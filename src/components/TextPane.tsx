import { useId, type ReactNode, type Ref } from 'react'
import { CopyButton } from './CopyButton'

interface Props {
  label: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  rows?: number
  readOnly?: boolean
  /** Monospace font (default true). */
  mono?: boolean
  invalid?: boolean
  /** Extra buttons in the pane header. */
  actions?: ReactNode
  /** Hide the Copy button. */
  noCopy?: boolean
  /** Text under the textarea (counts, notes). */
  footer?: ReactNode
  ref?: Ref<HTMLTextAreaElement>
  wrap?: boolean
}

/** Labeled textarea with Copy (and Clear when editable). */
export function TextPane({
  label,
  value,
  onChange,
  placeholder,
  rows = 12,
  readOnly = !onChange,
  mono = true,
  invalid = false,
  actions,
  noCopy = false,
  footer,
  ref,
  wrap = true,
}: Props) {
  const id = useId()
  return (
    <div className="pane">
      <div className="pane-header">
        <label htmlFor={id} className="pane-label">
          {label}
        </label>
        <div className="pane-actions">
          {actions}
          {!noCopy && <CopyButton text={value} what={label} />}
          {!readOnly && onChange && (
            <button type="button" className="btn btn-small" onClick={() => onChange('')} disabled={value === ''} aria-label={`Clear ${label}`}>
              Clear
            </button>
          )}
        </div>
      </div>
      <textarea
        id={id}
        ref={ref}
        className={`textarea${mono ? ' mono' : ''}${invalid ? ' invalid' : ''}${wrap ? '' : ' nowrap'}`}
        value={value}
        rows={rows}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        aria-invalid={invalid || undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      {footer && <div className="pane-footer">{footer}</div>}
    </div>
  )
}
