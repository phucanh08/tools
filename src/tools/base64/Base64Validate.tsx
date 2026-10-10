import { useRef, useState } from 'react'
import { Checkbox, Segmented, Select, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { ErrorMessage, Notice, Verdict } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, useDebounced } from '../../hooks'
import { analyzeBase64, looksFormDecoded, repairBase64, type Change } from '../../lib/b64validate'
import { formatSize } from '../../lib/encoding'
import { sniffMedia } from '../../lib/media-sniff'

const VARIANT_LABEL = {
  standard: 'Standard (RFC 4648 §4)',
  'url-safe': 'URL-safe (RFC 4648 §5)',
  mime: 'MIME, line-wrapped (RFC 2045)',
  'data-url': 'Data URL (RFC 2397)',
} as const

const ALPHABET_LABEL = {
  standard: 'Standard (+ /)',
  'url-safe': 'URL-safe (- _)',
  mixed: 'Mixed (+ / and - _)',
  neutral: 'Either (no + / - _ characters)',
} as const

const KIND_LABEL: Record<Change['kind'], string> = { format: 'Format', repair: 'Repair', lossy: 'Data loss' }

/** Outputs longer than this are not rendered into a textarea. */
const MAX_DISPLAY_CHARS = 2_000_000

type AlphabetChoice = 'auto' | 'standard' | 'url-safe'

