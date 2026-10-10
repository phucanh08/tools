import { describe, expect, it } from 'vitest'
import { decodeBaseN, encodeBaseN, type BaseN } from './base-n'
import { bytesToHex, hexToBytes, utf8Decode, utf8Encode } from './encoding'

const u8 = (s: string) => utf8Encode(s)

describe('base32 / base32hex', () => {
  // RFC 4648 §10 test vectors (also produced by CPython base64.b32encode / b32hexencode).
  const vectors: [string, string, string][] = [
    ['', '', ''],
    ['f', 'MY======', 'CO======'],
    ['fo', 'MZXQ====', 'CPNG===='],
    ['foo', 'MZXW6===', 'CPNMU==='],
    ['foob', 'MZXW6YQ=', 'CPNMUOG='],
    ['fooba', 'MZXW6YTB', 'CPNMUOJ1'],
    ['foobar', 'MZXW6YTBOI======', 'CPNMUOJ1E8======'],
  ]
  it.each(vectors)('RFC 4648 vector "%s"', (plain, b32, b32hex) => {
    expect(encodeBaseN(u8(plain), 'base32')).toBe(b32)
    expect(encodeBaseN(u8(plain), 'base32hex')).toBe(b32hex)
    expect(utf8Decode(decodeBaseN(b32, 'base32'))).toBe(plain)
    expect(utf8Decode(decodeBaseN(b32hex, 'base32hex'))).toBe(plain)
  })

  it('supports no padding, lowercase and whitespace on decode', () => {
    expect(encodeBaseN(u8('foobar'), 'base32', { padding: false })).toBe('MZXW6YTBOI')
    expect(utf8Decode(decodeBaseN('mzxw6ytboi', 'base32'))).toBe('foobar')
    expect(utf8Decode(decodeBaseN('MZXW 6YTB\nOI======', 'base32'))).toBe('foobar')
  })

  it('rejects invalid input with a clear message', () => {
    expect(() => decodeBaseN('MZXW1===', 'base32')).toThrow('Invalid Base32 character "1" at position 5')
    expect(() => decodeBaseN('MZX', 'base32')).toThrow(/length 3 is not a valid/)
    expect(() => decodeBaseN('MY=====', 'base32')).toThrow(/multiple of 8/)
    expect(() => decodeBaseN('MY==A===', 'base32')).toThrow(/padding in the middle/)
    // RFC 4648 §6: the pad count is fixed by the body length.
    expect(() => decodeBaseN('MZXW6YTB========', 'base32')).toThrow(/8 "=" padding character\(s\), expected 0/)
    expect(() => decodeBaseN('MY==============', 'base32')).toThrow(/14 "=" padding character\(s\), expected 6/)
    expect(() => decodeBaseN('CPNMUOG=========', 'base32hex')).toThrow(/expected 1/)
    expect(() => decodeBaseN('MZ======', 'base32')).toThrow(/non-zero unused bits/)
    expect(() => decodeBaseN('W', 'base32hex')).toThrow(/Base32hex/)
  })
})

describe('base58 (Bitcoin)', () => {
  // Bitcoin Core src/test/data/base58_encode_decode.json.
  const vectors: [string, string][] = [
    ['', ''],
    ['61', '2g'],
    ['626262', 'a3gV'],
    ['636363', 'aPEr'],
    ['73696d706c792061206c6f6e6720737472696e67', '2cFupjhnEsSn59qHXstmK2ffpLv2'],
    ['00eb15231dfceb60925886b67d065299925915aeb172c06647', '1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L'],
    ['516b6fcd0f', 'ABnLTmg'],
    ['bf4f89001e670274dd', '3SEo3LWLoPntC'],
    ['572e4794', '3EFU7m'],
    ['ecac89cad93923c02321', 'EJDM8drfXA6uyA'],
    ['10c8511e', 'Rt5zm'],
    ['00000000000000000000', '1111111111'],
  ]
  it.each(vectors)('%s <-> %s', (hex, b58) => {
    expect(encodeBaseN(hexToBytes(hex), 'base58')).toBe(b58)
    expect(bytesToHex(decodeBaseN(b58, 'base58'))).toBe(hex)
  })

  it('maps leading zero bytes to "1" and back', () => {
    expect(encodeBaseN(new Uint8Array([0, 0, 1]), 'base58')).toBe('112')
    expect(bytesToHex(decodeBaseN('112', 'base58'))).toBe('000001')
  })

  it('explains characters missing from the alphabet', () => {
    expect(() => decodeBaseN('abc0', 'base58')).toThrow('Invalid Base58 character "0" at position 4 (Base58 omits 0, O, I and l)')
  })
})

