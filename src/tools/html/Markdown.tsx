import { marked } from 'marked'
import { useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { downloadText } from '../../components/download'
import { ErrorMessage } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { attempt, useDebounced } from '../../hooks'
import { InertFrame } from './SandboxFrames'

const SAMPLE = `# Markdown preview

Write **GitHub-flavored** Markdown on the left.

- [x] Task lists
- [ ] Tables
- \`inline code\` and ~~strikethrough~~

| Tool | Runs locally |
| ---- | :----------: |
| Markdown | ✓ |

\`\`\`js
console.log('hello')
\`\`\`
`

const PREVIEW_CSS = `body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:1rem 1.25rem;color:#1f2328;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}a{color:#58a6ff}code,pre{background:#161b22!important}th,td{border-color:#30363d!important}}
pre{background:#f6f8fa;padding:.75rem;border-radius:6px;overflow:auto}code{background:#f6f8fa;padding:.1em .3em;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}pre code{padding:0}
table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:.3rem .6rem}img{max-width:100%}blockquote{margin:0;padding-left:1rem;border-left:4px solid #d0d7de;color:#656d76}`

export default function Markdown() {
  const [md, setMd] = useState(SAMPLE)
  const [breaks, setBreaks] = useState(false)
  const [view, setView] = useState<'preview' | 'html'>('preview')
  const debounced = useDebounced(md, 200)

  const result = attempt(() => marked.parse(debounced, { gfm: true, breaks, async: false }))
  const html = result.ok ? result.value : ''
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${PREVIEW_CSS}</style></head><body>${html}</body></html>`

  return (
    <div className="tool">
      <Toolbar>
        <Segmented
          label="Output"
          value={view}
          onChange={setView}
          options={[
            { value: 'preview', label: 'Preview' },
            { value: 'html', label: 'HTML source' },
          ]}
        />
        <Checkbox label="Line breaks as <br>" checked={breaks} onChange={setBreaks} />
        <button type="button" className="btn" disabled={!html} onClick={() => downloadText(html, 'document.html', 'text/html;charset=utf-8')}>
          Download HTML
        </button>
      </Toolbar>
      <div className="panes">
        <TextPane label="Markdown" value={md} onChange={setMd} rows={24} mono />
        {view === 'html' ? (
          <TextPane label="HTML" value={html} rows={24} wrap={false} />
        ) : (
          <div className="pane">
            <div className="pane-header">
              <span className="pane-label">Preview</span>
            </div>
            <InertFrame html={doc} title="Markdown preview" />
          </div>
        )}
      </div>
      {!result.ok && <ErrorMessage>{result.error}</ErrorMessage>}
      <p className="muted small">Raw HTML in the Markdown is passed through. The preview is sandboxed with scripts disabled.</p>
    </div>
  )
}
