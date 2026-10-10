// Base64 validation, variant detection, normalization and repair.
// Pure functions, no DOM access. Alphabets and padding rules: RFC 4648 §4-5;
// line-wrapped "MIME" Base64: RFC 2045 §6.8; data URLs: RFC 2397.

import { base64ToBytes, bytesToBase64 } from './encoding'

export type Variant = 'standard' | 'url-safe' | 'mime' | 'data-url'
export type Alphabet = 'standard' | 'url-safe' | 'mixed' | 'neutral'

export interface Issue {
  severity: 'error' | 'warning'
  message: string
  /** UTF-16 offset in the input (for selecting the character in a textarea). */
  offset?: number
  /** 1-based position counted in characters (code points). */
  position?: number
  line?: number
  column?: number
  /** Readable description of the offending character, e.g. `"!" (U+0021)`. */
  char?: string
}

export interface Analysis {
  valid: boolean
  /** First error, if any (the earliest problem in the input). */
  error: Issue | null
  warnings: Issue[]
  variant: Variant
  alphabet: Alphabet
  /** Line-wrapped across several lines. */
  wrapped: boolean
  /** Length of the first line when wrapped. */
  lineLength: number | null
  dataUrl: { mime: string } | null
  padded: boolean
  /** Number of Base64 data characters (no padding, no line breaks). */
  dataChars: number
  /** Number of characters outside the Base64 alphabet. */
  invalidChars: number
  /** Decoded size in bytes when valid. */
  decodedBytes: number | null
}

const CHAR_NAMES: Record<string, string> = {
  ' ': 'space',
  '\t': 'tab',
  ' ': 'no-break space',
  '​': 'zero-width space',
  '﻿': 'byte order mark',
  '\r': 'carriage return',
  '\n': 'line feed',
}

export function describeChar(c: string): string {
  const cp = c.codePointAt(0) ?? 0
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
  const name = CHAR_NAMES[c]
  if (name) return `${name} (${hex})`
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return `control character (${hex})`
  return `"${c}" (${hex})`
}

const isAlnum = (c: string) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')

/** Value 0-63 of a Base64 character in either alphabet. */
function sextet(c: string): number {
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 65
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 71
  if (c >= '0' && c <= '9') return c.charCodeAt(0) + 4
  return c === '+' || c === '-' ? 62 : 63
}

/** True when the unused low bits of the final character are not zero (RFC 4648 §3.5). */
function nonCanonicalTail(lastChar: string, dataChars: number): boolean {
  const rem = dataChars % 4
  if (rem === 2) return (sextet(lastChar) & 0x0f) !== 0
  if (rem === 3) return (sextet(lastChar) & 0x03) !== 0
  return false
}

interface Pos {
  offset: number
  position: number
  line: number
  column: number
}

/**
 * Strictly checks Base64 text. Leading/trailing whitespace is ignored and line
 * breaks are allowed (MIME); every other character outside the alphabet, mixed
 * alphabets, misplaced or excess "=" and impossible lengths are errors. A
 * missing "=" is only a warning (padding is optional in URL-safe Base64).
 */
