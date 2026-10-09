import { useState } from 'react'
import { Segmented, Select, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice, Spinner } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, errorMessage } from '../../hooks'
import { base64ToBytes, bytesToBase64, bytesToHex, isValidUtf8, utf8Decode, utf8Encode } from '../../lib/encoding'
import { rsaDecrypt, rsaEncrypt, type OaepHash } from '../../lib/crypto/keys'
import { inspectPemKey } from '../../lib/crypto/pem'

const HASHES: OaepHash[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

export default function Rsa() {
  const [direction, setDirection] = useState<'encrypt' | 'decrypt'>('encrypt')
  const [pem, setPem] = useState('')
  const [hash, setHash] = useState<OaepHash>('SHA-256')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const info = pem.trim() === '' ? null : attempt(() => inspectPemKey(pem))

  const go = async () => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      if (direction === 'encrypt') {
        setOutput(bytesToBase64(await rsaEncrypt(pem, utf8Encode(input), hash)))
      } else {
        const bytes = await rsaDecrypt(pem, base64ToBytes(input), hash)
        if (isValidUtf8(bytes)) setOutput(utf8Decode(bytes))
        else {
          setOutput(bytesToHex(bytes))
          setNote('Decrypted data is not UTF-8 text; shown as hex.')
        }
      }
    } catch (e) {
      setOutput('')
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'encrypt', label: 'Encrypt (public key)' },
            { value: 'decrypt', label: 'Decrypt (private key)' },
          ]}
        />
        <Select label="OAEP hash" value={hash} onChange={setHash} options={HASHES.map((h) => ({ value: h, label: h }))} />
      </Toolbar>
      <TextPane
        label={direction === 'encrypt' ? 'Public key (PEM)' : 'Private key (PEM)'}
        value={pem}
        onChange={setPem}
        rows={8}
        wrap={false}
        placeholder={direction === 'encrypt' ? '-----BEGIN PUBLIC KEY-----' : '-----BEGIN PRIVATE KEY-----'}
        invalid={info !== null && !info.ok}
        footer={info?.ok ? `${info.value.type} ${info.value.kind} key` : undefined}
      />
      {info && !info.ok && <ErrorMessage title="Key">{info.error}</ErrorMessage>}
      <div className="panes">
        <TextPane
          label={direction === 'encrypt' ? 'Plaintext' : 'Ciphertext (Base64)'}
          value={input}
          onChange={setInput}
          mono={direction === 'decrypt'}
          rows={8}
        />
        <TextPane label={direction === 'encrypt' ? 'Ciphertext (Base64)' : 'Plaintext'} value={output} rows={8} />
      </div>
      <Toolbar>
        <button type="button" className="btn btn-primary" onClick={go} disabled={busy || !info?.ok || input === ''}>
          {direction === 'encrypt' ? 'Encrypt' : 'Decrypt'}
        </button>
        {busy && <Spinner />}
      </Toolbar>
      <ErrorMessage>{error}</ErrorMessage>
      {note && <Notice kind="warn">{note}</Notice>}
      <p className="muted small">
        RSA-OAEP can only encrypt short messages (e.g. 190 bytes for RSA-2048 with SHA-256). Use AES for larger data.
      </p>
    </div>
  )
}
