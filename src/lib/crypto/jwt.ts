// JWT (JWS compact serialization) decode, verify and HMAC signing.
import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from '../encoding'
import { hmac } from './hash'
import { verify as verifySignature, SIGN_ALGORITHMS, type SignAlgorithm } from './keys'

export interface DecodedJwt {
  header: Record<string, unknown>
  payload: unknown
  signature: Uint8Array<ArrayBuffer>
  signingInput: Uint8Array<ArrayBuffer>
  parts: [string, string, string]
}

function decodeSegment(segment: string, name: string): unknown {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new Error(`Invalid JWT ${name}: not base64url`)
  let text: string
  try {
    text = utf8Decode(base64ToBytes(segment))
  } catch {
    throw new Error(`Invalid JWT ${name}: not valid base64url / UTF-8`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Invalid JWT ${name}: not valid JSON`)
  }
}

export function decodeJwt(token: string): DecodedJwt {
  const t = token.trim().replace(/^Bearer\s+/i, '')
  const parts = t.split('.')
  if (parts.length === 5) throw new Error('This looks like an encrypted JWT (JWE); only signed JWTs (JWS) are supported')
  if (parts.length !== 3) throw new Error(`A JWT has 3 dot-separated parts; found ${parts.length}`)
  const [h, p, s] = parts as [string, string, string]
  const header = decodeSegment(h, 'header')
  if (header === null || typeof header !== 'object' || Array.isArray(header)) {
    throw new Error('Invalid JWT header: must be a JSON object')
  }
  const payload = decodeSegment(p, 'payload')
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('Invalid JWT signature: not base64url')
  return {
    header: header as Record<string, unknown>,
    payload,
    signature: base64ToBytes(s),
    signingInput: utf8Encode(`${h}.${p}`),
    parts: [h, p, s],
  }
}

export const HMAC_JWT_ALGS = ['HS256', 'HS384', 'HS512'] as const
export type HmacJwtAlg = (typeof HMAC_JWT_ALGS)[number]

export function isHmacAlg(alg: unknown): alg is HmacJwtAlg {
  return typeof alg === 'string' && (HMAC_JWT_ALGS as readonly string[]).includes(alg)
}

function normalizeAsymmetric(alg: unknown): SignAlgorithm | null {
  if (alg === 'Ed25519') return 'EdDSA'
  return typeof alg === 'string' && (SIGN_ALGORITHMS as readonly string[]).includes(alg) ? (alg as SignAlgorithm) : null
}

export type JwtKey = { secret: Uint8Array<ArrayBuffer> } | { publicKeyPem: string }

export async function verifyJwt(token: string, key: JwtKey): Promise<boolean> {
  const jwt = decodeJwt(token)
  const alg = jwt.header.alg
  if (alg === 'none' || alg === undefined) throw new Error('Unsigned token (alg "none"): nothing to verify')
  if (isHmacAlg(alg)) {
    if (!('secret' in key)) throw new Error(`${alg} requires a shared secret`)
    const k = await crypto.subtle.importKey(
      'raw',
      key.secret,
      { name: 'HMAC', hash: `SHA-${alg.slice(2)}` },
      false,
      ['verify'],
    )
    // subtle.verify compares in constant time.
    return crypto.subtle.verify('HMAC', k, jwt.signature, jwt.signingInput)
  }
  const asym = normalizeAsymmetric(alg)
  if (!asym) throw new Error(`Unsupported JWT algorithm "${String(alg)}"`)
  if (!('publicKeyPem' in key)) throw new Error(`${String(alg)} requires a PEM public key`)
  return verifySignature(asym, key.publicKeyPem, jwt.signingInput, jwt.signature)
}

const b64urlJson = (v: unknown) => bytesToBase64(utf8Encode(JSON.stringify(v)), { urlSafe: true })

export async function signJwtHmac(
  payload: unknown,
  secret: Uint8Array<ArrayBuffer>,
  alg: HmacJwtAlg = 'HS256',
  extraHeader: Record<string, unknown> = {},
): Promise<string> {
  const header = { alg, typ: 'JWT', ...extraHeader }
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`
  const sig = await hmac(`SHA-${alg.slice(2)}` as 'SHA-256', secret, utf8Encode(input))
  return `${input}.${bytesToBase64(sig, { urlSafe: true })}`
}

export interface ClaimTimes {
  name: 'exp' | 'nbf' | 'iat'
  value: number
  date: Date
}

export function timeClaims(payload: unknown): ClaimTimes[] {
  if (payload === null || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  return (['iat', 'nbf', 'exp'] as const)
    .filter((k) => typeof p[k] === 'number' && Number.isFinite(p[k]))
    .map((k) => ({ name: k, value: p[k] as number, date: new Date((p[k] as number) * 1000) }))
}
