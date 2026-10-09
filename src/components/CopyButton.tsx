import { useEffect, useState } from 'react'

interface Props {
  text: string
  label?: string
  className?: string
  disabled?: boolean
  /** Accessible description of what is copied, e.g. "public key". */
  what?: string
}

export function CopyButton({ text, label = 'Copy', className = 'btn btn-small', disabled, what }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), state === 'copied' ? 1500 : 4000)
    return () => clearTimeout(t)
  }, [state])

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      disabled={disabled || text === ''}
      aria-label={what ? `${label} ${what}` : undefined}
      title={state === 'failed' ? 'Clipboard access was denied. Select the text and copy it manually.' : undefined}
    >
      <span aria-live="polite">{state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed' : label}</span>
    </button>
  )
}
