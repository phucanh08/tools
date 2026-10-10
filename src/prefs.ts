// Small persisted UI preferences (sidebar collapse, closed menu groups).
// Storage may be unavailable (privacy modes); failures fall back to defaults.
import { CATEGORIES, type CategoryId } from './tools/meta'

const COLLAPSED_KEY = 'sider-collapsed'
const CLOSED_KEY = 'nav-closed'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: keep the in-memory state only */
  }
}

export function readCollapsed(): boolean {
  return read(COLLAPSED_KEY) === '1'
}

export function writeCollapsed(collapsed: boolean): void {
  write(COLLAPSED_KEY, collapsed ? '1' : null)
}

/** Parses the stored list of closed menu groups, ignoring anything that is not a known category id. */
export function parseClosedGroups(raw: string | null): CategoryId[] {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const known = new Set<string>(CATEGORIES.map((c) => c.id))
  return [...new Set(value.filter((v): v is CategoryId => typeof v === 'string' && known.has(v)))]
}

export function readClosedGroups(): CategoryId[] {
  return parseClosedGroups(read(CLOSED_KEY))
}

export function writeClosedGroups(ids: readonly CategoryId[]): void {
  write(CLOSED_KEY, ids.length ? JSON.stringify(ids) : null)
}