export function analyzeBase64(input: string): Analysis {
  const result: Analysis = {
    valid: false,
    error: null,
    warnings: [],
    variant: 'standard',
    alphabet: 'neutral',
    wrapped: false,
    lineLength: null,
    dataUrl: null,
    padded: false,
    dataChars: 0,
    invalidChars: 0,
    decodedBytes: null,
  }

  // Indexes below are UTF-16 offsets; positions are computed only for reported issues.
  const chars = input
  const locate = (offset: number): Pos => {
    let position = 0
    let line = 1
    let column = 1
    for (const c of input.slice(0, offset)) {
      position++
      if (c === '\n') {
        line++
        column = 1
      } else {
        column++
      }
    }
    return { offset, position: position + 1, line, column }
  }
  const at = (i: number, severity: Issue['severity'], message: string, withChar = true): Issue => {
    const cp = input.codePointAt(i)
    return {
      severity,
      message,
      ...locate(i),
      ...(withChar && cp !== undefined ? { char: describeChar(String.fromCodePoint(cp)) } : {}),
    }
  }
  const fail = (issue: () => Issue) => {
    if (!result.error) result.error = issue()
  }

  let start = 0
  let end = chars.length
  while (start < end && /\s/.test(chars[start] ?? '')) start++
  while (end > start && /\s/.test(chars[end - 1] ?? '')) end--
  if (start === end) {
    result.error = { severity: 'error', message: 'The input is empty.' }
    return result
  }

  // data: URL prefix
  const lead = chars.slice(start, start + 5).toLowerCase()
  if (lead === 'data:') {
    let comma = -1
    for (let i = start; i < end; i++) {
      if (chars[i] === ',') {
        comma = i
        break
      }
    }
    if (comma < 0) {
      fail(() => at(start, 'error', 'Data URL has no "," before the data.', false))
      return result
    }
    const header = chars.slice(start + 5, comma)
    result.dataUrl = { mime: (header.split(';')[0] ?? '').trim().toLowerCase() || 'text/plain' }
    result.variant = 'data-url'
    if (!/;base64$/i.test(header)) {
      fail(() => at(comma, 'error', 'Data URL is not Base64-encoded (";base64" is missing before ",").', false))
      return result
    }
    start = comma + 1
  }

  let std = 0
  let url = 0
  const pads: number[] = []
  let lastData = -1
  const lineLengths: number[] = []
  let lineLen = 0
  for (let i = start; i < end; i++) {
    const c = chars[i] ?? ''
    if (c === '\n' || c === '\r') {
      if (c === '\n' || chars[i + 1] !== '\n') {
        lineLengths.push(lineLen)
        lineLen = 0
      }
      continue
    }
    lineLen++
    if (c === '=') {
      pads.push(i)
      continue
    }
    if (isAlnum(c) || c === '+' || c === '/' || c === '-' || c === '_') {
      if (pads.length > 0) {
        fail(() => at(pads[0] ?? i, 'error', '"=" padding is only allowed at the end, but data follows it.'))
      }
      if (c === '+' || c === '/') {
        if (std === 0 && url > 0) fail(() => at(i, 'error', 'Mixes standard ("+", "/") and URL-safe ("-", "_") characters.'))
        std++
      } else if (c === '-' || c === '_') {
        if (url === 0 && std > 0) fail(() => at(i, 'error', 'Mixes standard ("+", "/") and URL-safe ("-", "_") characters.'))
        url++
      }
      result.dataChars++
      lastData = i
      continue
    }
    result.invalidChars++
    fail(() => at(i, 'error', 'Invalid character for Base64.'))
    const hi = c.charCodeAt(0)
    if (hi >= 0xd800 && hi <= 0xdbff) i++ // count a surrogate pair once
  }
  lineLengths.push(lineLen)

  result.alphabet = std > 0 && url > 0 ? 'mixed' : std > 0 ? 'standard' : url > 0 ? 'url-safe' : 'neutral'
  result.padded = pads.length > 0
  const lines = lineLengths.filter((n) => n > 0)
  result.wrapped = lines.length > 1
  result.lineLength = result.wrapped ? (lines[0] ?? null) : null
  if (!result.dataUrl) result.variant = result.wrapped ? 'mime' : result.alphabet === 'url-safe' ? 'url-safe' : 'standard'

  const n = result.dataChars
  if (n === 0) {
    fail(() => ({ severity: 'error', message: 'There is no Base64 data.' }))
  } else if (n % 4 === 1) {
    fail(() => at(lastData, 'error', 'Invalid length: the last Base64 character cannot form a byte (a character is missing or extra).'))
  }
  if (pads.length > 0 && n % 4 !== 1) {
    const expected = (4 - (n % 4)) % 4
    if (expected === 0) {
      fail(() => at(pads[0] ?? 0, 'error', 'Unexpected "=": the data length is already a multiple of 4.'))
    } else if (pads.length > expected) {
      fail(() => at(pads[expected] ?? 0, 'error', `Too many "=": expected ${expected}.`))
    } else if (pads.length < expected) {
      fail(() => at(pads[pads.length - 1] ?? 0, 'error', `Incomplete padding: expected ${expected} "=" but found ${pads.length}.`, false))
    }
  }

  if (!result.error) {
    if (pads.length === 0 && n % 4 !== 0) {
      const missing = 4 - (n % 4)
      result.warnings.push({
        severity: 'warning',
        message: `No "=" padding (${missing} missing). Fine for URL-safe Base64; strict standard decoders require it.`,
      })
    }
    if (lastData >= 0 && nonCanonicalTail(chars[lastData] ?? 'A', n)) {
      result.warnings.push(
        at(lastData, 'warning', 'Non-canonical: the unused low bits of the last character are not zero (decoders ignore them).'),
      )
    }
    if (result.wrapped && lines.slice(0, -1).some((len) => len !== lines[0])) {
      result.warnings.push({ severity: 'warning', message: 'Lines have different lengths.' })
    }
    if (result.wrapped && (lines[0] ?? 0) > 76) {
      result.warnings.push({ severity: 'warning', message: `Lines are ${lines[0]} characters long; MIME allows at most 76.` })
    }
  }

  result.valid = result.error === null
  if (result.valid) result.decodedBytes = Math.floor((n * 3) / 4)
  return result
}

