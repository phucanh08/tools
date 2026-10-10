import { useState } from 'react'
import { Checkbox, NumberField, Segmented, TextField, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { downloadBytes, downloadText } from '../../components/download'
import { FilePicker } from '../../components/FilePicker'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, errorMessage } from '../../hooks'
import { base64ToBytes, formatSize, isValidUtf8, textToBase64, utf8Decode, utf8Encode } from '../../lib/encoding'
import { MIME_LINE_LENGTH, lineStats, unwrapLines, wrapLines, type LineEnding } from '../../lib/mime'
import { safeFilename, uudecode, uuencode, validateFilename, validateMode } from '../../lib/uuencode'

type Tool = 'mime' | 'uu'

export default function MimeUuencode() {
  const [tool, setTool] = useState<Tool>('mime')
  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Tool"
          value={tool}
          onChange={setTool}
          options={[
            { value: 'mime', label: 'MIME line wrap' },
            { value: 'uu', label: 'Uuencode' },
          ]}
        />
      </Toolbar>
      {tool === 'mime' ? <MimeWrap /> : <Uu />}
    </div>
  )
}

const EOL_LABEL: Record<LineEnding, string> = { '\r\n': 'CRLF', '\n': 'LF' }

function MimeWrap() {
  const [mode, setMode] = useState<'wrap' | 'unwrap'>('wrap')
  const [input, setInput] = useState('')
  const [plain, setPlain] = useState(false)
  const [width, setWidth] = useState(MIME_LINE_LENGTH)
  const [eol, setEol] = useState<LineEnding>('\r\n')

  const result =
    input.trim() === ''
      ? null
      : attempt(() => {
          if (mode === 'unwrap') return unwrapLines(input)
          return wrapLines(plain ? textToBase64(input) : input, width, eol)
        })
  const output = result?.ok ? result.value : ''
  // Validate the Base64 itself, but only as a warning: wrapping works on any text.
  const b64Check = output !== '' && !(mode === 'wrap' && plain) ? attempt(() => base64ToBytes(output)) : null
  const inStats = lineStats(input)
  const outStats = lineStats(output)

  return (
    <>
      <Toolbar>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'wrap', label: 'Wrap' },
            { value: 'unwrap', label: 'Unwrap' },
          ]}
        />
        {mode === 'wrap' && (
          <>
            <NumberField label="Line width" value={width} onChange={setWidth} min={1} max={1000} width="7rem" />
            <Segmented
              label="Line ending"
              value={eol}
              onChange={setEol}
              options={[
                { value: '\r\n', label: 'CRLF' },
                { value: '\n', label: 'LF' },
              ]}
            />
            <Checkbox label="Input is plain text (encode to Base64 first)" checked={plain} onChange={setPlain} />
          </>
        )}
      </Toolbar>
      <p className="muted small">
        MIME (RFC 2045) limits Base64 lines to 76 characters with CRLF line breaks; PEM uses 64. Copy and Download keep the chosen line
        ending exactly.
      </p>
      <div className="panes">
        <TextPane
          label={mode === 'wrap' && plain ? 'Text (UTF-8)' : 'Base64 input'}
          value={input}
          onChange={setInput}
          placeholder={mode === 'wrap' ? 'Paste Base64 (any line breaks are removed first)…' : 'Paste wrapped Base64…'}
          invalid={result !== null && !result.ok}
          footer={`${inStats.lines} line(s), longest ${inStats.longest}`}
        />
        <TextPane
          label={mode === 'wrap' ? 'Wrapped Base64' : 'Unwrapped Base64'}
          value={output}
          noCopy
          actions={<CopyButton text={output} what={mode === 'wrap' ? 'Wrapped Base64' : 'Unwrapped Base64'} />}
          footer={
            mode === 'wrap'
              ? `${outStats.lines} line(s) × ${width}, ${EOL_LABEL[eol]} line endings`
              : `${output.length} characters (removed ${inStats.crlf} CRLF, ${inStats.lf} LF)`
          }
        />
      </div>
      {result && !result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      {b64Check && !b64Check.ok && <Notice kind="warn">The data is not valid Base64: {b64Check.error}</Notice>}
      {mode === 'wrap' && width % 4 !== 0 && <Notice>Line widths that are a multiple of 4 keep each line decodable on its own.</Notice>}
      {output !== '' && (
        <Toolbar>
          <button type="button" className="btn" onClick={() => downloadText(output, mode === 'wrap' ? 'wrapped.b64.txt' : 'unwrapped.b64.txt')}>
            Download .txt
          </button>
        </Toolbar>
      )}
    </>
  )
}

