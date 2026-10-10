import { useState } from 'react'
import { Checkbox, Segmented, Select, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { CHARSETS, charsetInfo, decodeBytes, detectCharset, encodeText, type CharsetId, type Unmappable } from '../../lib/charset'
import { base64ToBytes, bytesToBase64 } from '../../lib/encoding'

type Mode = 'encode' | 'decode'
type OnUnmappable = 'replace' | 'error'

const CHARSET_OPTIONS = CHARSETS.map((c) => ({ value: c.id, label: c.label }))

function describeUnmappable(list: Unmappable[]): string {
  const shown = list.slice(0, 8).map((u) => `"${u.char}" (U+${u.codePoint.toString(16).toUpperCase().padStart(4, '0')}${u.count > 1 ? ` ×${u.count}` : ''})`)
  return shown.join(', ') + (list.length > 8 ? ` and ${list.length - 8} more` : '')
}

export default function Base64Charset() {
  const [mode, setMode] = useState<Mode>('encode')
  const [input, setInput] = useState('')
  const [charset, setCharset] = useState<CharsetId>('utf-8')
  const [decodeAs, setDecodeAs] = useState<CharsetId | 'auto'>('auto')
  const [onUnmappable, setOnUnmappable] = useState<OnUnmappable>('replace')
  const [bom, setBom] = useState(false)
  const [urlSafe, setUrlSafe] = useState(false)

  const encoded = mode === 'encode' && input !== '' ? encodeText(input, charset, { bom }) : null
  const blocked = encoded !== null && encoded.unmappable.length > 0 && onUnmappable === 'error'

  const decoded =
    mode === 'decode' && input.trim() !== ''
      ? attempt(() => {
          const bytes = base64ToBytes(input)
          const detection = decodeAs === 'auto' ? detectCharset(bytes) : null
          const used = detection?.charset ?? (decodeAs as CharsetId)
          return { bytes, detection, used, ...decodeBytes(bytes, used) }
        })
      : null
  const dec = decoded?.ok ? decoded.value : null

  const output = encoded ? (blocked ? '' : bytesToBase64(encoded.bytes, { urlSafe })) : (dec?.text ?? '')
  const shownCharset = mode === 'encode' ? charset : dec?.used
  const latin1Note = shownCharset === 'iso-8859-1'

  const swap = () => {
    setInput(output)
    if (mode === 'encode') {
      setDecodeAs(charset)
      setMode('decode')
    } else {
      if (dec) setCharset(dec.used)
      setMode('encode')
    }
  }

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: 'Text → Base64' },
            { value: 'decode', label: 'Base64 → Text' },
          ]}
        />
        {mode === 'encode' ? (
          <Select label="Charset" value={charset} onChange={setCharset} options={CHARSET_OPTIONS} />
        ) : (
          <Select
            label="Decode as"
            value={decodeAs}
            onChange={setDecodeAs}
            options={[{ value: 'auto' as const, label: 'Auto-detect' }, ...CHARSET_OPTIONS]}
          />
        )}
        {mode === 'encode' && (
          <>
            <Segmented
              label="Unmappable characters"
              value={onUnmappable}
              onChange={setOnUnmappable}
              options={[
                { value: 'replace', label: 'Replace with ?' },
                { value: 'error', label: 'Stop with error' },
              ]}
            />
            {charsetInfo(charset).kind === 'unicode' && <Checkbox label="Add BOM" checked={bom} onChange={setBom} />}
            <Checkbox label="URL-safe" checked={urlSafe} onChange={setUrlSafe} />
          </>
        )}
        <button type="button" className="btn" onClick={swap} disabled={output === ''}>
          ⇅ Use output as input
        </button>
      </Toolbar>
      <div className="panes">
        <TextPane
          label={mode === 'encode' ? 'Text' : 'Base64'}
          value={input}
          onChange={setInput}
          placeholder={mode === 'encode' ? 'Type or paste text…' : 'Paste Base64…'}
          invalid={blocked || (decoded !== null && !decoded.ok)}
          footer={mode === 'encode' ? `${encoded?.bytes.length ?? 0} bytes in ${charsetInfo(charset).label}` : `${input.length} characters`}
        />
        <TextPane
          label={mode === 'encode' ? 'Base64' : 'Decoded text'}
          value={output}
          footer={mode === 'encode' ? `${output.length} characters` : dec ? `${dec.bytes.length} bytes → ${[...dec.text].length} characters` : undefined}
        />
      </div>
      {encoded && encoded.unmappable.length > 0 &&
        (blocked ? (
          <ErrorMessage title={`Not representable in ${charsetInfo(charset).label}`}>{describeUnmappable(encoded.unmappable)}</ErrorMessage>
        ) : (
          <Notice kind="warn">
            {encoded.unmappable.reduce((n, u) => n + u.count, 0)} character(s) do not exist in {charsetInfo(charset).label} and were
            replaced with “?”: {describeUnmappable(encoded.unmappable)}
          </Notice>
        ))}
      {encoded && encoded.decomposed > 0 && (
        <Notice>
          {encoded.decomposed} character(s) were written as a base letter plus a combining mark, which is how{' '}
          {charsetInfo(charset).label} stores them (e.g. “ế” = “ê” + acute).
        </Notice>
      )}
      {decoded && !decoded.ok && <ErrorMessage>{decoded.error}</ErrorMessage>}
      {dec && (
        <Notice kind={dec.detection?.confidence === 'low' ? 'warn' : 'info'}>
          {dec.detection ? (
            <>
              Detected <strong>{charsetInfo(dec.used).label}</strong>: {dec.detection.reason}. Choose another charset in “Decode as” if the
              text looks wrong.
            </>
          ) : (
            <>
              Decoded as <strong>{charsetInfo(dec.used).label}</strong>.
            </>
          )}
          {dec.bomRemoved && ' The byte order mark was removed.'}
        </Notice>
      )}
      {dec && dec.invalid > 0 && (
        <Notice kind="warn">
          {dec.invalid} invalid byte sequence(s) for {charsetInfo(dec.used).label} were replaced with “�”.
        </Notice>
      )}
      {latin1Note && (
        <p className="muted small">
          ISO-8859-1 here is real Latin-1 (every byte is the code point of the same value). Browsers treat the label “iso-8859-1” as
          Windows-1252, which differs only in 0x80–0x9F; pick Windows-1252 for that behavior.
        </p>
      )}
    </div>
  )
}
