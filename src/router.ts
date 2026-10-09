// Tiny path-based router built on the History API (no hash routing).
import { useSyncExternalStore } from 'react'

const NAVIGATE_EVENT = 'app:navigate'

/** Normalizes a pathname: strips trailing slashes and a trailing ".html"; "/index" -> "/". */
export function normalizePath(pathname: string): string {
  let p = pathname
  try {
    p = decodeURI(p)
  } catch {
    /* keep raw */
  }
  p = p.replace(/\.html$/i, '').replace(/\/+$/, '')
  if (p === '' || p === '/index') return '/'
  return p.startsWith('/') ? p : `/${p}`
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAVIGATE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAVIGATE_EVENT, onChange)
  }
}

const getSnapshot = () => normalizePath(window.location.pathname)

/** Current normalized path; re-renders on navigation. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => '/')
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const url = new URL(to, window.location.href)
  const current = window.location.pathname + window.location.search + window.location.hash
  const next = url.pathname + url.search + url.hash
  if (next !== current) {
    if (opts.replace) window.history.replaceState(null, '', next)
    else window.history.pushState(null, '', next)
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
  if (!url.hash) window.scrollTo(0, 0)
}

/**
 * Decides whether a click on an anchor should be handled by the client-side
 * router. Returns the target path, or null to let the browser handle it.
 */
export function routableHref(
  anchor: { href: string; target: string; hasAttribute(name: string): boolean },
  location: { origin: string; pathname: string },
): string | null {
  if (!anchor.href || anchor.hasAttribute('download') || anchor.hasAttribute('data-native')) return null
  if (anchor.target && anchor.target !== '_self') return null
  let url: URL
  try {
    url = new URL(anchor.href)
  } catch {
    return null
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== location.origin) return null
  // Static files (e.g. /sandbox.html, /favicon.svg) are served as-is.
  if (/\.(?!html$)[a-z0-9]+$/i.test(url.pathname) || /\/sandbox\.html$/i.test(url.pathname)) return null
  // Same-page fragment links: let the browser scroll.
  if (url.hash && normalizePath(url.pathname) === normalizePath(location.pathname)) return null
  return url.pathname + url.search + url.hash
}

/** Installs a document-level click handler that routes same-origin links. */
export function interceptLinks(): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const anchor = (e.target as Element | null)?.closest?.('a')
    if (!anchor) return
    const to = routableHref(anchor, window.location)
    if (to === null) return
    e.preventDefault()
    navigate(to)
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
