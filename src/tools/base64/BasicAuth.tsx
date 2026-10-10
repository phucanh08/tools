import { useState } from 'react'
import { Checkbox, Segmented, TextField, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { curlExamples, decodeBasicAuth, encodeBasicAuth, hasControlChars } from '../../lib/basic-auth'

type Mode = 'encode' | 'decode'

export default function BasicAuth() {
  const [mode, setMode] = useState<Mode>('encode')
  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: 'Build header' },
            { value: 'decode', label: 'Decode header' },
          ]}
        />
      </Toolbar>
      {mode === 'encode' ? <Encode /> : <Decode />}
      <p className="muted small">
        Basic auth only encodes credentials, it does not encrypt them: send it over HTTPS only. Everything stays in your browser.
      </p>
    </div>
  )
}

function Warnings({ user, password, decoded = false }: { user: string; password: string; decoded?: boolean }) {
  return (
    <>
      {decoded && password.includes(':') && (
        <Notice>
          The password contains ":". Basic auth splits at the first ":", so this split is right only if the user name had no ":".
        </Notice>
      )}
      {user.includes(':') && (
        <Notice kind="warn">
          The user name contains ":". RFC 7617 forbids this: servers split at the first ":", so the user becomes "
          {user.slice(0, user.indexOf(':'))}".
        </Notice>
      )}
      {(hasControlChars(user) || hasControlChars(password)) && (
        <Notice kind="warn">Control characters (such as tabs or line breaks) are not allowed in Basic credentials.</Notice>
      )}
    </>
  )
}

function Encode() {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const empty = user === '' && password === ''
  const auth = encodeBasicAuth(user, password)
  const curl = curlExamples(user, password)
  return (
    <>
      <Toolbar>
        <TextField label="User name" value={user} onChange={setUser} width="16rem" />
        <TextField label="Password" value={password} onChange={setPassword} type={show ? 'text' : 'password'} width="16rem" />
        <Checkbox label="Show password" checked={show} onChange={setShow} />
      </Toolbar>
      <Warnings user={user} password={password} />
      {!empty && (
        <>
          <TextPane label="Authorization header" value={auth.header} rows={2} />
          <dl className="kv">
            <dt>Header value</dt>
            <dd className="mono">
              {auth.value} <CopyButton text={auth.value} what="header value" />
            </dd>
            <dt>Token</dt>
            <dd className="mono">
              {auth.token} <CopyButton text={auth.token} what="token" />
            </dd>
          </dl>
          <TextPane label="curl example" value={`${curl.userFlag}\n${curl.header}`} rows={2} wrap={false} />
        </>
      )}
    </>
  )
}

function Decode() {
  const [input, setInput] = useState('')
  const result = input.trim() === '' ? null : attempt(() => decodeBasicAuth(input))
  const value = result?.ok ? result.value : null
  return (
    <>
      <TextPane
        label="Header or token"
        value={input}
        onChange={setInput}
        rows={3}
        placeholder="Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==  (or Basic …, or the bare token)"
        invalid={result !== null && !result.ok}
      />
      {result && !result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      {value && (
        <>
          <dl className="kv" aria-label="Decoded credentials">
            <dt>User</dt>
            <dd className="mono">
              <span data-testid="basic-user">{value.user}</span> <CopyButton text={value.user} what="user" />
            </dd>
            <dt>Password</dt>
            <dd className="mono">
              <span data-testid="basic-password">{value.password}</span> <CopyButton text={value.password} what="password" />
            </dd>
            <dt>Charset</dt>
            <dd>{value.charset}</dd>
          </dl>
          {value.charset !== 'UTF-8' && (
            <Notice kind="warn">The bytes are not valid UTF-8; decoded as ISO-8859-1 (legacy clients).</Notice>
          )}
          <Warnings user={value.user} password={value.password} decoded />
        </>
      )}
    </>
  )
}
