// Media type detection from magic bytes, fuller than encoding.sniffMime.
// Pure functions, no DOM access. Signatures follow the WHATWG MIME Sniffing
// Standard (§6 "Matching a MIME type pattern") and each format's own spec.

export type PreviewKind = 'image' | 'audio' | 'video' | 'pdf' | 'none'

export interface MediaType {
  mime: string
  ext: string
  /** Human-readable format name. */
  label: string
  /** How the Media Viewer may preview it safely ('none' = download only). */
  preview: PreviewKind
}

const TYPES: Record<string, Omit<MediaType, 'mime'>> = {
  'image/png': { ext: 'png', label: 'PNG image', preview: 'image' },
  'image/apng': { ext: 'png', label: 'Animated PNG image', preview: 'image' },
  'image/jpeg': { ext: 'jpg', label: 'JPEG image', preview: 'image' },
  'image/gif': { ext: 'gif', label: 'GIF image', preview: 'image' },
  'image/webp': { ext: 'webp', label: 'WebP image', preview: 'image' },
  'image/bmp': { ext: 'bmp', label: 'BMP image', preview: 'image' },
  'image/x-icon': { ext: 'ico', label: 'ICO icon', preview: 'image' },
  'image/svg+xml': { ext: 'svg', label: 'SVG image', preview: 'image' },
  'image/avif': { ext: 'avif', label: 'AVIF image', preview: 'image' },
  'image/heic': { ext: 'heic', label: 'HEIC/HEIF image', preview: 'none' },
  'image/tiff': { ext: 'tiff', label: 'TIFF image', preview: 'none' },
  'image/jxl': { ext: 'jxl', label: 'JPEG XL image', preview: 'none' },
  'image/vnd.adobe.photoshop': { ext: 'psd', label: 'Photoshop document', preview: 'none' },
  'application/pdf': { ext: 'pdf', label: 'PDF document', preview: 'pdf' },
  'audio/mpeg': { ext: 'mp3', label: 'MP3 audio', preview: 'audio' },
  'audio/aac': { ext: 'aac', label: 'AAC audio (ADTS)', preview: 'audio' },
  'audio/wav': { ext: 'wav', label: 'WAV audio', preview: 'audio' },
  'audio/ogg': { ext: 'ogg', label: 'Ogg audio', preview: 'audio' },
  'audio/flac': { ext: 'flac', label: 'FLAC audio', preview: 'audio' },
  'audio/mp4': { ext: 'm4a', label: 'MPEG-4 audio', preview: 'audio' },
  'audio/midi': { ext: 'mid', label: 'MIDI', preview: 'none' },
  'video/mp4': { ext: 'mp4', label: 'MP4 video', preview: 'video' },
  'video/quicktime': { ext: 'mov', label: 'QuickTime video', preview: 'video' },
  'video/3gpp': { ext: '3gp', label: '3GPP video', preview: 'video' },
  'video/webm': { ext: 'webm', label: 'WebM video', preview: 'video' },
  'video/x-matroska': { ext: 'mkv', label: 'Matroska video', preview: 'video' },
  'video/ogg': { ext: 'ogv', label: 'Ogg video', preview: 'video' },
  'video/x-msvideo': { ext: 'avi', label: 'AVI video', preview: 'none' },
  'application/zip': { ext: 'zip', label: 'ZIP archive', preview: 'none' },
  'application/epub+zip': { ext: 'epub', label: 'EPUB e-book', preview: 'none' },
  'application/vnd.oasis.opendocument.text': { ext: 'odt', label: 'OpenDocument text', preview: 'none' },
  'application/vnd.oasis.opendocument.spreadsheet': { ext: 'ods', label: 'OpenDocument spreadsheet', preview: 'none' },
  'application/vnd.oasis.opendocument.presentation': { ext: 'odp', label: 'OpenDocument presentation', preview: 'none' },
  'application/gzip': { ext: 'gz', label: 'gzip archive', preview: 'none' },
  'application/x-bzip2': { ext: 'bz2', label: 'bzip2 archive', preview: 'none' },
  'application/x-xz': { ext: 'xz', label: 'xz archive', preview: 'none' },
  'application/zstd': { ext: 'zst', label: 'Zstandard archive', preview: 'none' },
  'application/x-7z-compressed': { ext: '7z', label: '7-Zip archive', preview: 'none' },
  'application/vnd.rar': { ext: 'rar', label: 'RAR archive', preview: 'none' },
  'font/woff': { ext: 'woff', label: 'WOFF font', preview: 'none' },
  'font/woff2': { ext: 'woff2', label: 'WOFF2 font', preview: 'none' },
  'font/ttf': { ext: 'ttf', label: 'TrueType font', preview: 'none' },
  'font/otf': { ext: 'otf', label: 'OpenType font', preview: 'none' },
  'application/wasm': { ext: 'wasm', label: 'WebAssembly module', preview: 'none' },
  'application/vnd.sqlite3': { ext: 'sqlite', label: 'SQLite database', preview: 'none' },
  'application/x-elf': { ext: 'elf', label: 'ELF executable', preview: 'none' },
  'application/vnd.microsoft.portable-executable': { ext: 'exe', label: 'Windows executable', preview: 'none' },
  'text/html': { ext: 'html', label: 'HTML document', preview: 'none' },
  'application/xml': { ext: 'xml', label: 'XML document', preview: 'none' },
  'application/json': { ext: 'json', label: 'JSON', preview: 'none' },
  'text/plain': { ext: 'txt', label: 'Plain text', preview: 'none' },
}

