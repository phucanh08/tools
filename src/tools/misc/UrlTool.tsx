import { useState } from 'react'
import { Segmented, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { parseUrl, urlDecode, urlEncode, type ParsedUrl, type UrlMode } from '../../lib/misc'

const MODES: { value: UrlMode; label: string; title: string }[] = [
  { value: 'component', label: 'Component', title: 'encodeURIComponent: for a single query value or path segment' },
  { value: 'uri', label: 'Full URI', title: 'encodeURI: keeps :/?#&= intact' },
  { value: 'form', label: 'Form (+ for space)', title: 'application/x-www-form-urlencoded' },
]

export default function UrlTool() {
  return (
    <div className="tool">
      <EncodeSection />
      <h2 className="section-title">Parse URL</h2>
      <ParseSection />
    </div>
  )
}

function EncodeSection() {
  const [direction, setDirection] = useState<'encode' | 'decode'>('encode')
  const [mode, setMode] = useState<UrlMode>('component')
  const [input, setInput] = useState('')
  const result = attempt(() => (direction === 'encode' ? urlEncode(input, mode) : urlDecode(input, mode)))

  return (
    <>
      <Toolbar>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
        />
        <Segmented label="Mode" value={mode} onChange={setMode} options={MODES} />
      </Toolbar>
      <div className="panes">
        <TextPane label={direction === 'encode' ? 'Text' : 'Encoded'} value={input} onChange={setInput} rows={6} invalid={!result.ok} />
        <TextPane label={direction === 'encode' ? 'Encoded' : 'Decoded'} value={result.ok ? result.value : ''} rows={6} />
      </div>
      {!result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
    </>
  )
}

const PARTS: (keyof Omit<ParsedUrl, 'params'>)[] = [
  'href',
  'origin',
  'protocol',
  'username',
  'password',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
]

function ParseSection() {
  const [input, setInput] = useState('https://user@example.com:8080/path/to/page?q=hello%20world&lang=en&lang=vi#section')
  const parsed = input.trim() === '' ? null : attempt(() => parseUrl(input))

  return (
    <>
      <TextPane label="URL" value={input} onChange={setInput} rows={2} invalid={parsed !== null && !parsed.ok} />
      {parsed && !parsed.ok && <ErrorMessage>{parsed.error}</ErrorMessage>}
      {parsed?.ok && (
        <div className="panes">
          <div className="table-wrap">
            <table className="table">
              <caption>Parts</caption>
              <tbody>
                {PARTS.filter((k) => parsed.value[k] !== '').map((k) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td className="mono break">{parsed.value[k]}</td>
                    <td className="nowrap">
                      <CopyButton text={parsed.value[k]} what={k} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="table">
              <caption>Query parameters ({parsed.value.params.length})</caption>
              {parsed.value.params.length > 0 && (
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Value (decoded)</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {parsed.value.params.map(([k, v], i) => (
                  <tr key={i}>
                    <td className="mono break">{k}</td>
                    <td className="mono break">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
