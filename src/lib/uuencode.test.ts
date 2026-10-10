import { describe, expect, it } from 'vitest'
import { utf8Decode, utf8Encode } from './encoding'
import { lineStats, unwrapLines, wrapLines } from './mime'
import { safeFilename, uudecode, uuencode } from './uuencode'

describe('uuencode', () => {
  it('encodes the Wikipedia "Cat" example', () => {
    // https://en.wikipedia.org/wiki/Uuencoding : "Cat" -> "#0V%T"; CPython binascii.b2a_uu(b"Cat", backtick=True)
    expect(uuencode(utf8Encode('Cat'), { filename: 'cat.txt' })).toBe('begin 644 cat.txt\n#0V%T\n`\nend\n')
  })

  it('encodes the Wikipedia URL example with last-line padding', () => {
    // Wikipedia; CPython binascii.b2a_uu(b"http://www.wikipedia.org\r\n", backtick=True)
    const out = uuencode(utf8Encode('http://www.wikipedia.org\r\n'), { filename: 'wikipedia-url.txt' })
    expect(out).toBe("begin 644 wikipedia-url.txt\n::'1T<#HO+W=W=RYW:6MI<&5D:6$N;W)G#0H`\n`\nend\n")
  })

  it('splits at 45 bytes per line ("M" length character)', () => {
    // CPython binascii.b2a_uu(bytes(range(45)), backtick=True)
    const out = uuencode(Uint8Array.from({ length: 46 }, (_, i) => i), { mode: '600', filename: 'x', eol: '\r\n' })
    const lines = out.split('\r\n')
    expect(lines[0]).toBe('begin 600 x')
    expect(lines[1]).toBe('M``$"`P0%!@<("0H+#`T.#Q`1$A,4%187&!D:&QP=\'A\\@(2(C)"4F)R@I*BLL')
    expect(lines[2]).toBe('!+0``')
    expect(lines.slice(3)).toEqual(['`', 'end', ''])
  })

  it('validates mode and file name', () => {
    expect(() => uuencode(new Uint8Array(1), { mode: '999' })).toThrow(/octal/)
    expect(() => uuencode(new Uint8Array(1), { filename: ' ' })).toThrow(/required/)
  })
})

describe('uudecode', () => {
  it('decodes the Wikipedia examples and header fields', () => {
    const r = uudecode('begin 644 cat.txt\n#0V%T\n`\nend\n')
    expect(utf8Decode(r.bytes)).toBe('Cat')
    expect(r).toMatchObject({ filename: 'cat.txt', mode: '644', warnings: [] })
    const url = uudecode("begin 644 wikipedia-url.txt\r\n::'1T<#HO+W=W=RYW:6MI<&5D:6$N;W)G#0H`\r\n`\r\nend\r\n")
    expect(utf8Decode(url.bytes)).toBe('http://www.wikipedia.org\r\n')
  })

  it('accepts spaces for zero and stripped trailing spaces', () => {
    // Old encoders use " " for zero; "!" + "  " encodes one 0x00 byte, here with trailing spaces stripped.
    const r = uudecode('begin 755 my file.bin\n!\n \nend')
    expect(Array.from(r.bytes)).toEqual([0])
    expect(r.filename).toBe('my file.bin')
    expect(r.mode).toBe('755')
  })

  it('round-trips random binary data of many lengths', () => {
    for (let len = 0; len < 140; len++) {
      const bytes = crypto.getRandomValues(new Uint8Array(len))
      expect(uudecode(uuencode(bytes, { filename: 'r.bin' })).bytes).toEqual(bytes)
    }
  })

  it('reports problems', () => {
    expect(() => uudecode('#0V%T')).toThrow(/No "begin/)
    expect(() => uudecode('begin abc x\n')).toThrow(/Invalid header/)
    expect(() => uudecode('begin 644 x\n#0V~T\n`\nend')).toThrow(/invalid character "~"/)
    expect(uudecode('begin 644 x\n#0V%T\n').warnings).toEqual(['Missing "end" line; the data may be truncated'])
    expect(uudecode('begin 644 x\n#0V%T\nend').warnings).toEqual(['Missing zero-length ("`") line before "end"'])

  })

  it('validates the length character and flags lines missing data characters', () => {
    // "N" would mean 46 bytes (max is 45 = "M"); "a" and "~" are outside the alphabet.
    expect(() => uudecode('begin 644 x\nN0V%T\n`\nend')).toThrow(/Line 2: invalid length character "N"/)
    expect(() => uudecode('begin 644 x\na0V%T\n`\nend')).toThrow(/invalid length character "a"/)
    expect(uudecode('begin 644 x\nM' + '`'.repeat(60) + '\n`\nend').bytes.length).toBe(45)
    // "#" (3 bytes) needs 4 characters, all of which hold data bits.
    const short = (body: string) => uudecode(`begin 644 x\n${body}\n\`\nend`).warnings
    const warn = (missing: number) =>
      `Line 2: ${missing} data character(s) missing, decoded as zero bits (trailing spaces may have been stripped, or the line is truncated)`
    expect(short('#0V%')).toEqual([warn(1)])
    expect(short('#0V')).toEqual([warn(2)])
    // "!" (1 byte) uses 2 data characters + 2 padding: stripped padding is not a warning.
    expect(short('!0V')).toEqual([])
    expect(short('!0')).toEqual([warn(1)])
    // "\"" (2 bytes) uses 3 data characters + 1 padding.
    expect(short('"0V%')).toEqual([])
    expect(short('"0V')).toEqual([warn(1)])
    expect(uudecode('begin 644 x\n"0V%\n`\nend').bytes).toEqual(new Uint8Array([0x43, 0x61]))
  })

  it('makes download names safe', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd')
    expect(safeFilename('C:\\dir\\a.txt')).toBe('a.txt')
    expect(safeFilename('..')).toBe('file.bin')
  })
})

describe('MIME line wrapping', () => {
  it('wraps at 76 columns with CRLF by default (RFC 2045 §6.8)', () => {
    const b64 = 'A'.repeat(200)
    const wrapped = wrapLines(b64)
    expect(wrapped.split('\r\n').map((l) => l.length)).toEqual([76, 76, 48])
    expect(wrapped.endsWith('\r\n')).toBe(false)
    expect(lineStats(wrapped)).toEqual({ lines: 3, longest: 76, crlf: 2, lf: 0 })

  })

  it('counts lines of very large inputs without a stack overflow', () => {
    const many = 'QUJD\n'.repeat(300_000) + 'QUJDREVG'
    expect(lineStats(many)).toEqual({ lines: 300_001, longest: 8, crlf: 0, lf: 300_000 })
  })

  it('supports other widths and LF, and is idempotent', () => {
    const wrapped = wrapLines('QUJDREVGR0g=', 4, '\n')
    expect(wrapped).toBe('QUJD\nREVG\nR0g=')
    expect(wrapLines(wrapped, 4, '\n')).toBe(wrapped)
    expect(wrapLines('', 76)).toBe('')
    expect(() => wrapLines('abc', 0)).toThrow(/at least 1/)
  })

  it('unwraps any mix of line endings and spaces', () => {
    expect(unwrapLines('QUJD\r\nREVG\n R0g=\t')).toBe('QUJDREVGR0g=')
  })
})
