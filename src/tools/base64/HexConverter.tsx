import { useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { bytesToBase64, bytesToHex, isValidUtf8, parseBytes, utf8Decode, type ByteFormat } from '../../lib/encoding'

type Separator = '' | ' ' | ':'

export default function HexConverter() {
  const [source, setSource] = useState<ByteFormat>('text')
  const [value, setValue] = useState('')
  const [separator, setSeparator] = useState<Separator>('')
  const [upper, setUpper] = useState(false)
  const [urlSafe, setUrlSafe] = useState(false)

  const parsed = attempt(() => parseBytes(value, source))
  const bytes = parsed.ok ? parsed.value : null

  const render = (format: ByteFormat): string => {
    if (format === source) return value
    if (!bytes) return ''
    switch (format) {
      case 'text':
        return isValidUtf8(bytes) ? utf8Decode(bytes) : ''
      case 'hex': {
        const h = bytesToHex(bytes, separator)
        return upper ? h.toUpperCase() : h
      }
      case 'base64':
        return bytesToBase64(bytes, { urlSafe })
    }
  }

  const edit = (format: ByteFormat) => (v: string) => {
    setSource(format)
    setValue(v)
  }

  const textInvalid = bytes !== null && source !== 'text' && !isValidUtf8(bytes)

  return (
    <div className="tool">
      <p className="muted small">Edit any field; the others update from the same bytes.</p>
      <Toolbar>
        <Segmented
          label="Hex separator"
          value={separator}
          onChange={setSeparator}
          options={[
            { value: '', label: 'None' },
            { value: ' ', label: 'Space' },
            { value: ':', label: 'Colon' },
          ]}
        />
        <Checkbox label="Uppercase hex" checked={upper} onChange={setUpper} />
        <Checkbox label="URL-safe Base64" checked={urlSafe} onChange={setUrlSafe} />
      </Toolbar>
      <div className="panes panes-3">
        <TextPane
          label="Text (UTF-8)"
          value={render('text')}
          onChange={edit('text')}
          rows={10}
          invalid={source === 'text' && !parsed.ok}
          footer={textInvalid ? 'Bytes are not valid UTF-8 text.' : undefined}
        />
        <TextPane
          label="Hex"
          value={render('hex')}
          onChange={edit('hex')}
          rows={10}
          invalid={source === 'hex' && !parsed.ok}
        />
        <TextPane
          label="Base64"
          value={render('base64')}
          onChange={edit('base64')}
          rows={10}
          invalid={source === 'base64' && !parsed.ok}
        />
      </div>
      {!parsed.ok && <ErrorMessage>{parsed.error}</ErrorMessage>}
      {bytes && <Notice>{bytes.length.toLocaleString()} bytes</Notice>}
    </div>
  )
}
