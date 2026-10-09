// AES-GCM encryption via Web Crypto.
//
// Password mode output format (self-describing, all binary parts base64url):
//   v1.aes-256-gcm.pbkdf2-sha256.<iterations>.<salt>.<iv>.<ciphertext+tag>
// - salt: 16 random bytes, iv: 12 random bytes, tag: 128 bits (appended by Web Crypto).
// - key: PBKDF2-HMAC-SHA256(password UTF-8, salt, iterations) -> 256-bit AES key.
//
// Raw-key mode output: base64( iv(12) || ciphertext+tag ).
import { base64ToBytes, bytesToBase64, utf8Encode } from '../encoding'
import { randomBytes } from './random'

export const DEFAULT_PBKDF2_ITERATIONS = 600_000
const MIN_ITERATIONS = 1_000
const MAX_ITERATIONS = 10_000_000
const SALT_LENGTH = 16
const IV_LENGTH = 12
const TAG_LENGTH_BYTES = 16
const FORMAT_PREFIX = 'v1.aes-256-gcm.pbkdf2-sha256'

const b64url = (b: Uint8Array) => bytesToBase64(b, { urlSafe: true })

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptWithPassword(
  plaintext: Uint8Array<ArrayBuffer>,
  password: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
): Promise<string> {
  if (password.length === 0) throw new Error('Password must not be empty')
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error(`Iterations must be between ${MIN_ITERATIONS} and ${MAX_ITERATIONS}`)
  }
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = await deriveKey(password, salt, iterations)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return [FORMAT_PREFIX, String(iterations), b64url(salt), b64url(iv), b64url(ct)].join('.')
}

export interface ParsedEnvelope {
  iterations: number
  salt: Uint8Array<ArrayBuffer>
  iv: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
}

export function parseEnvelope(input: string): ParsedEnvelope {
  const parts = input.trim().split('.')
  if (parts.length !== 7 || parts.slice(0, 3).join('.') !== FORMAT_PREFIX) {
    throw new Error(`Unrecognized format. Expected "${FORMAT_PREFIX}.<iterations>.<salt>.<iv>.<ciphertext>"`)
  }
  const [, , , iterStr, saltStr, ivStr, ctStr] = parts as [string, string, string, string, string, string, string]
  if (!/^\d+$/.test(iterStr)) throw new Error('Invalid iteration count')
  const iterations = Number(iterStr)
  if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error(`Iteration count ${iterations} is outside the accepted range`)
  }
  const salt = base64ToBytes(saltStr)
  const iv = base64ToBytes(ivStr)
  const ciphertext = base64ToBytes(ctStr)
  if (salt.length !== SALT_LENGTH) throw new Error('Invalid salt length')
  if (iv.length !== IV_LENGTH) throw new Error('Invalid IV length')
  if (ciphertext.length < TAG_LENGTH_BYTES) throw new Error('Ciphertext is too short')
  return { iterations, salt, iv, ciphertext }
}

const DECRYPT_FAILED = 'Decryption failed: wrong password/key or the data was modified.'

export async function decryptWithPassword(envelope: string, password: string): Promise<Uint8Array<ArrayBuffer>> {
  const { iterations, salt, iv, ciphertext } = parseEnvelope(envelope)
  const key = await deriveKey(password, salt, iterations)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext))
  } catch {
    throw new Error(DECRYPT_FAILED)
  }
}

async function importRawKey(keyBytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (![16, 24, 32].includes(keyBytes.length)) {
    throw new Error(`AES key must be 128, 192 or 256 bits (got ${keyBytes.length * 8} bits)`)
  }
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptWithKey(
  plaintext: Uint8Array<ArrayBuffer>,
  keyBytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const key = await importRawKey(keyBytes)
  const iv = randomBytes(IV_LENGTH)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  const out = new Uint8Array(IV_LENGTH + ct.length)
  out.set(iv, 0)
  out.set(ct, IV_LENGTH)
  return bytesToBase64(out)
}

export async function decryptWithKey(
  data: string,
  keyBytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importRawKey(keyBytes)
  const raw = base64ToBytes(data)
  if (raw.length < IV_LENGTH + TAG_LENGTH_BYTES) throw new Error('Ciphertext is too short')
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, IV_LENGTH) }, key, raw.slice(IV_LENGTH)),
    )
  } catch {
    throw new Error(DECRYPT_FAILED)
  }
}
