import { useState } from 'react'
import { NumberField, Segmented, TextField, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice, Spinner } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { errorMessage } from '../../hooks'
import { bytesToBase64, bytesToHex, isValidUtf8, parseBytes, utf8Decode, utf8Encode } from '../../lib/encoding'
import {
  decryptWithKey,
  decryptWithPassword,
  DEFAULT_PBKDF2_ITERATIONS,
  encryptWithKey,
  encryptWithPassword,
} from '../../lib/crypto/aes'
import { randomBytes } from '../../lib/crypto/random'

type Direction = 'encrypt' | 'decrypt'

function decodePlaintext(bytes: Uint8Array): { text: string; note: string } {
  if (isValidUtf8(bytes)) return { text: utf8Decode(bytes), note: '' }
  return { text: bytesToHex(bytes), note: 'Decrypted data is not UTF-8 text; shown as hex.' }
}

export default function Aes() {
  const [tab, setTab] = useState<'password' | 'raw'>('password')
  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Mode"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'password', label: 'Password (PBKDF2)' },
            { value: 'raw', label: 'Raw key' },
          ]}
        />
      </Toolbar>
      {tab === 'password' ? <PasswordMode /> : <RawKeyMode />}
    </div>
  )
}

function useRunner() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')
  const [note, setNote] = useState('')
  const run = async (fn: () => Promise<{ text: string; note?: string }>) => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      const r = await fn()
      setOutput(r.text)
      setNote(r.note ?? '')
    } catch (e) {
      setOutput('')
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, output, note, run }
}

function DirectionToggle({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  return (
    <Segmented
      label="Direction"
      value={value}
      onChange={onChange}
      options={[
        { value: 'encrypt', label: 'Encrypt' },
        { value: 'decrypt', label: 'Decrypt' },
      ]}
    />
  )
}

function PasswordMode() {
  const [direction, setDirection] = useState<Direction>('encrypt')
  const [password, setPassword] = useState('')
  const [iterations, setIterations] = useState(DEFAULT_PBKDF2_ITERATIONS)
  const [input, setInput] = useState('')
  const { busy, error, output, note, run } = useRunner()

  const go = () =>
    run(async () =>
      direction === 'encrypt'
        ? { text: await encryptWithPassword(utf8Encode(input), password, iterations) }
        : decodePlaintext(await decryptWithPassword(input, password)),
    )

  return (
    <>
      <Toolbar>
        <DirectionToggle value={direction} onChange={setDirection} />
        <TextField label="Password" type="password" value={password} onChange={setPassword} width="16rem" autoComplete="new-password" />
        {direction === 'encrypt' && (
          <NumberField label="PBKDF2 iterations" value={iterations} onChange={setIterations} min={1000} max={10_000_000} step={1000} width="11rem" />
        )}
        <button type="button" className="btn btn-primary" onClick={go} disabled={busy || password === '' || input === ''}>
          {direction === 'encrypt' ? 'Encrypt' : 'Decrypt'}
        </button>
        {busy && <Spinner label="Deriving key…" />}
      </Toolbar>
      <div className="panes">
        <TextPane
          label={direction === 'encrypt' ? 'Plaintext' : 'Encrypted string'}
          value={input}
          onChange={setInput}
          mono={direction === 'decrypt'}
          placeholder={direction === 'encrypt' ? 'Text to encrypt…' : 'v1.aes-256-gcm.pbkdf2-sha256.…'}
        />
        <TextPane label={direction === 'encrypt' ? 'Encrypted string' : 'Plaintext'} value={output} />
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {note && <Notice kind="warn">{note}</Notice>}
      <details className="explain">
        <summary>Output format</summary>
        <p>
          <code>v1.aes-256-gcm.pbkdf2-sha256.&lt;iterations&gt;.&lt;salt&gt;.&lt;iv&gt;.&lt;ciphertext+tag&gt;</code>
        </p>
        <p>
          The key is derived with PBKDF2-HMAC-SHA256 from your password and a random 16-byte salt. Encryption is AES-256-GCM
          with a random 12-byte IV and a 128-bit authentication tag. Binary parts are Base64url. Everything needed to decrypt
          (except the password) is in the string.
        </p>
      </details>
    </>
  )
}

function RawKeyMode() {
  const [direction, setDirection] = useState<Direction>('encrypt')
  const [key, setKey] = useState('')
  const [keyFormat, setKeyFormat] = useState<'hex' | 'base64'>('hex')
  const [input, setInput] = useState('')
  const { busy, error, output, note, run } = useRunner()

  const generate = () => {
    const k = randomBytes(32)
    setKey(keyFormat === 'hex' ? bytesToHex(k) : bytesToBase64(k))
  }

  const go = () =>
    run(async () => {
      const keyBytes = parseBytes(key, keyFormat)
      return direction === 'encrypt'
        ? { text: await encryptWithKey(utf8Encode(input), keyBytes) }
        : decodePlaintext(await decryptWithKey(input, keyBytes))
    })

  return (
    <>
      <Toolbar>
        <DirectionToggle value={direction} onChange={setDirection} />
        <Segmented
          label="Key format"
          value={keyFormat}
          onChange={setKeyFormat}
          options={[
            { value: 'hex', label: 'Hex' },
            { value: 'base64', label: 'Base64' },
          ]}
        />
        <button type="button" className="btn" onClick={generate}>
          Generate 256-bit key
        </button>
      </Toolbar>
      <TextField label="AES key (128, 192 or 256 bits)" value={key} onChange={setKey} mono placeholder={keyFormat === 'hex' ? '64 hex digits for AES-256' : 'Base64 key'} />
      <Toolbar>
        <button type="button" className="btn btn-primary" onClick={go} disabled={busy || key === '' || input === ''}>
          {direction === 'encrypt' ? 'Encrypt' : 'Decrypt'}
        </button>
        {busy && <Spinner />}
      </Toolbar>
      <div className="panes">
        <TextPane
          label={direction === 'encrypt' ? 'Plaintext' : 'Base64 (IV ‖ ciphertext ‖ tag)'}
          value={input}
          onChange={setInput}
          mono={direction === 'decrypt'}
        />
        <TextPane label={direction === 'encrypt' ? 'Base64 (IV ‖ ciphertext ‖ tag)' : 'Plaintext'} value={output} />
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {note && <Notice kind="warn">{note}</Notice>}
      <p className="muted small">AES-GCM with a random 12-byte IV prepended to the ciphertext and 128-bit tag, Base64-encoded.</p>
    </>
  )
}
