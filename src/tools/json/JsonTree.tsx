import { useState } from 'react'
import { Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { joinPath, parseJson, type JsonValue } from '../../lib/json'

const SAMPLE = `{
  "id": 42,
  "name": "Ada",
  "active": true,
  "tags": ["admin", "dev"],
  "address": { "city": "London", "zip": null },
  "projects": [{ "name": "engine", "stars": 1843 }, { "name": "notes", "stars": 7 }]
}`

/** Children rendered per node before a "show more" button. */
const PAGE = 200

type ExpandMode = { kind: 'default' } | { kind: 'all' } | { kind: 'none' }

export default function JsonTree() {
  const [input, setInput] = useState(SAMPLE)
  const [expand, setExpand] = useState<{ mode: ExpandMode; gen: number }>({ mode: { kind: 'default' }, gen: 0 })
  const parsed = input.trim() === '' ? null : parseJson(input)

  return (
    <div className="tool">
      <div className="panes panes-tree">
        <TextPane label="JSON" value={input} onChange={setInput} rows={24} invalid={parsed !== null && !parsed.ok} wrap={false} />
        <div className="pane">
          <div className="pane-header">
            <span className="pane-label">Tree</span>
            <Toolbar>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setExpand((e) => ({ mode: { kind: 'all' }, gen: e.gen + 1 }))}
              >
                Expand all
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setExpand((e) => ({ mode: { kind: 'none' }, gen: e.gen + 1 }))}
              >
                Collapse all
              </button>
            </Toolbar>
          </div>
          <div className="tree-box">
            {parsed === null ? (
              <p className="muted">Paste JSON on the left.</p>
            ) : parsed.ok ? (
              <ul className="tree" key={expand.gen} aria-label="JSON tree">
                <TreeNode name="$" path="$" value={parsed.value} depth={0} mode={expand.mode} />
              </ul>
            ) : (
              <ErrorMessage>
                {parsed.error.message} (line {parsed.error.line}, column {parsed.error.column})
              </ErrorMessage>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function initiallyOpen(mode: ExpandMode, depth: number): boolean {
  return mode.kind === 'all' ? true : mode.kind === 'none' ? depth === 0 : depth < 2
}

function TreeNode({
  name,
  path,
  value,
  depth,
  mode,
}: {
  name: string
  path: string
  value: JsonValue
  depth: number
  mode: ExpandMode
}) {
  const [open, setOpen] = useState(() => initiallyOpen(mode, depth))
  const [limit, setLimit] = useState(PAGE)
  const isContainer = value !== null && typeof value === 'object'

  const label = (
    <>
      <span className="tree-key">{name}</span>
      <span className="tree-colon">: </span>
    </>
  )
  const copyPath = <CopyButton text={path} label="path" className="tree-copy" what={`path ${path}`} />

  if (!isContainer) {
    return (
      <li className="tree-leaf">
        {label}
        <Primitive value={value} />
        {copyPath}
      </li>
    )
  }

  const entries: [string | number, JsonValue][] = Array.isArray(value)
    ? value.map((v, i) => [i, v])
    : Object.entries(value)
  const summary = Array.isArray(value) ? `Array[${value.length}]` : `Object{${entries.length}}`

  return (
    <li className="tree-branch">
      <button
        type="button"
        className="tree-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${name} (${summary})`}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {label}
      <span className="tree-type">{summary}</span>
      {copyPath}
      {open && entries.length > 0 && (
        <ul>
          {entries.slice(0, limit).map(([k, v]) => (
            <TreeNode
              key={String(k)}
              name={typeof k === 'number' ? `[${k}]` : k}
              path={joinPath(path, k)}
              value={v}
              depth={depth + 1}
              mode={mode}
            />
          ))}
          {entries.length > limit && (
            <li>
              <button type="button" className="btn btn-small" onClick={() => setLimit((l) => l + PAGE * 5)}>
                Show more ({(entries.length - limit).toLocaleString()} remaining)
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

function Primitive({ value }: { value: JsonValue }) {
  if (value === null) return <span className="tree-null">null</span>
  switch (typeof value) {
    case 'string':
      return <span className="tree-string">{JSON.stringify(value)}</span>
    case 'number':
      return <span className="tree-number">{String(value)}</span>
    case 'boolean':
      return <span className="tree-boolean">{String(value)}</span>
    default:
      return null
  }
}
