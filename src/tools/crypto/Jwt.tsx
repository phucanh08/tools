import { useCallback, useState } from 'react'
import { Segmented, Select, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice, Spinner, Verdict } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, useAsyncValue, useNow } from '../../hooks'
import { parseBytes } from '../../lib/encoding'
import { parseJsonOrThrow } from '../../lib/json'
import { relativeTime } from '../../lib/misc'
import { decodeJwt, HMAC_JWT_ALGS, isHmacAlg, signJwtHmac, timeClaims, verifyJwt, type HmacJwtAlg } from '../../lib/crypto/jwt'

type SecretFormat = 'text' | 'base64' | 'hex'

const SECRET_FORMATS = [
  { value: 'text' as const, label: 'Text' },
  { value: 'base64' as const, label: 'Base64' },
  { value: 'hex' as const, label: 'Hex' },
]

export default function Jwt() {
  const [tab, setTab] = useState<'decode' | 'encode'>('decode')
  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Mode"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'decode', label: 'Decode & verify' },
            { value: 'encode', label: 'Encode (HMAC)' },
          ]}
        />
      </Toolbar>
      {tab === 'decode' ? <DecodeTab /> : <EncodeTab />}
    </div>
  )
}

function DecodeTab() {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [secretFormat, setSecretFormat] = useState<SecretFormat>('text')
  const [pem, setPem] = useState('')
  const now = useNow(1000)

  const decoded = token.trim() === '' ? null : attempt(() => decodeJwt(token))
  const jwt = decoded?.ok ? decoded.value : null
  const alg = jwt?.header.alg
  const hmacAlg = isHmacAlg(alg)
  const unsigned = alg === 'none' || alg === undefined

  const keyReady = hmacAlg ? secret !== '' : pem.trim() !== ''
  const verifyTask = useCallback(
    () =>
      verifyJwt(
        token,
        isHmacAlg(decodeJwt(token).header.alg) ? { secret: parseBytes(secret, secretFormat) } : { publicKeyPem: pem },
      ),
    [token, secret, secretFormat, pem],
  )
  const verification = useAsyncValue(jwt && !unsigned && keyReady ? verifyTask : null)
  const claims = jwt ? timeClaims(jwt.payload) : []

  return (
    <>
      <TextPane
        label="JWT"
        value={token}
        onChange={setToken}
        rows={5}
        placeholder="eyJhbGciOi…"
        invalid={decoded !== null && !decoded.ok}
      />
      {decoded && !decoded.ok && <ErrorMessage>{decoded.error}</ErrorMessage>}
      {jwt && (
        <>
          <div className="panes">
            <TextPane label="Header" value={JSON.stringify(jwt.header, null, 2)} rows={8} />
            <TextPane label="Payload" value={JSON.stringify(jwt.payload, null, 2)} rows={8} />
          </div>
          {claims.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Claim</th>
                    <th scope="col">Value</th>
                    <th scope="col">Date (UTC)</th>
                    <th scope="col">Relative</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => {
                    const ms = c.date.getTime()
                    const valid = Number.isFinite(ms) && Math.abs(ms) <= 8.64e15
                    let status = ''
                    let cls = ''
                    if (c.name === 'exp') [status, cls] = ms <= now ? ['Expired', 'diff-removed'] : ['Not expired', 'diff-added']
                    else if (c.name === 'nbf') [status, cls] = ms > now ? ['Not yet valid', 'diff-removed'] : ['Active', 'diff-added']
                    else if (c.name === 'iat' && ms > now + 60_000) [status, cls] = ['Issued in the future', 'badge-warn']
                    return (
                      <tr key={c.name}>
                        <th scope="row" className="mono">
                          {c.name}
                        </th>
                        <td className="mono">{c.value}</td>
                        <td className="mono">{valid ? c.date.toISOString() : 'invalid date'}</td>
                        <td>{valid ? relativeTime(ms, now) : ''}</td>
                        <td>{status && <span className={`badge ${cls}`}>{status}</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <h2 className="section-title">Verify signature</h2>
          {unsigned ? (
            <Notice kind="warn">This token is unsigned (alg “none”). Anyone can forge it.</Notice>
          ) : hmacAlg ? (
            <>
              <p className="muted small">{String(alg)} uses a shared secret.</p>
              <Toolbar>
                <Segmented label="Secret format" value={secretFormat} onChange={setSecretFormat} options={SECRET_FORMATS} />
              </Toolbar>
              <TextPane label="Secret" value={secret} onChange={setSecret} rows={2} />
            </>
          ) : (
            <>
              <p className="muted small">{String(alg)} is verified with the issuer's public key.</p>
              <TextPane label="Public key (PEM)" value={pem} onChange={setPem} rows={6} wrap={false} placeholder="-----BEGIN PUBLIC KEY-----" />
            </>
          )}
          {verification.pending && <Spinner label="Verifying…" />}
          {!verification.pending && verification.result?.ok && (
            <Verdict valid={verification.result.value} validText="Signature verified" invalidText="Invalid signature" />
          )}
          {!verification.pending && verification.result && !verification.result.ok && <ErrorMessage>{verification.result.error}</ErrorMessage>}
        </>
      )}
      <p className="muted small">Decoding happens locally. Never paste production tokens into online tools you don't trust.</p>
    </>
  )
}

const DEFAULT_PAYLOAD = `{
  "sub": "1234567890",
  "name": "Ada Lovelace",
  "iat": 1700000000
}`

function EncodeTab() {
  const [alg, setAlg] = useState<HmacJwtAlg>('HS256')
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD)
  const [secret, setSecret] = useState('')
  const [secretFormat, setSecretFormat] = useState<SecretFormat>('text')

  const task = useCallback(
    () => signJwtHmac(parseJsonOrThrow(payload, 'Payload'), parseBytes(secret, secretFormat), alg),
    [payload, secret, secretFormat, alg],
  )
  const { result } = useAsyncValue(secret === '' ? null : task)

  return (
    <>
      <Toolbar>
        <Select label="Algorithm" value={alg} onChange={setAlg} options={HMAC_JWT_ALGS.map((a) => ({ value: a, label: a }))} />
        <Segmented label="Secret format" value={secretFormat} onChange={setSecretFormat} options={SECRET_FORMATS} />
      </Toolbar>
      <TextPane label="Secret" value={secret} onChange={setSecret} rows={2} />
      <TextPane label="Payload (JSON)" value={payload} onChange={setPayload} rows={10} />
      {secret === '' && <p className="muted small">Enter a secret to sign the token.</p>}
      {result && !result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      <TextPane label="Token" value={result?.ok ? result.value : ''} rows={4} />
    </>
  )
}
