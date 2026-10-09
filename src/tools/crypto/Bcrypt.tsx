import { useState } from 'react'
import { TextField, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice, Spinner, Verdict } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { errorMessage } from '../../hooks'
import { bcryptCost, bcryptHash, bcryptVerify, MAX_COST, MIN_COST, passwordByteLength } from '../../lib/crypto/bcrypt'

export default function Bcrypt() {
  return (
    <div className="tool">
      <section aria-labelledby="bc-hash">
        <h2 id="bc-hash" className="section-title">
          Hash
        </h2>
        <HashSection />
      </section>
      <section aria-labelledby="bc-verify">
        <h2 id="bc-verify" className="section-title">
          Verify
        </h2>
        <VerifySection />
      </section>
    </div>
  )
}

function HashSection() {
  const [password, setPassword] = useState('')
  const [cost, setCost] = useState(10)
  const [hash, setHash] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const bytes = passwordByteLength(password)

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      setHash(await bcryptHash(password, cost))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Toolbar>
        <TextField label="Password" value={password} onChange={setPassword} width="20rem" hint={`${bytes} bytes`} />
        <div className="control">
          <label className="control-label" htmlFor="bc-cost">
            Cost: {cost} ({(2 ** cost).toLocaleString()} rounds)
          </label>
          <input id="bc-cost" type="range" min={MIN_COST} max={MAX_COST} value={cost} onChange={(e) => setCost(e.target.valueAsNumber)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
          Hash
        </button>
        {busy && <Spinner label={cost >= 13 ? 'Hashing (high cost, may take several seconds)…' : 'Hashing…'} />}
      </Toolbar>
      {bytes > 72 && (
        <Notice kind="warn">
          bcrypt only uses the first 72 bytes of a password. This one is {bytes} bytes (UTF-8); the rest is ignored.
        </Notice>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      <TextPane label="bcrypt hash" value={hash} rows={2} />
    </>
  )
}

function VerifySection() {
  const [password, setPassword] = useState('')
  const [hash, setHash] = useState('')
  const [verdict, setVerdict] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cost = bcryptCost(hash)

  const run = async () => {
    setBusy(true)
    setError('')
    setVerdict(null)
    try {
      setVerdict(await bcryptVerify(password, hash))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Toolbar>
        <TextField
          label="Password"
          value={password}
          onChange={(v) => {
            setPassword(v)
            setVerdict(null)
          }}
          width="20rem"
        />
        <TextField
          label="bcrypt hash"
          value={hash}
          onChange={(v) => {
            setHash(v)
            setVerdict(null)
          }}
          mono
          width="34rem"
          placeholder="$2b$10$…"
          hint={cost !== null ? `cost ${cost}` : undefined}
        />
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy || hash.trim() === ''}>
          Verify
        </button>
        {busy && <Spinner label="Checking…" />}
      </Toolbar>
      <ErrorMessage>{error}</ErrorMessage>
      {verdict !== null && <Verdict valid={verdict} validText="Password matches the hash" invalidText="Password does NOT match" />}
    </>
  )
}