/** Common aliases mapped to the canonical type used above. */
const ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/vnd.microsoft.icon': 'image/x-icon',
  'image/ico': 'image/x-icon',
  'image/x-ms-bmp': 'image/bmp',
  'image/heif': 'image/heic',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-aac': 'audio/aac',
  'audio/mid': 'audio/midi',
  'audio/x-midi': 'audio/midi',
  'video/x-m4v': 'video/mp4',
  'video/mkv': 'video/x-matroska',
  'video/avi': 'video/x-msvideo',
  'application/x-zip-compressed': 'application/zip',
  'application/x-gzip': 'application/gzip',
  'application/x-rar-compressed': 'application/vnd.rar',
  'application/x-font-woff': 'font/woff',
  'application/font-woff': 'font/woff',
  'application/x-font-ttf': 'font/ttf',
  'text/xml': 'application/xml',
}

/** Lower-cased MIME type without parameters, with known aliases resolved. */
export function canonicalMime(mime: string): string {
  const base = (mime.split(';')[0] ?? '').trim().toLowerCase()
  return ALIASES[base] ?? base
}

export function sameMime(a: string, b: string): boolean {
  return canonicalMime(a) === canonicalMime(b)
}

/** Describes a MIME type (unknown types get a generic, download-only entry). */
export function mediaType(mime: string): MediaType {
  const m = canonicalMime(mime)
  const known = TYPES[m]
  if (known) return { mime: m, ...known }
  return { mime: m || 'application/octet-stream', ext: 'bin', label: m || 'Unknown binary data', preview: 'none' }
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let s = ''
  for (let i = from; i < Math.min(to, bytes.length); i++) s += String.fromCharCode(bytes[i] ?? 0)
  return s
}

function indexOfAscii(bytes: Uint8Array, needle: string, from: number, to: number): number {
  const end = Math.min(to, bytes.length) - needle.length
  outer: for (let i = from; i <= end; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer
    return i
  }
  return -1
}

/** MPEG audio frame header (ISO/IEC 11172-3 §2.4.2.3): 11-bit sync, valid version/layer/bitrate/rate. */
function isMpegAudioFrame(b0: number, b1: number, b2: number): 'audio/mpeg' | 'audio/aac' | null {
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null
  const version = (b1 >> 3) & 0x03
  const layer = (b1 >> 1) & 0x03
  if (layer === 0) {
    // ADTS (ISO/IEC 13818-7): 12-bit sync 0xFFF, layer 00; sampling index 13-15 reserved.
    return (b1 & 0xf0) === 0xf0 && ((b2 >> 2) & 0x0f) < 13 ? 'audio/aac' : null
  }
  if (version === 1) return null // reserved
  const bitrate = b2 >> 4
  const rate = (b2 >> 2) & 0x03
  if (bitrate === 0x0f || rate === 0x03) return null
  return 'audio/mpeg'
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

function sniffFtyp(bytes: Uint8Array): string {
  const major = ascii(bytes, 8, 12)
  const boxSize = ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0)
  const brands = [major]
  for (let i = 16; i + 4 <= Math.min(boxSize, bytes.length, 64); i += 4) brands.push(ascii(bytes, i, i + 4))
  if (brands.includes('avif') || brands.includes('avis')) return 'image/avif'
  if (HEIF_BRANDS.has(major)) return 'image/heic'
  if (major === 'M4A ' || major === 'M4B ' || major === 'M4P ') return 'audio/mp4'
  if (major === 'qt  ') return 'video/quicktime'
  if (major.startsWith('3g')) return 'video/3gpp'
  return 'video/mp4'
}

const HTML_START = /^<(?:!doctype\s+html|html|head|body|script|iframe|style|title|div|p|a|table|br|b|h1|font|!--)[\s>/]/i

/** Control characters other than tab, LF, FF, CR and ESC suggest binary data. */
function hasBinaryControls(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0c && c !== 0x0d && c !== 0x1b) || c === 0x7f) return true
  }
  return false
}

function sniffText(bytes: Uint8Array): string | null {
  let start = 0
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3
  const head = new TextDecoder('utf-8').decode(bytes.subarray(start, start + 1024)).replace(/^\s+/, '')
  if (/^<svg[\s>]/i.test(head)) return 'image/svg+xml'
  if (/^<\?xml[\s\S]*?<(?:!doctype\s+svg|svg)[\s>]/i.test(head) || /^<!doctype\s+svg/i.test(head)) {
    return 'image/svg+xml'
  }
  if (HTML_START.test(head)) return 'text/html'
  if (head.startsWith('<?xml')) return 'application/xml'
  // Plain text: valid UTF-8 without control characters (other than tab/CR/LF/FF/ESC).
  try {
    const all = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, start + 4096))
    if (all.length > 0 && !hasBinaryControls(all)) {
      const t = all.trim()
      if ((t.startsWith('{') || t.startsWith('[')) && bytes.length <= 4096) {
        try {
          JSON.parse(t)
          return 'application/json'
        } catch {
          /* not JSON */
        }
      }
      return 'text/plain'
    }
  } catch {
    // A multi-byte sequence may be cut at the 4 KB boundary; treat as binary.
  }
  return null
}

