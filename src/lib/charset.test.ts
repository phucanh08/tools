import { describe, expect, it, vi } from 'vitest'
import { CHARSETS, DETECT_SAMPLE_BYTES, decodeBytes, detectCharset, encodeText, encoderTable, type CharsetId } from './charset'
import { bytesToBase64 } from './encoding'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ')
const bytes = (h: string) => new Uint8Array(h.split(/\s+/).filter(Boolean).map((x) => parseInt(x, 16)))

// Known byte sequences. Sources: WHATWG Encoding Standard indexes
// (https://encoding.spec.whatwg.org/ index-jis0208, index-gb18030, index-big5,
// index-euc-kr, index-windows-125x, index-koi8-r); every expected sequence is
// also checked by decoding it with TextDecoder below.
const VECTORS: [CharsetId, string, string][] = [
  ['utf-8', 'é€', 'c3 a9 e2 82 ac'],
  ['utf-16le', 'A€', '41 00 ac 20'],
  ['utf-16be', 'A€', '00 41 20 ac'],
  ['utf-16le', '😀', '3d d8 00 de'],
  ['iso-8859-1', 'café ÿ', '63 61 66 e9 20 ff'],
  ['windows-1252', '€ café “x”', '80 20 63 61 66 e9 20 93 78 94'],
  ['shift_jis', '日本語', '93 fa 96 7b 8c ea'],
  ['shift_jis', 'ｱ', 'b1'],
  ['euc-jp', '日本語', 'c6 fc cb dc b8 ec'],
  ['gbk', '中文', 'd6 d0 ce c4'],
  ['gbk', '€', '80'],
  ['big5', '中文', 'a4 a4 a4 e5'],
  ['euc-kr', '한국어', 'c7 d1 b1 b9 be ee'],
  ['windows-1251', 'привет', 'ef f0 e8 e2 e5 f2'],
  ['koi8-r', 'привет', 'd0 d2 c9 d7 c5 d4'],
  ['iso-8859-2', 'Łódź', 'a3 f3 64 bc'],
  ['windows-1250', 'Łódź', 'a3 f3 64 9f'],
  ['iso-8859-15', '€', 'a4'],
]

