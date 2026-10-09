import * as nodeCrypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes, utf8Decode, utf8Encode } from '../encoding'
import { decryptWithKey, decryptWithPassword, encryptWithKey, encryptWithPassword, parseEnvelope } from './aes'
import { bcryptCost, bcryptHash, bcryptVerify } from './bcrypt'
import { digest, hmac } from './hash'
import { decodeJwt, signJwtHmac, verifyJwt } from './jwt'
import {
  algorithmsForKey,
  ecdsaDerToRaw,
  ecdsaRawToDer,
  generateKeyPair,
  rsaDecrypt,
  rsaEncrypt,
  sign,
  verify,
  type SignAlgorithm,
} from './keys'
import { inspectPemKey } from './pem'
import { generatePassword, randomBytes, randomInt, uuidV4, uuidV7, uuidV7Timestamp } from './random'

const abc = utf8Encode('abc')

describe('hash known vectors', () => {
  it.each([
    ['MD5', '900150983cd24fb0d6963f7d28e17f72'],
    ['SHA-1', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['SHA-256', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'SHA-384',
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    ],
    [
      'SHA-512',
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    ],
    ['SHA3-256', '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'],
  ] as const)('%s("abc")', async (alg, hex) => {
    expect(bytesToHex(await digest(alg, abc))).toBe(hex)
  })

  it('MD5 of empty input and of a large buffer matches node:crypto', async () => {
    expect(bytesToHex(await digest('MD5', new Uint8Array()))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    const big = randomBytes(1_000_003)
    for (const [alg, node] of [
      ['MD5', 'md5'],
      ['SHA-256', 'sha256'],
      ['SHA3-512', 'sha3-512'],
    ] as const) {
      expect(bytesToHex(await digest(alg, big))).toBe(nodeCrypto.createHash(node).update(big).digest('hex'))
    }
  })
})

describe('HMAC (RFC 4231 test case 2)', () => {
  const key = utf8Encode('Jefe')
  const data = utf8Encode('what do ya want for nothing?')
  it('HMAC-SHA-256', async () => {
    expect(bytesToHex(await hmac('SHA-256', key, data))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })
  it('HMAC-SHA-512', async () => {
    expect(bytesToHex(await hmac('SHA-512', key, data))).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    )
  })
  it('rejects an empty key', async () => {
    await expect(hmac('SHA-256', new Uint8Array(), data)).rejects.toThrow(/empty/)
  })
})

describe('AES-GCM password mode', () => {
  const pt = utf8Encode('Bí mật 🔐 secret')

  it('round-trips and uses a fresh salt/IV each time', async () => {
    const a = await encryptWithPassword(pt, 'correct horse', 1000)
    const b = await encryptWithPassword(pt, 'correct horse', 1000)
    expect(a).not.toBe(b)
    expect(a.startsWith('v1.aes-256-gcm.pbkdf2-sha256.1000.')).toBe(true)
    expect(utf8Decode(await decryptWithPassword(a, 'correct horse'))).toBe('Bí mật 🔐 secret')
  })

  it('fails with the wrong password', async () => {
    const env = await encryptWithPassword(pt, 'right', 1000)
    await expect(decryptWithPassword(env, 'wrong')).rejects.toThrow(/Decryption failed/)
  })

  it('fails when the ciphertext is tampered with', async () => {
    const env = await encryptWithPassword(pt, 'pw', 1000)
    const parts = env.split('.')
    const ct = base64ToBytes(parts[6]!)
    ct[0] = ct[0]! ^ 1
    parts[6] = bytesToBase64(ct, { urlSafe: true })
    await expect(decryptWithPassword(parts.join('.'), 'pw')).rejects.toThrow(/Decryption failed/)
  })

  it('uses the documented default iteration count', async () => {
    const env = await encryptWithPassword(pt, 'pw')
    expect(parseEnvelope(env).iterations).toBe(600_000)
  })

  it('is interoperable: node:crypto can decrypt using the documented format', async () => {
    const env = await encryptWithPassword(pt, 'interop', 2000)
    const { iterations, salt, iv, ciphertext } = parseEnvelope(env)
    const key = nodeCrypto.pbkdf2Sync('interop', salt, iterations, 32, 'sha256')
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
    const out = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()])
    expect(out.toString('utf8')).toBe('Bí mật 🔐 secret')
  })

  it('rejects malformed envelopes and absurd iteration counts', async () => {
    await expect(decryptWithPassword('hello', 'pw')).rejects.toThrow(/Unrecognized format/)
    const env = await encryptWithPassword(pt, 'pw', 1000)
    await expect(decryptWithPassword(env.replace('.1000.', '.99999999999.'), 'pw')).rejects.toThrow(/range/)
  })
})

