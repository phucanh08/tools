// Text <-> bytes in legacy charsets. Pure functions, no DOM access.
//
// Decoding uses TextDecoder (WHATWG Encoding Standard). Browsers only ship a
// UTF-8 encoder, so encoding to the other charsets uses reverse tables that are
// derived lazily, once per charset, from TextDecoder itself:
//   - single-byte charsets: decode bytes 0x00-0xFF;
//   - multi-byte charsets: decode every valid lead/trail byte pair in one call,
//     each pair followed by a "\n" delimiter so a pair that is not mapped cannot
//     shift the alignment of the next one.
// Every table entry therefore decodes back to exactly the character it encodes,
// so decode(encode(text)) === text for every character that is representable.

export type CharsetId =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'iso-8859-1'
  | 'windows-1252'
  | 'windows-1258'
  | 'windows-1250'
  | 'windows-1251'
  | 'iso-8859-2'
  | 'iso-8859-15'
  | 'koi8-r'
  | 'shift_jis'
  | 'euc-jp'
  | 'gbk'
  | 'big5'
  | 'euc-kr'

export interface CharsetInfo {
  id: CharsetId
  label: string
  kind: 'unicode' | 'latin1' | 'single' | 'multi'
}

export const CHARSETS: CharsetInfo[] = [
  { id: 'utf-8', label: 'UTF-8', kind: 'unicode' },
  { id: 'utf-16le', label: 'UTF-16LE', kind: 'unicode' },
  { id: 'utf-16be', label: 'UTF-16BE', kind: 'unicode' },
  { id: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)', kind: 'latin1' },
  { id: 'windows-1252', label: 'Windows-1252 (Western)', kind: 'single' },
  { id: 'windows-1258', label: 'Windows-1258 (Vietnamese)', kind: 'single' },
  { id: 'windows-1250', label: 'Windows-1250 (Central European)', kind: 'single' },
  { id: 'windows-1251', label: 'Windows-1251 (Cyrillic)', kind: 'single' },
  { id: 'iso-8859-2', label: 'ISO-8859-2 (Latin-2)', kind: 'single' },
  { id: 'iso-8859-15', label: 'ISO-8859-15 (Latin-9)', kind: 'single' },
  { id: 'koi8-r', label: 'KOI8-R (Russian)', kind: 'single' },
  { id: 'shift_jis', label: 'Shift_JIS (Japanese)', kind: 'multi' },
  { id: 'euc-jp', label: 'EUC-JP (Japanese)', kind: 'multi' },
  { id: 'gbk', label: 'GBK (Simplified Chinese)', kind: 'multi' },
  { id: 'big5', label: 'Big5 (Traditional Chinese)', kind: 'multi' },
  { id: 'euc-kr', label: 'EUC-KR (Korean)', kind: 'multi' },
]