export default function Base64Validate() {
  const [input, setInput] = useState('')
  const [alphabet, setAlphabet] = useState<AlphabetChoice>('auto')
  const [padding, setPadding] = useState(true)
  const [lineWidth, setLineWidth] = useState(0)
  const [spacesArePlus, setSpacesArePlus] = useState(false)
  const [keepDataUrl, setKeepDataUrl] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  // Large pastes: analyse after typing pauses.
  const debounced = useDebounced(input, input.length > 200_000 ? 250 : 0)
  const text = input.length > 200_000 ? debounced : input

  const empty = text.trim() === ''
  const analysis = empty ? null : analyzeBase64(text)
  const target = alphabet === 'auto' ? (analysis?.alphabet === 'url-safe' ? 'url-safe' : 'standard') : alphabet
  const repaired = empty
    ? null
    : attempt(() => repairBase64(text, { alphabet: target, padding, lineWidth, spacesArePlus, keepDataUrl }))
  const fixed = repaired?.ok ? repaired.value : null
  const kind = fixed ? sniffMedia(fixed.bytes.subarray(0, 4096)) : null
  const error = analysis?.error

  const selectError = () => {
    const el = textarea.current
    if (!el || error?.offset === undefined) return
    el.focus()
    const cp = input.codePointAt(error.offset) ?? 0
    el.setSelectionRange(error.offset, error.offset + (cp > 0xffff ? 2 : 1))
  }

  return (
    <div className="tool">
      <TextPane
        ref={textarea}
        label="Base64 input"
        value={input}
        onChange={setInput}
        placeholder="Paste Base64, URL-safe Base64, a MIME block or a data: URL…"
        invalid={analysis !== null && !analysis.valid}
        rows={8}
        footer={`${input.length.toLocaleString()} characters`}
      />
      {analysis && (
        <>
          <Verdict valid={analysis.valid} validText="Valid Base64" invalidText="Not valid Base64" />
          {error && (
            <ErrorMessage>
              {error.message}
              {error.position !== undefined && (
                <>
                  {' '}
                  First problem at position {error.position.toLocaleString()} (line {error.line}, column {error.column})
                  {error.char ? <>: <span className="mono">{error.char}</span></> : null}.{' '}
                  <button type="button" className="btn btn-small" onClick={selectError}>
                    Select it
                  </button>
                </>
              )}
            </ErrorMessage>
          )}
          {analysis.warnings.map((w) => (
            <Notice key={w.message} kind="warn">
              {w.message}
            </Notice>
          ))}
          <dl className="kv">
            <dt>Variant</dt>
            <dd>{VARIANT_LABEL[analysis.variant]}</dd>
            <dt>Alphabet</dt>
            <dd>{ALPHABET_LABEL[analysis.alphabet]}</dd>
            {analysis.dataUrl && (
              <>
                <dt>Data URL type</dt>
                <dd className="mono">{analysis.dataUrl.mime}</dd>
              </>
            )}
            {analysis.wrapped && (
              <>
                <dt>Line length</dt>
                <dd>{analysis.lineLength} characters</dd>
              </>
            )}
            <dt>Padding</dt>
            <dd>{analysis.padded ? 'Present' : 'None'}</dd>
            <dt>Base64 characters</dt>
            <dd>{analysis.dataChars.toLocaleString()}</dd>
            {analysis.invalidChars > 0 && (
              <>
                <dt>Invalid characters</dt>
                <dd>{analysis.invalidChars.toLocaleString()}</dd>
              </>
            )}
            {analysis.decodedBytes !== null && (
              <>
                <dt>Decoded size</dt>
                <dd>
                  {formatSize(analysis.decodedBytes)} ({analysis.decodedBytes.toLocaleString()} bytes)
                </dd>
              </>
            )}
          </dl>
          {looksFormDecoded(text) && !spacesArePlus && (
            <Notice>
              The input has spaces but no "+". If it came from a URL query or form, the "+" characters may have become spaces:
              turn on <strong>Spaces were "+"</strong> below.
            </Notice>
          )}
        </>
      )}

      <section aria-labelledby="b64v-output">
        <h2 id="b64v-output" className="section-title">
          Normalize &amp; repair
        </h2>
        <Toolbar>
          <Segmented
            label="Output alphabet"
            value={alphabet}
            onChange={setAlphabet}
            options={[
              { value: 'auto', label: 'Same as input' },
              { value: 'standard', label: 'Standard' },
              { value: 'url-safe', label: 'URL-safe' },
            ]}
          />
          <Select
            label="Line length"
            value={lineWidth}
            onChange={setLineWidth}
            options={[
              { value: 0, label: 'Single line' },
              { value: 64, label: '64 (PEM)' },
              { value: 76, label: '76 (MIME)' },
            ]}
          />
          <Checkbox label='Padding (=)' checked={padding} onChange={setPadding} />
          <Checkbox label='Spaces were "+"' checked={spacesArePlus} onChange={setSpacesArePlus} />
          <Checkbox
            label="Keep data: prefix"
            checked={keepDataUrl}
            onChange={setKeepDataUrl}
            disabled={!fixed?.dataUrlMime}
            title="Output a data URL again when the input was one"
          />
        </Toolbar>
        {repaired && !repaired.ok && <ErrorMessage title="Cannot repair">{repaired.error}</ErrorMessage>}
        {fixed && (
          <>
            {fixed.changes.length === 0 ? (
              <Notice kind="ok">No changes needed: the input is already in this form.</Notice>
            ) : (
              <ul className="b64-changes" aria-label="Changes made">
                {fixed.changes.map((c, i) => (
                  <li key={i}>
                    <span className={`badge b64-change-${c.kind}`}>{KIND_LABEL[c.kind]}</span> {c.message}
                  </li>
                ))}
              </ul>
            )}
            {fixed.output.length > MAX_DISPLAY_CHARS ? (
              <Notice kind="warn">The output is too large to display ({formatSize(fixed.output.length)}). <CopyButton text={fixed.output} label="Copy output" /></Notice>
            ) : (
              <TextPane
                label="Output Base64"
                value={fixed.output}
                rows={8}
                footer={`${fixed.output.length.toLocaleString()} characters · decodes to ${fixed.bytes.length.toLocaleString()} bytes${
                  kind ? ` · looks like ${kind.label}` : ''
                }`}
              />
            )}
          </>
        )}
        {empty && <p className="muted small">Paste Base64 above to check it and get a cleaned-up copy here.</p>}
      </section>
    </div>
  )
}