describe('charset encode', () => {
  it.each(VECTORS)('%s: %s', (charset, text, expected) => {
    const r = encodeText(text, charset)
    expect(hex(r.bytes)).toBe(expected)
    expect(r.unmappable).toEqual([])
    expect(decodeBytes(bytes(expected), charset).text).toBe(text)
  })

  it('Shift_JIS "日本語" in Base64 matches the known value', () => {
    expect(bytesToBase64(encodeText('日本語', 'shift_jis').bytes)).toBe('k/qWe4zq')
  })

  it('writes Vietnamese in Windows-1258 as base letter + combining tone mark', () => {
    // Windows-1258 has ê (0xEA) and combining acute (0xEC) / dot below (0xF2),
    // but no precomposed ế / ệ (Microsoft cp1258 code page table).
    const r = encodeText('Tiếng Việt', 'windows-1258')
    expect(hex(r.bytes)).toBe('54 69 ea ec 6e 67 20 56 69 ea f2 74')
    expect(r.decomposed).toBe(2)
    expect(r.unmappable).toEqual([])
    expect(decodeBytes(r.bytes, 'windows-1258').text.normalize('NFC')).toBe('Tiếng Việt')
  })

  it('reports characters that cannot be represented and replaces them with "?"', () => {
    const r = encodeText('a€b€😀', 'iso-8859-1')
    expect(hex(r.bytes)).toBe('61 3f 62 3f 3f')
    expect(r.unmappable).toEqual([
      { char: '€', codePoint: 0x20ac, count: 2, firstIndex: 1 },
      { char: '😀', codePoint: 0x1f600, count: 1, firstIndex: 4 },
    ])
    const sjis = encodeText('日本 한', 'shift_jis')
    expect(sjis.unmappable.map((u) => u.char)).toEqual(['한'])
    expect(hex(sjis.bytes)).toBe('93 fa 96 7b 20 3f')
  })

  it('treats lone surrogates as unmappable even in UTF-8 / UTF-16', () => {
    expect(encodeText('a\ud800', 'utf-8').unmappable).toHaveLength(1)
    expect(hex(encodeText('\udc00', 'utf-16le').bytes)).toBe('3f 00')

  })

  it('encodes UTF-8 in one pass, reporting lone surrogates with code-point positions', () => {
    const text = 'é😀\ud800x\udc00😀\ud800'
    const r = encodeText(text, 'utf-8', { bom: true })
    expect(hex(r.bytes)).toBe('ef bb bf c3 a9 f0 9f 98 80 3f 78 3f f0 9f 98 80 3f')
    expect(r.unmappable).toEqual([
      { char: '\ud800', codePoint: 0xd800, count: 2, firstIndex: 2 },
      { char: '\udc00', codePoint: 0xdc00, count: 1, firstIndex: 4 },
    ])
    // A valid pair followed by a lone low surrogate: only the last one is reported.
    expect(encodeText('\udbff\udfff\udfff', 'utf-8').unmappable).toEqual([
      { char: '\udfff', codePoint: 0xdfff, count: 1, firstIndex: 1 },
    ])
    // One TextEncoder call for the whole input (a per-code-point loop took 0.6-2.9 s
    // on ~1 M code units). Counting calls is deterministic, unlike a time bound.
    const big = 'Xin chào 😀 thế giới. '.repeat(50_000) // ~1.1 M UTF-16 code units
    const spy = vi.spyOn(TextEncoder.prototype, 'encode')
    let large: ReturnType<typeof encodeText>
    try {
      large = encodeText(big, 'utf-8')
      expect(spy).toHaveBeenCalledTimes(1)
      encodeText('a\ud800b😀\udc00', 'utf-8')
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
    }
    expect(large.bytes).toEqual(new TextEncoder().encode(big))
    expect(large.unmappable).toEqual([])
  })

  it('adds a BOM only for Unicode charsets when asked', () => {
    expect(hex(encodeText('A', 'utf-8', { bom: true }).bytes)).toBe('ef bb bf 41')
    expect(hex(encodeText('A', 'utf-16le', { bom: true }).bytes)).toBe('ff fe 41 00')
    expect(hex(encodeText('A', 'utf-16be', { bom: true }).bytes)).toBe('fe ff 00 41')
    expect(hex(encodeText('A', 'shift_jis', { bom: true }).bytes)).toBe('41')
  })

  it('keeps line breaks (0x0A is the table-building delimiter)', () => {
    for (const c of CHARSETS) expect(hex(encodeText('a\r\nb', c.id).bytes.filter((b) => b !== 0))).toBe('61 0d 0a 62')
  })

  it('every reverse-table entry decodes back to its character (all legacy charsets)', () => {
    for (const c of CHARSETS) {
      if (c.kind !== 'single' && c.kind !== 'multi') continue
      const table = encoderTable(c.id)
      expect(table.size).toBeGreaterThan(c.kind === 'multi' ? 6000 : 200)
      let text = ''
      const all: number[] = []
      for (const [cp, b] of table) {
        // Encoder-only aliases (e.g. ¥ -> 0x5C in Shift_JIS) decode to another character by design.
        if ((cp === 0xa5 || cp === 0x203e || cp === 0x2212) && (c.id === 'shift_jis' || c.id === 'euc-jp')) continue
        text += String.fromCodePoint(cp)
        all.push(...b)
      }
      // Windows-1258 decoding is NFC-normalized (e.g. "Ư" + U+0309 becomes "Ử").
      expect(decodeBytes(new Uint8Array(all), c.id).text, c.id).toBe(c.id === 'windows-1258' ? text.normalize('NFC') : text)
      expect(Array.from(encodeText(text, c.id).bytes), c.id).toEqual(all)
    }
  })

  it('round-trips mixed text in every charset where it is representable', () => {
    const samples: Partial<Record<CharsetId, string>> = {
      'windows-1252': 'Größe: 5 € — “quoted” naïve',
      'windows-1258': 'Xin chào thế giới, Đà Nẵng, phở bò',
      'windows-1251': 'Съешь же ещё этих мягких французских булок',
      'koi8-r': 'Съешь же ещё этих мягких французских булок',
      shift_jis: 'こんにちは、世界！カタカナ ｶﾀｶﾅ',
      'euc-jp': 'こんにちは、世界！カタカナ ｶﾀｶﾅ',
      gbk: '你好，世界！简体中文',
      big5: '你好，世界！繁體中文',
      'euc-kr': '안녕하세요, 세계! 한국어',
    }
    for (const [charset, text] of Object.entries(samples) as [CharsetId, string][]) {
      const r = encodeText(text, charset)
      expect(r.unmappable, charset).toEqual([])
      expect(decodeBytes(r.bytes, charset).text.normalize('NFC'), charset).toBe(text)
    }
  })
})