export function charsetInfo(id: CharsetId): CharsetInfo {
  const info = CHARSETS.find((c) => c.id === id)
  if (!info) throw new Error(`Unknown charset ${id}`)
  return info
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

interface MultiSpec {
  /** Single bytes that map to one character on their own. */
  singles: number[]
  leads: number[]
  trails: number[]
  /** Pairs that must not be used for encoding (WHATWG encoder exclusions). */
  skip?: (lead: number, trail: number) => boolean
  /** For these code points, a later pair wins over an earlier one. */
  preferLast?: number[]
  /** Encoder-only aliases defined by the WHATWG encoders: code point -> bytes. */
  extra?: [number, number[]][]
}

const MULTI: Partial<Record<CharsetId, MultiSpec>> = {
  shift_jis: {
    singles: [...range(0x00, 0x80), ...range(0xa1, 0xdf)],
    leads: [...range(0x81, 0x9f), ...range(0xe0, 0xfc)],
    trails: [...range(0x40, 0x7e), ...range(0x80, 0xfc)],
    // WHATWG "index Shift_JIS pointer" excludes pointers 8272-8835 (NEC-selected
    // IBM extensions, duplicated at 0xFA-0xFC) and the user-defined area 0xF0-0xF9.
    skip: (lead, trail) => {
      if (lead >= 0xf0 && lead <= 0xf9) return true
      const pointer = (lead - (lead < 0xa0 ? 0x81 : 0xc1)) * 188 + trail - (trail < 0x7f ? 0x40 : 0x41)
      return pointer >= 8272 && pointer <= 8835
    },
    extra: [
      [0xa5, [0x5c]],
      [0x203e, [0x7e]],
      [0x2212, [0x81, 0x7c]],
    ],
  },
  'euc-jp': {
    singles: range(0x00, 0x7f),
    leads: range(0xa1, 0xfe),
    trails: range(0xa1, 0xfe),
    extra: [
      [0xa5, [0x5c]],
      [0x203e, [0x7e]],
      [0x2212, [0xa1, 0xdd]],
      // Half-width katakana: 0x8E followed by 0xA1-0xDF.
      ...range(0xff61, 0xff9f).map((cp): [number, number[]] => [cp, [0x8e, cp - 0xff61 + 0xa1]]),
    ],
  },
  gbk: {
    singles: range(0x00, 0x80),
    leads: range(0x81, 0xfe),
    trails: [...range(0x40, 0x7e), ...range(0x80, 0xfe)],
  },
  big5: {
    singles: range(0x00, 0x7f),
    // The WHATWG Big5 encoder excludes HKSCS pointers (lead bytes below 0xA1).
    leads: range(0xa1, 0xfe),
    trails: [...range(0x40, 0x7e), ...range(0xa1, 0xfe)],
    preferLast: [0x2550, 0x255e, 0x2561, 0x256a, 0x5341, 0x5345],
  },
  'euc-kr': {
    singles: range(0x00, 0x7f),
    leads: range(0x81, 0xfe),
    trails: range(0x41, 0xfe),
  },
}

/** Reverse table: code point -> encoded bytes (1 or 2 bytes). */
type Table = Map<number, number[]>

const tables = new Map<CharsetId, Table>()

function decodeSegments(charset: CharsetId, sequences: number[][]): string[] {
  const buf: number[] = []
  for (const seq of sequences) buf.push(...seq, 0x0a)
  return new TextDecoder(charset).decode(new Uint8Array(buf)).split('\n')
}

function buildTable(charset: CharsetId): Table {
  const table: Table = new Map()
  const add = (segment: string | undefined, bytes: number[], preferLast: Set<number>) => {
    if (!segment || segment.includes('�')) return
    const cp = segment.codePointAt(0)
    if (cp === undefined || String.fromCodePoint(cp) !== segment) return
    if (!table.has(cp) || preferLast.has(cp)) table.set(cp, bytes)
  }
  // Single-byte charsets: every byte 0x00-0xFF is a candidate single.
  const spec: MultiSpec = MULTI[charset] ?? { singles: range(0x00, 0xff), leads: [], trails: [] }
  const preferLast = new Set(spec.preferLast ?? [])
  // 0x0A is the delimiter, so it is mapped directly instead of decoded.
  const singles = spec.singles.filter((b) => b !== 0x0a).map((b) => [b])
  decodeSegments(charset, singles).forEach((seg, i) => {
    const bytes = singles[i]
    if (bytes) add(seg, bytes, preferLast)
  })
  if (spec.singles.includes(0x0a)) table.set(0x0a, [0x0a])
  const pairs: number[][] = []
  for (const lead of spec.leads) {
    for (const trail of spec.trails) {
      if (!spec.skip?.(lead, trail)) pairs.push([lead, trail])
    }
  }
  decodeSegments(charset, pairs).forEach((seg, i) => {
    const bytes = pairs[i]
    if (bytes) add(seg, bytes, preferLast)
  })
  for (const [cp, bytes] of spec.extra ?? []) if (!table.has(cp)) table.set(cp, bytes)
  return table
}

/** Reverse table for a legacy charset, built on first use and cached. */
export function encoderTable(charset: CharsetId): Table {
  let table = tables.get(charset)
  if (!table) {
    table = buildTable(charset)
    tables.set(charset, table)
  }
  return table
}

export interface Unmappable {
  char: string
  codePoint: number
  /** Number of occurrences in the input. */
  count: number
  /** Index (in code points) of the first occurrence. */
  firstIndex: number
}

export interface EncodeResult {
  bytes: Uint8Array<ArrayBuffer>
  /** Characters that do not exist in the charset (replaced with "?"). */
  unmappable: Unmappable[]
  /** Characters written as base letter + combining mark(s) (e.g. Vietnamese in Windows-1258). */
  decomposed: number
}

export interface EncodeOptions {
  /** Prefix a byte order mark (UTF-8 / UTF-16 only). */
  bom?: boolean
}

const REPLACEMENT_BYTE = 0x3f // "?"

/**
 * Encodes text in the given charset. Characters that cannot be represented are
 * replaced with "?" and listed in `unmappable`; callers decide whether that is
 * an error. Lone surrogates are always unmappable.
 */
export function encodeText(text: string, charset: CharsetId, opts: EncodeOptions = {}): EncodeResult {
  const out: number[] = []
  const missing = new Map<number, Unmappable>()
  let decomposed = 0
  let index = 0
  const miss = (char: string, cp: number) => {
    const m = missing.get(cp)
    if (m) m.count++
    else missing.set(cp, { char, codePoint: cp, count: 1, firstIndex: index })
  }
  const info = charsetInfo(charset)
  if (opts.bom && info.kind === 'unicode') {
    if (charset === 'utf-8') out.push(0xef, 0xbb, 0xbf)
    else if (charset === 'utf-16le') out.push(0xff, 0xfe)
    else out.push(0xfe, 0xff)
  }
  if (charset === 'utf-8') return encodeUtf8(text, out)
  const table = info.kind === 'single' || info.kind === 'multi' ? encoderTable(charset) : null

  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0
    if (cp >= 0xd800 && cp <= 0xdfff) {
      miss(char, cp)
      out.push(...(charset === 'utf-16le' ? [REPLACEMENT_BYTE, 0] : charset === 'utf-16be' ? [0, REPLACEMENT_BYTE] : [REPLACEMENT_BYTE]))
      index++
      continue
    }
    switch (info.kind) {
      case 'unicode':
        for (let i = 0; i < char.length; i++) {
          const unit = char.charCodeAt(i)
          if (charset === 'utf-16le') out.push(unit & 0xff, unit >> 8)
          else out.push(unit >> 8, unit & 0xff)
        }
        break
      case 'latin1':
        if (cp <= 0xff) out.push(cp)
        else {
          miss(char, cp)
          out.push(REPLACEMENT_BYTE)
        }
        break
      default: {
        const bytes = table?.get(cp)
        if (bytes) {
          out.push(...bytes)
          break
        }
        const parts = table ? decompose(char, table) : null
        if (parts) {
          out.push(...parts)
          decomposed++
        } else {
          miss(char, cp)
          out.push(REPLACEMENT_BYTE)
        }
      }
    }
    index++
  }
  return { bytes: new Uint8Array(out), unmappable: [...missing.values()], decomposed }
}

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/
const LONE_SURROGATES = new RegExp(LONE_SURROGATE.source, 'g')