describe('AES-GCM raw key mode', () => {
  it('round-trips with 128/192/256-bit keys and fails with a wrong key', async () => {
    for (const len of [16, 24, 32]) {
      const key = randomBytes(len)
      const ct = await encryptWithKey(utf8Encode('hello'), key)
      expect(base64ToBytes(ct).length).toBe(12 + 5 + 16)
      expect(utf8Decode(await decryptWithKey(ct, key))).toBe('hello')
      await expect(decryptWithKey(ct, randomBytes(len))).rejects.toThrow(/Decryption failed/)
    }
  })
  it('rejects invalid key sizes', async () => {
    await expect(encryptWithKey(utf8Encode('x'), randomBytes(20))).rejects.toThrow(/128, 192 or 256/)
  })
  it('matches node:crypto output format (iv || ct || tag)', async () => {
    const key = hexToBytes('000102030405060708090a0b0c0d0e0f000102030405060708090a0b0c0d0e0f')
    const iv = Buffer.alloc(12, 7)
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update('node says hi'), cipher.final(), cipher.getAuthTag()])
    const blob = bytesToBase64(Buffer.concat([iv, body]))
    expect(utf8Decode(await decryptWithKey(blob, key))).toBe('node says hi')
  })
})

describe('key pairs, signatures and RSA-OAEP', () => {
  it('generates PEM key pairs that identify correctly', async () => {
    const rsa = await generateKeyPair({ type: 'RSA', modulusLength: 2048 })
    expect(rsa.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/)
    expect(rsa.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n/)
    expect(inspectPemKey(rsa.publicPem)).toMatchObject({ kind: 'public', type: 'RSA' })
    expect(rsa.publicJwk.kty).toBe('RSA')
    const ec = await generateKeyPair({ type: 'EC', curve: 'P-384' })
    expect(inspectPemKey(ec.privatePem)).toMatchObject({ kind: 'private', type: 'EC', curve: 'P-384' })
    const ed = await generateKeyPair({ type: 'Ed25519' })
    expect(inspectPemKey(ed.publicPem)).toMatchObject({ type: 'Ed25519' })
    // node:crypto (OpenSSL) can parse what we export.
    expect(nodeCrypto.createPublicKey(rsa.publicPem).asymmetricKeyType).toBe('rsa')
    expect(nodeCrypto.createPrivateKey(ec.privatePem).asymmetricKeyDetails?.namedCurve).toBe('secp384r1')
    expect(nodeCrypto.createPrivateKey(ed.privatePem).asymmetricKeyType).toBe('ed25519')
  })

  it('sign/verify round-trips for every algorithm and rejects tampering', async () => {
    const rsa = await generateKeyPair({ type: 'RSA', modulusLength: 2048 })
    const keys: Record<string, { publicPem: string; privatePem: string }> = {
      RSA: rsa,
      'P-256': await generateKeyPair({ type: 'EC', curve: 'P-256' }),
      'P-384': await generateKeyPair({ type: 'EC', curve: 'P-384' }),
      'P-521': await generateKeyPair({ type: 'EC', curve: 'P-521' }),
      Ed25519: await generateKeyPair({ type: 'Ed25519' }),
    }
    const cases: [SignAlgorithm, string][] = [
      ['RS256', 'RSA'],
      ['RS512', 'RSA'],
      ['PS256', 'RSA'],
      ['PS384', 'RSA'],
      ['ES256', 'P-256'],
      ['ES384', 'P-384'],
      ['ES512', 'P-521'],
      ['EdDSA', 'Ed25519'],
    ]
    const msg = utf8Encode('message to sign')
    for (const [alg, k] of cases) {
      const pair = keys[k]!
      const sig = await sign(alg, pair.privatePem, msg)
      expect(await verify(alg, pair.publicPem, msg, sig), alg).toBe(true)
      expect(await verify(alg, pair.publicPem, utf8Encode('message to sigN'), sig), alg).toBe(false)
    }
    await expect(sign('ES256', keys['P-384']!.privatePem, msg)).rejects.toThrow(/P-256/)
    await expect(sign('RS256', keys.Ed25519!.privatePem, msg)).rejects.toThrow(/RSA key/)
    await expect(sign('RS256', rsa.publicPem, msg)).rejects.toThrow(/PRIVATE/)
    expect(algorithmsForKey(inspectPemKey(keys['P-521']!.publicPem))).toEqual(['ES512'])
  })

  it('ECDSA raw <-> DER conversion interoperates with OpenSSL', async () => {
    const pair = await generateKeyPair({ type: 'EC', curve: 'P-256' })
    const msg = utf8Encode('interop')
    const raw = await sign('ES256', pair.privatePem, msg)
    expect(raw.length).toBe(64)
    const der = ecdsaRawToDer(raw)
    expect(nodeCrypto.verify('sha256', msg, { key: pair.publicPem, dsaEncoding: 'der' }, der)).toBe(true)
    expect(ecdsaDerToRaw(der, 'P-256')).toEqual(raw)
    const nodeDer = nodeCrypto.sign('sha256', msg, { key: pair.privatePem, dsaEncoding: 'der' })
    expect(await verify('ES256', pair.publicPem, msg, ecdsaDerToRaw(nodeDer, 'P-256'))).toBe(true)
  })

  it('RSA-OAEP encrypt/decrypt round-trip, size limit, wrong key', async () => {
    const pair = await generateKeyPair({ type: 'RSA', modulusLength: 2048 })
    const other = await generateKeyPair({ type: 'RSA', modulusLength: 2048 })
    const ct = await rsaEncrypt(pair.publicPem, utf8Encode('top secret'))
    expect(ct.length).toBe(256)
    expect(utf8Decode(await rsaDecrypt(pair.privatePem, ct))).toBe('top secret')
    await expect(rsaDecrypt(other.privatePem, ct)).rejects.toThrow(/Decryption failed/)
    await expect(rsaEncrypt(pair.publicPem, new Uint8Array(191))).rejects.toThrow(/at most 190 bytes/)
    // OpenSSL-compatible: node decrypts what we encrypt.
    const nodePt = nodeCrypto.privateDecrypt(
      { key: pair.privatePem, padding: nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      ct,
    )
    expect(nodePt.toString()).toBe('top secret')
  })

  it('imports PKCS#1 "BEGIN RSA ..." keys produced by OpenSSL', async () => {
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    expect(publicKey).toContain('BEGIN RSA PUBLIC KEY')
    const msg = utf8Encode('pkcs1')
    const sig = await sign('RS256', privateKey, msg)
    expect(await verify('RS256', publicKey, msg, sig)).toBe(true)
    expect(nodeCrypto.verify('sha256', msg, publicKey, sig)).toBe(true)
    const ct = await rsaEncrypt(publicKey, msg)
    expect(utf8Decode(await rsaDecrypt(privateKey, ct))).toBe('pkcs1')
  })

  it('gives helpful errors for unsupported PEM types', () => {
    expect(() => inspectPemKey('-----BEGIN EC PRIVATE KEY-----\nAA==\n-----END EC PRIVATE KEY-----')).toThrow(/pkcs8/)
    expect(() => inspectPemKey('nope')).toThrow(/No PEM block/)
  })
})

describe('JWT', () => {
  // The well-known jwt.io example token, secret "your-256-bit-secret".
  const token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

  it('decodes header and payload', () => {
    const d = decodeJwt(`Bearer ${token}`)
    expect(d.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(d.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
  })

  it('verifies HS256 against the known secret and rejects a wrong one', async () => {
    expect(await verifyJwt(token, { secret: utf8Encode('your-256-bit-secret') })).toBe(true)
    expect(await verifyJwt(token, { secret: utf8Encode('wrong-secret') })).toBe(false)
    const expected = nodeCrypto
      .createHmac('sha256', 'your-256-bit-secret')
      .update(token.split('.').slice(0, 2).join('.'))
      .digest('base64url')
    expect(token.endsWith(expected)).toBe(true)
  })

  it('signs HS* tokens that verify', async () => {
    const secret = utf8Encode('s3cret')
    for (const alg of ['HS256', 'HS384', 'HS512'] as const) {
      const t = await signJwtHmac({ sub: 'x' }, secret, alg)
      expect(decodeJwt(t).header.alg).toBe(alg)
      expect(await verifyJwt(t, { secret })).toBe(true)
    }
  })

  it('verifies RS256/ES256 tokens signed by node:crypto', async () => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
    const rsa = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    let input = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ sub: 'rs' })}`
    let sig = nodeCrypto.sign('sha256', Buffer.from(input), rsa.privateKey).toString('base64url')
    const rsaPub = rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(await verifyJwt(`${input}.${sig}`, { publicKeyPem: rsaPub })).toBe(true)

    const ec = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    input = `${enc({ alg: 'ES256' })}.${enc({ sub: 'es' })}`
    sig = nodeCrypto
      .sign('sha256', Buffer.from(input), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' })
      .toString('base64url')
    const ecPub = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(await verifyJwt(`${input}.${sig}`, { publicKeyPem: ecPub })).toBe(true)
    await expect(verifyJwt(`${input}.${sig}`, { secret: utf8Encode('x') })).rejects.toThrow(/PEM public key/)
  })

  it('rejects malformed and unsigned tokens', async () => {
    expect(() => decodeJwt('a.b')).toThrow(/3 dot-separated/)
    expect(() => decodeJwt('a.b.c.d.e')).toThrow(/JWE/)
    const none = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'
    await expect(verifyJwt(none, { secret: utf8Encode('x') })).rejects.toThrow(/none/)
  })
})

describe('bcrypt', () => {
  it('verifies a published test vector (OpenWall crypt_blowfish)', async () => {
    expect(await bcryptVerify('U*U', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW')).toBe(true)
    expect(await bcryptVerify('U*V', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW')).toBe(false)
  })
  it('hashes and verifies', async () => {
    const h = await bcryptHash('mật khẩu', 4)
    expect(bcryptCost(h)).toBe(4)
    expect(await bcryptVerify('mật khẩu', h)).toBe(true)
    expect(await bcryptVerify('mat khau', h)).toBe(false)
    await expect(bcryptVerify('x', 'not-a-hash')).rejects.toThrow(/valid bcrypt/)
  })
})

describe('random', () => {
  it('generates passwords honoring sets and length', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ length: 12, sets: ['lower', 'digits', 'symbols'] })
      expect(p).toHaveLength(12)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).not.toMatch(/[A-Z]/)
    }
    expect(generatePassword({ length: 200, sets: ['upper'], excludeAmbiguous: true })).not.toMatch(/[IO]/)
    expect(() => generatePassword({ length: 10, sets: [] })).toThrow()
  })

  it('randomInt stays in range and covers all values', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(7)
      seen.add(v)
    }
    expect(seen.size).toBe(7)
  })

  it('generates RFC 9562 UUIDs v4 and v7', () => {
    const v4 = uuidV4()
    expect(v4).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const ts = 1_700_000_000_123
    const v7 = uuidV7(ts)
    expect(v7).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(v7.startsWith('018bcfe5-687b-7')).toBe(true)
    expect(uuidV7Timestamp(v7)).toBe(ts)
    expect(new Set(Array.from({ length: 100 }, () => uuidV4())).size).toBe(100)
  })

  it('randomBytes handles lengths above the 65536 getRandomValues limit', () => {
    const b = randomBytes(70_000)
    expect(b.length).toBe(70_000)
    expect(b.subarray(65_536).some((x) => x !== 0)).toBe(true)
  })
})