describe('charset decode', () => {
  it('true ISO-8859-1 keeps 0x80-0x9F as C1 controls (TextDecoder would use Windows-1252)', () => {
    expect(decodeBytes(bytes('80 9f e9'), 'iso-8859-1').text).toBe('\u0080\u009fé')
    expect(decodeBytes(bytes('80'), 'windows-1252').text).toBe('€')
  })

  it('counts invalid sequences instead of throwing', () => {
    const r = decodeBytes(bytes('61 ff 62'), 'utf-8')
    expect(r.text).toBe('a�b')
    expect(r.invalid).toBe(1)
    expect(decodeBytes(bytes('ef bf bd'), 'utf-8')).toEqual({ text: '�', invalid: 0, bomRemoved: false })
  })

  it('NFC-normalizes Windows-1258 (base letter + combining tone mark)', () => {
    const r = decodeBytes(bytes('54 69 ea ec 6e 67 20 56 69 ea f2 74'), 'windows-1258')
    expect(r.text).toBe('Tiếng Việt'.normalize('NFC'))
    expect(r.text.length).toBe(10)
    expect(r.normalized).toBe(true)
    expect(decodeBytes(bytes('41 42'), 'windows-1258')).toEqual({ text: 'AB', invalid: 0, bomRemoved: false })
    // Other charsets are left as decoded.
    expect(decodeBytes(bytes('65 cc 81'), 'utf-8').text).toBe('e\u0301')
  })

  it('removes a BOM that matches the charset', () => {
    expect(decodeBytes(bytes('ef bb bf 41'), 'utf-8')).toEqual({ text: 'A', invalid: 0, bomRemoved: true })
    expect(decodeBytes(bytes('ff fe 41 00'), 'utf-16le')).toEqual({ text: 'A', invalid: 0, bomRemoved: true })
    expect(decodeBytes(bytes('fe ff 00 41'), 'utf-16be')).toEqual({ text: 'A', invalid: 0, bomRemoved: true })
  })
})

