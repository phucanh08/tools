import { useState } from 'react'
import { Segmented, TextField, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { ErrorMessage } from '../../components/Messages'
import { attempt, useNow } from '../../hooks'
import { parseDateInput, relativeTime, timestampToMs, type TimestampUnit } from '../../lib/misc'

const UNIT_LABEL: Record<Exclude<TimestampUnit, 'auto'>, string> = {
  s: 'seconds',
  ms: 'milliseconds',
  us: 'microseconds',
  ns: 'nanoseconds',
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0')

/** RFC 2822 date in local time with numeric offset, e.g. "Fri, 09 Oct 2026 22:04:05 +0700". */
function rfc2822(d: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  return `${days[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${sign}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`
}

function localString(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(d)
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td className="mono break">{v}</td>
              <td className="nowrap">
                <CopyButton text={v} what={k} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Timestamp() {
  const now = useNow(1000)
  const [ts, setTs] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [unit, setUnit] = useState<TimestampUnit>('auto')
  const [dateInput, setDateInput] = useState(() => new Date().toISOString())

  const fromTs = ts.trim() === '' ? null : attempt(() => timestampToMs(ts, unit))
  const fromDate = dateInput.trim() === '' ? null : attempt(() => parseDateInput(dateInput))

  return (
    <div className="tool">
      <section aria-labelledby="ts-now">
        <h2 id="ts-now" className="section-title">
          Current time
        </h2>
        <Rows
          rows={[
            ['Unix seconds', String(Math.floor(now / 1000))],
            ['Unix milliseconds', String(now)],
            ['ISO 8601 (UTC)', new Date(now).toISOString()],
          ]}
        />
      </section>

      <section aria-labelledby="ts-to-date">
        <h2 id="ts-to-date" className="section-title">
          Timestamp → date
        </h2>
        <Toolbar>
          <TextField label="Unix timestamp" value={ts} onChange={setTs} mono width="16rem" />
          <Segmented
            label="Unit"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 's', label: 's' },
              { value: 'ms', label: 'ms' },
              { value: 'us', label: 'µs' },
              { value: 'ns', label: 'ns' },
            ]}
          />
          <button type="button" className="btn" onClick={() => setTs(String(Math.floor(Date.now() / 1000)))}>
            Now
          </button>
        </Toolbar>
        {fromTs && !fromTs.ok && <ErrorMessage>{fromTs.error}</ErrorMessage>}
        {fromTs?.ok && (
          <>
            {unit === 'auto' && <p className="muted small">Detected unit: {UNIT_LABEL[fromTs.value.unit]}</p>}
            <Rows
              rows={[
                ['ISO 8601 (UTC)', new Date(fromTs.value.ms).toISOString()],
                ['Local', localString(new Date(fromTs.value.ms))],
                ['RFC 2822', rfc2822(new Date(fromTs.value.ms))],
                ['Relative', relativeTime(fromTs.value.ms, now)],
              ]}
            />
          </>
        )}
      </section>

      <section aria-labelledby="date-to-ts">
        <h2 id="date-to-ts" className="section-title">
          Date → timestamp
        </h2>
        <TextField
          label="Date"
          value={dateInput}
          onChange={setDateInput}
          mono
          hint="ISO 8601 or RFC 2822. Without a time zone, the date is interpreted in your local time zone."
        />
        {fromDate && !fromDate.ok && <ErrorMessage>{fromDate.error}</ErrorMessage>}
        {fromDate?.ok && (
          <Rows
            rows={[
              ['Unix seconds', String(Math.floor(fromDate.value.getTime() / 1000))],
              ['Unix milliseconds', String(fromDate.value.getTime())],
              ['ISO 8601 (UTC)', fromDate.value.toISOString()],
              ['Relative', relativeTime(fromDate.value.getTime(), now)],
            ]}
          />
        )}
      </section>
    </div>
  )
}
