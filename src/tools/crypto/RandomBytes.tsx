import { useState } from 'react'
import { NumberField, Segmented, Toolbar } from '../../components/controls'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { formatBytes } from '../../lib/encoding'
import { randomBytes } from '../../lib/crypto/random'

type Format = 'hex' | 'base64' | 'base64url'
const MAX = 4096

export default function RandomBytes() {
  const [length, setLength] = useState(32)
  const [format, setFormat] = useState<Format>('hex')
  const [bytes, setBytes] = useState(() => randomBytes(32))

  const valid = Number.isInteger(length) && length >= 1 && length <= MAX
  const regenerate = (n = length) => {
    if (Number.isInteger(n) && n >= 1 && n <= MAX) setBytes(randomBytes(n))
  }
  const setLen = (n: number) => {
    setLength(n)
    regenerate(n)
  }
  const preset = [16, 32, 64].includes(length) ? length : 0

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Length"
          value={preset}
          onChange={(v) => v && setLen(v)}
          options={[
            { value: 16, label: '16 bytes (128 bit)' },
            { value: 32, label: '32 bytes (256 bit)' },
            { value: 64, label: '64 bytes (512 bit)' },
          ]}
        />
        <NumberField label="Custom bytes" value={length} onChange={setLen} min={1} max={MAX} />
        <Segmented
          label="Output"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'hex', label: 'Hex' },
            { value: 'base64', label: 'Base64' },
            { value: 'base64url', label: 'Base64url' },
          ]}
        />
        <button type="button" className="btn btn-primary" onClick={() => regenerate()} disabled={!valid}>
          ↻ Regenerate
        </button>
      </Toolbar>
      {!valid && <ErrorMessage>Length must be a whole number between 1 and {MAX}.</ErrorMessage>}
      <TextPane label={`${bytes.length} random bytes`} value={formatBytes(bytes, format)} rows={4} />
      <p className="muted small">Generated with crypto.getRandomValues (CSPRNG).</p>
    </div>
  )
}
