import { useState } from 'react'
import { Checkbox, NumberField, Toolbar } from '../../components/controls'
import { CopyButton } from '../../components/CopyButton'
import { ErrorMessage } from '../../components/Messages'
import { attempt } from '../../hooks'
import { generatePassword, passwordEntropyBits, type CharsetName, type PasswordOptions } from '../../lib/crypto/random'

const SETS: { name: CharsetName; label: string }[] = [
  { name: 'lower', label: 'a–z' },
  { name: 'upper', label: 'A–Z' },
  { name: 'digits', label: '0–9' },
  { name: 'symbols', label: '!@#$…' },
]

interface Options extends PasswordOptions {
  count: number
}

function generate(o: Options) {
  return attempt(() => Array.from({ length: o.count }, () => generatePassword(o)))
}

function strength(bits: number): { label: string; cls: string } {
  if (bits < 50) return { label: 'Weak', cls: 'weak' }
  if (bits < 80) return { label: 'Fair', cls: 'fair' }
  if (bits < 128) return { label: 'Strong', cls: 'strong' }
  return { label: 'Very strong', cls: 'strong' }
}

export default function Password() {
  const [opts, setOpts] = useState<Options>({ length: 20, sets: ['lower', 'upper', 'digits', 'symbols'], excludeAmbiguous: false, count: 5 })
  const [result, setResult] = useState(() => generate(opts))

  const update = (patch: Partial<Options>) => {
    const next = { ...opts, ...patch }
    setOpts(next)
    if (Number.isInteger(next.count) && next.count >= 1 && next.count <= 100) setResult(generate(next))
  }
  const toggleSet = (name: CharsetName, on: boolean) =>
    update({ sets: SETS.map((s) => s.name).filter((n) => (n === name ? on : opts.sets.includes(n))) })

  const bits = passwordEntropyBits(opts)
  const s = strength(bits)

  return (
    <div className="tool">
      <Toolbar>
        <div className="control">
          <label className="control-label" htmlFor="pw-length">
            Length: {opts.length}
          </label>
          <input
            id="pw-length"
            type="range"
            min={4}
            max={128}
            value={opts.length}
            onChange={(e) => update({ length: e.target.valueAsNumber })}
          />
        </div>
        <NumberField label="Count" value={opts.count} onChange={(count) => update({ count })} min={1} max={100} width="6rem" />
      </Toolbar>
      <Toolbar>
        {SETS.map((set) => (
          <Checkbox key={set.name} label={set.label} checked={opts.sets.includes(set.name)} onChange={(on) => toggleSet(set.name, on)} />
        ))}
        <Checkbox label="Exclude ambiguous (Il1O0o…)" checked={!!opts.excludeAmbiguous} onChange={(excludeAmbiguous) => update({ excludeAmbiguous })} />
        <button type="button" className="btn btn-primary" onClick={() => setResult(generate(opts))}>
          ↻ Generate
        </button>
      </Toolbar>
      <p className="entropy">
        Entropy: <strong>{Math.round(bits)} bits</strong> <span className={`badge strength-${s.cls}`}>{s.label}</span>
      </p>
      {result.ok ? (
        <>
          <ul className="output-list mono">
            {result.value.map((p, i) => (
              <li key={i}>
                <span className="break">{p}</span>
                <CopyButton text={p} what={`password ${i + 1}`} />
              </li>
            ))}
          </ul>
          {result.value.length > 1 && <CopyButton text={result.value.join('\n')} label="Copy all" className="btn" />}
        </>
      ) : (
        <ErrorMessage>{result.error}</ErrorMessage>
      )}
    </div>
  )
}
