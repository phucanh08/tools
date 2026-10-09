// PEM armor and minimal DER handling: detect key algorithm and wrap PKCS#1 RSA
// keys ("BEGIN RSA ... KEY") into PKCS#8/SPKI, which Web Crypto can import.
import { base64ToBytes, bytesToBase64 } from '../encoding'

export function derToPem(der: Uint8Array, label: string): string {
  const b64 = bytesToBase64(der)
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

export interface PemBlock {
  label: string
  der: Uint8Array<ArrayBuffer>
}

export function parsePem(pem: string): PemBlock {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem)
  if (!m) throw new Error('No PEM block found (expected "-----BEGIN ...-----" / "-----END ...-----")')
  const label = m[1]!
  const body = m[2]!
  if (/Proc-Type:\s*4,ENCRYPTED/i.test(body)) {
    throw new Error('Encrypted PEM keys are not supported. Decrypt it first (openssl pkey -in key.pem -out plain.pem).')
  }
  return { label, der: base64ToBytes(body.replace(/^[A-Za-z-]+:.*$/gm, '')) }
}

// --- DER --------------------------------------------------------------------

interface Tlv {
  tag: number
  start: number // start of value
  end: number // end of value (exclusive)
}

/** Reads one TLV starting at `pos`; the whole element must end at or before `limit`. */
function readTlv(der: Uint8Array, pos: number, limit: number = der.length): Tlv {
  if (pos + 2 > limit) throw new Error('Malformed DER: unexpected end')
  const tag = der[pos]!
  let len = der[pos + 1]!
  let p = pos + 2
  if (len & 0x80) {
    const n = len & 0x7f
    if (n === 0 || n > 4) throw new Error('Malformed DER: unsupported length')
    if (p + n > limit) throw new Error('Malformed DER: truncated length')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + der[p++]!
  }
  if (p + len > limit) throw new Error('Malformed DER: length exceeds enclosing data')
  return { tag, start: p, end: p + len }
}

function children(der: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = []
  let p = parent.start
  while (p < parent.end) {
    const t = readTlv(der, p, parent.end)
    out.push(t)
    p = t.end
  }
  return out
}

function oidToString(bytes: Uint8Array): string {
  if (bytes.length === 0) throw new Error('Malformed DER: empty OID')
  if (bytes[bytes.length - 1]! & 0x80) throw new Error('Malformed DER: unfinished OID')
  const parts: number[] = []
  let v = 0
  for (const b of bytes) {
    if (v === 0 && b === 0x80) throw new Error('Malformed DER: non-minimal OID')
    v = v * 128 + (b & 0x7f)
    if (!Number.isSafeInteger(v)) throw new Error('Malformed DER: OID arc too large')
    if (!(b & 0x80)) {
      if (parts.length === 0) {
        const first = Math.min(2, Math.floor(v / 40))
        parts.push(first, v - first * 40)
      } else parts.push(v)
      v = 0
    }
  }
  return parts.join('.')
}

function encodeLength(len: number): number[] {
  if (len < 0x80) return [len]
  const bytes: number[] = []
  while (len > 0) {
    bytes.unshift(len & 0xff)
    len = Math.floor(len / 256)
  }
  return [0x80 | bytes.length, ...bytes]
}

function tlv(tag: number, value: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = [tag, ...encodeLength(value.length)]
  const out = new Uint8Array(head.length + value.length)
  out.set(head, 0)
  out.set(value, head.length)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// rsaEncryption AlgorithmIdentifier: SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }
const RSA_ALG_ID = new Uint8Array([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
])

export function pkcs1PrivateToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = new Uint8Array([0x02, 0x01, 0x00])
  return tlv(0x30, concat(version, RSA_ALG_ID, tlv(0x04, pkcs1)))
}

export function pkcs1PublicToSpki(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  return tlv(0x30, concat(RSA_ALG_ID, tlv(0x03, concat(new Uint8Array([0x00]), pkcs1))))
}

// --- Key info -------------------------------------------------------------------

export type KeyType = 'RSA' | 'RSA-PSS' | 'EC' | 'Ed25519' | 'X25519' | 'unknown'
export type NamedCurve = 'P-256' | 'P-384' | 'P-521'

export interface KeyInfo {
  kind: 'public' | 'private'
  type: KeyType
  curve?: NamedCurve
  /** DER in SPKI (public) or PKCS#8 (private) form, ready for importKey. */
  der: Uint8Array<ArrayBuffer>
  oid: string
}

const OIDS: Record<string, KeyType> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.10': 'RSA-PSS',
  '1.2.840.10045.2.1': 'EC',
  '1.3.101.112': 'Ed25519',
  '1.3.101.110': 'X25519',
}
const CURVES: Record<string, NamedCurve> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
}

/** Parse a PEM public or private key and identify its algorithm. */
export function inspectPemKey(pem: string): KeyInfo {
  const { label, der: raw } = parsePem(pem)
  let der: Uint8Array<ArrayBuffer>
  let kind: 'public' | 'private'
  switch (label) {
    case 'PUBLIC KEY':
      der = raw
      kind = 'public'
      break
    case 'PRIVATE KEY':
      der = raw
      kind = 'private'
      break
    case 'RSA PUBLIC KEY':
      der = pkcs1PublicToSpki(raw)
      kind = 'public'
      break
    case 'RSA PRIVATE KEY':
      der = pkcs1PrivateToPkcs8(raw)
      kind = 'private'
      break
    case 'EC PRIVATE KEY':
      throw new Error(
        'SEC1 "EC PRIVATE KEY" is not supported by Web Crypto. Convert it: openssl pkcs8 -topk8 -nocrypt -in key.pem',
      )
    case 'ENCRYPTED PRIVATE KEY':
      throw new Error('Encrypted private keys are not supported. Decrypt it first (openssl pkey -in key.pem).')
    case 'CERTIFICATE':
      throw new Error('This is a certificate, not a key. Extract the public key: openssl x509 -pubkey -noout -in cert.pem')
    default:
      throw new Error(`Unsupported PEM type "${label}"`)
  }
  const top = readTlv(der, 0)
  if (top.tag !== 0x30) throw new Error('Malformed key: expected a DER SEQUENCE')
  if (top.end !== der.length) throw new Error('Malformed key: trailing data after DER SEQUENCE')
  const items = children(der, top)
  // SPKI: SEQ { algId SEQ, BIT STRING }; PKCS#8: SEQ { INTEGER, algId SEQ, OCTET STRING, ... }
  const algSeq = kind === 'public' ? items[0] : items[1]
  if (!algSeq || algSeq.tag !== 0x30) throw new Error('Malformed key: missing AlgorithmIdentifier')
  const [oidTlv, params] = children(der, algSeq)
  if (!oidTlv || oidTlv.tag !== 0x06) throw new Error('Malformed key: missing algorithm OID')
  const oid = oidToString(der.subarray(oidTlv.start, oidTlv.end))
  const type = OIDS[oid] ?? 'unknown'
  const info: KeyInfo = { kind, type, der, oid }
  if (type === 'EC') {
    if (!params || params.tag !== 0x06) throw new Error('EC key without named curve is not supported')
    const curveOid = oidToString(der.subarray(params.start, params.end))
    const curve = CURVES[curveOid]
    if (!curve) throw new Error(`Unsupported EC curve ${curveOid} (Web Crypto supports P-256, P-384, P-521)`)
    info.curve = curve
  }
  return info
}
