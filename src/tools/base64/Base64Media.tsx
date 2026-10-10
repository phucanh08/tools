import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { TextField, Toolbar } from '../../components/controls'
import { downloadBytes } from '../../components/download'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, useDebounced } from '../../hooks'
import { base64ToBytes, dataUrlMime, formatSize } from '../../lib/encoding'
import { mediaType, sameMime, sniffMedia, type PreviewKind } from '../../lib/media-sniff'

/** Image and PDF previews above this size are skipped (like Base64 File). */
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024
/** Audio/video stream from the blob, so a larger cap is fine. */
const MAX_MEDIA_BYTES = 200 * 1024 * 1024

type MediaKind = Exclude<PreviewKind, 'none'>

// A fresh key per decoded buffer resets the preview state (PDF toggle, errors, info).
const keys = new WeakMap<object, number>()
let nextKey = 0
function previewKey(bytes: Uint8Array): number {
  let k = keys.get(bytes)
  if (k === undefined) keys.set(bytes, (k = ++nextKey))
  return k
}

export default function Base64Media() {
  const [input, setInput] = useState('')
  const [name, setName] = useState('')
  const text = useDebounced(input, input.length > 100_000 ? 250 : 50)

  const decoded = useMemo(() => {
    if (text.trim() === '') return null
    return attempt(() => {
      const bytes = base64ToBytes(text)
      const declared = dataUrlMime(text)
      const sniffed = sniffMedia(bytes)
      return { bytes, declared, sniffed }
    })
  }, [text])

  const value = decoded?.ok ? decoded.value : null
  // Preview only what the bytes prove; the declared type is never trusted for rendering.
  const type = value?.sniffed ?? null
  const downloadType = type ?? mediaType(value?.declared ?? 'application/octet-stream')
  const defaultName = `file.${downloadType.ext}`
  const filename = name.trim() || defaultName
  const mismatch = value?.declared && type && !sameMime(value.declared, type.mime)
  const limit = type?.preview === 'audio' || type?.preview === 'video' ? MAX_MEDIA_BYTES : MAX_PREVIEW_BYTES
  const previewKind: MediaKind | null = type && type.preview !== 'none' && value && value.bytes.length <= limit ? type.preview : null

  return (
    <div className="tool">
      <TextPane
        label="Base64 or data URL"
        value={input}
        onChange={setInput}
        placeholder="Paste Base64 (standard or URL-safe) or a data: URL of an image, audio, video or PDF…"
        invalid={decoded !== null && !decoded.ok}
        rows={6}
        footer={`${input.length.toLocaleString()} characters`}
      />
      {decoded && !decoded.ok && (
        <ErrorMessage>
          {decoded.error} The Base64 Validator &amp; Repair tool can locate and fix the problem.
        </ErrorMessage>
      )}
      {value && (
        <>
          <dl className="kv">
            <dt>Size</dt>
            <dd>
              {formatSize(value.bytes.length)} ({value.bytes.length.toLocaleString()} bytes)
            </dd>
            <dt>Detected type</dt>
            <dd>
              {type ? (
                <>
                  {type.label} <span className="mono muted">{type.mime}</span>
                </>
              ) : (
                'Unknown (no known signature)'
              )}
            </dd>
            {value.declared && (
              <>
                <dt>Declared type</dt>
                <dd className="mono">{value.declared}</dd>
              </>
            )}
          </dl>
          {mismatch && (
            <Notice kind="warn">
              The data URL declares <span className="mono">{value.declared}</span>, but the bytes are{' '}
              <span className="mono">{type.mime}</span>. The preview and download use the detected type.
            </Notice>
          )}
          {value.declared && !type && (
            <Notice kind="warn">
              The bytes do not match any known format, so the declared type is not trusted: download only.
            </Notice>
          )}
          {type && type.preview === 'none' && (
            <Notice>
              {type.mime === 'text/html'
                ? 'HTML is never rendered here, for safety. Download it to inspect it.'
                : `${type.label} cannot be previewed in the browser. Download it instead.`}
            </Notice>
          )}
          {type && type.preview !== 'none' && !previewKind && (
            <Notice kind="warn">Too large to preview ({formatSize(value.bytes.length)}). Download it instead.</Notice>
          )}
          <Toolbar>
            <TextField label="File name" value={name} onChange={setName} placeholder={defaultName} width="18rem" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(value.bytes, filename, downloadType.mime)}
              disabled={value.bytes.length === 0}
            >
              Download {filename}
            </button>
          </Toolbar>
          {previewKind && type && <Preview key={previewKey(value.bytes)} bytes={value.bytes} mime={type.mime} kind={previewKind} />}
        </>
      )}
    </div>
  )
}