/**
 * UTF-8 in one TextEncoder call (encoding per code point is ~100x slower on
 * large inputs). Lone surrogates are found in one regex pass, reported as
 * unmappable and written as "?", as in the other charsets.
 */
function encodeUtf8(text: string, prefix: number[]): EncodeResult {
  const missing = new Map<number, Unmappable>()
  let clean = text
  if (LONE_SURROGATE.test(text)) {
    let index = 0 // code points before `last`
    let last = 0
    for (const m of text.matchAll(LONE_SURROGATES)) {
      index += codePointCount(text, last, m.index)
      last = m.index + 1
      const cp = m[0].charCodeAt(0)
      const seen = missing.get(cp)
      if (seen) seen.count++
      else missing.set(cp, { char: m[0], codePoint: cp, count: 1, firstIndex: index })
      index++
    }
    clean = text.replace(LONE_SURROGATES, '?')
  }
  const body = new TextEncoder().encode(clean)
  const bytes = new Uint8Array(prefix.length + body.length)
  bytes.set(prefix)
  bytes.set(body, prefix.length)
  return { bytes, unmappable: [...missing.values()], decomposed: 0 }
}

/** Code points in text[from, to), counting a surrogate pair once. */
function codePointCount(text: string, from: number, to: number): number {
  let n = 0
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i)
    n++
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = text.charCodeAt(i + 1)
      if (i + 1 < to && d >= 0xdc00 && d <= 0xdfff) i++
    }
  }
  return n
}

