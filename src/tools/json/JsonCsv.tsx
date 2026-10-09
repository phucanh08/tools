import { useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { downloadText } from '../../components/download'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { csvToJson, jsonToCsv } from '../../lib/convert'
import { formatJson, parseJsonOrThrow } from '../../lib/json'

type Direction = 'json2csv' | 'csv2json'
type Delimiter = ',' | ';' | '\t' | '|'

const DELIMITERS: { value: Delimiter; label: string }[] = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe' },
]

export default function JsonCsv() {
  const [direction, setDirection] = useState<Direction>('json2csv')
  const [input, setInput] = useState('')
  const [delimiter, setDelimiter] = useState<Delimiter>(',')
  const [autoDetect, setAutoDetect] = useState(true)
  const [flatten, setFlatten] = useState(true)
  const [inferTypes, setInferTypes] = useState(true)
  const [unflatten, setUnflatten] = useState(false)

  const result =
    input.trim() === ''
      ? { ok: true as const, value: '' }
      : attempt(() =>
          direction === 'json2csv'
            ? jsonToCsv(parseJsonOrThrow(input), { delimiter, flatten })
            : formatJson(csvToJson(input, { delimiter: autoDetect ? '' : delimiter, inferTypes, unflatten }), 2),
        )
  const output = result.ok ? result.value : ''
  const from = direction === 'json2csv' ? 'JSON' : 'CSV'
  const to = direction === 'json2csv' ? 'CSV' : 'JSON'

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'json2csv', label: 'JSON → CSV' },
            { value: 'csv2json', label: 'CSV → JSON' },
          ]}
        />
        {direction === 'csv2json' && <Checkbox label="Auto-detect delimiter" checked={autoDetect} onChange={setAutoDetect} />}
        {(direction === 'json2csv' || !autoDetect) && (
          <Segmented label="Delimiter" value={delimiter} onChange={setDelimiter} options={DELIMITERS} />
        )}
        {direction === 'json2csv' ? (
          <Checkbox label="Flatten nested objects (a.b.c)" checked={flatten} onChange={setFlatten} />
        ) : (
          <>
            <Checkbox label="Infer numbers / booleans / null" checked={inferTypes} onChange={setInferTypes} />
            <Checkbox label="Unflatten dotted headers" checked={unflatten} onChange={setUnflatten} />
          </>
        )}
      </Toolbar>
      <div className="panes">
        <TextPane
          label={from}
          value={input}
          onChange={setInput}
          placeholder={direction === 'json2csv' ? '[{"id":1,"name":"Ada"}, …]' : 'id,name\n1,Ada'}
          invalid={!result.ok}
          rows={20}
          wrap={false}
        />
        <TextPane
          label={to}
          value={output}
          rows={20}
          wrap={false}
          actions={
            <button
              type="button"
              className="btn btn-small"
              disabled={!output}
              onClick={() =>
                direction === 'json2csv'
                  ? downloadText(output, 'data.csv', 'text/csv;charset=utf-8')
                  : downloadText(output, 'data.json', 'application/json')
              }
            >
              Download
            </button>
          }
        />
      </div>
      {!result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
    </div>
  )
}
