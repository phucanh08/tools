// Asymmetric keys via Web Crypto: generation (PEM export), RSA-OAEP, signatures.
import { derToPem, inspectPemKey, type KeyInfo, type NamedCurve } from './pem'

export type KeyGenSpec =
  | { type: 'RSA'; modulusLength: 2048 | 3072 | 4096 }
  | { type: 'EC'; curve: NamedCurve }
  | { type: 'Ed25519' }

export interface GeneratedKeyPair {
  publicPem: string
  privatePem: string
  publicJwk: JsonWebKey
  privateJwk: JsonWebKey
}

const RSA_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]) // 65537

export async function generateKeyPair(spec: KeyGenSpec): Promise<GeneratedKeyPair> {
  let pair: CryptoKeyPair
  if (spec.type === 'RSA') {
    // The usage/algorithm binding is a Web Crypto concept only; the exported
    // PKCS#8/SPKI key can be used for OAEP, PSS or PKCS#1 v1.5 alike.
    pair = (await crypto.subtle.generateKey(
      { name: 'RSA-PSS', modulusLength: spec.modulusLength, publicExponent: RSA_EXPONENT, hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
  } else if (spec.type === 'EC') {
    pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: spec.curve }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair
  } else {
    pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  }
  const [spki, pkcs8, publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ])
  // Drop Web Crypto-specific fields that would confuse other tools.
  for (const jwk of [publicJwk, privateJwk]) {
    delete jwk.key_ops
    delete jwk.ext
    delete jwk.alg
  }
  return {
    publicPem: derToPem(new Uint8Array(spki), 'PUBLIC KEY'),
    privatePem: derToPem(new Uint8Array(pkcs8), 'PRIVATE KEY'),
    publicJwk,
    privateJwk,
  }
}

// --- Signatures (JOSE algorithm names) ---------------------------------------------

export const SIGN_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
] as const
export type SignAlgorithm = (typeof SIGN_ALGORITHMS)[number]

export const SIGN_ALGORITHM_LABELS: Record<SignAlgorithm, string> = {
  RS256: 'RSASSA-PKCS1-v1_5 SHA-256 (RS256)',
  RS384: 'RSASSA-PKCS1-v1_5 SHA-384 (RS384)',
  RS512: 'RSASSA-PKCS1-v1_5 SHA-512 (RS512)',
  PS256: 'RSA-PSS SHA-256 (PS256)',
  PS384: 'RSA-PSS SHA-384 (PS384)',
  PS512: 'RSA-PSS SHA-512 (PS512)',
  ES256: 'ECDSA P-256 SHA-256 (ES256)',
  ES384: 'ECDSA P-384 SHA-384 (ES384)',
  ES512: 'ECDSA P-521 SHA-512 (ES512)',
  EdDSA: 'Ed25519 (EdDSA)',
}

interface AlgParams {
  importParams: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams
  signParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams
  keyType: 'RSA' | 'EC' | 'Ed25519'
  curve?: NamedCurve
}

function algParams(alg: SignAlgorithm): AlgParams {
  const bits = alg.slice(2)
  const hash = `SHA-${bits}`
  switch (alg.slice(0, 2)) {
    case 'RS':
      return {
        importParams: { name: 'RSASSA-PKCS1-v1_5', hash },
        signParams: { name: 'RSASSA-PKCS1-v1_5' },
        keyType: 'RSA',
      }
    case 'PS':
      return {
        importParams: { name: 'RSA-PSS', hash },
        signParams: { name: 'RSA-PSS', saltLength: Number(bits) / 8 },
        keyType: 'RSA',
      }
    case 'ES': {
      const curve: NamedCurve = bits === '256' ? 'P-256' : bits === '384' ? 'P-384' : 'P-521'
      return {
        importParams: { name: 'ECDSA', namedCurve: curve },
        signParams: { name: 'ECDSA', hash },
        keyType: 'EC',
        curve,
      }
    }
    default:
      return { importParams: { name: 'Ed25519' }, signParams: { name: 'Ed25519' }, keyType: 'Ed25519' }
  }
}

/** Suggest compatible algorithms for a key. */
export function algorithmsForKey(info: Pick<KeyInfo, 'type' | 'curve'>): SignAlgorithm[] {
  switch (info.type) {
    case 'RSA':
      return ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512']
    case 'RSA-PSS':
      return ['PS256', 'PS384', 'PS512']
    case 'EC':
      return info.curve === 'P-256' ? ['ES256'] : info.curve === 'P-384' ? ['ES384'] : ['ES512']
    case 'Ed25519':
      return ['EdDSA']
    default:
      return []
  }
}

async function importForSignature(pem: string, alg: SignAlgorithm, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const info = inspectPemKey(pem)
  const p = algParams(alg)
  if (usage === 'sign' && info.kind !== 'private') throw new Error('Signing requires a PRIVATE key')
  if (usage === 'verify' && info.kind !== 'public') throw new Error('Verification requires a PUBLIC key')
  const typeOk = p.keyType === 'RSA' ? info.type === 'RSA' || info.type === 'RSA-PSS' : info.type === p.keyType
  if (!typeOk) throw new Error(`${alg} needs a ${p.keyType} key, but this is a ${info.type} key`)
  if (p.curve && info.curve !== p.curve) throw new Error(`${alg} needs a ${p.curve} key, but this key uses ${info.curve}`)
  return crypto.subtle.importKey(info.kind === 'public' ? 'spki' : 'pkcs8', info.der, p.importParams, false, [usage])
}

export async function sign(
  alg: SignAlgorithm,
  privatePem: string,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importForSignature(privatePem, alg, 'sign')
  return new Uint8Array(await crypto.subtle.sign(algParams(alg).signParams, key, data))
}

