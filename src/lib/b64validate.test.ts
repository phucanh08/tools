import { describe, expect, it } from 'vitest'
import { analyzeBase64, describeChar, looksFormDecoded, repairBase64 } from './b64validate'
import { base64ToBytes, bytesToBase64, utf8Decode } from './encoding'

const text = (b: Uint8Array) => utf8Decode(b)

describe('analyzeBase64', () => {
  it('accepts the RFC 4648 §10 test vectors', () => {
    const vectors: [string, number][] = [
      ['Zg==', 1],
      ['Zm8=', 2],
      ['Zm9v', 3],
      ['Zm9vYg==', 4],
      ['Zm9vYmE=', 5],
      ['Zm9vYmFy', 6],
    ]
    for (const [b64, len] of vectors) {
      const a = analyzeBase64(b64)
      expect(a.valid, b64).toBe(true)
      expect(a.decodedBytes).toBe(len)
      expect(a.variant).toBe('standard')
      expect(a.warnings).toEqual([])
    }
  })

  it('reports the first invalid character with position, line and column', () => {
    const a = analyzeBase64('Zm9v!YmFy')
    expect(a.valid).toBe(false)
    expect(a.error).toMatchObject({ offset: 4, position: 5, line: 1, column: 5, char: '"!" (U+0021)' })
    expect(a.invalidChars).toBe(1)

    const b = analyzeBase64('Zm9v\nYm#y')
    expect(b.error).toMatchObject({ position: 8, line: 2, column: 3, char: '"#" (U+0023)' })

    // Position counts code points; offset counts UTF-16 units (for textarea selection).
    const c = analyzeBase64('😀Zm9v')
    expect(c.error).toMatchObject({ offset: 0, position: 1, char: '"😀" (U+1F600)' })
    const d = analyzeBase64('Zm😀9v.')
    expect(d.invalidChars).toBe(2)
    expect(d.error).toMatchObject({ offset: 2, position: 3 })

    expect(analyzeBase64('Zm 9v').error?.char).toBe('space (U+0020)')
    expect(analyzeBase64('"Zm9v"').error).toMatchObject({ offset: 0, char: '""" (U+0022)' })
  })

  it('detects URL-safe, MIME and data URL variants', () => {
    const url = analyzeBase64('-_-__g')
    expect(url).toMatchObject({ valid: true, variant: 'url-safe', alphabet: 'url-safe', decodedBytes: 4 })
    expect(url.warnings[0]?.message).toMatch(/No "=" padding \(2 missing\)/)

    const std = analyzeBase64('+/+//g==')
    expect(std).toMatchObject({ valid: true, variant: 'standard', alphabet: 'standard', padded: true })

    const bytes = new Uint8Array(120).map((_, i) => i)
    const wrapped = bytesToBase64(bytes).replace(/(.{76})/g, '$1\r\n')
    const mime = analyzeBase64(wrapped)
    expect(mime).toMatchObject({ valid: true, variant: 'mime', wrapped: true, lineLength: 76, decodedBytes: 120 })

    const data = analyzeBase64('data:image/png;base64,iVBORw0KGgo=')
    expect(data).toMatchObject({ valid: true, variant: 'data-url', dataUrl: { mime: 'image/png' }, decodedBytes: 8 })
    expect(analyzeBase64('  Zm9v\n').valid).toBe(true)
  })

  it('flags mixed alphabets at the first conflicting character', () => {
    const a = analyzeBase64('+/+_/g==')
    expect(a.alphabet).toBe('mixed')
    expect(a.error).toMatchObject({ offset: 3, char: '"_" (U+005F)' })
    expect(a.error?.message).toMatch(/Mixes standard/)
  })

  it('reports padding and length problems', () => {
    expect(analyzeBase64('Zm=9v').error).toMatchObject({ offset: 2, char: '"=" (U+003D)' })
    expect(analyzeBase64('Zg===').error).toMatchObject({ offset: 4, message: 'Too many "=": expected 2.' })
    expect(analyzeBase64('Zm9v=').error?.message).toMatch(/Unexpected "="/)
    expect(analyzeBase64('Zg=').error?.message).toMatch(/Incomplete padding/)
    expect(analyzeBase64('Zm9vY').error).toMatchObject({ offset: 4, message: expect.stringMatching(/Invalid length/) })
    expect(analyzeBase64('====').error?.message).toBe('There is no Base64 data.')
    expect(analyzeBase64('   ').error?.message).toBe('The input is empty.')
    expect(analyzeBase64('data:text/plain,hello').error?.message).toMatch(/not Base64-encoded/)
    expect(analyzeBase64('data:image/png;base64').error?.message).toMatch(/no ","/)
  })

  it('warns about non-canonical trailing bits (RFC 4648 §3.5)', () => {
    const a = analyzeBase64('Zh==')
    expect(a.valid).toBe(true)
    expect(a.warnings[0]?.message).toMatch(/Non-canonical/)
    expect(analyzeBase64('Zg==').warnings).toEqual([])
  })

  it('describes invisible characters by name', () => {
    expect(describeChar('\t')).toBe('tab (U+0009)')
    expect(describeChar(' ')).toBe('no-break space (U+00A0)')
    expect(describeChar('\u0001')).toBe('control character (U+0001)')
  })
})

