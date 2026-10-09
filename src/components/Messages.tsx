import type { ReactNode } from 'react'

export function ErrorMessage({ children, title }: { children: ReactNode; title?: string }) {
  if (children === null || children === undefined || children === '' || children === false) return null
  return (
    <div className="msg msg-error" role="alert">
      {title && <strong>{title}: </strong>}
      {children}
    </div>
  )
}

export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'ok' }) {
  return (
    <div className={`msg msg-${kind}`} role={kind === 'warn' ? 'status' : undefined}>
      {children}
    </div>
  )
}

/** Large, unambiguous valid/invalid indicator. */
export function Verdict({ valid, validText = 'Valid', invalidText = 'Invalid' }: { valid: boolean; validText?: string; invalidText?: string }) {
  return (
    <div className={`verdict ${valid ? 'verdict-ok' : 'verdict-bad'}`} role="status">
      <span aria-hidden="true">{valid ? '✓' : '✗'}</span> {valid ? validText : invalidText}
    </div>
  )
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  )
}
