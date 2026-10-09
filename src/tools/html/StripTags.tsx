import { useState } from 'react'
import { Checkbox, Toolbar } from '../../components/controls'
import { TextPane } from '../../components/TextPane'
import { stripTags } from '../../lib/html'

export default function StripTags() {
  const [input, setInput] = useState('')
  const [keepLineBreaks, setKeepLineBreaks] = useState(true)
  const output = input ? stripTags(input, { keepLineBreaks }) : ''

  return (
    <div className="tool">
      <Toolbar>
        <Checkbox label="Keep line breaks (block elements, <br>)" checked={keepLineBreaks} onChange={setKeepLineBreaks} />
      </Toolbar>
      <div className="panes">
        <TextPane label="HTML" value={input} onChange={setInput} placeholder="<p>Hello <b>world</b></p>" rows={20} />
        <TextPane label="Plain text" value={output} rows={20} mono={false} />
      </div>
      <p className="muted small">Parsed with the browser's inert DOMParser: scripts never run and images are not loaded.</p>
    </div>
  )
}
