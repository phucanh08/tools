import { useCallback, useState } from 'react'
import { Segmented, Select, TextField, Toolbar } from '../../components/controls'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { useAsyncValue } from '../../hooks'
import { formatBytes, parseBytes, utf8Encode, type ByteFormat } from '../../lib/encoding'
import { hmac, HMAC_ALGORITHMS, type HmacAlgorithm } from '../../lib/crypto/hash'

export default function Hmac() {
  const [alg, setAlg] = useState<HmacAlgorithm>('SHA-256')
  const [key, setKey] = useState('')
  const [keyFormat, setKeyFormat] = useState<ByteFormat>('text')
  const [message, setMessage] = useState('')
  const [outFormat, setOutFormat] = useState<'hex' | 'base64' | 'base64url'>('hex')

  const task = useCallback(async () => {
    const k = parseBytes(key, keyFormat)
    return hmac(alg, k, utf8Encode(message))
  }, [alg, key, keyFormat, message])
  const { result } = useAsyncValue(key === '' ? null : task)
  const output = result?.ok ? formatBytes(result.value, outFormat) : ''

  return (
    <div className="tool">
      <Toolbar>
        <Select label="Algorithm" value={alg} onChange={setAlg} options={HMAC_ALGORITHMS.map((a) => ({ value: a, label: `HMAC-${a}` }))} />
        <Segmented
          label="Key format"
          value={keyFormat}
          onChange={setKeyFormat}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'hex', label: 'Hex' },
            { value: 'base64', label: 'Base64' },
          ]}
        />
        <Segmented
          label="Output"
          value={outFormat}
          onChange={setOutFormat}
          options={[
            { value: 'hex', label: 'Hex' },
            { value: 'base64', label: 'Base64' },
            { value: 'base64url', label: 'Base64url' },
          ]}
        />
      </Toolbar>
      <TextField label="Secret key" value={key} onChange={setKey} mono placeholder="Shared secret" />
      <TextPane label="Message (UTF-8)" value={message} onChange={setMessage} rows={8} mono={false} />
      {key === '' && <p className="muted small">Enter a key to compute the HMAC.</p>}
      {result && !result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      <TextPane label={`HMAC-${alg}`} value={output} rows={3} />
    </div>
  )
}
