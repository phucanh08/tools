import { describe, expect, it } from 'vitest'
import { curlExamples, decodeBasicAuth, encodeBasicAuth, hasControlChars, shellQuote } from './basic-auth'

describe('encodeBasicAuth', () => {
  it('matches the RFC 7617 examples', () => {
    // RFC 7617 §2: Aladdin / open sesame.
    expect(encodeBasicAuth('Aladdin', 'open sesame')).toEqual({
      token: 'QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      value: 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      header: 'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
    })
    // RFC 7617 §2.1: user "test", password "123£" with charset="UTF-8".
    expect(encodeBasicAuth('test', '123£').token).toBe('dGVzdDoxMjPCow==')
  })

  it('encodes UTF-8 like Node Buffer', () => {
    // Buffer.from('user:pässword').toString('base64')
    expect(encodeBasicAuth('user', 'pässword').token).toBe('dXNlcjpww6Rzc3dvcmQ=')
    expect(encodeBasicAuth('', '').token).toBe('Og==')
  })
})

describe('decodeBasicAuth', () => {
  it('accepts a full header, "Basic xxx" and a bare token', () => {
    const want = { user: 'Aladdin', password: 'open sesame', charset: 'UTF-8' }
    for (const input of [
      'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      'authorization:basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      '  AUTHORIZATION :   BASIC    QWxhZGRpbjpvcGVuIHNlc2FtZQ==  \n',
      'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      'bAsIc\tQWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      'QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      'QWxhZGRpbjpvcGVuIHNlc2FtZQ',
      `-H 'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=='`,
      '"Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="',
      'Proxy-Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
    ]) {
      const got = decodeBasicAuth(input)
      expect(got, input).toMatchObject(want)
      expect(got.token, input).toMatch(/^QWxhZGRpbjpvcGVuIHNlc2FtZQ(==)?$/)
    }
  })

  it('is UTF-8 safe and falls back to ISO-8859-1', () => {
    expect(decodeBasicAuth('dXNlcjpww6Rzc3dvcmQ=')).toMatchObject({ user: 'user', password: 'pässword', charset: 'UTF-8' })
    expect(decodeBasicAuth('Basic dGVzdDoxMjPCow==')).toMatchObject({ user: 'test', password: '123£' })
    // Buffer.from('test:123£', 'latin1').toString('base64')
    expect(decodeBasicAuth('dGVzdDoxMjOj')).toMatchObject({ user: 'test', password: '123£', charset: 'ISO-8859-1' })
  })

  it('splits at the first colon', () => {
    // Buffer.from('a:b:c').toString('base64')
    expect(decodeBasicAuth('YTpiOmM=')).toMatchObject({ user: 'a', password: 'b:c' })
    expect(decodeBasicAuth(encodeBasicAuth('a:b', 'c').value)).toMatchObject({ user: 'a', password: 'b:c' })
  })

  it('rejects other schemes and malformed tokens', () => {
    expect(() => decodeBasicAuth('Bearer abc.def')).toThrow('This is a "Bearer" credential, not "Basic".')
    expect(() => decodeBasicAuth('Basic')).toThrow(/No credentials/)
    expect(() => decodeBasicAuth('')).toThrow(/No credentials/)
    expect(() => decodeBasicAuth('Zm9vYmFy')).toThrow(/no ":"/)
    expect(() => decodeBasicAuth('Basic Zm9v!')).toThrow(/Invalid Base64 character/)
    expect(() => decodeBasicAuth('Basic Zm9v YmFy')).toThrow(/spaces/)
  })
})

describe('helpers', () => {
  it('detects control characters', () => {
    expect(hasControlChars('a\tb')).toBe(true)
    expect(hasControlChars('a\u007fb')).toBe(true)
    expect(hasControlChars('a\u0080b')).toBe(true) // C1 controls U+0080-U+009F
    expect(hasControlChars('a\u009fb')).toBe(true)
    expect(hasControlChars('a\u00a0b')).toBe(false) // no-break space is not a control
    expect(hasControlChars('pässword €')).toBe(false)
  })

  it('quotes for the shell and builds curl examples', () => {
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`)
    expect(curlExamples('Aladdin', 'open sesame')).toEqual({
      userFlag: `curl -u 'Aladdin:open sesame' https://example.com/`,
      header: `curl -H 'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==' https://example.com/`,
    })
  })
})