describe('ascii85', () => {
  it('encodes the Wikipedia examples', () => {
    // https://en.wikipedia.org/wiki/Ascii85 ("Man " -> "9jqo^"; "sure." -> "F*2M7/c"), cross-checked with CPython base64.a85encode.
    expect(encodeBaseN(u8('Man '), 'ascii85')).toBe('9jqo^')
    expect(encodeBaseN(u8('sure.'), 'ascii85')).toBe('F*2M7/c')
    expect(utf8Decode(decodeBaseN('F*2M7/c', 'ascii85'))).toBe('sure.')
  })

  it('encodes the Leviathan passage from Wikipedia', () => {
    const quote =
      'Man is distinguished, not only by his reason, but by this singular passion from other animals, which is a lust of the mind, that by a perseverance of delight in the continued and indefatigable generation of knowledge, exceeds the short vehemence of any carnal pleasure.'
    const expected =
      '9jqo^BlbD-BleB1DJ+*+F(f,q/0JhKF<GL>Cj@.4Gp$d7F!,L7@<6@)/0JDEF<G%<+EV:2F!,O<DJ+*.@<*K0@<6L(Df-\\0Ec5e;DffZ(EZee.Bl.9pF"AGXBPCsi+DGm>@3BB/F*&OCAfu2/AKYi(DIb:@FD,*)+C]U=@3BN#EcYf8ATD3s@q?d$AftVqCh[NqF<G:8+EV:.+Cf>-FD5W8ARlolDIal(DId<j@<?3r@:F%a+D58\'ATD4$Bl@l3De:,-DJs`8ARoFb/0JMK@qB4^F!,R<AKZ&-DfTqBG%G>uD.RTpAKYo\'+CT/5+Cei#DII?(E,9)oF*2M7/c'
    expect(encodeBaseN(u8(quote), 'ascii85')).toBe(expected)
    expect(utf8Decode(decodeBaseN(expected, 'ascii85'))).toBe(quote)
  })

  it('handles "z", delimiters and whitespace', () => {
    const zeros = new Uint8Array(8)
    expect(encodeBaseN(zeros, 'ascii85')).toBe('zz')
    expect(encodeBaseN(zeros, 'ascii85', { zeroShortcut: false })).toBe('!!!!!!!!!!')
    // A partial final group of zeros is never "z".
    expect(encodeBaseN(new Uint8Array(3), 'ascii85')).toBe('!!!!')
    // CPython base64.a85encode(b"Hello, World!", adobe=True)
    expect(encodeBaseN(u8('Hello, World!'), 'ascii85', { delimiters: true })).toBe('<~87cURD_*#4DfTZ)+T~>')
    expect(utf8Decode(decodeBaseN('<~87cURD_*#4\nDfTZ)+T~>', 'ascii85'))).toBe('Hello, World!')
    expect(decodeBaseN('z!!!!!', 'ascii85')).toEqual(zeros)
  })

  it('rejects invalid input', () => {
    expect(() => decodeBaseN('9jqo^v', 'ascii85')).toThrow('Invalid Ascii85 character "v" at position 6')
    expect(() => decodeBaseN('9jzqo', 'ascii85')).toThrow(/"z" inside a group/)
    expect(() => decodeBaseN('9jqo^B', 'ascii85')).toThrow(/single character/)
    expect(() => decodeBaseN('uuuuu', 'ascii85')).toThrow(/larger than 2\^32/)
    expect(() => decodeBaseN('<~9jqo^', 'ascii85')).toThrow(/without closing/)
  })
})

