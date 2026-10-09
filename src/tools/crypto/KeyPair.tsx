import { useState } from 'react'
import { Segmented, Select, Toolbar } from '../../components/controls'
import { downloadText } from '../../components/download'
import { ErrorMessage, Notice, Spinner } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { errorMessage } from '../../hooks'
import { generateKeyPair, type GeneratedKeyPair, type KeyGenSpec } from '../../lib/crypto/keys'

const SPECS: { value: string; label: string; spec: KeyGenSpec }[] = [
  { value: 'rsa2048', label: 'RSA 2048', spec: { type: 'RSA', modulusLength: 2048 } },
  { value: 'rsa3072', label: 'RSA 3072', spec: { type: 'RSA', modulusLength: 3072 } },
  { value: 'rsa4096', label: 'RSA 4096', spec: { type: 'RSA', modulusLength: 4096 } },
  { value: 'p256', label: 'ECDSA P-256', spec: { type: 'EC', curve: 'P-256' } },
  { value: 'p384', label: 'ECDSA P-384', spec: { type: 'EC', curve: 'P-384' } },
  { value: 'p521', label: 'ECDSA P-521', spec: { type: 'EC', curve: 'P-521' } },
  { value: 'ed25519', label: 'Ed25519', spec: { type: 'Ed25519' } },
]

export default function KeyPair() {
  const [choice, setChoice] = useState('ed25519')
  const [format, setFormat] = useState<'pem' | 'jwk'>('pem')
  const [pair, setPair] = useState<{ label: string; keys: GeneratedKeyPair } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selected = SPECS.find((s) => s.value === choice) ?? SPECS[0]!

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      setPair({ label: selected.label, keys: await generateKeyPair(selected.spec) })
    } catch (e) {
      setPair(null)
      const msg = errorMessage(e)
      setError(selected.spec.type === 'Ed25519' && /not supported|NotSupported/i.test(msg) ? `${msg}. Your browser may not support Ed25519 in Web Crypto yet.` : msg)
    } finally {
      setBusy(false)
    }
  }

  const pub = pair ? (format === 'pem' ? pair.keys.publicPem : JSON.stringify(pair.keys.publicJwk, null, 2)) : ''
  const priv = pair ? (format === 'pem' ? pair.keys.privatePem : JSON.stringify(pair.keys.privateJwk, null, 2)) : ''
  const ext = format === 'pem' ? 'pem' : 'jwk.json'
  const mime = format === 'pem' ? 'application/x-pem-file' : 'application/json'
  const base = pair?.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'key'

  return (
    <div className="tool">
      <Toolbar>
        <Select label="Algorithm" value={choice} onChange={setChoice} options={SPECS.map(({ value, label }) => ({ value, label }))} />
        <button type="button" className="btn btn-primary" onClick={generate} disabled={busy}>
          Generate key pair
        </button>
        {busy && <Spinner label={selected.spec.type === 'RSA' && selected.spec.modulusLength === 4096 ? 'Generating (RSA 4096 can take a few seconds)…' : 'Generating…'} />}
        <Segmented
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'pem', label: 'PEM' },
            { value: 'jwk', label: 'JWK' },
          ]}
        />
      </Toolbar>
      <Notice>Keys are generated locally with Web Crypto and never leave your browser.</Notice>
      <ErrorMessage>{error}</ErrorMessage>
      {pair && (
        <>
          <p className="muted small">Generated: {pair.label} {format === 'pem' ? '(SPKI public key, PKCS#8 private key)' : ''}</p>
          <div className="panes">
            <TextPane
              label="Public key"
              value={pub}
              rows={14}
              wrap={false}
              actions={
                <button type="button" className="btn btn-small" onClick={() => downloadText(pub, `${base}-public.${ext}`, mime)}>
                  Download
                </button>
              }
            />
            <TextPane
              label="Private key"
              value={priv}
              rows={14}
              wrap={false}
              actions={
                <button type="button" className="btn btn-small" onClick={() => downloadText(priv, `${base}-private.${ext}`, mime)}>
                  Download
                </button>
              }
            />
          </div>
          <p className="muted small">Keep the private key secret. Store it encrypted if it protects anything important.</p>
        </>
      )}
    </div>
  )
}