describe('repairBase64', () => {
  it('strips quotes, JSON escapes and line breaks', () => {
    const r = repairBase64('"Zm9v\\nYmFy",')
    expect(r.output).toBe('Zm9vYmFy')
    expect(text(r.bytes)).toBe('foobar')
    const messages = r.changes.map((c) => c.message).join(' | ')
    expect(messages).toMatch(/quotes/)
    expect(messages).toMatch(/1 JSON\/JavaScript escape/)
    expect(messages).toMatch(/1 line break/)
  })

  it('removes or keeps the data URL prefix', () => {
    const r = repairBase64('data:image/png;base64,iVBORw0KGgo=')
    expect(r.output).toBe('iVBORw0KGgo=')
    expect(r.dataUrlMime).toBe('image/png')
    expect(repairBase64('data:image/png;base64,iVBORw0KGgo', { keepDataUrl: true }).output).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(() => repairBase64('data:text/plain,hi')).toThrow(/not Base64-encoded/)
  })

  it('decodes percent-encoding and HTML entities', () => {
    const r = repairBase64('%2B%2F%2B%2F%2fg%3D%3D')
    expect(r.output).toBe('+/+//g==')
    expect(r.changes[0]).toMatchObject({ kind: 'repair', message: expect.stringMatching(/Decoded 7 escaped characters/) })
    expect(repairBase64('SGk&#43;IQ&#x3D;&#61;').output).toBe('SGk+IQ==')
  })

  it('unifies mixed alphabets and converts between standard and URL-safe', () => {
    const mixed = repairBase64('+/+__g')
    expect(mixed.output).toBe('+/+//g==')
    expect(mixed.changes.some((c) => c.kind === 'repair' && /Mixed alphabets/.test(c.message))).toBe(true)
    const url = repairBase64('+/+//g==', { alphabet: 'url-safe', padding: false })
    expect(url.output).toBe('-_-__g')
    expect(url.changes.map((c) => c.message)).toEqual([
      'Converted 5 standard characters ("+", "/") to URL-safe ("-", "_").',
      'Removed "=" padding (2).',
    ])
    expect(repairBase64('-_-__g').output).toBe('+/+//g==')
  })

  it('fixes missing and excess padding', () => {
    expect(repairBase64('Zg')).toMatchObject({ output: 'Zg==', changes: [{ kind: 'format', message: 'Added 2 missing "=".' }] })
    expect(repairBase64('Zg====')).toMatchObject({ output: 'Zg==', changes: [{ kind: 'repair', message: 'Removed 2 excess "=".' }] })
    expect(repairBase64('Zg=').changes).toEqual([{ kind: 'repair', message: 'Added 1 missing "=".' }])
    expect(repairBase64('Zm9v').changes).toEqual([])
  })

  it('joins concatenated chunks and drops interior padding otherwise', () => {
    const joined = repairBase64('Zm8=YmFy')
    expect(text(joined.bytes)).toBe('fobar')
    expect(joined.output).toBe('Zm9iYXI=')
    expect(joined.changes[0]?.message).toMatch(/Joined 2 concatenated/)
    const dropped = repairBase64('Zm=9v')
    expect(dropped.output).toBe('Zm9v')
    expect(dropped.changes[0]).toMatchObject({ kind: 'lossy' })
  })

  it('removes stray characters and a dangling final character', () => {
    const r = repairBase64('Zm9v*YmFy!!')
    expect(r.output).toBe('Zm9vYmFy')
    expect(r.changes[0]?.message).toBe('Removed 3 invalid characters: "*" (U+002A), "!" (U+0021) ×2.')
    const d = repairBase64('Zm9vY')
    expect(d.output).toBe('Zm9v')
    expect(d.changes[0]).toMatchObject({ kind: 'lossy' })
    expect(() => repairBase64('"!!!"')).toThrow(/Nothing decodable/)
  })

  it('turns spaces back into "+" when asked', () => {
    // "Hi>!" = SGk+IQ== ; URL form decoding turned "+" into " ".
    expect(looksFormDecoded('SGk IQ==')).toBe(true)
    expect(looksFormDecoded('Zm9v\nYmFy')).toBe(false)
    expect(looksFormDecoded('SGk+IQ==')).toBe(false)
    expect(repairBase64('SGk IQ==', { spacesArePlus: true }).output).toBe('SGk+IQ==')
    expect(repairBase64('SGk IQ==').output).not.toBe('SGk+IQ==')
  })

  it('clears non-canonical bits and wraps lines', () => {
    expect(repairBase64('Zh==').output).toBe('Zg==')
    const bytes = new Uint8Array(100).map((_, i) => (i * 37) & 0xff)
    const r = repairBase64(bytesToBase64(bytes), { lineWidth: 76 })
    const lines = r.output.split('\n')
    expect(lines.map((l) => l.length)).toEqual([76, 60])
    expect(r.changes.at(-1)?.message).toBe('Wrapped lines at 76 characters.')
  })

  it('recovers the original bytes from a corrupted MIME block', () => {
    const bytes = new Uint8Array(300).map((_, i) => (i * 131 + 17) & 0xff)
    const clean = bytesToBase64(bytes)
    const messy = `  "${clean.replace(/(.{64})/g, '$1\r\n  ').replace(/\+/g, '%2B').replace(/\//g, '_')}"  `
    const r = repairBase64(messy)
    expect(r.output).toBe(clean)
    expect(base64ToBytes(r.output)).toEqual(bytes)
    expect(analyzeBase64(r.output).valid).toBe(true)
  })
})
