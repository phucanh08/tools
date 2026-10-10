// Image → Base64 snippets: data URI, CSS, HTML, Markdown, JSON.
// Pure functions, no DOM access.

import { bytesToBase64 } from './encoding'

export interface Dimensions {
  width: number
  height: number
}

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0)
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8)
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16)
const u32be = (b: Uint8Array, i: number) => (b[i] ?? 0) * 0x1000000 + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0)
const i32le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16) | ((b[i + 3] ?? 0) << 24)
const tag = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0))

function valid(d: Dimensions): Dimensions | null {
  return Number.isFinite(d.width) && Number.isFinite(d.height) && d.width > 0 && d.height > 0 ? d : null
}

function jpegSize(b: Uint8Array): Dimensions | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] ?? 0
    if (marker === 0xff) {
      i++ // fill byte
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null // end of image / start of scan before any SOF
    // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC): ITU T.81 Table B.1.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return valid({ height: u16be(b, i + 5), width: u16be(b, i + 7) })
    }
    i += 2 + u16be(b, i + 2)
  }
  return null
}

function svgSize(b: Uint8Array): Dimensions | null {
  const text = new TextDecoder().decode(b.subarray(0, 4096))
  const open = /<svg\b[^>]*>/i.exec(text)?.[0]
  if (!open) return null
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(open)?.[1]?.trim()
  const px = (v: string | undefined) => {
    const m = v ? /^(\d+(?:\.\d+)?)(px)?$/.exec(v) : null
    return m ? Math.round(Number(m[1])) : null
  }
  const w = px(attr('width'))
  const h = px(attr('height'))
  if (w && h) return { width: w, height: h }
  const vb = attr('viewBox')
    ?.split(/[\s,]+/)
    .map(Number)
  if (vb && vb.length === 4 && vb.every(Number.isFinite)) {
    const vw = vb[2] ?? 0
    const vh = vb[3] ?? 0
    if (vw > 0 && vh > 0) {
      if (w) return { width: w, height: Math.round((w * vh) / vw) }
      if (h) return { width: Math.round((h * vw) / vh), height: h }
      return { width: Math.round(vw), height: Math.round(vh) }
    }
  }
  return null
}

/** Reads the pixel size from the image header (PNG, GIF, JPEG, WebP, BMP, ICO, AVIF, SVG). */
export function imageDimensions(b: Uint8Array): Dimensions | null {
  // PNG: IHDR is the first chunk (PNG spec §11.2.2).
  if (tag(b, 0, '\u0089PNG') && tag(b, 12, 'IHDR')) return valid({ width: u32be(b, 16), height: u32be(b, 20) })
  // GIF: logical screen descriptor.
  if (tag(b, 0, 'GIF8')) return valid({ width: u16le(b, 6), height: u16le(b, 8) })
  if (b[0] === 0xff && b[1] === 0xd8) return jpegSize(b)
  if (tag(b, 0, 'RIFF') && tag(b, 8, 'WEBP')) {
    if (tag(b, 12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return valid({ width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff })
    }
    if (tag(b, 12, 'VP8L') && b[20] === 0x2f) {
      const b1 = b[21] ?? 0
      const b2 = b[22] ?? 0
      const b3 = b[23] ?? 0
      const b4 = b[24] ?? 0
      return valid({ width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) })
    }
    if (tag(b, 12, 'VP8X')) return valid({ width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) })
    return null
  }
  if (tag(b, 0, 'BM') && b.length >= 26) {
    if (i32le(b, 14) === 12) return valid({ width: u16le(b, 18), height: u16le(b, 20) })
    return valid({ width: i32le(b, 18), height: Math.abs(i32le(b, 22)) })
  }
  // ICO: largest directory entry (0 means 256).
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    let best: Dimensions | null = null
    const count = u16le(b, 4)
    for (let k = 0; k < count && 6 + k * 16 + 2 <= b.length; k++) {
      const width = b[6 + k * 16] || 256
      const height = b[7 + k * 16] || 256
      if (!best || width * height > best.width * best.height) best = { width, height }
    }
    return best
  }
  // AVIF/HEIF: image spatial extents property ("ispe" box).
  if (tag(b, 4, 'ftyp')) {
    for (let i = 8; i + 16 <= Math.min(b.length, 65536); i++) {
      if (tag(b, i, 'ispe')) return valid({ width: u32be(b, i + 8), height: u32be(b, i + 12) })
    }
    return null
  }
  return svgSize(b)
}

/** Escapes text for an HTML attribute value or text node. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Escapes Markdown image alt text (brackets and backslashes). */
export function escapeMarkdownAlt(s: string): string {
  return s.replace(/[\\[\]]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, ' ')
}

/** "my_photo-2024.final.png" → "my photo 2024.final". */
export function altFromFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  const alt = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return alt || 'image'
}

export interface Snippets {
  base64: string
  dataUri: string
  css: string
  html: string
  markdown: string
  json: string
}

export function buildSnippets(bytes: Uint8Array, mime: string, alt: string, size: Dimensions | null): Snippets {
  const base64 = bytesToBase64(bytes)
  const dataUri = `data:${mime};base64,${base64}`
  const dims = size ? ` width="${size.width}" height="${size.height}"` : ''
  return {
    base64,
    dataUri,
    css: `background-image: url("${dataUri}");`,
    html: `<img src="${dataUri}" alt="${escapeHtml(alt)}"${dims}>`,
    markdown: `![${escapeMarkdownAlt(alt)}](${dataUri})`,
    json: JSON.stringify(dataUri),
  }
}

/** Size growth of Base64 over the original bytes, in percent (≈33.3% for large inputs). */
export function overheadPercent(originalBytes: number, encodedChars: number): number {
  if (originalBytes === 0) return 0
  return ((encodedChars - originalBytes) / originalBytes) * 100
}
