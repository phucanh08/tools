import { deflateRawSync, deflateSync, gunzipSync, gzipSync, inflateRawSync, inflateSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { SLICE_BYTES, compressBytes, compressionRatio, decompressBytes, detectFormat, isGzip, isZlib, sliceSource, type CompressFormat } from './compress'
import { base64ToBytes, utf8Decode, utf8Encode } from './encoding'

// Reference implementation: Node's zlib (independent of CompressionStream).
const zlibCompress: Record<CompressFormat, (b: Uint8Array) => Uint8Array> = {
  gzip: (b) => gzipSync(b),
  deflate: (b) => deflateSync(b),
  'deflate-raw': (b) => deflateRawSync(b),
}
const zlibDecompress: Record<CompressFormat, (b: Uint8Array) => Uint8Array> = {
  gzip: (b) => gunzipSync(b),
  deflate: (b) => inflateSync(b),
  'deflate-raw': (b) => inflateRawSync(b),
}
const FORMATS: CompressFormat[] = ['gzip', 'deflate', 'deflate-raw']
const text = 'Xin chào! 👋 '.repeat(50) + 'The quick brown fox jumps over the lazy dog.'

describe('compress', () => {
  it.each(FORMATS)('%s output is readable by zlib and round-trips', async (format) => {
    const input = utf8Encode(text)
    const packed = await compressBytes(input, format)
    expect(packed.length).toBeLessThan(input.length)
    expect(utf8Decode(zlibDecompress[format](packed))).toBe(text)
    expect(utf8Decode(await decompressBytes(packed, format))).toBe(text)
  })

  it.each(FORMATS)('%s decompresses data produced by zlib', async (format) => {
    const packed = zlibCompress[format](utf8Encode(text))
    expect(utf8Decode(await decompressBytes(packed, format))).toBe(text)
  })

  it('decodes a known gzip Base64 vector ("hello", produced by `printf hello | gzip -n | base64`)', async () => {
    const packed = base64ToBytes('H4sIAAAAAAAAA8tIzcnJBwCGphA2BQAAAA==')
    expect(detectFormat(packed)).toEqual({ format: 'gzip', certain: true })
    expect(utf8Decode(await decompressBytes(packed, 'gzip'))).toBe('hello')
  })

  it('compresses empty input to a valid empty stream', async () => {
    for (const format of FORMATS) {
      const packed = await compressBytes(new Uint8Array(0), format)
      expect(zlibDecompress[format](packed).length).toBe(0)
    }
  })

  it('detects gzip and zlib headers (RFC 1952 / RFC 1950)', () => {
    expect(isGzip(gzipSync('x'))).toBe(true)
    expect(isZlib(deflateSync('x'))).toBe(true)
    // Every zlib compression level header: 78 01, 78 5E, 78 9C, 78 DA.
    for (const h of [[0x78, 0x01], [0x78, 0x5e], [0x78, 0x9c], [0x78, 0xda]]) expect(isZlib(new Uint8Array(h))).toBe(true)
    expect(isZlib(new Uint8Array([0x78, 0x9d]))).toBe(false)
    expect(detectFormat(deflateRawSync('hello hello'))).toEqual({ format: 'deflate-raw', certain: false })
  })

  it('reports a wrong format clearly', async () => {
    await expect(decompressBytes(deflateSync('hello'), 'gzip')).rejects.toThrow(
      'Could not decompress as gzip: the data does not start with a gzip header (it looks like zlib (deflate)).',
    )
    await expect(decompressBytes(utf8Encode('plain text'), 'deflate')).rejects.toThrow(/does not start with a zlib \(deflate\) header/)
  })

  it('reports corrupt or truncated data clearly', async () => {
    const packed = gzipSync(utf8Encode(text))
    await expect(decompressBytes(packed.subarray(0, packed.length - 6), 'gzip')).rejects.toThrow(/corrupt, truncated/)
    const corrupt = Uint8Array.from(deflateSync(utf8Encode(text)))
    corrupt[corrupt.length - 1] = (corrupt[corrupt.length - 1] ?? 0) ^ 0xff // break the Adler-32 checksum
    await expect(decompressBytes(corrupt, 'deflate')).rejects.toThrow(/corrupt, truncated/)
    await expect(decompressBytes(new Uint8Array(0), 'gzip')).rejects.toThrow('No compressed data.')
  })

  it('stops when the output exceeds the limit', async () => {
    const bomb = gzipSync(new Uint8Array(1024 * 1024))
    await expect(decompressBytes(bomb, 'gzip', 64 * 1024)).rejects.toThrow(/larger than/)
  })

  it('feeds the input in slices', async () => {
    const bytes = Uint8Array.from({ length: 2 * SLICE_BYTES + 5 }, (_, i) => i & 0xff)
    const reader = sliceSource(bytes).getReader()
    const sizes: number[] = []
    const parts: Uint8Array[] = []
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      sizes.push(r.value.length)
      parts.push(r.value)
    }
    expect(sizes).toEqual([SLICE_BYTES, SLICE_BYTES, 5])
    expect(new Uint8Array(parts.flatMap((p) => [...p]))).toEqual(bytes)
  })

  it('stops pulling input as soon as the output cap is exceeded', async () => {
    // Chromium's DecompressionStream is a TransformStream that inflates each written
    // chunk synchronously; this stub does the same (1 MB of output per input chunk).
    // Node's zlib-backed stream reads ahead regardless, so it cannot show this.
    const written: number[] = []
    class InflatingStub extends TransformStream<Uint8Array, Uint8Array> {
      constructor() {
        super({
          transform(chunk, controller) {
            written.push(chunk.length)
            for (let i = 0; i < 16; i++) controller.enqueue(new Uint8Array(64 * 1024))
          },
        })
      }
    }
    vi.stubGlobal('DecompressionStream', InflatingStub)
    try {
      const input = new Uint8Array(20 * SLICE_BYTES)
      await expect(decompressBytes(input, 'deflate-raw', 3 * 1024 * 1024)).rejects.toThrow(/larger than 3 MB/)
      // 4 slices inflate past 3 MB; at most one more may be queued by the pipe.
      expect(written.every((n) => n === SLICE_BYTES)).toBe(true)
      expect(written.length).toBeGreaterThanOrEqual(4)
      expect(written.length).toBeLessThanOrEqual(5)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('computes the ratio', () => {
    expect(compressionRatio(200, 50)).toEqual({ percent: 25, summary: '25.0% of original (75.0% smaller)' })
    expect(compressionRatio(10, 30).summary).toBe('300.0% of original (200.0% larger)')
    expect(compressionRatio(0, 20).summary).toBe('empty input')
  })
})
