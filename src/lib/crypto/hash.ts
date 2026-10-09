// Message digests and HMAC. SHA-1/SHA-2 use Web Crypto; MD5 and SHA-3 use
// @noble/hashes (audited, dependency-free) since Web Crypto does not offer them.
import { md5 } from '@noble/hashes/legacy.js'
import { sha3_256, sha3_512 } from '@noble/hashes/sha3.js'
import { base64ToBytes, hexToBytes } from '../encoding'

export const HASH_ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA3-256', 'SHA3-512'] as const
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number]

export const HMAC_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const
export type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number]

export async function digest(alg: HashAlgorithm, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  switch (alg) {
    case 'MD5':
      return new Uint8Array(md5(data))
    case 'SHA3-256':
      return new Uint8Array(sha3_256(data))
    case 'SHA3-512':
      return new Uint8Array(sha3_512(data))
    default:
      return new Uint8Array(await crypto.subtle.digest(alg, data))
  }
}

export async function hmac(
  alg: HmacAlgorithm,
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (key.length === 0) throw new Error('HMAC key must not be empty')
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: alg }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/**
 * Does `expected` (hex, case-insensitive; or Base64/Base64url, case-sensitive)
 * encode exactly these digest bytes? Compares decoded bytes, never strings.
 */
export function digestMatches(bytes: Uint8Array, expected: string): boolean {
  const s = expected.replace(/\s+/g, '')
  if (s === '') return false
  if (/^[0-9a-fA-F]+$/.test(s) && s.length === bytes.length * 2) {
    return timingSafeEqual(hexToBytes(s), bytes)
  }
  try {
    return timingSafeEqual(base64ToBytes(s), bytes)
  } catch {
    return false
  }
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}
