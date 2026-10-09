import { useState } from 'react'
import { Checkbox, Toolbar } from '../../components/controls'
import { Notice } from '../../components/Messages'
import { TextPane } from '../../components/TextPane'
import { useDebounced } from '../../hooks'
import { InertFrame, ScriptFrame } from './SandboxFrames'

const SAMPLE = `<!doctype html>
<html>
<head>
<style>
  body { font-family: system-ui, sans-serif; padding: 1rem; }
  h1 { color: #4f46e5; }
</style>
</head>
<body>
  <h1>Hello!</h1>
  <p>Edit the HTML on the left.</p>
  <button id="b">Click me</button>
  <script>
    document.getElementById('b').addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<p>Scripts are running.</p>')
    })
  </script>
</body>
</html>`

export default function HtmlPreview() {
  const [html, setHtml] = useState(SAMPLE)
  const [scripts, setScripts] = useState(false)
  const debounced = useDebounced(html, 400)

  return (
    <div className="tool">
      <Toolbar>
        <Checkbox label="Run scripts" checked={scripts} onChange={setScripts} />
        <span className="muted small">
          {scripts
            ? 'Scripts run in an isolated sandbox (separate origin, no access to this site or its storage).'
            : 'Scripts are disabled. The preview cannot run code or submit forms.'}
        </span>
      </Toolbar>
      <div className="panes">
        <TextPane label="HTML" value={html} onChange={setHtml} rows={24} wrap={false} />
        <div className="pane">
          <div className="pane-header">
            <span className="pane-label">Preview</span>
          </div>
          {scripts ? (
            <ScriptFrame key={debounced} html={debounced} title="HTML preview (scripts enabled)" />
          ) : (
            <InertFrame html={debounced} title="HTML preview" />
          )}
        </div>
      </div>
      <Notice>External resources (stylesheets, scripts, fonts) may be blocked by this site's security policy.</Notice>
    </div>
  )
}
