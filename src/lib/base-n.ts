// Base32 / Base32hex (RFC 4648), Base58 (Bitcoin), Ascii85 (Adobe), Z85
// (ZeroMQ RFC 32) and Base36. Pure functions on bytes, no DOM access.

export type BaseN = 'base32' | 'base32hex' | 'base58' | 'ascii85' | 'z85' | 'base36'

export const BASE_N_LABELS: Record<BaseN, string> = {
  base32: 'Base32 (RFC 4648)',
  base32hex: 'Base32hex (RFC 4648)',
  base58: 'Base58 (Bitcoin)',
  ascii85: 'Ascii85 (Adobe)',
  z85: 'Z85 (ZeroMQ)',
  base36: 'Base36',
}

export interface BaseNOptions {
  /** Base32: emit "=" padding (default true). */
  padding?: boolean
  /** Ascii85: wrap in <~ ~> (default false). */
  delimiters?: boolean
  /** Ascii85: write an all-zero group as "z" (default true). */
  zeroShortcut?: boolean
}

export function encodeBaseN(bytes: Uint8Array, base: BaseN, opts: BaseNOptions = {}): string {
  switch (base) {
    case 'base32':
    case 'base32hex':
      return base32Encode(bytes, base === 'base32hex', opts.padding ?? true)
    case 'base58':
      return base58Encode(bytes)
    case 'ascii85':
      return ascii85Encode(bytes, opts)
    case 'z85':
      return z85Encode(bytes)
    case 'base36':
      return base36Encode(bytes)
  }
}

export function decodeBaseN(text: string, base: BaseN): Uint8Array<ArrayBuffer> {
  switch (base) {
    case 'base32':
    case 'base32hex':
      return base32Decode(text, base === 'base32hex')
    case 'base58':
      return base58Decode(text)
    case 'ascii85':
      return ascii85Decode(text)
    case 'z85':
      return z85Decode(text)
    case 'base36':
      return base36Decode(text)
  }
}

const describeChar = (c: string) => (/\s/.test(c) || c < ' ' ? `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}` : `"${c}"`)

function badChar(name: string, c: string, pos: number): Error {
  return new Error(`Invalid ${name} character ${describeChar(c)} at position ${pos + 1}`)
}

// ---------------------------------------------------------------- Base32

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const B32HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV'

