// Byte/text encoding helpers. Pure functions, no DOM access.

const encoder = new TextEncoder()

export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text) as Uint8Array<ArrayBuffer>
}

/** Strict UTF-8 decode: throws on invalid byte sequences. */
export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
}

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    utf8Decode(bytes)
    return true
  } catch {
    return false
  }
}

export interface Base64Options {
  urlSafe?: boolean
  /** Keep "=" padding. Defaults to true for standard, false for URL-safe. */
  padding?: boolean
}

export function bytesToBase64(bytes: Uint8Array, opts: Base64Options = {}): string {
  const { urlSafe = false, padding = !urlSafe } = opts
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  let out = btoa(binary)
  if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_')
  if (!padding) out = out.replace(/=+$/, '')
  return out
}

/**
 * Lenient decoder: accepts standard and URL-safe alphabets, missing padding and
 * embedded whitespace. Throws a descriptive Error on invalid input.
 */
export function base64ToBytes(input: string): Uint8Array<ArrayBuffer> {
  let s = input.replace(/\s+/g, '')
  if (s.startsWith('data:')) {
    const comma = s.indexOf(',')
    if (comma < 0) throw new Error('Invalid data URL: missing ","')
    if (!/;base64$/i.test(s.slice(0, comma))) throw new Error('Data URL is not Base64-encoded (missing ";base64")')
    s = s.slice(comma + 1)
  }
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const firstPad = s.indexOf('=')
  if (firstPad >= 0 && !/^=+$/.test(s.slice(firstPad))) {
    throw new Error(`Invalid Base64: "=" padding in the middle (position ${firstPad})`)
  }
  const body = firstPad >= 0 ? s.slice(0, firstPad) : s
  if (firstPad >= 0) {
    const expectedPad = (4 - (body.length % 4)) % 4
    if (body.length === 0 || s.length - firstPad !== expectedPad) {
      throw new Error('Invalid Base64: wrong amount of "=" padding')
    }
  }
  const bad = body.search(/[^A-Za-z0-9+/]/)
  if (bad >= 0) {
    throw new Error(`Invalid Base64 character "${body[bad]}" at position ${bad}`)
  }
  if (body.length % 4 === 1) {
    throw new Error('Invalid Base64: length is not valid (one stray character)')
  }
  const padded = body + '='.repeat((4 - (body.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function textToBase64(text: string, opts: Base64Options = {}): string {
  return bytesToBase64(utf8Encode(text), opts)
}

export function base64ToText(b64: string): string {
  const bytes = base64ToBytes(b64)
  try {
    return utf8Decode(bytes)
  } catch {
    throw new Error('Decoded bytes are not valid UTF-8 text (binary data?). Try the Base64 File or Hex tool.')
  }
}

export function bytesToHex(bytes: Uint8Array, separator = ''): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(separator)
}

/** Accepts optional "0x" prefix, whitespace, ":" or "-" separators. */
export function hexToBytes(input: string): Uint8Array<ArrayBuffer> {
  const s = input.replace(/^0x/i, '').replace(/[\s:-]+/g, '')
  if (s.length % 2 !== 0) throw new Error('Invalid hex: odd number of digits')
  const bad = s.search(/[^0-9a-fA-F]/)
  if (bad >= 0) throw new Error(`Invalid hex character "${s[bad]}"`)
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

export type ByteFormat = 'text' | 'hex' | 'base64'

export function parseBytes(input: string, format: ByteFormat): Uint8Array<ArrayBuffer> {
  switch (format) {
    case 'text':
      return utf8Encode(input)
    case 'hex':
      return hexToBytes(input)
    case 'base64':
      return base64ToBytes(input)
  }
}

export function formatBytes(bytes: Uint8Array, format: Exclude<ByteFormat, 'text'> | 'base64url'): string {
  switch (format) {
    case 'hex':
      return bytesToHex(bytes)
    case 'base64':
      return bytesToBase64(bytes)
    case 'base64url':
      return bytesToBase64(bytes, { urlSafe: true })
  }
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`
}

/** Extracts the MIME type from a data URL, if present. */
export function dataUrlMime(input: string): string | null {
  const m = /^data:([^;,]*)[;,]/.exec(input.trim())
  return m ? m[1] || 'text/plain' : null
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
