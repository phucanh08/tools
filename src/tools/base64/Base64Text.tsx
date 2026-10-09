import { useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { base64ToText, textToBase64, utf8Encode } from '../../lib/encoding'

type Mode = 'encode' | 'decode'

export default function Base64Text() {
  const [mode, setMode] = useState<Mode>('encode')
  const [input, setInput] = useState('')
  const [urlSafe, setUrlSafe] = useState(false)
  const [padding, setPadding] = useState(true)

  const result =
    input === ''
      ? { ok: true as const, value: '' }
      : attempt(() => (mode === 'encode' ? textToBase64(input, { urlSafe, padding }) : base64ToText(input)))
  const output = result.ok ? result.value : ''

  const swap = () => {
    if (!result.ok) return
    setInput(output)
    setMode(mode === 'encode' ? 'decode' : 'encode')
  }

  return (
    <div className="tool">
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
        {mode === 'encode' ? (
          <>
            <Checkbox label="URL-safe (base64url)" checked={urlSafe} onChange={setUrlSafe} />
            <Checkbox label="Padding (=)" checked={padding} onChange={setPadding} />
          </>
        ) : (
          <span className="muted small">Accepts standard and URL-safe alphabets, with or without padding.</span>
        )}
        <button type="button" className="btn" onClick={swap} disabled={!result.ok || output === ''}>
          ⇅ Use output as input
        </button>
      </Toolbar>
      <div className="panes">
        <TextPane
          label={mode === 'encode' ? 'Text (UTF-8)' : 'Base64'}
          value={input}
          onChange={setInput}
          placeholder={mode === 'encode' ? 'Type or paste text…' : 'Paste Base64…'}
          invalid={!result.ok}
          footer={mode === 'encode' ? `${utf8Encode(input).length} bytes` : `${input.length} characters`}
        />
        <TextPane
          label={mode === 'encode' ? 'Base64' : 'Text (UTF-8)'}
          value={output}
          footer={`${output.length} characters`}
        />
      </div>
      {!result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
    </div>
  )
}
