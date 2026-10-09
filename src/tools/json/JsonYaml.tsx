import { useState } from 'react'
import { Segmented, Toolbar } from '../../components/controls'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { jsonToYaml, yamlToJson } from '../../lib/convert'
import { formatJson, parseJsonOrThrow } from '../../lib/json'

type Direction = 'json2yaml' | 'yaml2json'

export default function JsonYaml() {
  const [direction, setDirection] = useState<Direction>('json2yaml')
  const [input, setInput] = useState('')
  const [indent, setIndent] = useState<2 | 4>(2)

  const result =
    input.trim() === ''
      ? { ok: true as const, value: '' }
      : attempt(() =>
          direction === 'json2yaml'
            ? jsonToYaml(parseJsonOrThrow(input), indent)
            : formatJson(yamlToJson(input), indent),
        )
  const output = result.ok ? result.value : ''
  const from = direction === 'json2yaml' ? 'JSON' : 'YAML'
  const to = direction === 'json2yaml' ? 'YAML' : 'JSON'

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'json2yaml', label: 'JSON → YAML' },
            { value: 'yaml2json', label: 'YAML → JSON' },
          ]}
        />
        <Segmented
          label="Indent"
          value={indent}
          onChange={setIndent}
          options={[
            { value: 2, label: '2' },
            { value: 4, label: '4' },
          ]}
        />
        <button
          type="button"
          className="btn"
          disabled={!result.ok || output === ''}
          onClick={() => {
            setInput(output)
            setDirection(direction === 'json2yaml' ? 'yaml2json' : 'json2yaml')
          }}
        >
          ⇄ Swap
        </button>
      </Toolbar>
      <div className="panes">
        <TextPane label={from} value={input} onChange={setInput} placeholder={`Paste ${from}…`} invalid={!result.ok} rows={20} wrap={false} />
        <TextPane label={to} value={output} rows={20} wrap={false} />
      </div>
      {!result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      {direction === 'yaml2json' && (
        <p className="muted small">YAML 1.2 core schema. Multiple documents (separated by ---) become a JSON array.</p>
      )}
    </div>
  )
}