/**
 * Detects the media type from magic bytes. Returns null for unknown binary data.
 * Text formats (SVG, HTML, XML, JSON, plain text) are recognised so that the
 * viewer can refuse to render HTML.
 */
export function sniffMedia(bytes: Uint8Array): MediaType | null {
  const mime = sniffMimeType(bytes)
  return mime ? mediaType(mime) : null
}

export function sniffMimeType(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null
  const at = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  const str = (s: string, offset = 0) => ascii(bytes, offset, offset + s.length) === s

  // Images
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    // APNG: an acTL chunk before the first IDAT (PNG 3rd edition §11.3.4).
    const idat = indexOfAscii(bytes, 'IDAT', 8, 4096)
    const actl = indexOfAscii(bytes, 'acTL', 8, idat < 0 ? 4096 : idat)
    return actl >= 0 ? 'image/apng' : 'image/png'
  }
  if (at([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (str('GIF87a') || str('GIF89a')) return 'image/gif'
  if (str('RIFF') && bytes.length >= 12) {
    const form = ascii(bytes, 8, 12)
    if (form === 'WEBP') return 'image/webp'
    if (form === 'WAVE') return 'audio/wav'
    if (form === 'AVI ') return 'video/x-msvideo'
  }
  if (str('BM') && bytes.length >= 26 && at([0, 0, 0, 0], 6)) return 'image/bmp'
  if (at([0x00, 0x00, 0x01, 0x00]) && bytes.length >= 6 && (bytes[4] ?? 0) + (bytes[5] ?? 0) > 0) return 'image/x-icon'
  if (str('ftyp', 4) && bytes.length >= 12) return sniffFtyp(bytes)
  if (str('II*\u0000') || str('MM\u0000*')) return 'image/tiff'
  if (at([0xff, 0x0a]) || at([0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) return 'image/jxl'
  if (str('8BPS')) return 'image/vnd.adobe.photoshop'

  // Documents and audio/video containers
  if (str('%PDF-')) return 'application/pdf'
  if (str('ID3') && bytes.length >= 10) return 'audio/mpeg'
  if (str('OggS')) {
    return indexOfAscii(bytes, '\u0080theora', 26, 128) >= 0 ? 'video/ogg' : 'audio/ogg'
  }
  if (str('fLaC')) return 'audio/flac'
  if (str('MThd')) return 'audio/midi'
  if (at([0x1a, 0x45, 0xdf, 0xa3])) {
    if (indexOfAscii(bytes, 'webm', 4, 64) >= 0) return 'video/webm'
    return 'video/x-matroska'
  }

  // Archives and fonts
  if (str('PK\u0003\u0004')) {
    // OCF / ODF: first entry is an uncompressed file named "mimetype" (EPUB OCF §4.3).
    if (str('mimetype', 30)) {
      const m = /^[a-z0-9.+-]+\/[a-z0-9.+-]+/.exec(ascii(bytes, 38, 38 + 80))?.[0]
      if (m && TYPES[m]) return m
    }
    return 'application/zip'
  }
  if (str('PK\u0005\u0006') || str('PK\u0007\u0008')) return 'application/zip'
  if (at([0x1f, 0x8b, 0x08])) return 'application/gzip'
  if (str('BZh') && (bytes[3] ?? 0) >= 0x31 && (bytes[3] ?? 0) <= 0x39) return 'application/x-bzip2'
  if (at([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return 'application/x-xz'
  if (at([0x28, 0xb5, 0x2f, 0xfd])) return 'application/zstd'
  if (at([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return 'application/x-7z-compressed'
  if (str('Rar!\u001a\u0007')) return 'application/vnd.rar'
  if (str('wOFF')) return 'font/woff'
  if (str('wOF2')) return 'font/woff2'
  if (str('OTTO')) return 'font/otf'
  if (at([0x00, 0x01, 0x00, 0x00, 0x00])) return 'font/ttf'
  if (at([0x00, 0x61, 0x73, 0x6d])) return 'application/wasm'
  if (str('SQLite format 3\u0000')) return 'application/vnd.sqlite3'
  if (at([0x7f, 0x45, 0x4c, 0x46])) return 'application/x-elf'
  if (str('MZ') && bytes.length >= 64) return 'application/vnd.microsoft.portable-executable'

  // MPEG audio without an ID3 tag: frame sync. Checked late because 2 bytes are a weak signature.
  const frame = isMpegAudioFrame(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0)
  if (frame) return frame

  return sniffText(bytes)
}

/** File extension for a MIME type, falling back to "bin". */
export function extensionFor(mime: string): string {
  return mediaType(mime).ext
}
