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

// Bitrates in kbit/s by bitrate index 1-14 (ISO/IEC 11172-3 §2.4.2.3, ISO/IEC 13818-3 §2.4.2.3).
const MPEG1_BITRATES = {
  3: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // Layer I
  2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], // Layer II
  1: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // Layer III
} as Record<number, number[]>
const MPEG2_BITRATES = {
  3: [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  1: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
} as Record<number, number[]>
// Sample rates by version bits (0 = MPEG-2.5, 2 = MPEG-2, 3 = MPEG-1) and rate index 0-2.
const MPEG_RATES: Record<number, number[]> = { 0: [11025, 12000, 8000], 2: [22050, 24000, 16000], 3: [44100, 48000, 32000] }

/**
 * Length in bytes of the MPEG audio frame (or ADTS frame) whose header starts at
 * `s`, or 0 if there is no valid header there. MPEG audio: ISO/IEC 11172-3
 * §2.4.2.3 (version, layer, bitrate, sample rate, padding). ADTS: ISO/IEC
 * 13818-7 §6.2 (12-bit sync, layer 00, 13-bit frame_length).
 */
function frameLength(bytes: Uint8Array, s: number): number {
  if (s + 4 > bytes.length) return 0
  const b1 = bytes[s + 1] ?? 0
  const b2 = bytes[s + 2] ?? 0
  if (bytes[s] !== 0xff || (b1 & 0xe0) !== 0xe0) return 0
  const version = (b1 >> 3) & 0x03
  const layer = (b1 >> 1) & 0x03
  if (layer === 0) {
    // ADTS: sync 0xFFF and sampling index 13-15 reserved; the frame includes its 7-byte header.
    if ((b1 & 0xf0) !== 0xf0 || ((b2 >> 2) & 0x0f) >= 13 || s + 6 > bytes.length) return 0
    const len = (((bytes[s + 3] ?? 0) & 0x03) << 11) | ((bytes[s + 4] ?? 0) << 3) | ((bytes[s + 5] ?? 0) >> 5)
    return len >= 7 ? len : 0
  }
  if (version === 1) return 0 // reserved
  const index = b2 >> 4
  const rates = MPEG_RATES[version]
  const rate = rates?.[(b2 >> 2) & 0x03]
  // Index 0 is "free format" (length cannot be computed) and 15 is forbidden.
  const kbps = index >= 1 && index <= 14 ? (version === 3 ? MPEG1_BITRATES : MPEG2_BITRATES)[layer]?.[index - 1] : undefined
  if (!kbps || !rate) return 0
  const pad = (b2 >> 1) & 0x01
  const bps = kbps * 1000
  if (layer === 3) return (Math.floor((12 * bps) / rate) + pad) * 4 // Layer I: 4-byte slots
  const perFrame = layer === 1 && version !== 3 ? 72 : 144 // Layer III in MPEG-2/2.5 has half the samples
  return Math.floor((perFrame * bps) / rate) + pad
}

/**
 * MPEG audio / ADTS without an ID3 tag. Two or three bytes of frame sync are a
 * weak signature, so when the buffer is long enough the next frame header must
 * follow at the computed frame length (WHATWG MIME Sniffing §6.4.4).
 */
function sniffFrameSync(bytes: Uint8Array): 'audio/mpeg' | 'audio/aac' | null {
  const len = frameLength(bytes, 0)
  if (len === 0) return null
  if (len + 4 <= bytes.length && frameLength(bytes, len) === 0) return null
  return ((bytes[1] ?? 0) >> 1) & 0x03 ? 'audio/mpeg' : 'audio/aac'
}

/** ID3v2 header (id3v2.4.0-structure §3.1): "ID3", version 2-4, revision, flags, 4 syncsafe size bytes. */
function isId3v2(bytes: Uint8Array): boolean {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== 'ID3') return false
  const major = bytes[3] ?? 0
  if (major < 2 || major > 4 || bytes[4] === 0xff || ((bytes[5] ?? 0) & 0x0f) !== 0) return false
  for (let i = 6; i < 10; i++) if ((bytes[i] ?? 0) >= 0x80) return false
  return true
}

/** PE image: DOS "MZ" header whose e_lfanew (offset 0x3C) points to "PE\0\0" (Microsoft PE format §2-3). */
function isPortableExecutable(bytes: Uint8Array): boolean {
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false
  const lfanew = ((bytes[0x3c] ?? 0) | ((bytes[0x3d] ?? 0) << 8) | ((bytes[0x3e] ?? 0) << 16) | ((bytes[0x3f] ?? 0) << 24)) >>> 0
  return lfanew >= 64 && lfanew + 4 <= bytes.length && ascii(bytes, lfanew, lfanew + 4) === 'PE\u0000\u0000'
}

/**
 * Text with a UTF-16 byte order mark (FF FE little-endian, FE FF big-endian).
 * FF FE also looks like an MPEG frame sync, so this runs before that check.
 */
function isUtf16Text(bytes: Uint8Array): boolean {
  const le = bytes[0] === 0xff && bytes[1] === 0xfe
  if (!le && !(bytes[0] === 0xfe && bytes[1] === 0xff)) return false
  const head = bytes.subarray(2, 2 + 4096)
  // stream: a surrogate pair cut at the 4 KB boundary is held back instead of becoming U+FFFD.
  const text = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(head, { stream: true })
  return !text.includes('�') && !hasBinaryControls(text)
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
  if (isId3v2(bytes)) return 'audio/mpeg'
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
  // bzip2: "BZh" + block size '1'-'9', then a block header (pi) or, for empty input, the end-of-stream marker (sqrt pi).
  if (
    str('BZh') &&
    (bytes[3] ?? 0) >= 0x31 &&
    (bytes[3] ?? 0) <= 0x39 &&
    (at([0x31, 0x41, 0x59, 0x26, 0x53, 0x59], 4) || at([0x17, 0x72, 0x45, 0x38, 0x50, 0x90], 4))
  )
    return 'application/x-bzip2'
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
  if (isPortableExecutable(bytes)) return 'application/vnd.microsoft.portable-executable'

  // UTF-16 text with a BOM: FF FE would otherwise pass as an MPEG Layer I frame sync.
  if (isUtf16Text(bytes)) return 'text/plain'

  // MPEG audio without an ID3 tag: frame sync. Checked late because it is a weak signature.
  const frame = sniffFrameSync(bytes)
  if (frame) return frame

  return sniffText(bytes)
}

/** File extension for a MIME type, falling back to "bin". */
export function extensionFor(mime: string): string {
  return mediaType(mime).ext
}