/**
 * Tries to write a precomposed character as base + combining marks that the
 * charset has (canonically equivalent). Windows-1258 needs this for most
 * Vietnamese letters: "ế" is "ê" (0xEA) + combining acute (0xEC).
 */
function decompose(char: string, table: Table): number[] | null {
  const [base, ...marks] = [...char.normalize('NFD')]
  if (!base || marks.length === 0 || marks.length > 4) return null
  const lookup = (s: string) => ([...s].length === 1 ? table.get(s.codePointAt(0) ?? -1) : undefined)
  // Try to keep as many marks as possible in the precomposed base: "ệ" (NFD
  // e + U+0323 + U+0302) becomes "ê" + U+0323, not "e" + two marks.
  const subsets = Array.from({ length: 1 << marks.length }, (_, mask) => mask).sort(
    (a, b) => popcount(b) - popcount(a) || a - b,
  )
  for (const mask of subsets) {
    const kept = marks.filter((_, i) => mask & (1 << i))
    const head = lookup((base + kept.join('')).normalize('NFC'))
    if (!head) continue
    const out = [...head]
    let ok = true
    for (const [i, mark] of marks.entries()) {
      if (mask & (1 << i)) continue
      const b = lookup(mark)
      if (!b) {
        ok = false
        break
      }
      out.push(...b)
    }
    if (ok) return out
  }
  return null
}

function popcount(n: number): number {
  let c = 0
  for (; n; n &= n - 1) c++
  return c
}

export interface DecodeResult {
  text: string
  /** Number of invalid byte sequences replaced with U+FFFD. */
  invalid: number
  /** A byte order mark matching the charset was found and removed. */
  bomRemoved: boolean
  /**
   * Set when Windows-1258 text (base letters + combining tone marks) was
   * normalized to NFC, i.e. precomposed letters such as "ế".
   */
  normalized?: true
}

/**
 * Decodes bytes in the given charset, counting invalid sequences instead of
 * throwing. Windows-1258 output is NFC-normalized: the charset stores most
 * Vietnamese letters as base + combining mark, which many fonts, searches and
 * comparisons handle poorly.
 */
export function decodeBytes(bytes: Uint8Array, charset: CharsetId): DecodeResult {
  const r = decodeRaw(bytes, charset)
  if (charset !== 'windows-1258') return r
  const text = r.text.normalize('NFC')
  return text === r.text ? r : { ...r, text, normalized: true }
}

function decodeRaw(bytes: Uint8Array, charset: CharsetId): DecodeResult {
  if (charset === 'iso-8859-1') {
    // TextDecoder("iso-8859-1") is Windows-1252 per the WHATWG Encoding Standard;
    // real ISO-8859-1 maps every byte to the code point of the same value.
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { text, invalid: 0, bomRemoved: false }
  }
  const bom = detectBom(bytes)
  const bomRemoved = bom !== null && bom.charset === charset
  const body = bomRemoved ? bytes.subarray(bom.length) : bytes
  try {
    return { text: new TextDecoder(charset, { fatal: true, ignoreBOM: true }).decode(body), invalid: 0, bomRemoved }
  } catch {
    const text = new TextDecoder(charset, { ignoreBOM: true }).decode(body)
    const strict = countChar(text, '�')
    return { text, invalid: Math.max(1, strict - countLegitFffd(body, charset)), bomRemoved }
  }
}

function countChar(s: string, c: string): number {
  let n = 0
  for (let i = s.indexOf(c); i >= 0; i = s.indexOf(c, i + 1)) n++
  return n
}

