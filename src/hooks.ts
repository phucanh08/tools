import { useEffect, useState } from 'react'

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name
  return String(e)
}

/** Runs a synchronous computation and captures a thrown error as a message. */
export function attempt<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() }
  } catch (e) {
    return { ok: false, error: errorMessage(e) }
  }
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: string }

export interface AsyncValue<T> {
  /** Last settled result (may belong to a previous input while pending). */
  result: Settled<T> | null
  /** True while the current task has not settled yet. */
  pending: boolean
}

/**
 * Runs an async task whenever its identity changes (memoize it with
 * useCallback) and keeps the latest result. Stale results are ignored.
 * Pass null to clear.
 */
export function useAsyncValue<T>(task: (() => Promise<T>) | null): AsyncValue<T> {
  const [state, setState] = useState<{ task: unknown; result: Settled<T> } | null>(null)
  useEffect(() => {
    if (!task) return
    let live = true
    task().then(
      (value) => {
        if (live) setState({ task, result: { ok: true, value } })
      },
      (e: unknown) => {
        if (live) setState({ task, result: { ok: false, error: errorMessage(e) } })
      },
    )
    return () => {
      live = false
    }
  }, [task])
  if (!task) return { result: null, pending: false }
  return { result: state?.result ?? null, pending: state?.task !== task }
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/** Current time in ms, refreshed every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