describe('charset detection', () => {
  const enc = (t: string, c: CharsetId) => encodeText(t, c).bytes

  it('uses the BOM first', () => {
    expect(detectCharset(bytes('ef bb bf 41'))).toMatchObject({ charset: 'utf-8', confidence: 'high' })
    expect(detectCharset(bytes('ff fe 41 00'))).toMatchObject({ charset: 'utf-16le', confidence: 'high' })
    expect(detectCharset(bytes('fe ff 00 41'))).toMatchObject({ charset: 'utf-16be', confidence: 'high' })
  })

  it('prefers valid UTF-8, then UTF-16 zero-byte patterns', () => {
    expect(detectCharset(enc('héllo wörld', 'utf-8'))).toMatchObject({ charset: 'utf-8', confidence: 'high' })
    expect(detectCharset(enc('plain', 'utf-8')).reason).toMatch(/ASCII/)
    expect(detectCharset(enc('Hello, world', 'utf-16le')).charset).toBe('utf-16le')
    expect(detectCharset(enc('Hello, wörld', 'utf-16be')).charset).toBe('utf-16be')
  })

  it.each([
    ['shift_jis', 'これは日本語のテキストです。カタカナも少し。'],
    ['euc-jp', 'これは日本語のテキストです。カタカナも少し。'],
    ['gbk', '这是一段简体中文的测试文本，我们来看看结果。'],
    ['big5', '這是一段繁體中文的測試文本，我們來看看結果。'],
    ['euc-kr', '이것은 한국어 텍스트입니다. 결과를 확인해 봅시다.'],
    ['windows-1252', 'Ça coûte très cher, déjà réglé à côté.'],
    ['windows-1252', 'Così però è più facile, perché sì.'],
    ['windows-1252', 'Größere Übungen für Bären.'],
    ['windows-1258', 'Tiếng Việt có dấu: đường phố Hà Nội.'],
    ['windows-1251', 'Съешь же ещё этих мягких французских булок.'],
    ['koi8-r', 'Съешь же ещё этих мягких французских булок.'],
  ] as [CharsetId, string][])('guesses %s for typical text', (charset, text) => {
    const d = detectCharset(enc(text, charset))
    expect(d.charset).toBe(charset)
    expect(d.confidence).toBe('low')
  })

  it.each([
    ['Chinese', '这是一段简体中文的测试文本，我们来看看结果。'],
    ['Japanese', 'これは日本語のテキストです。カタカナも少し。'],
    ['Korean', '이것은 한국어 텍스트입니다. 결과를 확인해 봅시다.'],
    ['Chinese with ASCII', 'UTF-16 编码的文本 (version 2) 没有字节顺序标记'],
  ])('recognises BOM-less UTF-16 %s text', (_, text) => {
    for (const charset of ['utf-16le', 'utf-16be'] as const) {
      const d = detectCharset(enc(text, charset))
      expect(d, charset).toMatchObject({ charset, confidence: 'low' })
      expect(d.reason).toMatch(/without BOM/)
    }
  })

  it('does not take Latin-1, UTF-8 or legacy CJK bytes for BOM-less UTF-16', () => {
    // Pairs of ASCII letters read as CJK ideographs in UTF-16; no control bytes, so not UTF-16.
    expect(detectCharset(enc('Bush hid the facts', 'utf-8')).charset).toBe('utf-8')
    expect(detectCharset(enc('this app can break', 'utf-8')).charset).toBe('utf-8')
    for (const [text, charset] of [
      ['Ça coûte très cher, déjà réglé à côté.', 'iso-8859-1'],
      ['Größere Übungen für Bären.', 'windows-1252'],
      ['这是一段简体中文的测试文本，我们来看看结果。', 'utf-8'],
      ['これは日本語のテキストです。', 'utf-8'],
      ['これは日本語のテキストです。カタカナも少し。', 'shift_jis'],
      ['这是一段简体中文的测试文本，我们来看看结果。', 'gbk'],
      ['이것은 한국어 텍스트입니다. 결과를 확인해 봅시다.', 'euc-kr'],
    ] as [string, CharsetId][]) {
      expect(detectCharset(enc(text, charset)).charset, `${charset}: ${text}`).not.toMatch(/^utf-16/)
    }
    // Too short to judge: fewer than 8 code units.
    expect(detectCharset(enc('你好，世界', 'utf-16le')).reason).not.toMatch(/CJK/)
  })

  it('samples large inputs for the heuristics but not for the UTF-8 check', () => {
    const big = enc('Съешь же ещё этих мягких французских булок. '.repeat(10_000), 'windows-1251')
    expect(big.length).toBeGreaterThan(DETECT_SAMPLE_BYTES)
    const d = detectCharset(big)
    expect(d.charset).toBe('windows-1251')
    expect(d.reason).toMatch(/first 64 KB/)
    // Legacy multi-byte text whose sample ends inside a character is still scored.
    const sjis = enc('これは日本語のテキストです。'.repeat(5000), 'shift_jis')
    expect(detectCharset(sjis.subarray(0, DETECT_SAMPLE_BYTES + 1)).charset).toBe('shift_jis')
    // Invalid UTF-8 after the sample is still found: the strict UTF-8 check reads everything.
    const utf8 = enc('é'.repeat(DETECT_SAMPLE_BYTES), 'utf-8')
    expect(detectCharset(utf8).charset).toBe('utf-8')
    const broken = new Uint8Array([...utf8, 0xff])
    expect(detectCharset(broken).charset).not.toBe('utf-8')
  })
})
