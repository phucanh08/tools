import { useMemo, useState } from 'react'
import { TextField } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { FilePicker } from '../../components/FilePicker'
import { ErrorMessage, Notice, Spinner } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { errorMessage } from '../../hooks'
import { formatSize } from '../../lib/encoding'
import { altFromFileName, encodeImage, imageDimensions, overheadPercent, withAlt, type Dimensions } from '../../lib/image-snippets'
import { mediaType, sniffMedia } from '../../lib/media-sniff'

/** Snippets longer than this are offered via Copy only (huge textareas freeze the page). */
const MAX_DISPLAY_CHARS = 1_000_000
/** Image previews above this size are skipped. */
const MAX_PREVIEW_BYTES = 25 * 1024 * 1024

interface Loaded {
  file: File
  bytes: Uint8Array<ArrayBuffer>
  mime: string
  size: Dimensions | null
}

const SNIPPETS = [
  ['dataUri', 'Data URI'],
  ['css', 'CSS background-image'],
  ['html', 'HTML <img>'],
  ['markdown', 'Markdown image'],
  ['json', 'JSON string'],
  ['base64', 'Base64 only'],
] as const

export default function ImageToBase64() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [alt, setAlt] = useState('')

  const onFile = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // Trust the bytes over the file extension; fall back to the browser's type.
      const sniffed = sniffMedia(bytes)
      const mime = sniffed?.mime.startsWith('image/') ? sniffed.mime : file.type.startsWith('image/') && !sniffed ? file.type : null
      if (!mime) {
        setLoaded(null)
        setError(`"${file.name}" is not a recognised image${sniffed ? ` (it looks like ${sniffed.label})` : ''}.`)
        return
      }
      setLoaded({ file, bytes, mime, size: imageDimensions(bytes) })
      setAlt(altFromFileName(file.name))
    } catch (e) {
      setLoaded(null)
      setError(`Could not read file: ${errorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // Encode once per image; typing alt text only rebuilds the two snippets that contain it.
  const encoded = useMemo(() => (loaded ? encodeImage(loaded.bytes, loaded.mime) : null), [loaded])
  const snippets = useMemo(
    () => (loaded && encoded ? withAlt(encoded, alt.trim() || 'image', loaded.size) : null),
    [loaded, encoded, alt],
  )
  const original = loaded?.bytes.length ?? 0
  const canPreview = loaded !== null && loaded.bytes.length <= MAX_PREVIEW_BYTES && mediaType(loaded.mime).preview === 'image'

  return (
    <div className="tool">
      <FilePicker onFile={onFile} file={loaded?.file} accept="image/*" label="Choose an image or drop it here" />
      {busy && <Spinner label="Reading image…" />}
      <ErrorMessage>{error}</ErrorMessage>
      {loaded && snippets && (
        <>
          <dl className="kv">
            <dt>File</dt>
            <dd>{loaded.file.name}</dd>
            <dt>Type</dt>
            <dd className="mono">{loaded.mime}</dd>
            <dt>Dimensions</dt>
            <dd>{loaded.size ? `${loaded.size.width} × ${loaded.size.height} px` : 'Unknown'}</dd>
            <dt>Original size</dt>
            <dd>
              {formatSize(original)} ({original.toLocaleString()} bytes)
            </dd>
            <dt>Base64 size</dt>
            <dd>
              {snippets.base64.length.toLocaleString()} characters (+{overheadPercent(original, snippets.base64.length).toFixed(1)}%)
            </dd>
            <dt>Data URI size</dt>
            <dd>
              {snippets.dataUri.length.toLocaleString()} characters (+{overheadPercent(original, snippets.dataUri.length).toFixed(1)}%)
            </dd>
          </dl>
          <TextField label="Alt text" value={alt} onChange={setAlt} width="24rem" hint="Used in the HTML and Markdown snippets (escaped)." />
          {canPreview && (
            <figure className="image-preview">
              <img src={snippets.dataUri} alt={alt || 'Image preview'} />
            </figure>
          )}
          {snippets.dataUri.length > MAX_DISPLAY_CHARS && (
            <Notice kind="warn">The snippets are too large to display ({formatSize(snippets.dataUri.length)}). Use the Copy buttons.</Notice>
          )}
          <div className="img-snippets">
            {SNIPPETS.map(([key, label]) =>
              snippets.dataUri.length > MAX_DISPLAY_CHARS ? (
                <CopyButton key={key} text={snippets[key]} className="btn" label={`Copy ${label}`} />
              ) : (
                <TextPane key={key} label={label} value={snippets[key]} rows={3} footer={`${snippets[key].length.toLocaleString()} characters`} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  )
}