describe('z85', () => {
  it('matches the ZeroMQ RFC 32 test vector', () => {
    // https://rfc.zeromq.org/spec/32/ : 86 4F D2 6F B5 59 F7 5B -> "HelloWorld"
    expect(encodeBaseN(hexToBytes('864FD26FB559F75B'), 'z85')).toBe('HelloWorld')
    expect(bytesToHex(decodeBaseN('HelloWorld', 'z85'))).toBe('864fd26fb559f75b')
  })

  it('enforces the length rules', () => {
    expect(() => encodeBaseN(u8('abc'), 'z85')).toThrow('Z85 needs a multiple of 4 bytes; got 3 (pad the data first)')
    expect(() => decodeBaseN('Hello', 'z85')).not.toThrow()
    expect(() => decodeBaseN('Hell', 'z85')).toThrow(/multiple of 5/)
    expect(() => decodeBaseN('Hell~', 'z85')).toThrow('Invalid Z85 character "~" at position 5')
    expect(() => decodeBaseN('%%%%%', 'z85')).toThrow(/larger than 2\^32/)
  })
})

describe('base36', () => {
  it('converts numbers', () => {
    expect(encodeBaseN(new Uint8Array([0xff]), 'base36')).toBe('73') // 255 = 7*36 + 3
    expect(encodeBaseN(new Uint8Array([0x01, 0x00]), 'base36')).toBe('74') // 256 = 7*36 + 4
    // Java: Long.toString(Long.MAX_VALUE, 36) == "1y2p0ij32e8e7"
    expect(encodeBaseN(hexToBytes('7fffffffffffffff'), 'base36')).toBe('1y2p0ij32e8e7')
    expect(bytesToHex(decodeBaseN('1Y2P0IJ32E8E7', 'base36'))).toBe('7fffffffffffffff')
    // CPython: int("666f6f626172", 16) in base 36
    expect(encodeBaseN(u8('foobar'), 'base36')).toBe('13x8yd7ywi')
  })

  it('keeps leading zero bytes as leading "0" digits', () => {
    expect(encodeBaseN(new Uint8Array([0, 0, 0xff]), 'base36')).toBe('0073')
    expect(bytesToHex(decodeBaseN('0073', 'base36'))).toBe('0000ff')
    expect(encodeBaseN(new Uint8Array([0, 0]), 'base36')).toBe('00')
    expect(decodeBaseN('00', 'base36')).toEqual(new Uint8Array(2))
  })

  it('rejects invalid characters', () => {
    expect(() => decodeBaseN('ab-c', 'base36')).toThrow('Invalid Base36 character "-" at position 3')
  })
})

describe('round trips on random bytes', () => {
  const bases: BaseN[] = ['base32', 'base32hex', 'base58', 'ascii85', 'z85', 'base36']
  it.each(bases)('%s', (base) => {
    for (let trial = 0; trial < 200; trial++) {
      const len = base === 'z85' ? (trial % 17) * 4 : trial % 67
      const bytes = crypto.getRandomValues(new Uint8Array(len))
      // Leading zeros and all-zero groups exercise the special cases.
      if (trial % 5 === 0 && len > 2) bytes.fill(0, 0, Math.min(len, 1 + (trial % 9)))
      const encoded = encodeBaseN(bytes, base, { padding: trial % 2 === 0, delimiters: trial % 3 === 0 })
      expect(decodeBaseN(encoded, base), `${base} ${bytesToHex(bytes)}`).toEqual(bytes)
    }
  })
})
