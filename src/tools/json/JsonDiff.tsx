import { useState } from 'react'
import { ErrorMessage, Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { diffJson, parseJson, type DiffEntry, type DiffKind, type JsonValue } from '../../lib/json'

const KIND_LABEL: Record<DiffKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  type: 'Type changed',
}

const MAX_ROWS = 2000

function preview(v: JsonValue | undefined): string {
  if (v === undefined) return ''
  const s = JSON.stringify(v)
  return s.length > 200 ? `${s.slice(0, 200)}…` : s
}

export default function JsonDiff() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const a = left.trim() === '' ? null : parseJson(left)
  const b = right.trim() === '' ? null : parseJson(right)
  const diff: DiffEntry[] | null = a?.ok && b?.ok ? diffJson(a.value, b.value) : null

  const counts = diff?.reduce<Record<DiffKind, number>>(
    (acc, d) => {
      acc[d.kind]++
      return acc
    },
    { added: 0, removed: 0, changed: 0, type: 0 },
  )

  return (
    <div className="tool">
      <div className="panes">
        <TextPane label="Original (A)" value={left} onChange={setLeft} rows={14} invalid={a !== null && !a.ok} wrap={false} />
        <TextPane label="Modified (B)" value={right} onChange={setRight} rows={14} invalid={b !== null && !b.ok} wrap={false} />
      </div>
      {a && !a.ok && (
        <ErrorMessage title="Original">
          {a.error.message} (line {a.error.line}, column {a.error.column})
        </ErrorMessage>
      )}
      {b && !b.ok && (
        <ErrorMessage title="Modified">
          {b.error.message} (line {b.error.line}, column {b.error.column})
        </ErrorMessage>
      )}
      {diff && counts && (
        <section aria-label="Differences">
          {diff.length === 0 ? (
            <Notice kind="ok">✓ The documents are structurally identical.</Notice>
          ) : (
            <>
              <p className="diff-summary">
                {diff.length} difference{diff.length === 1 ? '' : 's'}:{' '}
                {(Object.keys(counts) as DiffKind[])
                  .filter((k) => counts[k] > 0)
                  .map((k) => (
                    <span key={k} className={`badge diff-${k}`}>
                      {counts[k]} {KIND_LABEL[k].toLowerCase()}
                    </span>
                  ))}
              </p>
              <div className="table-wrap">
                <table className="table diff-table">
                  <thead>
                    <tr>
                      <th scope="col">Change</th>
                      <th scope="col">Path</th>
                      <th scope="col">Before (A)</th>
                      <th scope="col">After (B)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.slice(0, MAX_ROWS).map((d, i) => (
                      <tr key={i} className={`diff-row diff-${d.kind}`}>
                        <td>
                          <span className={`badge diff-${d.kind}`}>{KIND_LABEL[d.kind]}</span>
                        </td>
                        <td className="mono">{d.path}</td>
                        <td className="mono">{preview(d.before)}</td>
                        <td className="mono">{preview(d.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {diff.length > MAX_ROWS && <p className="muted">Showing the first {MAX_ROWS} differences.</p>}
            </>
          )}
        </section>
      )}
    </div>
  )
}
