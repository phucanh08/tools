import { useId, type ReactNode } from 'react'

export interface Option<T extends string | number> {
  value: T
  label: ReactNode
  title?: string
}

/** Single-choice button group (a radio group). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  hideLabel?: boolean
}) {
  const id = useId()
  return (
    <div className="control">
      <span id={id} className={hideLabel ? 'visually-hidden' : 'control-label'}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            title={o.title}
            className={o.value === value ? 'active' : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  title,
}: {
  label: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <label className="checkbox" title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="control">
      <label htmlFor={id} className="control-label">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const found = options.find((o) => String(o.value) === e.target.value)
          if (found) onChange(found.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {typeof o.label === 'string' ? o.label : String(o.value)}
          </option>
        ))}
      </select>
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
  width,
  autoComplete = 'off',
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'password' | 'number' | 'search'
  mono?: boolean
  width?: string
  autoComplete?: string
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="control" style={width ? { width } : undefined}>
      <label htmlFor={id} className="control-label">
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={mono ? 'input mono' : 'input'}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete={autoComplete}
        autoCapitalize="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  width = '8rem',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  width?: string
}) {
  const id = useId()
  return (
    <div className="control" style={{ width }}>
      <label htmlFor={id} className="control-label">
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="input"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </div>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>
}
