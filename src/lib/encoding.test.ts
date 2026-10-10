import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  base64ToText,
  bytesToBase64,
  bytesToHex,
  hexToBytes,
  textToBase64,
} from './encoding'
import { decodeEntities, encodeEntities, minifyHtml } from './html'
import { timestampToMs, urlDecode, urlEncode } from './misc'

describe('base64', () => {
  it('matches RFC 4648 test vectors', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ]
    for (const [plain, b64] of vectors) {
      expect(textToBase64(plain)).toBe(b64)
      expect(base64ToText(b64)).toBe(plain)
    }
  })

  it('round-trips UTF-8 text (Vietnamese, emoji)', () => {
    const s = 'Xin chào thế giới 👋 — ñ 日本語'
    expect(base64ToText(textToBase64(s))).toBe(s)
    expect(textToBase64('é')).toBe('w6k=')
  })

  it('URL-safe variant uses -_ and no padding, and decodes back', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0xfe])
    expect(bytesToBase64(bytes)).toBe('+/+//g==')
    expect(bytesToBase64(bytes, { urlSafe: true })).toBe('-_-__g')
    expect(Array.from(base64ToBytes('-_-__g'))).toEqual(Array.from(bytes))
    expect(Array.from(base64ToBytes('+/+//g=='))).toEqual(Array.from(bytes))
  })

  it('round-trips all byte values and large inputs', () => {
    const bytes = new Uint8Array(100_000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
    expect(base64ToBytes(bytesToBase64(bytes, { urlSafe: true }))).toEqual(bytes)
  })

  it('accepts whitespace and data URLs, rejects garbage', () => {
    expect(base64ToText('Zm9v\nYmFy')).toBe('foobar')
    expect(base64ToText('data:text/plain;base64,Zm9vYmFy')).toBe('foobar')
    expect(() => base64ToBytes('Zm9v!')).toThrow(/Invalid Base64 character "!"/)
    expect(() => base64ToBytes('Zm=9v')).toThrow(/padding/)
    expect(() => base64ToBytes('Z')).toThrow(/length/)
  })

  it('reports non-UTF-8 binary data clearly', () => {
    expect(() => base64ToText('/w==')).toThrow(/not valid UTF-8/)
  })
})

describe('hex', () => {
  it('round-trips and accepts separators/prefix', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff')
    expect(Array.from(hexToBytes('0x00 0f:FF'))).toEqual([0, 15, 255])
    expect(() => hexToBytes('abc')).toThrow(/odd/)
    expect(() => hexToBytes('zz')).toThrow(/Invalid hex/)
  })
})


describe('html entities', () => {
  it('minimal encode escapes the five special characters', () => {
    expect(encodeEntities(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    )
  })
  it('non-ascii mode encodes accents and emoji', () => {
    expect(encodeEntities('café ©', 'non-ascii')).toBe('caf&eacute; &copy;')
    expect(encodeEntities('😀', 'non-ascii')).toBe('&#x1F600;')
  })
  it('decodes named, decimal and hex references', () => {
    expect(decodeEntities('&lt;p&gt; &amp;amp; &eacute; &#233; &#xE9; &nbsp;')).toBe('<p> &amp; é é é  ')
  })
  it('round-trips', () => {
    const s = `<script>alert("x & y")</script> é 😀`
    for (const mode of ['minimal', 'non-ascii', 'all'] as const) {
      expect(decodeEntities(encodeEntities(s, mode))).toBe(s)
    }
  })
})

describe('html minify', () => {
  it('removes comments and collapses whitespace but keeps <pre>', () => {
    const html = `<div>\n  <!-- note -->\n  <p>Hello   <b>big</b>   world</p>\n  <pre>  keep\n   this </pre>\n</div>`
    expect(minifyHtml(html)).toBe('<div><p>Hello <b>big</b> world</p><pre>  keep\n   this </pre></div>')
  })
  it('keeps conditional comments', () => {
    expect(minifyHtml('<!--[if IE]><p>x</p><![endif]-->')).toContain('<!--[if IE]>')
  })
})

describe('url + timestamp', () => {
  it('encodes and decodes components', () => {
    expect(urlEncode('a b&c=d/é')).toBe('a%20b%26c%3Dd%2F%C3%A9')
    expect(urlEncode('a b', 'form')).toBe('a+b')
    expect(urlDecode('a+b%20c', 'form')).toBe('a b c')
    expect(urlDecode('a%20b%26c%3Dd%2F%C3%A9')).toBe('a b&c=d/é')
    expect(() => urlDecode('%E0%A4%A')).toThrow(/Malformed/)
  })
  it('auto-detects timestamp units', () => {
    expect(timestampToMs('1700000000')).toEqual({ ms: 1700000000000, unit: 's' })
    expect(timestampToMs('1700000000123')).toEqual({ ms: 1700000000123, unit: 'ms' })
    expect(new Date(timestampToMs('0').ms).toISOString()).toBe('1970-01-01T00:00:00.000Z')
    expect(() => timestampToMs('abc')).toThrow()
  })
})
