// JSON helpers: strict parsing with precise error locations, formatting, diff.

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface JsonError {
  message: string
  /** 0-based character offset */
  offset: number
  /** 1-based */
  line: number
  /** 1-based */
  column: number
}

export type ParseResult = { ok: true; value: JsonValue } | { ok: false; error: JsonError }

export class JsonSyntaxError extends Error {
  readonly offset: number
  constructor(message: string, offset: number) {
    super(message)
    this.offset = offset
  }
}

export function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let lastNewline = -1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++
      lastNewline = i
    }
  }
  return { line, column: offset - lastNewline }
}

/**
 * Strict RFC 8259 validator used to locate errors precisely (engine-specific
 * JSON.parse messages differ and Safari gives no position at all).
 */
function validateJson(text: string): void {
  let i = 0
  const n = text.length
  const describe = (pos: number) =>
    pos >= n ? 'end of input' : `"${text[pos] === '\n' ? '\\n' : text[pos]}"`
  const fail = (msg: string, pos = i): never => {
    throw new JsonSyntaxError(msg, pos)
  }
  const ws = () => {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++
      else break
    }
  }
  const value = (depth: number): void => {
    if (depth > 10000) fail('Nesting too deep')
    ws()
    const c = text[i]
    if (c === '{') return object(depth)
    if (c === '[') return array(depth)
    if (c === '"') return string()
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return number()
    for (const lit of ['true', 'false', 'null']) {
      if (text.startsWith(lit, i)) {
        i += lit.length
        return
      }
    }
    if (c === "'") fail('Strings must use double quotes')
    if (c === undefined) fail('Unexpected end of input, expected a value')
    fail(`Unexpected ${describe(i)}, expected a value`)
  }
  const object = (depth: number) => {
    i++ // {
    ws()
    if (text[i] === '}') {
      i++
      return
    }
    for (;;) {
      ws()
      if (text[i] !== '"') {
        if (text[i] === '}') fail('Trailing comma is not allowed in JSON')
        fail(`Unexpected ${describe(i)}, expected a double-quoted property name`)
      }
      string()
      ws()
      if (text[i] !== ':') fail(`Unexpected ${describe(i)}, expected ":" after property name`)
      i++
      value(depth + 1)
      ws()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === '}') {
        i++
        return
      }
      fail(`Unexpected ${describe(i)}, expected "," or "}" after property value`)
    }
  }
  const array = (depth: number) => {
    i++ // [
    ws()
    if (text[i] === ']') {
      i++
      return
    }
    for (;;) {
      value(depth + 1)
      ws()
      if (text[i] === ',') {
        i++
        ws()
        if (text[i] === ']') fail('Trailing comma is not allowed in JSON')
        continue
      }
      if (text[i] === ']') {
        i++
        return
      }
      fail(`Unexpected ${describe(i)}, expected "," or "]" after array element`)
    }
  }
  const string = () => {
    const start = i
    i++ // opening quote
    while (i < n) {
      const c = text.charCodeAt(i)
      if (c === 0x22) {
        i++
        return
      }
      if (c === 0x5c) {
        const e = text[i + 1]
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail('Invalid \\u escape (expected 4 hex digits)')
          i += 6
        } else if (e !== undefined && '"\\/bfnrt'.includes(e)) {
          i += 2
        } else {
          fail(`Invalid escape sequence "\\${e ?? ''}"`)
        }
        continue
      }
      if (c < 0x20) fail('Unescaped control character in string (use \\n, \\t, ...)')
      i++
    }
    fail('Unterminated string', start)
  }
  const number = () => {
    const start = i
    if (text[i] === '-') i++
    if (text[i] === '0') {
      i++
      if (text[i] !== undefined && /[0-9]/.test(text[i]!)) fail('Leading zeros are not allowed in numbers')
    } else if (text[i] !== undefined && /[1-9]/.test(text[i]!)) {
      while (i < n && /[0-9]/.test(text[i]!)) i++
    } else {
      fail('Invalid number', start)
    }
    if (text[i] === '.') {
      i++
      if (!/[0-9]/.test(text[i] ?? '')) fail('Expected digit after decimal point')
      while (i < n && /[0-9]/.test(text[i]!)) i++
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++
      if (text[i] === '+' || text[i] === '-') i++
      if (!/[0-9]/.test(text[i] ?? '')) fail('Expected digit in exponent')
      while (i < n && /[0-9]/.test(text[i]!)) i++
    }
  }

  // Byte-order mark is tolerated by neither JSON.parse nor the spec for texts.
  value(0)
  ws()
  if (i < n) fail(`Unexpected ${describe(i)} after the JSON value`)
}

