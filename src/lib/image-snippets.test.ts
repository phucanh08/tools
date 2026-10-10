import { describe, expect, it } from 'vitest'
import { altFromFileName, buildSnippets, encodeImage, escapeHtml, escapeMarkdownAlt, imageDimensions, overheadPercent, withAlt } from './image-snippets'
import { base64ToBytes, utf8Encode } from './encoding'

// A real 1×1 RGBA PNG (signature + IHDR + IDAT + IEND).
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))

describe('imageDimensions', () => {
  it('reads PNG IHDR (PNG spec §11.2.2)', () => {
    expect(imageDimensions(base64ToBytes(PNG_1X1))).toEqual({ width: 1, height: 1 })
    const big = bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 'IHDR', [0, 0, 0x0f, 0xa0, 0, 0, 0x02, 0x58])
    expect(imageDimensions(big)).toEqual({ width: 4000, height: 600 })
  })

  it('reads GIF, BMP and ICO headers', () => {
    expect(imageDimensions(bytes('GIF89a', [10, 0, 20, 0]))).toEqual({ width: 10, height: 20 })
    const bmp = bytes('BM', [0, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 0x20, 0x03, 0, 0, 0x38, 0xff, 0xff, 0xff])
    expect(imageDimensions(bmp)).toEqual({ width: 800, height: 200 }) // top-down BMP has a negative height
    const ico = bytes([0, 0, 1, 0, 2, 0], [16, 16, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(imageDimensions(ico)).toEqual({ width: 256, height: 256 })
  })

  it('reads the JPEG SOF segment after APP segments (ITU T.81 B.2.2)', () => {
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe0, 0, 16], 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
      [0xff, 0xc4, 0, 3, 0],
      [0xff, 0xc0, 0, 17, 8, 0x01, 0xe0, 0x02, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
    )
    expect(imageDimensions(jpeg)).toEqual({ width: 640, height: 480 })
    expect(imageDimensions(bytes([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })

  it('reads WebP VP8, VP8L and VP8X (RFC 9649)', () => {
    const riff = (chunk: string, body: number[]) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', chunk, [0, 0, 0, 0], body)
    expect(imageDimensions(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00]))).toEqual({ width: 320, height: 240 })
    // VP8L: 14-bit width-1 and height-1 packed little-endian after the 0x2f signature: 100 x 50.
    const w = 99
    const h = 49
    const bits = w | (h << 14)
    expect(imageDimensions(riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff]))).toEqual({
      width: 100,
      height: 50,
    })
    expect(imageDimensions(riff('VP8X', [0, 0, 0, 0, 0x7f, 0x07, 0, 0x37, 0x04, 0]))).toEqual({ width: 1920, height: 1080 })
    // Truncated VP8X header (29 bytes): unknown, not 1 x 1.
    expect(imageDimensions(riff('VP8X', [0, 0, 0, 0, 0x7f, 0x07, 0, 0x37, 0x04]))).toBeNull()
    expect(imageDimensions(riff('VP8X', []))).toBeNull()
  })

  it('reads SVG width/height or viewBox', () => {
    const svg = (s: string) => imageDimensions(utf8Encode(s))
    expect(svg('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16px">')).toEqual({ width: 24, height: 16 })
    expect(svg('<?xml version="1.0"?><svg viewBox="0 0 100 50">')).toEqual({ width: 100, height: 50 })
    expect(svg("<svg width='200' viewBox='0,0,100,50'>")).toEqual({ width: 200, height: 100 })
    expect(svg('<svg width="100%" height="2em">')).toBeNull()
  })

  it('returns null for unknown data', () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

describe('snippets', () => {
  it('escapes HTML and Markdown alt text', () => {
    expect(escapeHtml(`a "b" <c> & 'd'`)).toBe('a &quot;b&quot; &lt;c&gt; &amp; &#39;d&#39;')
    expect(escapeMarkdownAlt('a [b] \\ c\nd')).toBe('a \\[b\\] \\\\ c d')
  })

  it('derives alt text from the file name', () => {
    expect(altFromFileName('my_photo-2024.final.png')).toBe('my photo 2024.final')
    expect(altFromFileName('C:\\x\\logo.svg')).toBe('logo')
    expect(altFromFileName('.png')).toBe('image')
  })

  it('builds data URI, CSS, HTML, Markdown and JSON snippets', () => {
    const png = base64ToBytes(PNG_1X1)
    const s = buildSnippets(png, 'image/png', 'a "logo" <b>', { width: 1, height: 1 })
    const uri = `data:image/png;base64,${PNG_1X1}`
    expect(s.base64).toBe(PNG_1X1)
    expect(s.dataUri).toBe(uri)
    expect(s.css).toBe(`background-image: url("${uri}");`)
    expect(s.html).toBe(`<img src="${uri}" alt="a &quot;logo&quot; &lt;b&gt;" width="1" height="1">`)
    expect(s.markdown).toBe(`![a "logo" <b>](${uri})`)
    expect(JSON.parse(s.json)).toBe(uri)
    expect(buildSnippets(png, 'image/png', 'x', null).html).toBe(`<img src="${uri}" alt="x">`)
  })

  it('reuses one encoding for every alt text', () => {
    const png = base64ToBytes(PNG_1X1)
    const encoded = encodeImage(png, 'image/png')
    expect(encoded.dataUri).toBe(`data:image/png;base64,${PNG_1X1}`)
    for (const alt of ['a', 'b [c]']) {
      const s = withAlt(encoded, alt, { width: 1, height: 1 })
      expect(s).toEqual(buildSnippets(png, 'image/png', alt, { width: 1, height: 1 }))
      expect(s.dataUri).toBe(encoded.dataUri)
    }
  })

  it('computes the Base64 overhead', () => {
    expect(overheadPercent(3, 4)).toBeCloseTo(33.333, 2)
    expect(overheadPercent(70, 96)).toBeCloseTo(37.142, 2)
    expect(overheadPercent(0, 0)).toBe(0)
  })
})
