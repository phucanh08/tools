import { useCallback, useMemo, useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { downloadBytes } from '../../components/download'
import { ErrorMessage, Notice, Spinner } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { useAsyncValue, useDebounced } from '../../hooks'
import {
  FORMAT_LABELS,
  compressBytes,
  compressionRatio,
  compressionSupported,
  decompressBytes,
  detectFormat,
  type CompressFormat,
} from '../../lib/compress'
import { base64ToBytes, bytesToBase64, formatSize, isValidUtf8, utf8Decode, utf8Encode } from '../../lib/encoding'

type Mode = 'compress' | 'decompress'

const FORMAT_OPTIONS: { value: CompressFormat; label: string; title: string }[] = [
  { value: 'gzip', label: 'gzip', title: 'RFC 1952: header 1F 8B, CRC-32 trailer' },
  { value: 'deflate', label: 'zlib', title: 'RFC 1950 "deflate": 2-byte header, Adler-32 trailer' },
  { value: 'deflate-raw', label: 'Raw deflate', title: 'RFC 1951: no header or checksum' },
]

const sizeText = (n: number) => `${formatSize(n)} (${n.toLocaleString()} bytes)`

export default function Base64Compress() {
  const [mode, setMode] = useState<Mode>('compress')
  const [input, setInput] = useState('')
  const [format, setFormat] = useState<CompressFormat>('gzip')
  const [decodeFormat, setDecodeFormat] = useState<CompressFormat | 'auto'>('auto')
  const [urlSafe, setUrlSafe] = useState(false)
  const debounced = useDebounced(input, 200)

  const task = useCallback(async () => {
    if (mode === 'compress') {
      const original = utf8Encode(debounced)
      const packed = await compressBytes(original, format)
      return { kind: 'compress' as const, original: original.length, packed: packed.length, output: bytesToBase64(packed, { urlSafe }) }
    }
    const packed = base64ToBytes(debounced)
    const detected = detectFormat(packed)
    const used = decodeFormat === 'auto' ? detected.format : decodeFormat
    const bytes = await decompressBytes(packed, used)
    return { kind: 'decompress' as const, packed: packed.length, used, auto: decodeFormat === 'auto', certain: detected.certain, bytes }
  }, [mode, debounced, format, decodeFormat, urlSafe])

  const { result, pending } = useAsyncValue(debounced.trim() === '' ? null : task)
  const value = result?.ok ? result.value : null
  const comp = value?.kind === 'compress' && mode === 'compress' ? value : null
  const decomp = value?.kind === 'decompress' && mode === 'decompress' ? value : null
  const decompBytes = decomp?.bytes
  // Up to 64 MB: validate and decode once per result, not on every render.
  const text = useMemo(() => (decompBytes && isValidUtf8(decompBytes) ? utf8Decode(decompBytes) : null), [decompBytes])
  const output = comp?.output ?? text ?? ''
  const stale = pending || input !== debounced

  if (!compressionSupported()) {
    return (
      <div className="tool">
        <ErrorMessage>This browser does not support CompressionStream / DecompressionStream.</ErrorMessage>
      </div>
    )
  }

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'compress', label: 'Compress → Base64' },
            { value: 'decompress', label: 'Base64 → Decompress' },
          ]}
        />
        {mode === 'compress' ? (
          <>
            <Segmented label="Format" value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
            <Checkbox label="URL-safe" checked={urlSafe} onChange={setUrlSafe} />
          </>
        ) : (
          <Segmented
            label="Format"
            value={decodeFormat}
            onChange={setDecodeFormat}
            options={[{ value: 'auto' as const, label: 'Auto', title: 'Detect gzip / zlib header, else raw deflate' }, ...FORMAT_OPTIONS]}
          />
        )}
        {stale && input.trim() !== '' && <Spinner label={mode === 'compress' ? 'Compressing…' : 'Decompressing…'} />}
      </Toolbar>
      <div className="panes">
        <TextPane
          label={mode === 'compress' ? 'Text (UTF-8)' : 'Compressed Base64'}
          value={input}
          onChange={setInput}
          placeholder={mode === 'compress' ? 'Type or paste text to compress…' : 'Paste gzip / zlib / deflate data as Base64…'}
          invalid={result !== null && !result.ok && !stale}
        />
        <TextPane label={mode === 'compress' ? 'Compressed Base64' : 'Decompressed text'} value={stale ? '' : output} />
      </div>
      {result && !result.ok && !stale && <ErrorMessage>{result.error}</ErrorMessage>}
      {comp && !stale && (
        <dl className="kv">
          <dt>Original</dt>
          <dd>{sizeText(comp.original)}</dd>
          <dt>{FORMAT_LABELS[format]}</dt>
          <dd>{sizeText(comp.packed)}</dd>
          <dt>Base64</dt>
          <dd>{comp.output.length.toLocaleString()} characters</dd>
          <dt>Ratio</dt>
          <dd>{compressionRatio(comp.original, comp.packed).summary}</dd>
          <dt>Base64 vs. text</dt>
          <dd>{compressionRatio(comp.original, comp.output.length).summary}</dd>
        </dl>
      )}
      {comp && !stale && comp.output.length > comp.original && (
        <Notice kind="warn">The Base64 output is longer than the text: short or random input does not compress well.</Notice>
      )}
      {decomp && !stale && (
        <>
          <dl className="kv">
            <dt>Format</dt>
            <dd>
              {FORMAT_LABELS[decomp.used]}
              {decomp.auto && (decomp.certain ? ' (detected from header)' : ' (no gzip/zlib header, tried raw deflate)')}
            </dd>
            <dt>Compressed</dt>
            <dd>{sizeText(decomp.packed)}</dd>
            <dt>Decompressed</dt>
            <dd>{sizeText(decomp.bytes.length)}</dd>
            <dt>Ratio</dt>
            <dd>{compressionRatio(decomp.bytes.length, decomp.packed).summary}</dd>
          </dl>
          {text === null && (
            <Notice kind="warn">The decompressed data is binary (not UTF-8 text). Download it as a file instead.</Notice>
          )}
          <Toolbar>
            <button
              type="button"
              className="btn"
              onClick={() => downloadBytes(decomp.bytes, 'decompressed.bin')}
              disabled={decomp.bytes.length === 0}
            >
              Download decompressed data
            </button>
          </Toolbar>
        </>
      )}
    </div>
  )
}