export function parseJson(text: string): ParseResult {
  if (text.trim() === '') {
    return { ok: false, error: { message: 'Input is empty', offset: 0, line: 1, column: 1 } }
  }
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue }
  } catch (nativeError) {
    try {
      validateJson(text)
    } catch (e) {
      if (e instanceof JsonSyntaxError) {
        const { line, column } = offsetToLineColumn(text, e.offset)
        return { ok: false, error: { message: e.message, offset: e.offset, line, column } }
      }
    }
    // Validator accepted what JSON.parse rejected (should not happen): fall back.
    return {
      ok: false,
      error: { message: (nativeError as Error).message, offset: 0, line: 1, column: 1 },
    }
  }
}

/** Throws an Error whose message includes line/column. */
export function parseJsonOrThrow(text: string, label = 'JSON'): JsonValue {
  const r = parseJson(text)
  if (r.ok) return r.value
  throw new Error(`${label}: ${r.error.message} (line ${r.error.line}, column ${r.error.column})`)
}

export function sortKeysDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    // fromEntries defines own properties, so a "__proto__" key stays a plain key.
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeysDeep(value[k]!)]),
    )
  }
  return value
}

export type Indent = 2 | 4 | '\t'

export function formatJson(value: JsonValue, indent: Indent = 2, sortKeys = false): string {
  return JSON.stringify(sortKeys ? sortKeysDeep(value) : value, null, indent)
}

export function minifyJson(value: JsonValue): string {
  return JSON.stringify(value)
}

// ---------------------------------------------------------------------------
// Diff

export type DiffKind = 'added' | 'removed' | 'changed' | 'type'

export interface DiffEntry {
  path: string
  kind: DiffKind
  before?: JsonValue
  after?: JsonValue
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`
  return IDENT.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`
}

function jsonType(v: JsonValue): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

export function diffJson(a: JsonValue, b: JsonValue, path = '$'): DiffEntry[] {
  const ta = jsonType(a)
  const tb = jsonType(b)
  if (ta !== tb) return [{ path, kind: 'type', before: a, after: b }]
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: DiffEntry[] = []
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const p = joinPath(path, i)
      if (i >= a.length) out.push({ path: p, kind: 'added', after: b[i]! })
      else if (i >= b.length) out.push({ path: p, kind: 'removed', before: a[i]! })
      else out.push(...diffJson(a[i]!, b[i]!, p))
    }
    return out
  }
  if (ta === 'object' && a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ao = a as { [key: string]: JsonValue }
    const bo = b as { [key: string]: JsonValue }
    const out: DiffEntry[] = []
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)])
    for (const k of keys) {
      const p = joinPath(path, k)
      const inA = Object.hasOwn(ao, k)
      const inB = Object.hasOwn(bo, k)
      if (!inA) out.push({ path: p, kind: 'added', after: bo[k]! })
      else if (!inB) out.push({ path: p, kind: 'removed', before: ao[k]! })
      else out.push(...diffJson(ao[k]!, bo[k]!, p))
    }
    return out
  }
  return a === b ? [] : [{ path, kind: 'changed', before: a, after: b }]
}