function Uu() {
  const [mode, setMode] = useState<'encode' | 'decode'>('encode')
  return (
    <>
      <Toolbar>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
        />
      </Toolbar>
      {mode === 'encode' ? <UuEncode /> : <UuDecode />}
    </>
  )
}

function UuEncode() {
  const [source, setSource] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ file: File; bytes: Uint8Array<ArrayBuffer> } | null>(null)
  const [fileError, setFileError] = useState('')
  const [name, setName] = useState('file.txt')
  const [mode, setMode] = useState('644')
  const [crlf, setCrlf] = useState(false)

  const onFile = async (f: File) => {
    setFileError('')
    try {
      setFile({ file: f, bytes: new Uint8Array(await f.arrayBuffer()) })
      setName(f.name.replace(/[\r\n]/g, '') || 'file.bin')
    } catch (e) {
      setFile(null)
      setFileError(`Could not read file: ${errorMessage(e)}`)
    }
  }

  const bytes = source === 'text' ? (text === '' ? null : utf8Encode(text)) : (file?.bytes ?? null)
  const optionError = validateMode(mode) ?? validateFilename(name)
  const output = bytes && !optionError ? uuencode(bytes, { filename: name, mode, eol: crlf ? '\r\n' : '\n' }) : ''

  return (
    <>
      <Toolbar>
        <Segmented
          label="Input"
          value={source}
          onChange={setSource}
          options={[
            { value: 'text', label: 'Text (UTF-8)' },
            { value: 'file', label: 'File' },
          ]}
        />
        <TextField label="File name" value={name} onChange={setName} width="14rem" />
        <TextField label="Mode" value={mode} onChange={setMode} width="6rem" mono hint="octal" />
        <Checkbox label="CRLF line endings" checked={crlf} onChange={setCrlf} />
      </Toolbar>
      {source === 'file' && (
        <>
          <FilePicker onFile={onFile} file={file?.file} />
          <ErrorMessage>{fileError}</ErrorMessage>
        </>
      )}
      <div className="panes">
        {source === 'text' && <TextPane label="Text (UTF-8)" value={text} onChange={setText} placeholder="Type or paste text…" />}
        <TextPane
          label="Uuencoded"
          value={output}
          noCopy
          actions={<CopyButton text={output} what="Uuencoded" />}
          footer={bytes ? `${formatSize(bytes.length)} → ${output.length.toLocaleString()} characters` : undefined}
        />
      </div>
      {optionError && <ErrorMessage>{optionError}</ErrorMessage>}
      {output !== '' && (
        <Toolbar>
          <button type="button" className="btn" onClick={() => downloadText(output, `${safeFilename(name)}.uu`)}>
            Download .uu
          </button>
        </Toolbar>
      )}
    </>
  )
}

function UuDecode() {
  const [input, setInput] = useState('')
  const [view, setView] = useState<'text' | 'download'>('text')
  const decoded = input.trim() === '' ? null : attempt(() => uudecode(input))
  const value = decoded?.ok ? decoded.value : null
  const isText = value !== null && isValidUtf8(value.bytes)
  const filename = value ? safeFilename(value.filename) : ''

  return (
    <>
      <TextPane
        label="Uuencoded input"
        value={input}
        onChange={setInput}
        placeholder={'begin 644 file.txt\n#0V%T\n`\nend'}
        invalid={decoded !== null && !decoded.ok}
        rows={8}
      />
      {decoded && !decoded.ok && <ErrorMessage>{decoded.error}</ErrorMessage>}
      {value && (
        <>
          <dl className="kv">
            <dt>File name</dt>
            <dd className="mono">{value.filename}</dd>
            <dt>Mode</dt>
            <dd className="mono">{value.mode}</dd>
            <dt>Size</dt>
            <dd>
              {formatSize(value.bytes.length)} ({value.bytes.length.toLocaleString()} bytes)
            </dd>
          </dl>
          {value.warnings.map((w) => (
            <Notice key={w} kind="warn">
              {w}
            </Notice>
          ))}
          <Toolbar>
            <Segmented
              label="Output"
              value={isText ? view : 'download'}
              onChange={setView}
              options={[
                { value: 'text', label: 'Text', title: isText ? undefined : 'The data is not UTF-8 text' },
                { value: 'download', label: 'Binary' },
              ]}
            />
            <button type="button" className="btn btn-primary" onClick={() => downloadBytes(value.bytes, filename)} disabled={value.bytes.length === 0}>
              Download {filename}
            </button>
          </Toolbar>
          {isText && view === 'text' ? (
            <TextPane label="Decoded text" value={utf8Decode(value.bytes)} rows={8} />
          ) : (
            <Notice>{isText ? 'Use Download to save the file.' : 'The decoded data is binary (not UTF-8 text). Use Download to save it.'}</Notice>
          )}
        </>
      )}
    </>
  )
}
