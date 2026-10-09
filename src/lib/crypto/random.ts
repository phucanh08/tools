// Cryptographically secure randomness only (crypto.getRandomValues).

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(length) || length < 0) throw new Error('Length must be a non-negative integer')
  const out = new Uint8Array(length)
  // getRandomValues is limited to 65536 bytes per call.
  for (let i = 0; i < length; i += 65536) {
    crypto.getRandomValues(out.subarray(i, Math.min(i + 65536, length)))
  }
  return out
}

/** Uniform random integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new Error('max must be in (0, 2^32]')
  const limit = 2 ** 32 - (2 ** 32 % max)
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    const v = buf[0]!
    if (v < limit) return v % max
  }
}

export const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
} as const

export type CharsetName = keyof typeof CHARSETS

const AMBIGUOUS = new Set('Il1O0o|`\'"')

export interface PasswordOptions {
  length: number
  sets: CharsetName[]
  excludeAmbiguous?: boolean
  /** Guarantee at least one character from every selected set. Default true. */
  requireEach?: boolean
}

export function generatePassword(opts: PasswordOptions): string {
  const { length, sets, excludeAmbiguous = false, requireEach = true } = opts
  if (sets.length === 0) throw new Error('Select at least one character set')
  if (!Number.isInteger(length) || length < 1 || length > 4096) throw new Error('Length must be between 1 and 4096')
  const pools = sets.map((s) => [...CHARSETS[s]].filter((c) => !excludeAmbiguous || !AMBIGUOUS.has(c)))
  const all = pools.flat()
  if (requireEach && length < pools.length) {
    throw new Error(`Length must be at least ${pools.length} to include every selected set`)
  }
  const chars: string[] = []
  if (requireEach) for (const pool of pools) chars.push(pool[randomInt(pool.length)]!)
  while (chars.length < length) chars.push(all[randomInt(all.length)]!)
  // Fisher–Yates shuffle so the guaranteed characters are not at fixed positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join('')
}

/** Approximate entropy in bits for a uniformly random password. */
export function passwordEntropyBits(opts: PasswordOptions): number {
  const size = new Set(
    opts.sets.flatMap((s) => [...CHARSETS[s]]).filter((c) => !opts.excludeAmbiguous || !AMBIGUOUS.has(c)),
  ).size
  return size > 0 ? opts.length * Math.log2(size) : 0
}

function formatUuid(b: Uint8Array): string {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function uuidV4(): string {
  const b = randomBytes(16)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  return formatUuid(b)
}

/** RFC 9562 UUIDv7: 48-bit Unix ms timestamp + 74 random bits. */
export function uuidV7(timestampMs: number = Date.now()): string {
  const b = randomBytes(16)
  let ts = Math.floor(timestampMs)
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256
    ts = Math.floor(ts / 256)
  }
  b[6] = (b[6]! & 0x0f) | 0x70
  b[8] = (b[8]! & 0x3f) | 0x80
  return formatUuid(b)
}

export function uuidV7Timestamp(uuid: string): number | null {
  const h = uuid.replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/i.test(h) || h[12] !== '7') return null
  return parseInt(h.slice(0, 12), 16)
}