/** U+FFFD characters that were genuinely encoded (only possible in UTF-8/16). */
function countLegitFffd(bytes: Uint8Array, charset: CharsetId): number {
  let n = 0
  if (charset === 'utf-8') {
    for (let i = 0; i + 2 < bytes.length; i++) if (bytes[i] === 0xef && bytes[i + 1] === 0xbf && bytes[i + 2] === 0xbd) n++
  } else if (charset === 'utf-16le' || charset === 'utf-16be') {
    const [a, b] = charset === 'utf-16le' ? [0xfd, 0xff] : [0xff, 0xfd]
    for (let i = 0; i + 1 < bytes.length; i += 2) if (bytes[i] === a && bytes[i + 1] === b) n++
  }
  return n
}

export function detectBom(bytes: Uint8Array): { charset: CharsetId; length: number } | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { charset: 'utf-8', length: 3 }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { charset: 'utf-16le', length: 2 }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { charset: 'utf-16be', length: 2 }
  return null
}

export interface Detection {
  charset: CharsetId
  /** Human-readable reason, e.g. "UTF-8 byte order mark". */
  reason: string
  /** "high" for BOM / valid UTF-8, "low" for heuristic guesses. */
  confidence: 'high' | 'low'
}

/** Charsets tried by the heuristic, in tie-break order. */
const GUESS_ORDER: CharsetId[] = ['shift_jis', 'euc-jp', 'gbk', 'big5', 'euc-kr', 'windows-1252', 'windows-1258', 'windows-1251', 'koi8-r']

/**
 * The heuristics (UTF-16 patterns, legacy-charset scores) only look at this
 * prefix: scoring costs ~0.3 s per MB, and 64 KB of text is plenty to decide.
 * The BOM, ASCII and strict UTF-8 checks still cover the whole input.
 */
export const DETECT_SAMPLE_BYTES = 64 * 1024

/**
 * Guesses the charset of bytes: BOM first, then strict UTF-8, then UTF-16
 * patterns, then a score over common legacy charsets. Guesses can be wrong for
 * short inputs; callers should let the user override.
 */
export function detectCharset(bytes: Uint8Array): Detection {
  const bom = detectBom(bytes)
  if (bom) return { charset: bom.charset, reason: `${charsetInfo(bom.charset).label} byte order mark`, confidence: 'high' }
  const sampled = bytes.length > DETECT_SAMPLE_BYTES
  const sample = sampled ? bytes.subarray(0, DETECT_SAMPLE_BYTES) : bytes
  // UTF-16 always has an even length; check the whole input, not the (even) sample.
  const even = bytes.length % 2 === 0
  if (bytes.every((b) => b < 0x80)) {
    // No CJK guess here: pairs of ASCII letters read as ideographs, and one stray
    // control byte would turn plain ASCII into "UTF-16".
    const utf16 = even ? guessUtf16(sample) : null
    if (utf16) return utf16
    return { charset: 'utf-8', reason: 'ASCII only (valid UTF-8)', confidence: 'high' }
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { charset: 'utf-8', reason: 'valid UTF-8', confidence: 'high' }
  } catch {
    // Not UTF-8: fall through to heuristics.
  }
  const utf16 = even ? (guessUtf16(sample) ?? guessUtf16Cjk(sample)) : null
  if (utf16) return utf16
  let best: { charset: CharsetId; score: number } | null = null
  for (const charset of GUESS_ORDER) {
    const score = scoreCharset(sample, charset, sampled)
    if (score !== null && (best === null || score > best.score)) best = { charset, score }
  }
  const charset = best?.charset ?? 'windows-1252'
  const from = sampled ? `, from the first ${DETECT_SAMPLE_BYTES / 1024} KB` : ''
  return { charset, reason: `best guess (not UTF-8; looks like ${charsetInfo(charset).label}${from})`, confidence: 'low' }
}

/**
 * UTF-16 without a BOM, from the share of zero bytes in one half of each code
 * unit. Only works for mostly Latin-script text (ASCII/Latin-1 code points have
 * a zero high byte); CJK text is handled by guessUtf16Cjk. The caller checks
 * that the input length is even.
 */