/** Attaches a blob: URL to the element and revokes it when the data changes or the view unmounts. */
function useBlobSrc<T extends HTMLImageElement | HTMLMediaElement | HTMLIFrameElement>(bytes: Uint8Array<ArrayBuffer>, mime: string) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    el.src = url
    return () => {
      el.removeAttribute('src')
      if (el instanceof HTMLMediaElement) el.load()
      URL.revokeObjectURL(url)
    }
  }, [bytes, mime])
  return ref
}

function Preview({ bytes, mime, kind }: { bytes: Uint8Array<ArrayBuffer>; mime: string; kind: MediaKind }) {
  const [info, setInfo] = useState('')
  const [failed, setFailed] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  return (
    <section aria-labelledby="media-preview">
      <h2 id="media-preview" className="section-title">
        Preview
      </h2>
      {failed && <Notice kind="warn">Your browser could not play or display this file. You can still download it.</Notice>}
      {kind === 'image' && (
        <figure className="image-preview">
          <BlobImage bytes={bytes} mime={mime} onInfo={setInfo} onFail={() => setFailed(true)} />
        </figure>
      )}
      {(kind === 'audio' || kind === 'video') && (
        <BlobMediaElement bytes={bytes} mime={mime} kind={kind} onInfo={setInfo} onFail={() => setFailed(true)} />
      )}
      {kind === 'pdf' &&
        (showPdf ? (
          <BlobFrame bytes={bytes} mime={mime} />
        ) : (
          <div>
            <button type="button" className="btn" onClick={() => setShowPdf(true)}>
              Show PDF preview
            </button>
          </div>
        ))}
      {info && <p className="muted small">{info}</p>}
    </section>
  )
}

function BlobImage({ bytes, mime, onInfo, onFail }: { bytes: Uint8Array<ArrayBuffer>; mime: string; onInfo: (s: string) => void; onFail: () => void }) {
  const ref = useBlobSrc<HTMLImageElement>(bytes, mime)
  // SVG is shown only through <img>, where scripts and external loads are disabled.
  return (
    <img
      ref={ref}
      alt="Decoded image preview"
      onLoad={(e) => onInfo(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`)}
      onError={(e) => {
        if (e.currentTarget.getAttribute('src')) onFail()
      }}
    />
  )
}

function BlobMediaElement({
  bytes,
  mime,
  kind,
  onInfo,
  onFail,
}: {
  bytes: Uint8Array<ArrayBuffer>
  mime: string
  kind: 'audio' | 'video'
  onInfo: (s: string) => void
  onFail: () => void
}) {
  const ref = useBlobSrc<HTMLMediaElement>(bytes, mime)
  const onMeta = (el: HTMLMediaElement) => {
    const d = Number.isFinite(el.duration) ? `${el.duration.toFixed(2)} s` : 'unknown duration'
    onInfo(el instanceof HTMLVideoElement && el.videoWidth ? `${el.videoWidth} × ${el.videoHeight} px · ${d}` : d)
  }
  const onError = (el: HTMLMediaElement) => {
    if (el.getAttribute('src')) onFail()
  }
  return kind === 'audio' ? (
    <audio
      ref={ref as RefObject<HTMLAudioElement>}
      controls
      preload="metadata"
      className="media-preview-audio"
      aria-label="Decoded audio preview"
      onLoadedMetadata={(e) => onMeta(e.currentTarget)}
      onError={(e) => onError(e.currentTarget)}
    />
  ) : (
    <video
      ref={ref as RefObject<HTMLVideoElement>}
      controls
      preload="metadata"
      className="media-preview-video"
      aria-label="Decoded video preview"
      onLoadedMetadata={(e) => onMeta(e.currentTarget)}
      onError={(e) => onError(e.currentTarget)}
    />
  )
}

function BlobFrame({ bytes, mime }: { bytes: Uint8Array<ArrayBuffer>; mime: string }) {
  // Only bytes that start with "%PDF-" reach here, served with type application/pdf
  // (rendered by the browser's PDF viewer). object/embed are blocked by the CSP.
  const ref = useBlobSrc<HTMLIFrameElement>(bytes, mime)
  return <iframe ref={ref} title="PDF preview" className="preview-frame" />
}