export function base32Encode(bytes: Uint8Array, hex = false, padding = true): string {
  const alphabet = hex ? B32HEX : B32
  let out = ''
  let buffer = 0
  let bits = 0
  for (const b of bytes) {
    buffer = ((buffer << 8) | b) & 0xffff
    bits += 8
    while (bits >= 5) {
      out += alphabet[(buffer >> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 31]
  if (padding) out += '='.repeat((8 - (out.length % 8)) % 8)
  return out
}

/** Case-insensitive; ignores whitespace; padding optional but must be correct if present. */
export function base32Decode(text: string, hex = false): Uint8Array<ArrayBuffer> {
  const name = hex ? 'Base32hex' : 'Base32'
  const alphabet = hex ? B32HEX : B32
  const s = text.replace(/\s+/g, '').toUpperCase()
  const firstPad = s.indexOf('=')
  const body = firstPad >= 0 ? s.slice(0, firstPad) : s
  if (firstPad >= 0) {
    if (!/^=+$/.test(s.slice(firstPad))) throw new Error(`Invalid ${name}: "=" padding in the middle (position ${firstPad + 1})`)
    if (s.length % 8 !== 0) throw new Error(`Invalid ${name}: padded input must be a multiple of 8 characters`)
    const pad = s.length - firstPad
    const expected = (8 - (body.length % 8)) % 8
    if (pad !== expected) throw new Error(`Invalid ${name}: ${pad} "=" padding character(s), expected ${expected}`)
  }
  // Valid unpadded lengths mod 8: 0, 2, 4, 5, 7 (RFC 4648 §6: 1-5 bytes per 8-char block).
  if ([1, 3, 6].includes(body.length % 8)) throw new Error(`Invalid ${name}: length ${body.length} is not a valid encoding length`)
  const out = new Uint8Array(Math.floor((body.length * 5) / 8))
  let buffer = 0
  let bits = 0
  let n = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i] ?? ''
    const v = alphabet.indexOf(c)
    if (v < 0) throw badChar(name, c, i)
    buffer = ((buffer << 5) | v) & 0xffff
    bits += 5
    if (bits >= 8) {
      out[n++] = (buffer >> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  if ((buffer & ((1 << bits) - 1)) !== 0) throw new Error(`Invalid ${name}: the last character has non-zero unused bits (not canonical)`)
  return out
}

// ---------------------------------------------------------------- Base58

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Bitcoin Base58: big-endian number, each leading 0x00 byte becomes "1". */
export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  // Repeated division of the byte array by 58 (O(n²), fine for tool-sized input).
  const digits: number[] = []
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i] ?? 0
    for (let j = 0; j < digits.length; j++) {
      carry += (digits[j] ?? 0) << 8
      digits[j] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let out = '1'.repeat(zeros)
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i] ?? 0]
  return out
}

export function base58Decode(text: string): Uint8Array<ArrayBuffer> {
  const s = text.replace(/\s+/g, '')
  let zeros = 0
  while (zeros < s.length && s[zeros] === '1') zeros++
  const bytes: number[] = [] // little-endian
  for (let i = zeros; i < s.length; i++) {
    const c = s[i] ?? ''
    const v = B58.indexOf(c)
    if (v < 0) {
      const hint = '0OIl'.includes(c) ? ' (Base58 omits 0, O, I and l)' : ''
      throw new Error(`${badChar('Base58', c, i).message}${hint}`)
    }
    let carry = v
    for (let j = 0; j < bytes.length; j++) {
      carry += (bytes[j] ?? 0) * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  const out = new Uint8Array(zeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i] ?? 0
  return out
}

// ---------------------------------------------------------------- Ascii85 / Z85

/** Ascii85 (Adobe/btoa): "!".."u", optional "z" for 0x00000000 groups, optional <~ ~>. */
export function ascii85Encode(bytes: Uint8Array, opts: BaseNOptions = {}): string {
  const { delimiters = false, zeroShortcut = true } = opts
  let out = ''
  for (let i = 0; i < bytes.length; i += 4) {
    const n = Math.min(4, bytes.length - i)
    const value = (((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0
    if (n === 4 && value === 0 && zeroShortcut) {
      out += 'z'
      continue
    }
    // A final group of n bytes is zero-padded and written as n + 1 characters.
    out += group85(value, (d) => String.fromCharCode(33 + d)).slice(0, n + 1)
  }
  return delimiters ? `<~${out}~>` : out
}

export function ascii85Decode(text: string): Uint8Array<ArrayBuffer> {
  let s = text.replace(/\s+/g, '')
  if (s.startsWith('<~')) s = s.slice(2)
  if (s.endsWith('~>')) s = s.slice(0, -2)
  else if (text.trimStart().startsWith('<~')) throw new Error('Invalid Ascii85: "<~" without closing "~>"')
  const out: number[] = []
  let group: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i] ?? ''
    if (c === 'z') {
      if (group.length) throw new Error(`Invalid Ascii85: "z" inside a group at position ${i + 1}`)
      out.push(0, 0, 0, 0)
      continue
    }
    const code = c.charCodeAt(0)
    if (code < 33 || code > 117) throw badChar('Ascii85', c, i)
    group.push(code - 33)
    if (group.length === 5) {
      out.push(...ungroup85(group, 'Ascii85', i - 4))
      group = []
    }
  }
  if (group.length === 1) throw new Error('Invalid Ascii85: the last group has a single character')
  if (group.length) {
    const n = group.length - 1
    // Pad with "u" (84), decode, keep n bytes.
    out.push(...ungroup85([...group, ...Array<number>(5 - group.length).fill(84)], 'Ascii85', s.length - group.length).slice(0, n))
  }
  return new Uint8Array(out)
}

const Z85 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#'

/** Z85 (ZeroMQ RFC 32): input length must be a multiple of 4 bytes. */
export function z85Encode(bytes: Uint8Array): string {
  if (bytes.length % 4 !== 0) throw new Error(`Z85 needs a multiple of 4 bytes; got ${bytes.length} (pad the data first)`)
  let out = ''
  for (let i = 0; i < bytes.length; i += 4) {
    const value = (((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0
    out += group85(value, (d) => Z85[d] ?? '')
  }
  return out
}

export function z85Decode(text: string): Uint8Array<ArrayBuffer> {
  const s = text.replace(/\s+/g, '')
  if (s.length % 5 !== 0) throw new Error(`Invalid Z85: length must be a multiple of 5 characters; got ${s.length}`)
  const out: number[] = []
  for (let i = 0; i < s.length; i += 5) {
    const group: number[] = []
    for (let j = i; j < i + 5; j++) {
      const c = s[j] ?? ''
      const v = Z85.indexOf(c)
      if (v < 0) throw badChar('Z85', c, j)
      group.push(v)
    }
    out.push(...ungroup85(group, 'Z85', i))
  }
  return new Uint8Array(out)
}

function group85(value: number, digit: (d: number) => string): string {
  let out = ''
  for (let k = 4; k >= 0; k--) {
    const p = 85 ** k
    out += digit(Math.floor(value / p) % 85)
  }
  return out
}

function ungroup85(group: number[], name: string, pos: number): number[] {
  let value = 0
  for (const d of group) value = value * 85 + d
  if (value > 0xffffffff) throw new Error(`Invalid ${name}: group at position ${pos + 1} is larger than 2^32 − 1`)
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

// ---------------------------------------------------------------- Base36

/**
 * Base36 of the bytes read as one big-endian unsigned integer (digits 0-9a-z).
 * Leading 0x00 bytes have no numeric value, so each is written as a leading
 * "0" (the Base58 convention) to keep the conversion lossless.
 */
export function base36Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  if (zeros === bytes.length) return '0'.repeat(zeros)
  let hex = ''
  for (let i = zeros; i < bytes.length; i++) hex += (bytes[i] ?? 0).toString(16).padStart(2, '0')
  return '0'.repeat(zeros) + BigInt(`0x${hex}`).toString(36)
}

export function base36Decode(text: string): Uint8Array<ArrayBuffer> {
  const s = text.replace(/\s+/g, '').toLowerCase()
  const bad = s.search(/[^0-9a-z]/)
  if (bad >= 0) throw badChar('Base36', s[bad] ?? '', bad)
  let zeros = 0
  while (zeros < s.length && s[zeros] === '0') zeros++
  if (zeros === s.length) return new Uint8Array(zeros)
  let n = 0n
  // 10 digits per step stay well below 2^53.
  for (let i = zeros; i < s.length; i += 10) {
    const chunk = s.slice(i, i + 10)
    n = n * 36n ** BigInt(chunk.length) + BigInt(parseInt(chunk, 36))
  }
  let hex = n.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  const out = new Uint8Array(zeros + hex.length / 2)
  for (let i = 0; i < hex.length / 2; i++) out[zeros + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}
