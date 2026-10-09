// URL and timestamp helpers.

export type UrlMode = 'component' | 'uri' | 'form'

export function urlEncode(text: string, mode: UrlMode = 'component'): string {
  switch (mode) {
    case 'component':
      return encodeURIComponent(text)
    case 'uri':
      return encodeURI(text)
    case 'form':
      return new URLSearchParams({ q: text }).toString().slice(2)
  }
}

export function urlDecode(text: string, mode: UrlMode = 'component'): string {
  try {
    if (mode === 'form') return decodeURIComponent(text.replace(/\+/g, ' '))
    return mode === 'uri' ? decodeURI(text) : decodeURIComponent(text)
  } catch {
    const bad = /%(?![0-9a-fA-F]{2})|%[0-9a-fA-F]{2}/.exec(text)
    throw new Error(
      `Malformed percent-encoding${bad ? ` near "${text.slice(bad.index, bad.index + 6)}"` : ''} (invalid escape or invalid UTF-8)`,
    )
  }
}

export interface ParsedUrl {
  href: string
  protocol: string
  username: string
  password: string
  host: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  origin: string
  params: [string, string][]
}

export function parseUrl(input: string): ParsedUrl {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    throw new Error('Not an absolute URL (include the scheme, e.g. https://)')
  }
  return {
    href: u.href,
    protocol: u.protocol,
    username: u.username,
    password: u.password,
    host: u.host,
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    origin: u.origin,
    params: [...u.searchParams.entries()],
  }
}

export type TimestampUnit = 'auto' | 's' | 'ms' | 'us' | 'ns'

/** Parse a numeric Unix timestamp into milliseconds. "auto" guesses by magnitude. */
export function timestampToMs(input: string, unit: TimestampUnit = 'auto'): { ms: number; unit: Exclude<TimestampUnit, 'auto'> } {
  const s = input.trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('Timestamp must be a number')
  const n = Number(s)
  let u: Exclude<TimestampUnit, 'auto'>
  if (unit !== 'auto') u = unit
  else {
    const abs = Math.abs(n)
    u = abs < 1e11 ? 's' : abs < 1e14 ? 'ms' : abs < 1e17 ? 'us' : 'ns'
  }
  const ms = u === 's' ? n * 1000 : u === 'ms' ? n : u === 'us' ? n / 1000 : n / 1e6
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) throw new Error('Timestamp is out of the supported date range')
  return { ms, unit: u }
}

/** Parse a date string. Accepts ISO 8601, RFC 2822 and other Date.parse formats. */
export function parseDateInput(input: string): Date {
  const d = new Date(input.trim())
  if (Number.isNaN(d.getTime())) throw new Error('Unrecognized date. Try ISO 8601, e.g. 2024-01-31T12:00:00Z')
  return d
}

export function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = ms - now
  const abs = Math.abs(diff)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365.25 * 864e5],
    ['month', 30.44 * 864e5],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4],
    ['second', 1e3],
  ]
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (abs >= size || unit === 'second') return rtf.format(Math.round(diff / size), unit)
  }
  return ''
}
