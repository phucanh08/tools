import { useCallback, useState } from 'react'
import { Checkbox, Segmented, TextField, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { FilePicker } from '../../components/FilePicker'
import { ErrorMessage, Notice, Spinner } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { errorMessage, useAsyncValue } from '../../hooks'
import { bytesToBase64, bytesToHex, formatSize, utf8Encode } from '../../lib/encoding'
import { digest, digestMatches, HASH_ALGORITHMS, type HashAlgorithm } from '../../lib/crypto/hash'

const LARGE_FILE = 200 * 1024 * 1024

type Digests = [HashAlgorithm, Uint8Array][]

async function hashAll(data: Uint8Array<ArrayBuffer>): Promise<Digests> {
  return Promise.all(HASH_ALGORITHMS.map(async (alg) => [alg, await digest(alg, data)] as [HashAlgorithm, Uint8Array]))
}

export default function Hash() {
  const [source, setSource] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [format, setFormat] = useState<'hex' | 'base64'>('hex')
  const [upper, setUpper] = useState(false)
  const [expected, setExpected] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileResult, setFileResult] = useState<{ digests: Digests } | { error: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const textTask = useCallback(() => hashAll(utf8Encode(text)), [text])
  const textHash = useAsyncValue(source === 'text' ? textTask : null)

  const onFile = async (f: File) => {
    setFile(f)
    setFileResult(null)
    setBusy(true)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      setFileResult({ digests: await hashAll(bytes) })
    } catch (e) {
      setFileResult({ error: `Could not hash file: ${errorMessage(e)}` })
    } finally {
      setBusy(false)
    }
  }

  let digests: Digests | null = null
  let error = ''
  if (source === 'text') {
    if (textHash.result?.ok) digests = textHash.result.value
    else if (textHash.result) error = textHash.result.error
  } else if (fileResult) {
    if ('digests' in fileResult) digests = fileResult.digests
    else error = fileResult.error
  }

  const show = (b: Uint8Array) => (format === 'base64' ? bytesToBase64(b) : upper ? bytesToHex(b).toUpperCase() : bytesToHex(b))
  const want = expected.trim()

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Input"
          value={source}
          onChange={setSource}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'file', label: 'File' },
          ]}
        />
        <Segmented
          label="Output"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'hex', label: 'Hex' },
            { value: 'base64', label: 'Base64' },
          ]}
        />
        <Checkbox label="Uppercase" checked={upper} onChange={setUpper} disabled={format !== 'hex'} />
      </Toolbar>
      {source === 'text' ? (
        <TextPane label="Text (UTF-8)" value={text} onChange={setText} rows={6} mono={false} />
      ) : (
        <>
          <FilePicker onFile={onFile} file={file} />
          {file && (
            <p className="muted small">
              {file.name} — {formatSize(file.size)}
            </p>
          )}
          {file && file.size > LARGE_FILE && (
            <Notice kind="warn">
              This file is larger than 200 MB. It is read fully into memory, which may be slow or fail on some devices.
            </Notice>
          )}
          {busy && <Spinner label="Hashing…" />}
        </>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      {digests && (
        <div className="table-wrap">
          <table className="table hash-table">
            <tbody>
              {digests.map(([alg, bytes]) => {
                const value = show(bytes)
                const match = digestMatches(bytes, want)
                return (
                  <tr key={alg} className={match ? 'row-match' : undefined}>
                    <th scope="row">
                      {alg}
                      {(alg === 'MD5' || alg === 'SHA-1') && <span className="badge badge-warn" title="Not collision resistant">legacy</span>}
                    </th>
                    <td className="mono break">{value}</td>
                    <td className="nowrap">
                      {match && <span className="badge diff-added">match</span>} <CopyButton text={value} what={alg} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <TextField
        label="Compare with expected hash (optional)"
        value={expected}
        onChange={setExpected}
        mono
        placeholder="Paste a checksum to highlight the matching row"
      />
      {want !== '' && digests && !digests.some(([, b]) => digestMatches(b, want)) && (
        <ErrorMessage>No algorithm matches the expected hash.</ErrorMessage>
      )}
    </div>
  )
}
