import { useRef, useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { formatJson, minifyJson, parseJson, sortKeysDeep, type Indent } from '../../lib/json'

const SAMPLE = '{"name":"Dev Tools","version":1,"tags":["json","format"],"nested":{"ok":true,"value":null}}'

export default function JsonFormat() {
  const [input, setInput] = useState('')
  const [indent, setIndent] = useState<Indent>(2)
  const [sortKeys, setSortKeys] = useState(false)
  const [mode, setMode] = useState<'format' | 'minify'>('format')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const empty = input.trim() === ''
  const parsed = empty ? null : parseJson(input)
  const output = parsed?.ok
    ? mode === 'format'
      ? formatJson(parsed.value, indent, sortKeys)
      : minifyJson(sortKeys ? sortKeysDeep(parsed.value) : parsed.value)
    : ''

  const jumpToError = () => {
    const ta = inputRef.current
    if (!ta || !parsed || parsed.ok) return
    const { offset, line } = parsed.error
    ta.focus()
    ta.setSelectionRange(offset, Math.min(offset + 1, input.length))
    // Scroll the error line into view (approximate: uses the computed line height).
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20
    ta.scrollTop = Math.max(0, (line - 1) * lineHeight - ta.clientHeight / 2)
  }

  return (
    <div className="tool">
      <Toolbar>
        <button type="button" className={`btn${mode === 'format' ? ' btn-primary' : ''}`} onClick={() => setMode('format')}>
          Format
        </button>
        <button type="button" className={`btn${mode === 'minify' ? ' btn-primary' : ''}`} onClick={() => setMode('minify')}>
          Minify
        </button>
        <Segmented
          label="Indent"
          value={indent}
          onChange={(v) => {
            setIndent(v)
            setMode('format')
          }}
          options={[
            { value: 2, label: '2 spaces' },
            { value: 4, label: '4 spaces' },
            { value: '\t', label: 'Tab' },
          ]}
        />
        <Checkbox label="Sort keys" checked={sortKeys} onChange={setSortKeys} />
        <button
          type="button"
          className="btn"
          onClick={() => setInput(output)}
          disabled={!output}
          title="Replace the input with the output"
        >
          ⇐ Use output as input
        </button>
        {empty && (
          <button type="button" className="btn" onClick={() => setInput(SAMPLE)}>
            Load sample
          </button>
        )}
      </Toolbar>
      <div className="status-line" aria-live="polite">
        {parsed === null ? (
          <span className="muted">Paste JSON to validate.</span>
        ) : parsed.ok ? (
          <Notice kind="ok">✓ Valid JSON</Notice>
        ) : (
          <ErrorMessage>
            {parsed.error.message} — line {parsed.error.line}, column {parsed.error.column}{' '}
            <button type="button" className="btn btn-small" onClick={jumpToError}>
              Go to error
            </button>
          </ErrorMessage>
        )}
      </div>
      <div className="panes">
        <TextPane
          ref={inputRef}
          label="Input JSON"
          value={input}
          onChange={setInput}
          placeholder="Paste JSON here…"
          invalid={parsed !== null && !parsed.ok}
          rows={20}
          wrap={false}
        />
        <TextPane
          label={mode === 'format' ? 'Formatted' : 'Minified'}
          value={output}
          rows={20}
          wrap={mode === 'minify'}
          footer={output ? `${output.length.toLocaleString()} characters` : undefined}
        />
      </div>
    </div>
  )
}
