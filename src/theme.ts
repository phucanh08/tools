// Theme preference: 'light' | 'dark' stored in localStorage('theme');
// 'system' = no stored value (follow prefers-color-scheme). Must stay
// consistent with public/theme-init.js, which applies it before first paint.
import { useCallback, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'

function readPref(): ThemePref {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
  try {
    if (pref === 'system') localStorage.removeItem('theme')
    else localStorage.setItem('theme', pref)
  } catch {
    /* storage unavailable: still applied for this page view */
  }
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readPref)
  const set = useCallback((p: ThemePref) => {
    applyTheme(p)
    setPref(p)
  }, [])
  return [pref, set]
}
