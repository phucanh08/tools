import { describe, expect, it } from 'vitest'
import { canonicalMime, extensionFor, mediaType, sameMime, sniffMedia, sniffMimeType } from './media-sniff'
import { utf8Encode } from './encoding'

/** Bytes from numbers and ASCII strings, padded with zeros to `len`. */
function b(parts: (number[] | string)[], len = 64): Uint8Array {
  const out: number[] = []
  for (const p of parts) {
    if (typeof p === 'string') for (const c of p) out.push(c.charCodeAt(0))
    else out.push(...p)
  }
  while (out.length < len) out.push(0)
  return new Uint8Array(out)
}

const ftyp = (brand: string, compat: string[] = []) => b([[0, 0, 0, 16 + compat.length * 4], 'ftyp', brand, [0, 0, 0, 0], ...compat])

describe('sniffMimeType', () => {
  // Signatures: WHATWG MIME Sniffing §6.1-6.2 and the format specs noted inline.
  const cases: [string, Uint8Array, string][] = [
    ['PNG (PNG spec §5.2)', b([[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 'IHDR']), 'image/png'],
    ['APNG (acTL before IDAT)', b([[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 'IHDR', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'acTL']), 'image/apng'],
    ['JPEG (SOI + marker, ITU T.81)', b([[0xff, 0xd8, 0xff, 0xe0]]), 'image/jpeg'],
    ['GIF87a', b(['GIF87a']), 'image/gif'],
    ['GIF89a', b(['GIF89a']), 'image/gif'],
    ['WebP (RIFF/WEBP)', b(['RIFF', [0, 0, 0, 0], 'WEBPVP8 ']), 'image/webp'],
    ['BMP', b(['BM', [0x3a, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0, 0x28]]), 'image/bmp'],
    ['ICO', b([[0, 0, 1, 0, 1, 0, 16, 16]]), 'image/x-icon'],
    ['TIFF little-endian', b(['II*', [0]]), 'image/tiff'],
    ['TIFF big-endian', b(['MM', [0], '*']), 'image/tiff'],
    ['AVIF (ftyp avif)', ftyp('avif'), 'image/avif'],
    ['AVIF (mif1 + compatible avif)', ftyp('mif1', ['avif']), 'image/avif'],
    ['HEIC', ftyp('heic'), 'image/heic'],
    ['JPEG XL codestream', b([[0xff, 0x0a]]), 'image/jxl'],
    ['PDF (ISO 32000 header)', b(['%PDF-1.7\n']), 'application/pdf'],
    ['MP3 with ID3v2 tag', b(['ID3', [4, 0, 0, 0, 0, 0, 0]]), 'audio/mpeg'],
    ['MP3 frame sync (MPEG-1 Layer III 128 kbit/s 44.1 kHz)', b([[0xff, 0xfb, 0x90, 0x64]]), 'audio/mpeg'],
    ['MPEG-2 Layer III frame', b([[0xff, 0xf3, 0x84, 0xc4]]), 'audio/mpeg'],
    // ADTS frame_length = 16 (13 bits from bytes 3-5), so the next sync word is at offset 16.
    ['AAC ADTS', b([[0xff, 0xf1, 0x50, 0x80, 0x02, 0x1f, 0xfc], [0, 0, 0, 0, 0, 0, 0, 0, 0], [0xff, 0xf1, 0x50, 0x80, 0x02, 0x1f, 0xfc]]), 'audio/aac'],
    ['WAV (RIFF/WAVE)', b(['RIFF', [36, 0, 0, 0], 'WAVEfmt ']), 'audio/wav'],
    ['AVI', b(['RIFF', [0, 0, 0, 0], 'AVI LIST']), 'video/x-msvideo'],
    ['Ogg (RFC 3533 capture pattern)', b(['OggS', [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 19], 'OpusHead']), 'audio/ogg'],
    ['Ogg Theora', b(['OggS', [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 42, 0x80], 'theora']), 'video/ogg'],
    ['FLAC', b(['fLaC', [0, 0, 0, 34]]), 'audio/flac'],
    ['MIDI', b(['MThd', [0, 0, 0, 6]]), 'audio/midi'],
    ['MP4 (isom)', ftyp('isom', ['iso2', 'mp41']), 'video/mp4'],
    ['M4A', ftyp('M4A '), 'audio/mp4'],
    ['QuickTime', ftyp('qt  '), 'video/quicktime'],
    ['3GP', ftyp('3gp5'), 'video/3gpp'],
    ['WebM (EBML DocType webm)', b([[0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84], 'webm']), 'video/webm'],
    ['Matroska', b([[0x1a, 0x45, 0xdf, 0xa3, 0xa3, 0x42, 0x82, 0x88], 'matroska']), 'video/x-matroska'],
    ['ZIP local file header', b(['PK', [3, 4, 20, 0]]), 'application/zip'],
    ['ZIP (empty archive)', b(['PK', [5, 6]]), 'application/zip'],
    ['EPUB (OCF mimetype entry)', b(['PK', [3, 4], [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0], 'mimetypeapplication/epub+zip'], 96), 'application/epub+zip'],
    ['gzip (RFC 1952)', b([[0x1f, 0x8b, 0x08, 0]]), 'application/gzip'],
    ['bzip2 (block header magic)', b(['BZh9', [0x31, 0x41, 0x59, 0x26, 0x53, 0x59]]), 'application/x-bzip2'],
    ['bzip2 (empty stream, end-of-stream magic)', b(['BZh9', [0x17, 0x72, 0x45, 0x38, 0x50, 0x90, 0, 0, 0, 0]], 14), 'application/x-bzip2'],
    ['xz', b([[0xfd, 0x37, 0x7a, 0x58, 0x5a, 0]]), 'application/x-xz'],
    ['zstd', b([[0x28, 0xb5, 0x2f, 0xfd]]), 'application/zstd'],
    ['7z', b([[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]]), 'application/x-7z-compressed'],
    ['RAR 5', b(['Rar!', [0x1a, 0x07, 0x01, 0x00]]), 'application/vnd.rar'],
    ['WOFF', b(['wOFF']), 'font/woff'],
    ['WOFF2', b(['wOF2']), 'font/woff2'],
    ['OpenType CFF', b(['OTTO']), 'font/otf'],
    ['TrueType', b([[0, 1, 0, 0, 0, 12]]), 'font/ttf'],
    ['WebAssembly', b([[0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]]), 'application/wasm'],
    ['SQLite', b(['SQLite format 3', [0]]), 'application/vnd.sqlite3'],
    ['ELF', b([[0x7f], 'ELF']), 'application/x-elf'],
    // e_lfanew (offset 0x3C) = 0x40 points to the "PE\0\0" signature.
    ['PE/EXE', b(['MZ', new Array(58).fill(0), [0x40, 0, 0, 0], 'PE', [0, 0, 0x4c, 0x01]], 96), 'application/vnd.microsoft.portable-executable'],
  ]
  for (const [name, bytes, mime] of cases) {
    it(name, () => expect(sniffMimeType(bytes)).toBe(mime))
  }

  it('recognises SVG but never classifies HTML as an image', () => {
    expect(sniffMimeType(utf8Encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml')
    expect(sniffMimeType(utf8Encode('﻿  <?xml version="1.0"?>\n<!-- c -->\n<svg width="1">'))).toBe('image/svg+xml')
    expect(sniffMimeType(utf8Encode('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">'))).toBe('image/svg+xml')
    expect(sniffMimeType(utf8Encode('<!doctype html><svg></svg>'))).toBe('text/html')
    expect(sniffMimeType(utf8Encode('  <html><body><svg/></body></html>'))).toBe('text/html')
    expect(sniffMimeType(utf8Encode('<script>alert(1)</script>'))).toBe('text/html')
    expect(sniffMimeType(utf8Encode('<?xml version="1.0"?><root/>'))).toBe('application/xml')
    expect(sniffMimeType(utf8Encode('{"a":[1,2]}'))).toBe('application/json')
    expect(sniffMimeType(utf8Encode('hello world'))).toBe('text/plain')
  })

  it('requires a second MPEG frame header when the buffer is long enough (WHATWG §6.4.4)', () => {
    // MPEG-1 Layer III, 128 kbit/s, 44.1 kHz, no padding: 144 * 128000 / 44100 = 417 bytes.
    const header = [0xff, 0xfb, 0x90, 0x64]
    const twoFrames = new Uint8Array(417 + 4 + 100)
    twoFrames.set(header, 0)
    twoFrames.set(header, 417)
    expect(sniffMimeType(twoFrames)).toBe('audio/mpeg')
    const oneHeader = new Uint8Array(417 + 4 + 100)
    oneHeader.set(header, 0)
    expect(sniffMimeType(oneHeader)).toBeNull()
    // Padding bit adds one byte: the next header is at 418.
    const padded = new Uint8Array(600)
    padded.set([0xff, 0xfb, 0x92, 0x64], 0)
    padded.set(header, 418)
    expect(sniffMimeType(padded)).toBe('audio/mpeg')
    // Free-format bitrate (index 0): frame length unknown, not accepted from a bare sync.
    expect(sniffMimeType(b([[0xff, 0xfb, 0x00, 0x64]]))).toBeNull()
    // ADTS with an impossible frame_length (< 7-byte header) is not AAC.
    expect(sniffMimeType(b([[0xff, 0xf1, 0x50, 0x80]]))).toBeNull()
  })

  it('does not mistake text for weak binary signatures', () => {
    const utf16le = (s: string) => new Uint8Array([0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])])
    const utf16be = (s: string) => new Uint8Array([0xfe, 0xff, ...[...s].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff])])
    expect(sniffMimeType(new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]))).toBe('text/plain')
    expect(sniffMimeType(utf16le('Hello, world! Xin chào'.repeat(40)))).toBe('text/plain')
    expect(sniffMimeType(utf16be('Hello'))).toBe('text/plain')
    expect(sniffMimeType(utf8Encode('ID3v2 is a metadata container used with MP3 files.'))).toBe('text/plain')
    expect(sniffMimeType(utf8Encode('BZh9 hello'))).toBe('text/plain')
    expect(sniffMimeType(utf8Encode('MZ is the DOS header magic. '.repeat(4)))).toBe('text/plain')
    // "MZ" whose e_lfanew points outside the buffer or not to "PE\0\0" is not an executable.
    expect(sniffMimeType(b(['MZ', new Array(58).fill(0), [0x40, 0, 0, 0], 'NE']))).toBeNull()
    expect(sniffMimeType(b(['MZ', new Array(58).fill(0), [0, 1, 0, 0]]))).toBeNull()
    // ID3 header with a non-syncsafe size byte or an unknown major version.
    expect(sniffMimeType(b(['ID3', [4, 0, 0, 0, 0, 0x80, 0]]))).toBeNull()
    expect(sniffMimeType(b(['ID3', [0xff, 0, 0, 0, 0, 0, 0]]))).toBeNull()
    expect(sniffMimeType(b(['ID3', [3, 0, 0, 0, 0, 2, 1]]))).toBe('audio/mpeg')
  })

  it('returns null for unknown binary and empty input', () => {
    expect(sniffMimeType(new Uint8Array([0, 1, 2, 3, 0xfe, 0x80, 0x81]))).toBeNull()
    expect(sniffMimeType(new Uint8Array())).toBeNull()
    // Frame-sync lookalikes with reserved fields are not MP3.
    expect(sniffMimeType(new Uint8Array([0xff, 0xfb, 0xf0, 0x00, 0x99]))).toBeNull()
    expect(sniffMimeType(new Uint8Array([0xff, 0xeb, 0x90, 0x00, 0x99]))).toBeNull()
  })
})

describe('media types', () => {
  it('resolves aliases and compares types', () => {
    expect(canonicalMime('IMAGE/JPG; foo=bar')).toBe('image/jpeg')
    expect(sameMime('audio/mp3', 'audio/mpeg')).toBe(true)
    expect(sameMime('image/png', 'image/jpeg')).toBe(false)
    expect(sameMime('application/x-zip-compressed', 'application/zip')).toBe(true)
  })

  it('maps types to extensions and preview kinds', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('audio/x-wav')).toBe('wav')
    expect(extensionFor('application/x-unknown')).toBe('bin')
    expect(mediaType('image/svg+xml').preview).toBe('image')
    expect(mediaType('application/pdf').preview).toBe('pdf')
    expect(mediaType('video/webm').preview).toBe('video')
    expect(mediaType('text/html').preview).toBe('none')
    expect(mediaType('image/tiff').preview).toBe('none')
    expect(sniffMedia(b(['fLaC']))).toEqual({ mime: 'audio/flac', ext: 'flac', label: 'FLAC audio', preview: 'audio' })
  })
})
