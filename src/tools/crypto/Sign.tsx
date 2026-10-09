import { useState } from 'react'
import { Segmented, Select, Toolbar } from '../../components/controls'
import { ErrorMessage, Spinner, Verdict } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, errorMessage } from '../../hooks'
import { bytesToBase64, bytesToHex, parseBytes, utf8Encode } from '../../lib/encoding'
import {
  algorithmsForKey,
  ecdsaDerToRaw,
  ecdsaRawToDer,
  sign,
  SIGN_ALGORITHM_LABELS,
  verify,
  type SignAlgorithm,
} from '../../lib/crypto/keys'
import { inspectPemKey } from '../../lib/crypto/pem'

type SigEncoding = 'base64' | 'hex'
type EcFormat = 'raw' | 'der'

export default function Sign() {
  const [pem, setPem] = useState('')
  const [alg, setAlg] = useState<SignAlgorithm | null>(null)
  const [message, setMessage] = useState('')
  const [encoding, setEncoding] = useState<SigEncoding>('base64')
  const [ecFormat, setEcFormat] = useState<EcFormat>('raw')
  const [signature, setSignature] = useState('')
  const [verdict, setVerdict] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const info = pem.trim() === '' ? null : attempt(() => inspectPemKey(pem))
  const key = info?.ok ? info.value : null
  const algs = key ? algorithmsForKey(key) : []
  const effectiveAlg = alg && algs.includes(alg) ? alg : (algs[0] ?? null)
  const isEc = key?.type === 'EC'
  const mode: 'sign' | 'verify' = key?.kind === 'public' ? 'verify' : 'sign'

  const reset = () => {
    setVerdict(null)
    setError('')
  }

  const run = async () => {
    if (!key || !effectiveAlg) return
    setBusy(true)
    reset()
    try {
      const data = utf8Encode(message)
      if (mode === 'sign') {
        let sig = await sign(effectiveAlg, pem, data)
        if (isEc && ecFormat === 'der') sig = ecdsaRawToDer(sig)
        setSignature(encoding === 'base64' ? bytesToBase64(sig) : bytesToHex(sig))
      } else {
        let sig = parseBytes(signature, encoding)
        if (isEc && ecFormat === 'der' && key.curve) sig = ecdsaDerToRaw(sig, key.curve)
        setVerdict(await verify(effectiveAlg, pem, data, sig))
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool">
      <TextPane
        label="Key (PEM) — private key to sign, public key to verify"
        value={pem}
        onChange={(v) => {
          setPem(v)
          reset()
        }}
        rows={8}
        wrap={false}
        placeholder={'-----BEGIN PRIVATE KEY-----\n…'}
        invalid={info !== null && !info.ok}
        footer={key ? `Detected: ${key.type}${key.curve ? ` ${key.curve}` : ''} ${key.kind} key → ${mode}` : undefined}
      />
      {info && !info.ok && <ErrorMessage title="Key">{info.error}</ErrorMessage>}
      {key && algs.length === 0 && <ErrorMessage>No signature algorithm supports this key type ({key.type}).</ErrorMessage>}
      <Toolbar>
        {effectiveAlg && (
          <Select
            label="Algorithm"
            value={effectiveAlg}
            onChange={(v) => {
              setAlg(v)
              reset()
            }}
            options={algs.map((a) => ({ value: a, label: SIGN_ALGORITHM_LABELS[a] }))}
          />
        )}
        <Segmented
          label="Signature encoding"
          value={encoding}
          onChange={(v) => {
            setEncoding(v)
            reset()
          }}
          options={[
            { value: 'base64', label: 'Base64' },
            { value: 'hex', label: 'Hex' },
          ]}
        />
        {isEc && (
          <Segmented
            label="ECDSA format"
            value={ecFormat}
            onChange={(v) => {
              setEcFormat(v)
              reset()
            }}
            options={[
              { value: 'raw', label: 'Raw r‖s', title: 'IEEE P1363: JOSE / JWT / Web Crypto' },
              { value: 'der', label: 'DER', title: 'ASN.1 DER: OpenSSL / Java' },
            ]}
          />
        )}
      </Toolbar>
      <TextPane
        label="Message (UTF-8)"
        value={message}
        onChange={(v) => {
          setMessage(v)
          reset()
        }}
        rows={6}
        mono={false}
      />
      {mode === 'verify' ? (
        <TextPane
          label={`Signature (${encoding === 'base64' ? 'Base64' : 'hex'})`}
          value={signature}
          onChange={(v) => {
            setSignature(v)
            reset()
          }}
          rows={4}
        />
      ) : (
        <TextPane label={`Signature (${encoding === 'base64' ? 'Base64' : 'hex'})`} value={signature} rows={4} />
      )}
      <Toolbar>
        <button
          type="button"
          className="btn btn-primary"
          onClick={run}
          disabled={busy || !effectiveAlg || (mode === 'verify' && signature.trim() === '')}
        >
          {mode === 'sign' ? 'Sign' : 'Verify'}
        </button>
        {busy && <Spinner />}
      </Toolbar>
      <ErrorMessage>{error}</ErrorMessage>
      {verdict !== null && <Verdict valid={verdict} validText="Signature is valid" invalidText="Signature is INVALID" />}
    </div>
  )
}
