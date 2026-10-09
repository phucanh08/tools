import beautify from 'js-beautify'
import { useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { minifyHtml } from '../../lib/html'

type Indent = 2 | 4 | 'tab'

export default function HtmlFormat() {
  const [mode, setMode] = useState<'beautify' | 'minify'>('beautify')
  const [indent, setIndent] = useState<Indent>(2)
  const [wrapAttrs, setWrapAttrs] = useState(false)
  const [input, setInput] = useState('')

  const result =
    input.trim() === ''
      ? { ok: true as const, value: '' }
      : attempt(() =>
          mode === 'minify'
            ? minifyHtml(input)
            : beautify.html(input, {
                indent_size: indent === 'tab' ? 1 : indent,
                indent_char: indent === 'tab' ? '\t' : ' ',
                indent_with_tabs: indent === 'tab',
                wrap_line_length: 0,
                wrap_attributes: wrapAttrs ? 'force-expand-multiline' : 'auto',
                indent_inner_html: true,
                end_with_newline: true,
              }),
        )
  const output = result.ok ? result.value : ''

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'beautify', label: 'Beautify' },
            { value: 'minify', label: 'Minify' },
          ]}
        />
        {mode === 'beautify' && (
          <>
            <Segmented
              label="Indent"
              value={indent}
              onChange={setIndent}
              options={[
                { value: 2, label: '2 spaces' },
                { value: 4, label: '4 spaces' },
                { value: 'tab', label: 'Tab' },
              ]}
            />
            <Checkbox label="One attribute per line" checked={wrapAttrs} onChange={setWrapAttrs} />
          </>
        )}
      </Toolbar>
      <div className="panes">
        <TextPane label="HTML" value={input} onChange={setInput} placeholder="<div><p>Paste HTML…</p></div>" rows={20} wrap={false} />
        <TextPane
          label={mode === 'beautify' ? 'Beautified' : 'Minified'}
          value={output}
          rows={20}
          wrap={mode === 'minify'}
          footer={input && output ? `${input.length.toLocaleString()} → ${output.length.toLocaleString()} characters` : undefined}
        />
      </div>
      {!result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      {mode === 'minify' && (
        <p className="muted small">
          Conservative minifier: removes comments and collapses whitespace; &lt;pre&gt;, &lt;textarea&gt;, &lt;script&gt; and
          &lt;style&gt; are kept verbatim.
        </p>
      )}
    </div>
  )
}
