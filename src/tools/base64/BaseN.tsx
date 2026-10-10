import { useState } from 'react'
import { Checkbox, Segmented, Select, Toolbar } from '../../components/controls'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt } from '../../hooks'
import { BASE_N_LABELS, decodeBaseN, encodeBaseN, type BaseN as BaseNId } from '../../lib/base-n'
import { bytesToHex, hexToBytes, isValidUtf8, utf8Decode, utf8Encode } from '../../lib/encoding'

type Mode = 'encode' | 'decode'
type Format = 'text' | 'hex'

const BASE_OPTIONS = (Object.keys(BASE_N_LABELS) as BaseNId[]).map((id) => ({ value: id, label: BASE_N_LABELS[id] }))

const NOTES: Record<BaseNId, string> = {
  base32: 'Alphabet A–Z 2–7, "=" padding to 8 characters. Decoding ignores case and whitespace.',
  base32hex: 'Alphabet 0–9 A–V (sort order preserved), "=" padding to 8 characters.',
  base58: 'Bitcoin alphabet (no 0, O, I, l). Each leading 0x00 byte is written as "1".',
  ascii85: 'Characters ! to u; "z" stands for four zero bytes. Adobe streams are wrapped in <~ ~>.',
  z85: 'ZeroMQ Z85: input must be a multiple of 4 bytes, encoded text a multiple of 5 characters.',
  base36:
    'Digits 0–9 a–z of the bytes read as one big-endian number. Leading 0x00 bytes have no numeric value, so each is kept as a leading "0".',
}

const FORMAT_OPTIONS = [
  { value: 'text' as const, label: 'Text (UTF-8)' },
  { value: 'hex' as const, label: 'Hex' },
]

export default function BaseN() {
  const [mode, setMode] = useState<Mode>('encode')
  const [base, setBase] = useState<BaseNId>('base32')
  const [input, setInput] = useState('')
  const [inFormat, setInFormat] = useState<Format>('text')
  const [outFormat, setOutFormat] = useState<Format>('text')
  const [padding, setPadding] = useState(true)
  const [delimiters, setDelimiters] = useState(false)
  const [zeroShortcut, setZeroShortcut] = useState(true)

  const result =
    input.trim() === ''
      ? null
      : attempt(() => {
          if (mode === 'encode') {
            const bytes = inFormat === 'hex' ? hexToBytes(input) : utf8Encode(input)
            return { bytes, text: encodeBaseN(bytes, base, { padding, delimiters, zeroShortcut }) }
          }
          const bytes = decodeBaseN(input, base)
          return { bytes, text: '' }
        })
  const value = result?.ok ? result.value : null
  const notUtf8 = mode === 'decode' && outFormat === 'text' && value !== null && !isValidUtf8(value.bytes)

  let output = ''
  if (value) {
    if (mode === 'encode') output = value.text
    else if (outFormat === 'hex') output = bytesToHex(value.bytes, ' ')
    else if (!notUtf8) output = utf8Decode(value.bytes)
  }

  const swap = () => {
    if (mode === 'encode') {
      setOutFormat(inFormat)
      setMode('decode')
    } else {
      setInFormat(outFormat)
      setMode('encode')
    }
    setInput(output)
  }

  const encodedLabel = BASE_N_LABELS[base].replace(/ \(.*\)$/, '')
  const plainLabel = (f: Format) => (f === 'hex' ? 'Hex' : 'Text (UTF-8)')

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
        />
        <Select label="Encoding" value={base} onChange={setBase} options={BASE_OPTIONS} />
        {mode === 'encode' ? (
          <Segmented label="Input" value={inFormat} onChange={setInFormat} options={FORMAT_OPTIONS} />
        ) : (
          <Segmented label="Output" value={outFormat} onChange={setOutFormat} options={FORMAT_OPTIONS} />
        )}
        {mode === 'encode' && (base === 'base32' || base === 'base32hex') && (
          <Checkbox label="Padding (=)" checked={padding} onChange={setPadding} />
        )}
        {mode === 'encode' && base === 'ascii85' && (
          <>
            <Checkbox label="<~ ~> delimiters" checked={delimiters} onChange={setDelimiters} />
            <Checkbox label='"z" for zero groups' checked={zeroShortcut} onChange={setZeroShortcut} />
          </>
        )}
        <button type="button" className="btn" onClick={swap} disabled={output === ''}>
          ⇅ Use output as input
        </button>
      </Toolbar>
      <p className="muted small">{NOTES[base]}</p>
      <div className="panes">
        <TextPane
          label={mode === 'encode' ? plainLabel(inFormat) : encodedLabel}
          value={input}
          onChange={setInput}
          placeholder={mode === 'encode' ? (inFormat === 'hex' ? 'e.g. 66 6f 6f or 0x666f6f' : 'Type or paste text…') : `Paste ${encodedLabel}…`}
          invalid={result !== null && !result.ok}
          footer={value ? `${value.bytes.length} bytes` : undefined}
        />
        <TextPane
          label={mode === 'encode' ? encodedLabel : plainLabel(outFormat)}
          value={output}
          footer={`${output.length} characters`}
        />
      </div>
      {result && !result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      {notUtf8 && <Notice kind="warn">The decoded bytes are not valid UTF-8 text. Switch Output to Hex to see them.</Notice>}
    </div>
  )
}