export async function verify(
  alg: SignAlgorithm,
  publicPem: string,
  data: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  const key = await importForSignature(publicPem, alg, 'verify')
  return crypto.subtle.verify(algParams(alg).signParams, key, signature, data)
}

// --- ECDSA signature format conversion (raw r||s <-> DER) -------------------------

const CURVE_BYTES: Record<NamedCurve, number> = { 'P-256': 32, 'P-384': 48, 'P-521': 66 }

export function ecdsaSignatureSize(curve: NamedCurve): number {
  return CURVE_BYTES[curve] * 2
}

function derInt(bytes: Uint8Array): number[] {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  const v = Array.from(bytes.subarray(i))
  if (v[0]! & 0x80) v.unshift(0)
  return [0x02, ...derLen(v.length), ...v]
}

function derLen(n: number): number[] {
  return n < 0x80 ? [n] : [0x81, n]
}

/** IEEE P1363 (r||s, as produced by Web Crypto / JOSE) -> ASN.1 DER (OpenSSL). */
export function ecdsaRawToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  if (raw.length % 2 !== 0 || raw.length === 0) throw new Error('Invalid raw ECDSA signature length')
  const half = raw.length / 2
  const body = [...derInt(raw.subarray(0, half)), ...derInt(raw.subarray(half))]
  return new Uint8Array([0x30, ...derLen(body.length), ...body])
}

/** ASN.1 DER -> IEEE P1363 (r||s) with fixed-size integers for the curve. */
export function ecdsaDerToRaw(der: Uint8Array, curve: NamedCurve): Uint8Array<ArrayBuffer> {
  const size = CURVE_BYTES[curve]
  let p = 0
  const readLen = () => {
    let len = der[p++]
    if (len === undefined) throw new Error('Invalid DER ECDSA signature: truncated')
    if (len & 0x80) {
      const n = len & 0x7f
      // Only the definite short/0x81 forms can occur for ECDSA signature sizes.
      if (n !== 1 || p >= der.length) throw new Error('Invalid DER ECDSA signature length encoding')
      len = der[p++]!
      if (len < 0x80) throw new Error('Invalid DER ECDSA signature: non-minimal length')
    }
    return len
  }
  if (der[p++] !== 0x30) throw new Error('Invalid DER ECDSA signature')
  const total = readLen()
  if (p > der.length) throw new Error('Invalid DER ECDSA signature')
  if (p + total !== der.length) throw new Error('Invalid DER ECDSA signature length')
  const end = der.length
  const out = new Uint8Array(size * 2)
  for (let k = 0; k < 2; k++) {
    if (der[p++] !== 0x02) throw new Error('Invalid DER ECDSA signature integer')
    const len = readLen()
    if (len === 0 || p + len > der.length) throw new Error('Invalid DER ECDSA signature integer length')
    let v = der.subarray(p, p + len)
    p += len
    // DER INTEGERs are two's complement and minimally encoded; r and s are positive.
    if (v[0]! & 0x80) throw new Error('Invalid DER ECDSA signature: negative integer')
    if (v.length > 1 && v[0] === 0 && !(v[1]! & 0x80)) {
      throw new Error('Invalid DER ECDSA signature: non-minimal integer encoding')
    }
    while (v.length > size && v[0] === 0) v = v.subarray(1)
    if (v.length > size) throw new Error('ECDSA integer too large for curve')
    out.set(v, k * size + (size - v.length))
  }
  if (p !== end) throw new Error('Trailing data in DER ECDSA signature')
  return out
}

// --- RSA-OAEP --------------------------------------------------------------------

export type OaepHash = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
const HASH_BYTES: Record<OaepHash, number> = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 }

async function importRsaOaep(pem: string, usage: 'encrypt' | 'decrypt', hash: OaepHash): Promise<CryptoKey> {
  const info = inspectPemKey(pem)
  if (info.type !== 'RSA') throw new Error(`RSA-OAEP needs an RSA key, but this is a ${info.type} key`)
  if (usage === 'encrypt' && info.kind !== 'public') throw new Error('Encryption requires the PUBLIC key')
  if (usage === 'decrypt' && info.kind !== 'private') throw new Error('Decryption requires the PRIVATE key')
  return crypto.subtle.importKey(info.kind === 'public' ? 'spki' : 'pkcs8', info.der, { name: 'RSA-OAEP', hash }, false, [
    usage,
  ])
}

export function oaepMaxMessageBytes(modulusBits: number, hash: OaepHash): number {
  return Math.ceil(modulusBits / 8) - 2 * HASH_BYTES[hash] - 2
}

export async function rsaEncrypt(
  publicPem: string,
  data: Uint8Array<ArrayBuffer>,
  hash: OaepHash = 'SHA-256',
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importRsaOaep(publicPem, 'encrypt', hash)
  const bits = (key.algorithm as RsaHashedKeyAlgorithm).modulusLength
  const max = oaepMaxMessageBytes(bits, hash)
  if (data.length > max) {
    throw new Error(
      `Message is ${data.length} bytes; RSA-${bits} with OAEP/${hash} can encrypt at most ${max} bytes. Use AES for larger data.`,
    )
  }
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, data))
}

export async function rsaDecrypt(
  privatePem: string,
  ciphertext: Uint8Array<ArrayBuffer>,
  hash: OaepHash = 'SHA-256',
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await importRsaOaep(privatePem, 'decrypt', hash)
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, ciphertext))
  } catch {
    throw new Error('Decryption failed: wrong key, wrong OAEP hash, or corrupted ciphertext.')
  }
}
