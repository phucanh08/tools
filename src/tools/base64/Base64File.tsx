import { useState } from 'react'
import { Segmented, TextField, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { downloadBytes, downloadText } from '../../components/download'
import { FilePicker } from '../../components/FilePicker'
import { ErrorMessage, Notice, Spinner } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, errorMessage } from '../../hooks'
import { base64ToBytes, bytesToBase64, bytesToDataUrl, dataUrlMime, formatSize } from '../../lib/encoding'
import { extensionFor, mediaType, sniffMimeType } from '../../lib/media-sniff'

/** Outputs longer than this are not rendered into a textarea (it would freeze the page). */
const MAX_DISPLAY_CHARS = 2_000_000
/** Image previews above this size are skipped. */
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024

type Direction = 'toBase64' | 'toFile'

export default function Base64File() {
  const [direction, setDirection] = useState<Direction>('toBase64')
  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'toBase64', label: 'File → Base64' },
            { value: 'toFile', label: 'Base64 → File' },
          ]}
        />
      </Toolbar>
      {direction === 'toBase64' ? <FileToBase64 /> : <Base64ToFile />}
    </div>
  )
}

interface Loaded {
  file: File
  bytes: Uint8Array<ArrayBuffer>
  mime: string
}

function FileToBase64() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState<'base64' | 'dataurl'>('base64')

  const onFile = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const mime = file.type || sniffMimeType(bytes) || 'application/octet-stream'
      setLoaded({ file, bytes, mime })
    } catch (e) {
      setError(`Could not read file: ${errorMessage(e)}`)
      setLoaded(null)
    } finally {
      setBusy(false)
    }
  }

  const output = loaded ? (format === 'dataurl' ? bytesToDataUrl(loaded.bytes, loaded.mime) : bytesToBase64(loaded.bytes)) : ''
  const tooLarge = output.length > MAX_DISPLAY_CHARS
  const isImage = loaded ? mediaType(loaded.mime).preview === 'image' : false

  return (
    <>
      <FilePicker onFile={onFile} file={loaded?.file} />
      {busy && <Spinner label="Reading file…" />}
      <ErrorMessage>{error}</ErrorMessage>
      {loaded && (
        <>
          <dl className="kv">
            <dt>File</dt>
            <dd>{loaded.file.name}</dd>
            <dt>Size</dt>
            <dd>
              {formatSize(loaded.bytes.length)} ({loaded.bytes.length.toLocaleString()} bytes)
            </dd>
            <dt>Type</dt>
            <dd className="mono">{loaded.mime}</dd>
            <dt>Output</dt>
            <dd>{output.length.toLocaleString()} characters</dd>
          </dl>
          <Toolbar>
            <Segmented
              label="Output"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'base64', label: 'Base64' },
                { value: 'dataurl', label: 'Data URL' },
              ]}
            />
            <CopyButton text={output} className="btn" label={format === 'dataurl' ? 'Copy data URL' : 'Copy Base64'} />
            <button
              type="button"
              className="btn"
              onClick={() => downloadText(output, `${loaded.file.name}.${format === 'dataurl' ? 'dataurl' : 'b64'}.txt`)}
            >
              Download as .txt
            </button>
          </Toolbar>
          {tooLarge ? (
            <Notice kind="warn">
              The output is too large to display ({formatSize(output.length)}). Use Copy or Download.
            </Notice>
          ) : (
            <TextPane label={format === 'dataurl' ? 'Data URL' : 'Base64'} value={output} rows={10} />
          )}
          {isImage && loaded.bytes.length <= MAX_PREVIEW_BYTES && (
            <figure className="image-preview">
              <img src={bytesToDataUrl(loaded.bytes, loaded.mime)} alt={`Preview of ${loaded.file.name}`} />
            </figure>
          )}
        </>
      )}
    </>
  )
}

function Base64ToFile() {
  const [input, setInput] = useState('')
  const [name, setName] = useState('')

  const decoded =
    input.trim() === ''
      ? null
      : attempt(() => {
          const bytes = base64ToBytes(input)
          const mime = dataUrlMime(input) ?? sniffMimeType(bytes) ?? 'application/octet-stream'
          return { bytes, mime }
        })

  const value = decoded?.ok ? decoded.value : null
  const defaultName = value ? `file.${extensionFor(value.mime)}` : 'file.bin'
  const filename = name.trim() || defaultName
  const isImage = value ? mediaType(value.mime).preview === 'image' : false

  return (
    <>
      <TextPane
        label="Base64 or data URL"
        value={input}
        onChange={setInput}
        placeholder="Paste Base64 (standard or URL-safe) or a data: URL…"
        invalid={decoded !== null && !decoded.ok}
        rows={10}
      />
      {decoded && !decoded.ok && <ErrorMessage>{decoded.error}</ErrorMessage>}
      {value && (
        <>
          <dl className="kv">
            <dt>Size</dt>
            <dd>
              {formatSize(value.bytes.length)} ({value.bytes.length.toLocaleString()} bytes)
            </dd>
            <dt>Detected type</dt>
            <dd className="mono">{value.mime}</dd>
          </dl>
          <Toolbar>
            <TextField label="File name" value={name} onChange={setName} placeholder={defaultName} width="18rem" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(value.bytes, filename, value.mime)}
              disabled={value.bytes.length === 0}
            >
              Download {filename}
            </button>
          </Toolbar>
          {isImage && value.bytes.length <= MAX_PREVIEW_BYTES && (
            <figure className="image-preview">
              <img src={bytesToDataUrl(value.bytes, value.mime)} alt="Decoded image preview" />
            </figure>
          )}
        </>
      )}
    </>
  )
}