function guessUtf16(bytes: Uint8Array): Detection | null {
  if (bytes.length < 4) return null
  let zeroEven = 0
  let zeroOdd = 0
  for (let i = 0; i < bytes.length; i += 2) {
    if (bytes[i] === 0) zeroEven++
    if (bytes[i + 1] === 0) zeroOdd++
  }
  const pairs = bytes.length / 2
  if (zeroOdd >= pairs * 0.3 && zeroEven <= pairs * 0.05)
    return { charset: 'utf-16le', reason: 'zero bytes at odd offsets (UTF-16LE without BOM)', confidence: 'low' }
  if (zeroEven >= pairs * 0.3 && zeroOdd <= pairs * 0.05)
    return { charset: 'utf-16be', reason: 'zero bytes at even offsets (UTF-16BE without BOM)', confidence: 'low' }
  return null
}

/** CJK punctuation + kana, CJK unified ideographs, Hangul syllables, fullwidth forms. */
const CJK_RANGES: [number, number][] = [
  [0x3000, 0x30ff],
  [0x4e00, 0x9fff],
  [0xac00, 0xd7a3],
  [0xff00, 0xffef],
]

/**
 * UTF-16 CJK text without a BOM. Deliberately conservative: it misses short
 * text and pure ideographs without punctuation, and only fires when:
 *   - the bytes contain a C0 control byte other than tab/LF/CR (a cheap pre-check;
 *     Latin-1, UTF-8 and legacy CJK text practically never contain one);
 *   - every code unit is CJK (ranges above) or printable ASCII/tab/LF/CR;
 *   - at least two units are ASCII (high byte 0, e.g. a space 00 20), CJK
 *     punctuation U+3000-U+301F ("、" is 30 01) or fullwidth forms U+FFxx ("，").
 *     Legacy double-byte text read as UTF-16 gives units >= 0x8100 or Hangul
 *     (no legacy byte is 0xFF), so at most a stray control byte at an edge
 *     produces one such unit;
 *   - at least 4 code units, and 30% of them, are CJK;
 *   - exactly one byte order fits. Otherwise the input is left to the legacy guess.
 * All-ASCII input never gets here: pairs of ASCII letters read as ideographs.
 */
function guessUtf16Cjk(bytes: Uint8Array): Detection | null {
  if (bytes.length < 16) return null
  if (!bytes.some((b) => b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d)) return null
  const le = looksLikeCjk(bytes, 'utf-16le')
  const be = looksLikeCjk(bytes, 'utf-16be')
  if (le === be) return null
  const charset = le ? 'utf-16le' : 'utf-16be'
  return { charset, reason: `CJK text pattern (${charsetInfo(charset).label} without BOM)`, confidence: 'low' }
}

function looksLikeCjk(bytes: Uint8Array, charset: 'utf-16le' | 'utf-16be'): boolean {
  let text: string
  try {
    // stream: a surrogate pair cut at the end of a sample is held back, not an error.
    text = new TextDecoder(charset, { fatal: true, ignoreBOM: true }).decode(bytes, { stream: true })
  } catch {
    return false
  }
  let cjk = 0
  let anchors = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80 || (c >= 0x3000 && c <= 0x301f) || c >= 0xff00) anchors++
    if (CJK_RANGES.some(([lo, hi]) => c >= lo && c <= hi)) cjk++
    else if (!((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d)) return false
  }
  return anchors >= 2 && cjk >= 4 && cjk >= text.length * 0.3
}

const LATIN = /\p{Script=Latin}/u
const CYRILLIC = /\p{Script=Cyrillic}/u
const VIET_VOWEL = /[aeiouyăâêôơưAEIOUYĂÂÊÔƠƯ]/u

/**
 * Plausibility score per non-ASCII byte, or null if the bytes are not valid in
 * the charset. Multi-byte charsets score their common rows (kana, level-1
 * hanzi/kanji, KS X 1001 hangul) high and rare/extension rows low; single-byte
 * charsets score letters that sit next to other letters.
 */
