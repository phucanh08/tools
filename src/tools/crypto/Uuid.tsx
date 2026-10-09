import { useState } from 'react'
import { Checkbox, NumberField, Segmented, TextField, Toolbar } from '../../components/controls'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { uuidV4, uuidV7, uuidV7Timestamp } from '../../lib/crypto/random'

interface Options {
  version: 4 | 7
  count: number
  upper: boolean
  hyphens: boolean
}

function generate(o: Options): string[] {
  const n = Number.isInteger(o.count) ? Math.min(Math.max(o.count, 1), 1000) : 1
  return Array.from({ length: n }, () => (o.version === 4 ? uuidV4() : uuidV7()))
}

function describe(input: string): { version: string; variant: string; time?: string } | string {
  const h = input.trim().replace(/^urn:uuid:/i, '').replace(/[{}]/g, '').replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/i.test(h)) return 'Not a UUID (expected 32 hex digits, hyphens optional)'
  const version = parseInt(h[12]!, 16)
  const v = parseInt(h[16]!, 16)
  const variant = v < 8 ? 'NCS (reserved)' : v < 12 ? 'RFC 9562' : v < 14 ? 'Microsoft (reserved)' : 'Future (reserved)'
  const ts = uuidV7Timestamp(h)
  return {
    version: /^0+$/.test(h) ? 'Nil UUID' : /^f+$/i.test(h) ? 'Max UUID' : `v${version}`,
    variant,
    time: ts !== null ? `${new Date(ts).toISOString()} (${ts} ms)` : undefined,
  }
}

export default function Uuid() {
  const [opts, setOpts] = useState<Options>({ version: 4, count: 5, upper: false, hyphens: true })
  const [ids, setIds] = useState(() => generate(opts))
  const [decode, setDecode] = useState('')

  const update = (patch: Partial<Options>) => {
    const next = { ...opts, ...patch }
    setOpts(next)
    if ('version' in patch || 'count' in patch) setIds(generate(next))
  }

  const shown = ids.map((id) => {
    const s = opts.hyphens ? id : id.replace(/-/g, '')
    return opts.upper ? s.toUpperCase() : s
  })
  const info = decode.trim() ? describe(decode) : null

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Version"
          value={opts.version}
          onChange={(version) => update({ version })}
          options={[
            { value: 4, label: 'v4 (random)' },
            { value: 7, label: 'v7 (time-ordered)' },
          ]}
        />
        <NumberField label="Count" value={opts.count} onChange={(count) => update({ count })} min={1} max={1000} width="7rem" />
        <Checkbox label="Uppercase" checked={opts.upper} onChange={(upper) => update({ upper })} />
        <Checkbox label="Hyphens" checked={opts.hyphens} onChange={(hyphens) => update({ hyphens })} />
        <button type="button" className="btn btn-primary" onClick={() => setIds(generate(opts))}>
          ↻ Generate
        </button>
      </Toolbar>
      <TextPane label={`${shown.length} UUID${shown.length === 1 ? '' : 's'}`} value={shown.join('\n')} rows={Math.min(Math.max(shown.length, 3), 16)} />
      <h2 className="section-title">Inspect a UUID</h2>
      <TextField label="UUID" value={decode} onChange={setDecode} mono placeholder="018f3a9e-…" />
      {typeof info === 'string' && <ErrorMessage>{info}</ErrorMessage>}
      {info && typeof info === 'object' && (
        <dl className="kv">
          <dt>Version</dt>
          <dd>{info.version}</dd>
          <dt>Variant</dt>
          <dd>{info.variant}</dd>
          {info.time && (
            <>
              <dt>Timestamp</dt>
              <dd className="mono">{info.time}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  )
}
