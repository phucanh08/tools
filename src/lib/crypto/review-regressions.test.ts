// Regression tests for findings from the independent (Codex) crypto review.
import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes, utf8Encode } from '../encoding'
import { bcryptVerify } from './bcrypt'
import { digest, digestMatches } from './hash'
import { ecdsaDerToRaw, ecdsaRawToDer, generateKeyPair, sign, verify } from './keys'
import { derToPem, inspectPemKey } from './pem'

describe('digestMatches (Base64 is case-sensitive, hex is not)', () => {
  it('rejects a Base64 checksum differing only in letter case', async () => {
    const d = await digest('SHA-256', utf8Encode('abc'))
    const b64 = bytesToBase64(d)
    expect(b64.startsWith('ungW')).toBe(true)
    expect(digestMatches(d, b64)).toBe(true)
    expect(digestMatches(d, 'U' + b64.slice(1))).toBe(false)
    expect(digestMatches(d, bytesToBase64(d, { urlSafe: true }))).toBe(true)
    expect(digestMatches(d, bytesToHex(d).toUpperCase())).toBe(true)
    expect(digestMatches(d, ` ${bytesToHex(d)} `)).toBe(true)
    expect(digestMatches(d, '')).toBe(false)
    expect(digestMatches(d, 'not a hash!')).toBe(false)
  })
})

describe('bcrypt verify cost bound', () => {
  it('refuses cost 31 before doing any work', async () => {
    const started = Date.now()
    await expect(bcryptVerify('U*U', '$2b$31$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW')).rejects.toThrow(
      /Unsupported cost 31/,
    )
    expect(Date.now() - started).toBeLessThan(200)
  })
})

describe('strict ECDSA DER', () => {
  it('rejects negative and non-minimal integers and bad lengths', () => {
    expect(() => ecdsaDerToRaw(hexToBytes('3006020180020101'), 'P-256')).toThrow(/negative/)
    expect(() => ecdsaDerToRaw(hexToBytes('300702020001020101'), 'P-256')).toThrow(/non-minimal/)
    expect(() => ecdsaDerToRaw(hexToBytes('3081060201010201 01'), 'P-256')).toThrow()
    expect(() => ecdsaDerToRaw(hexToBytes('30060201010201'), 'P-256')).toThrow()
  })
  it('a genuine signature with its sign byte removed no longer verifies', async () => {
    const pair = await generateKeyPair({ type: 'EC', curve: 'P-256' })
    const msg = utf8Encode('m')
    for (let i = 0; i < 64; i++) {
      const raw = await sign('ES256', pair.privatePem, msg)
      if (!(raw[0]! & 0x80)) continue
      const der = ecdsaRawToDer(raw)
      // r is encoded as 02 21 00 <32 bytes>; strip the 00 and fix lengths.
      expect(Array.from(der.subarray(2, 5))).toEqual([0x02, 0x21, 0x00])
      const bad = new Uint8Array([0x30, der[1]! - 1, 0x02, 0x20, ...der.subarray(5)])
      expect(() => ecdsaDerToRaw(bad, 'P-256')).toThrow(/negative/)
      expect(await verify('ES256', pair.publicPem, msg, ecdsaDerToRaw(der, 'P-256'))).toBe(true)
      return
    }
    throw new Error('no high-bit r produced in 64 tries')
  })
  it('round-trips P-521 signatures', async () => {
    const pair = await generateKeyPair({ type: 'EC', curve: 'P-521' })
    const raw = await sign('ES512', pair.privatePem, utf8Encode('x'))
    expect(raw.length).toBe(132)
    expect(ecdsaDerToRaw(ecdsaRawToDer(raw), 'P-521')).toEqual(raw)
  })
})

describe('strict PEM/DER parsing', () => {
  const pem = (hex: string) => derToPem(hexToBytes(hex), 'PUBLIC KEY')
  it.each([
    ['child exceeds parent', '3003300306032b6570'],
    ['unfinished OID arc', '3008300606042b657080'],
    ['truncated long-form length', '3009300706032b65700282'],
    ['trailing data', '300730050603 2b6570 00'],
  ])('rejects %s', (_name, hex) => {
    expect(() => inspectPemKey(pem(hex))).toThrow(/Malformed/)
  })
})

describe('strict Base64 padding and data URLs', () => {
  it.each(['====', 'Zg====', 'Zm9v=', 'Zg=', '='])('rejects %j', (s) => {
    expect(() => base64ToBytes(s)).toThrow(/padding/)
  })
  it('still accepts correct and omitted padding', () => {
    expect(Array.from(base64ToBytes('Zg=='))).toEqual([102])
    expect(Array.from(base64ToBytes('Zg'))).toEqual([102])
    expect(Array.from(base64ToBytes('Zm8='))).toEqual([102, 111])
  })
  it('requires ;base64 in data URLs', () => {
    expect(() => base64ToBytes('data:text/plain,Zm9v')).toThrow(/;base64/)
    expect(Array.from(base64ToBytes('data:text/plain;charset=utf-8;base64,Zm9v'))).toEqual([102, 111, 111])
  })
})
