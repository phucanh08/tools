// gzip / zlib (deflate) / raw deflate via the platform CompressionStream and
// DecompressionStream (browsers and Node 18+). No DOM access, no dependency.

export type CompressFormat = 'gzip' | 'deflate' | 'deflate-raw'

export const FORMAT_LABELS: Record<CompressFormat, string> = {
  gzip: 'gzip',
  deflate: 'zlib (deflate)',
  'deflate-raw': 'raw deflate',
}

/** Decompressed output above this size is rejected (protects against zip bombs). */
export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

export function compressionSupported(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'
}

async function collect(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      throw new Error(`Output is larger than ${Math.round(limit / 1024 / 1024)} MB; stopped.`)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** Input is fed to the (de)compressor in slices of this size. */
export const SLICE_BYTES = 32 * 1024

/**
 * A pull-based stream over `bytes`, one slice per pull (highWaterMark 0, so
 * nothing is read ahead). Feeding a zip bomb in one chunk lets the browser
 * inflate all of it before collect() sees the first output; with slices,
 * collect() checks the cap between slices and its cancel() stops the pulls.
 */
export function sliceSource(bytes: Uint8Array, sliceBytes = SLICE_BYTES): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close()
          return
        }
        controller.enqueue(bytes.subarray(offset, offset + sliceBytes))
        offset += sliceBytes
      },
    },
    { highWaterMark: 0 },
  )
}

function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): ReadableStream<Uint8Array> {
  return sliceSource(bytes).pipeThrough(transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
}

export async function compressBytes(bytes: Uint8Array, format: CompressFormat): Promise<Uint8Array<ArrayBuffer>> {
  if (!compressionSupported()) throw new Error('This browser does not support CompressionStream.')
  return collect(pipe(bytes, new CompressionStream(format)), Number.MAX_SAFE_INTEGER)
}

export async function decompressBytes(
  bytes: Uint8Array,
  format: CompressFormat,
  limit = MAX_OUTPUT_BYTES,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!compressionSupported()) throw new Error('This browser does not support DecompressionStream.')
  if (bytes.length === 0) throw new Error('No compressed data.')
  try {
    return await collect(pipe(bytes, new DecompressionStream(format)), limit)
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Output is larger')) throw e
    const header = format !== 'deflate-raw' && !headerMatches(bytes, format)
    const detail = header
      ? `the data does not start with a ${FORMAT_LABELS[format]} header${hint(bytes)}`
      : 'the data is corrupt, truncated or has trailing bytes'
    throw new Error(`Could not decompress as ${FORMAT_LABELS[format]}: ${detail}.`, { cause: e })
  }
}

function hint(bytes: Uint8Array): string {
  const detected = detectFormat(bytes)
  return detected.format !== 'deflate-raw' ? ` (it looks like ${FORMAT_LABELS[detected.format]})` : ''
}

function headerMatches(bytes: Uint8Array, format: CompressFormat): boolean {
  if (format === 'gzip') return isGzip(bytes)
  if (format === 'deflate') return isZlib(bytes)
  return true
}

/** gzip member header: ID1 ID2 = 1F 8B, CM = 8 (deflate). RFC 1952 §2.3.1. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08
}

/** zlib header: CM = 8, CINFO <= 7, FDICT unset, (CMF*256 + FLG) % 31 == 0. RFC 1950 §2.2. */
export function isZlib(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false
  const cmf = bytes[0] ?? 0
  const flg = bytes[1] ?? 0
  return (cmf & 0x0f) === 8 && cmf >> 4 <= 7 && (flg & 0x20) === 0 && ((cmf << 8) | flg) % 31 === 0
}

export interface DetectedFormat {
  format: CompressFormat
  /** True when a header identified the format; raw deflate has none, so it is a fallback. */
  certain: boolean
}

export function detectFormat(bytes: Uint8Array): DetectedFormat {
  if (isGzip(bytes)) return { format: 'gzip', certain: true }
  if (isZlib(bytes)) return { format: 'deflate', certain: true }
  return { format: 'deflate-raw', certain: false }
}

export interface Ratio {
  /** compressed / original, as a percentage (0 when original is empty). */
  percent: number
  /** Human-readable summary like "38.2% of original (61.8% smaller)". */
  summary: string
}

export function compressionRatio(original: number, compressed: number): Ratio {
  if (original === 0) return { percent: 0, summary: 'empty input' }
  const percent = (compressed / original) * 100
  const delta = Math.abs(100 - percent)
  const summary =
    percent <= 100
      ? `${percent.toFixed(1)}% of original (${delta.toFixed(1)}% smaller)`
      : `${percent.toFixed(1)}% of original (${delta.toFixed(1)}% larger)`
  return { percent, summary }
}
