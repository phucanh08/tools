import { useState } from 'react'
import { Checkbox, Segmented, TextField, Toolbar } from '../../components/controls'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { jsonToTypeScript } from '../../lib/json-to-ts'
import { parseJsonOrThrow } from '../../lib/json'

export default function JsonTypescript() {
  const [input, setInput] = useState('')
  const [rootName, setRootName] = useState('Root')
  const [style, setStyle] = useState<'interface' | 'type'>('interface')
  const [readonly, setReadonly] = useState(false)

  const result =
    input.trim() === ''
      ? { ok: true as const, value: '' }
      : attempt(() =>
          jsonToTypeScript(parseJsonOrThrow(input), {
            rootName: rootName.trim() || 'Root',
            useTypeAlias: style === 'type',
            readonly,
          }),
        )

  return (
    <div className="tool">
      <Toolbar>
        <TextField label="Root name" value={rootName} onChange={setRootName} width="12rem" mono />
        <Segmented
          label="Declare as"
          value={style}
          onChange={setStyle}
          options={[
            { value: 'interface', label: 'interface' },
            { value: 'type', label: 'type' },
          ]}
        />
        <Checkbox label="readonly properties" checked={readonly} onChange={setReadonly} />
      </Toolbar>
      <div className="panes">
        <TextPane label="JSON sample" value={input} onChange={setInput} placeholder='{"id": 1, "tags": ["a"]}' invalid={!result.ok} rows={20} wrap={false} />
        <TextPane label="TypeScript" value={result.ok ? result.value : ''} rows={20} wrap={false} />
      </div>
      {!result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      <p className="muted small">
        Keys missing in some array items become optional (<code>?</code>). Mixed values become unions.
      </p>
    </div>
  )
}
