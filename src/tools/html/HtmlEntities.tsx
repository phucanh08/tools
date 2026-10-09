import { useState } from 'react'
import { Checkbox, Segmented, Toolbar } from '../../components/controls'
import { TextPane } from '../../components/TextPane'
import { decodeEntities, encodeEntities, type EntityMode } from '../../lib/html'

export default function HtmlEntities() {
  const [mode, setMode] = useState<'encode' | 'decode'>('encode')
  const [scope, setScope] = useState<EntityMode>('minimal')
  const [named, setNamed] = useState(true)
  const [input, setInput] = useState('')
  const output = mode === 'encode' ? encodeEntities(input, scope, named) : decodeEntities(input)

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
        {mode === 'encode' && (
          <>
            <Segmented
              label="Encode"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'minimal', label: 'Special chars', title: '& < > " \' only' },
                { value: 'non-ascii', label: '+ Non-ASCII' },
                { value: 'all', label: 'Everything' },
              ]}
            />
            <Checkbox label="Named references (&amp;eacute;)" checked={named} onChange={setNamed} disabled={scope === 'minimal'} />
          </>
        )}
        <button
          type="button"
          className="btn"
          disabled={!output}
          onClick={() => {
            setInput(output)
            setMode(mode === 'encode' ? 'decode' : 'encode')
          }}
        >
          ⇄ Swap
        </button>
      </Toolbar>
      <div className="panes">
        <TextPane label={mode === 'encode' ? 'Text' : 'HTML with entities'} value={input} onChange={setInput} />
        <TextPane label={mode === 'encode' ? 'Encoded' : 'Decoded'} value={output} />
      </div>
    </div>
  )
}
