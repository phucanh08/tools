// HTTP Basic authentication (RFC 7617). Pure functions, no DOM access.

import { base64ToBytes, textToBase64, utf8Decode } from './encoding'

export interface BasicAuthHeader {
  token: string
  /** "Basic <token>" */
  value: string
  /** "Authorization: Basic <token>" */
  header: string
}

/** Encodes credentials as UTF-8 (RFC 7617 §2.1, charset="UTF-8"). */
export function encodeBasicAuth(user: string, password: string): BasicAuthHeader {
  const token = textToBase64(`${user}:${password}`)
  return { token, value: `Basic ${token}`, header: `Authorization: Basic ${token}` }
}

export interface DecodedBasicAuth {
  user: string
  password: string
  token: string
  /** Charset that decoded the credentials; ISO-8859-1 is the legacy fallback for non-UTF-8 bytes. */
  charset: 'UTF-8' | 'ISO-8859-1'
}

/**
 * Decodes "Authorization: Basic xxx", "Basic xxx" (any case, extra whitespace)
 * or a bare token. The user-id ends at the first ":" (RFC 7617 §2).
 */
export function decodeBasicAuth(input: string): DecodedBasicAuth {
  let s = input.trim().replace(/^(["'])([\s\S]*)\1$/, '$2').trim()
  s = s.replace(/^-H\s+/i, '').replace(/^(["'])([\s\S]*)\1$/, '$2').trim()
  s = s.replace(/^(?:proxy-)?authorization\s*:\s*/i, '')
  const scheme = /^([A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]*)\s+(\S[\s\S]*)$/.exec(s)
  if (scheme) {
    if (scheme[1]?.toLowerCase() !== 'basic') {
      throw new Error(`This is a "${scheme[1]}" credential, not "Basic".`)
    }
    s = scheme[2] ?? ''
  } else if (/^basic$/i.test(s)) {
    s = ''
  }
  s = s.trim()
  if (s === '') throw new Error('No credentials token found.')
  if (/\s/.test(s)) throw new Error('The token must not contain spaces.')
  const bytes = base64ToBytes(s)
  let text: string
  let charset: DecodedBasicAuth['charset'] = 'UTF-8'
  try {
    text = utf8Decode(bytes)
  } catch {
    text = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    charset = 'ISO-8859-1'
  }
  const colon = text.indexOf(':')
  if (colon < 0) throw new Error('The decoded token has no ":" between user and password.')
  return { user: text.slice(0, colon), password: text.slice(colon + 1), token: s, charset }
}

/** RFC 7617 §2: control characters (C0, DEL and C1 U+0080-U+009F) are not allowed in user-id or password. */
export function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true
  }
  return false
}

/** Quotes a string for POSIX shells (single quotes, with ' escaped as '\''). */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function curlExamples(user: string, password: string, url = 'https://example.com/'): { userFlag: string; header: string } {
  const { header } = encodeBasicAuth(user, password)
  return {
    userFlag: `curl -u ${shellQuote(`${user}:${password}`)} ${url}`,
    header: `curl -H ${shellQuote(header)} ${url}`,
  }
}