// ---------------------------------------------------------------------------
// Repair / normalize

export interface RepairOptions {
  alphabet: 'standard' | 'url-safe'
  padding: boolean
  /** Wrap the output every N characters (0 = single line). */
  lineWidth: number
  /** Treat spaces as "+" that a URL/form decoder turned into spaces. */
  spacesArePlus: boolean
  /** Re-attach the data: URL prefix when the input had one. */
  keepDataUrl: boolean
}

export const DEFAULT_REPAIR: RepairOptions = {
  alphabet: 'standard',
  padding: true,
  lineWidth: 0,
  spacesArePlus: false,
  keepDataUrl: false,
}

export interface Change {
  /** format = lossless normalization; repair = corruption fixed; lossy = data dropped. */
  kind: 'format' | 'repair' | 'lossy'
  message: string
}

export interface RepairResult {
  output: string
  bytes: Uint8Array<ArrayBuffer>
  changes: Change[]
  dataUrlMime: string | null
}

function countChars(list: string[]): string {
  const counts = new Map<string, number>()
  for (const c of list) counts.set(c, (counts.get(c) ?? 0) + 1)
  const parts = [...counts].slice(0, 6).map(([c, k]) => `${describeChar(c)}${k > 1 ? ` ×${k}` : ''}`)
  return parts.join(', ') + (counts.size > 6 ? ', …' : '')
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * True when the input looks like Base64 that went through URL form decoding
 * ("+" became " "): a single line with spaces inside and no "+" left.
 */
export function looksFormDecoded(input: string): boolean {
  const s = input.trim()
  return !/[\r\n]/.test(s) && / /.test(s) && !s.includes('+') && /^[A-Za-z0-9/= ]+$/.test(s) && !/ {2}/.test(s)
}

function concatBytes(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/**
 * Cleans up Base64 text and re-encodes it in the requested form. Every change
 * is reported. Throws when nothing decodable is left.
 */
export function repairBase64(input: string, options: Partial<RepairOptions> = {}): RepairResult {
  const opts = { ...DEFAULT_REPAIR, ...options }
  const changes: Change[] = []
  // Leading/trailing spaces may be "+" characters when spacesArePlus is set.
  let s = opts.spacesArePlus ? input.replace(/^[\r\n\t]+|[\r\n\t]+$/g, '') : input.trim()

  // 1. Surrounding quotes (optionally followed by "," or ";" as in JSON/JS source).
  for (let k = 0; k < 3; k++) {
    const m = /^(["'`])([\s\S]*)\1[,;]?$/.exec(s)
    if (!m) break
    s = (m[2] ?? '').trim()
    changes.push({ kind: 'repair', message: `Removed surrounding ${m[1]} quotes.` })
  }

  // 2. JSON / JavaScript string escapes.
  if (s.includes('\\')) {
    let n = 0
    s = s.replace(/\\u00(2[bBfF]|3[dD])|\\[/nrt]/g, (esc, hex: string | undefined) => {
      n++
      if (hex) return String.fromCharCode(parseInt(hex, 16))
      return esc === '\\/' ? '/' : '\n'
    })
    if (n) changes.push({ kind: 'repair', message: `Unescaped ${plural(n, 'JSON/JavaScript escape')} (\\/, \\n, \\u002B…).` })
  }

  // 3. data: URL prefix.
  let dataUrlMime: string | null = null
  const dm = /^data:([^,]*),/i.exec(s)
  if (dm) {
    const header = dm[1] ?? ''
    if (!/;\s*base64\s*$/i.test(header)) throw new Error('This data URL is not Base64-encoded (";base64" is missing).')
    dataUrlMime = (header.split(';')[0] ?? '').trim().toLowerCase() || 'text/plain'
    s = s.slice(dm[0].length)
    changes.push({
      kind: 'format',
      message: opts.keepDataUrl ? `Kept the data URL prefix (${dataUrlMime}).` : `Removed the data URL prefix (${dataUrlMime}).`,
    })
  }

  // 4. Percent-encoding and HTML numeric entities of "+", "/", "=" and whitespace.
  {
    const found: string[] = []
    s = s.replace(/%(2B|2F|3D|0A|0D|20)|&#(43|47|61|x2B|x2F|x3D);/gi, (m, pct: string | undefined, ent: string | undefined) => {
      found.push(m)
      const code = pct ? parseInt(pct, 16) : ent?.[0]?.toLowerCase() === 'x' ? parseInt(ent.slice(1), 16) : Number(ent)
      return code === 0x0a || code === 0x0d || code === 0x20 ? '' : String.fromCharCode(code)
    })
    if (found.length) {
      const kinds = [...new Set(found.map((f) => f.toUpperCase().replace('&#X', '&#x')))].slice(0, 5).join(', ')
      changes.push({ kind: 'repair', message: `Decoded ${plural(found.length, 'escaped character')} (${kinds}).` })
    }
  }

  // 5. Spaces that were "+".
  if (opts.spacesArePlus) {
    const n = (s.match(/ /g) ?? []).length
    if (n) {
      s = s.replace(/ /g, '+')
      changes.push({ kind: 'repair', message: `Turned ${plural(n, 'space')} back into "+".` })
    }
  }

  // 6. Whitespace.
  {
    const breaks = (s.match(/\r\n|\r|\n/g) ?? []).length
    const other = (s.replace(/\r|\n/g, '').match(/\s/g) ?? []).length
    s = s.replace(/\s+/g, '')
    if (breaks) changes.push({ kind: 'format', message: `Removed ${plural(breaks, 'line break')}.` })
    if (other) changes.push({ kind: 'repair', message: `Removed ${plural(other, 'space or tab', 'spaces/tabs')}.` })
  }

  // 7. Stray characters outside both alphabets.
  {
    const stray = s.match(/[^A-Za-z0-9+/\-_=]/gu) ?? []
    if (stray.length) {
      s = s.replace(/[^A-Za-z0-9+/\-_=]/gu, '')
      changes.push({ kind: 'repair', message: `Removed ${plural(stray.length, 'invalid character')}: ${countChars(stray)}.` })
    }
  }

  // 8. Alphabet: decode internally with the standard alphabet.
  {
    const std = (s.match(/[+/]/g) ?? []).length
    const url = (s.match(/[-_]/g) ?? []).length
    if (std && url) {
      changes.push({ kind: 'repair', message: `Mixed alphabets: unified ${std} standard and ${url} URL-safe characters.` })
    } else if (url && opts.alphabet === 'standard') {
      changes.push({ kind: 'format', message: `Converted ${plural(url, 'URL-safe character')} ("-", "_") to standard ("+", "/").` })
    } else if (std && opts.alphabet === 'url-safe') {
      changes.push({ kind: 'format', message: `Converted ${plural(std, 'standard character')} ("+", "/") to URL-safe ("-", "_").` })
    }
    s = s.replace(/-/g, '+').replace(/_/g, '/')
  }

  // 9. Padding and concatenated chunks.
  const chunks = s.match(/[^=]+=*|^=+/g) ?? []
  let parts: string[]
  const interior = chunks.slice(0, -1)
  if (interior.length > 0) {
    const aligned = interior.every((c) => {
      const data = c.replace(/=+$/, '')
      const pad = c.length - data.length
      return data.length % 4 !== 1 && pad > 0 && pad === (4 - (data.length % 4)) % 4
    })
    if (aligned) {
      parts = chunks.map((c) => c.replace(/=+$/, '')).filter((c) => c.length > 0)
      changes.push({ kind: 'repair', message: `Joined ${chunks.length} concatenated Base64 chunks (each had its own "=" padding).` })
    } else {
      const removed = interior.reduce((n, c) => n + (c.length - c.replace(/=+$/, '').length), 0)
      parts = [s.replace(/=/g, '')]
      changes.push({ kind: 'lossy', message: `Removed ${plural(removed, '"="')} from the middle of the data; the result may be wrong.` })
    }
  } else {
    parts = [s.replace(/=+$/, '')]
  }
  parts = parts.filter((p) => p.length > 0)
  if (parts.length === 0) throw new Error('Nothing decodable is left.')

  // Trailing padding of the last chunk.
  const lastChunk = chunks[chunks.length - 1] ?? ''
  const lastData = parts[parts.length - 1] ?? ''
  const pads = lastChunk.length - lastChunk.replace(/=+$/, '').length

  // Impossible length: drop the final dangling character.
  if (lastData.length % 4 === 1) {
    const dropped = lastData.slice(-1)
    parts[parts.length - 1] = lastData.slice(0, -1)
    changes.push({
      kind: 'lossy',
      message: `Dropped the final character ${describeChar(dropped)}: one leftover character cannot form a byte (data may be truncated).`,
    })
    parts = parts.filter((p) => p.length > 0)
    if (parts.length === 0) throw new Error('Nothing decodable is left.')
  }
  const finalData = parts[parts.length - 1] ?? ''
  const expected = (4 - (finalData.length % 4)) % 4
  const want = opts.padding ? expected : 0
  if (pads > expected) {
    changes.push({ kind: 'repair', message: `Removed ${plural(pads - want, 'excess "="', 'excess "="')}.` })
  } else if (pads < want) {
    changes.push({ kind: pads > 0 ? 'repair' : 'format', message: `Added ${plural(want - pads, 'missing "="', 'missing "="')}.` })
  } else if (pads > want) {
    changes.push({ kind: 'format', message: `Removed "=" padding (${pads}).` })
  }

  // Non-canonical last character.
  if (nonCanonicalTail(finalData.slice(-1), finalData.length)) {
    changes.push({ kind: 'repair', message: 'Cleared non-zero unused bits in the last character.' })
  }

  // 10. Decode and re-encode.
  const bytes = concatBytes(parts.map((p) => base64ToBytes(p)))
  let output = bytesToBase64(bytes, { urlSafe: opts.alphabet === 'url-safe', padding: opts.padding })
  if (opts.keepDataUrl && dataUrlMime) {
    output = `data:${dataUrlMime};base64,${output}`
  } else if (opts.lineWidth > 0 && output.length > opts.lineWidth) {
    const lines: string[] = []
    for (let i = 0; i < output.length; i += opts.lineWidth) lines.push(output.slice(i, i + opts.lineWidth))
    output = lines.join('\n')
    changes.push({ kind: 'format', message: `Wrapped lines at ${opts.lineWidth} characters.` })
  }
  return { output, bytes, changes, dataUrlMime }
}