function scoreCharset(bytes: Uint8Array, charset: CharsetId, partial = false): number | null {
  let text: string
  try {
    // partial: the bytes are a prefix, so a sequence cut at the end is not an error.
    text = new TextDecoder(charset, { fatal: true }).decode(bytes, { stream: partial })
  } catch {
    return null
  }
  let high = 0
  for (const b of bytes) if (b >= 0x80) high++
  if (high === 0) return 0
  const spec = MULTI[charset]
  let points = 0
  if (spec) {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i] ?? 0
      if (b < 0x80) continue
      const t = bytes[i + 1] ?? 0
      const [p, len] = pairScore(charset, b, t)
      points += p
      i += len - 1
    }
    return points / high
  }
  // A letter only counts when a neighbour is a letter of the same script:
  // mis-decoded bytes tend to produce mixed-script words ("cafщ") or symbols.
  const cyrillic = charset === 'windows-1251' || charset === 'koi8-r'
  const script = cyrillic ? CYRILLIC : LATIN
  const chars = [...text]
  chars.forEach((c, i) => {
    const cp = c.codePointAt(0) ?? 0
    if (cp < 0x80) return
    if (charset === 'windows-1258' && cp >= 0x300 && cp <= 0x323) {
      // Vietnamese tone marks follow a vowel.
      points += VIET_VOWEL.test(chars[i - 1] ?? '') ? 2 : 0.2
      return
    }
    if (!script.test(c) || !(script.test(chars[i - 1] ?? '') || script.test(chars[i + 1] ?? ''))) {
      points += 0.2
      return
    }
    if (cyrillic) points += cp >= 0x430 && cp <= 0x44f ? 1.8 : 1
    else if (charset === 'windows-1258') points += /[ĂăÂâÊêÔôƠơƯưĐđ]/u.test(c) ? 1.6 : 1.4
    else points += 1.5
  })
  return points / high
}

/** [points, byte length] for the sequence starting with lead byte b. */
function pairScore(charset: CharsetId, b: number, t: number): [number, number] {
  switch (charset) {
    case 'shift_jis':
      if (b >= 0xa1 && b <= 0xdf) return [0.2, 1] // half-width katakana
      if (b === 0x82 && t >= 0x9f && t <= 0xf1) return [4, 2] // hiragana
      if (b === 0x83 && t >= 0x40 && t <= 0x96) return [3, 2] // katakana
      if (b === 0x81) return [2.5, 2] // punctuation
      if ((b > 0x88 || (b === 0x88 && t >= 0x9f)) && (b < 0x98 || (b === 0x98 && t <= 0x72))) return [3, 2] // kanji level 1
      if (b >= 0x98 && b <= 0xea) return [1.5, 2] // kanji level 2
      return [0.5, b === 0x80 ? 1 : 2]
    case 'euc-jp':
      if (b === 0x8e) return [0.4, 2]
      if (b === 0x8f) return [0.5, 3]
      if (b === 0xa4) return [4, 2]
      if (b === 0xa5) return [3, 2]
      if (b === 0xa1) return [2.5, 2]
      if (b >= 0xb0 && b <= 0xcf) return [3, 2]
      if (b >= 0xd0 && b <= 0xf4) return [1.5, 2]
      return [0.5, 2]
    case 'gbk':
      if (b === 0x80) return [0.2, 1]
      if (t >= 0x30 && t <= 0x39) return [0.3, 4] // GB18030 four-byte sequence
      if (t < 0xa1) return [0.5, 2] // GBK extension
      if (b >= 0xa1 && b <= 0xa9) return [2.5, 2]
      if (b >= 0xb0 && b <= 0xd7) return [3.5, 2]
      if (b >= 0xd8 && b <= 0xf7) return [1.5, 2]
      return [0.5, 2]
    case 'big5':
      if (b < 0xa1) return [0.3, 2]
      if (b >= 0xa1 && b <= 0xa3) return [2.5, 2]
      if (b >= 0xa4 && b <= 0xc6) return [3.5, 2]
      if (b >= 0xc9 && b <= 0xf9) return [1.5, 2]
      return [0.5, 2]
    case 'euc-kr':
      if (t < 0xa1 || b < 0xa1) return [0.3, 2] // UHC extension hangul (rare syllables)
      if (b >= 0xb0 && b <= 0xc8) return [4, 2] // KS X 1001 hangul
      if (b >= 0xa1 && b <= 0xac) return [2, 2] // symbols
      if (b >= 0xca && b <= 0xfd) return [1, 2] // hanja
      return [0.5, 2]
    default:
      return [0, 1]
  }
}
