// Generate TypeScript declarations from sample JSON values.
import type { JsonValue } from './json'

interface Collected {
  primitives: Set<'string' | 'number' | 'boolean' | 'null'>
  objects: { [key: string]: JsonValue }[]
  arrays: JsonValue[][]
}

function collect(values: JsonValue[]): Collected {
  const c: Collected = { primitives: new Set(), objects: [], arrays: [] }
  for (const v of values) {
    if (v === null) c.primitives.add('null')
    else if (Array.isArray(v)) c.arrays.push(v)
    else if (typeof v === 'object') c.objects.push(v)
    else c.primitives.add(typeof v as 'string' | 'number' | 'boolean')
  }
  return c
}

const VALID_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function pascalCase(s: string): string {
  const words = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean)
  let out = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('')
  if (!out) out = 'Item'
  if (/^[0-9]/.test(out)) out = `T${out}`
  return out
}

function singular(name: string): string {
  if (/ies$/.test(name) && name.length > 4) return name.slice(0, -3) + 'y'
  if (/(ss|us|is)$/.test(name)) return name
  if (/s$/.test(name) && name.length > 3) return name.slice(0, -1)
  return name
}

export interface TsOptions {
  rootName?: string
  /** Use `type X = {...}` instead of `interface X {...}`. */
  useTypeAlias?: boolean
  readonly?: boolean
}

export function jsonToTypeScript(value: JsonValue, opts: TsOptions = {}): string {
  const { rootName = 'Root', useTypeAlias = false, readonly = false } = opts
  const declarations: { name: string; body: string }[] = []
  const usedNames = new Set<string>()
  const bodyToName = new Map<string, string>()

  const uniqueName = (base: string) => {
    let name = base
    let i = 2
    while (usedNames.has(name)) name = `${base}${i++}`
    usedNames.add(name)
    return name
  }

  const objectType = (
    objects: { [key: string]: JsonValue }[],
    nameHint: string,
    fixedName?: string,
  ): string => {
    const keys: string[] = []
    const valuesByKey = new Map<string, JsonValue[]>()
    for (const o of objects) {
      for (const [k, v] of Object.entries(o)) {
        let list = valuesByKey.get(k)
        if (!list) {
          list = []
          valuesByKey.set(k, list)
          keys.push(k)
        }
        list.push(v)
      }
    }
    const lines = keys.map((k) => {
      const vals = valuesByKey.get(k)!
      const optional = vals.length < objects.length ? '?' : ''
      const key = VALID_IDENT.test(k) ? k : JSON.stringify(k)
      const ro = readonly ? 'readonly ' : ''
      return `  ${ro}${key}${optional}: ${typeOf(vals, pascalCase(k))}`
    })
    const body = lines.length ? `{\n${lines.join('\n')}\n}` : '{}'
    if (fixedName) {
      declarations.push({ name: fixedName, body: body === '{}' ? '__alias__Record<string, unknown>' : body })
      bodyToName.set(body, fixedName)
      return fixedName
    }
    if (body === '{}') return 'Record<string, unknown>'
    const existing = bodyToName.get(body)
    if (existing) return existing
    const name = uniqueName(nameHint)
    bodyToName.set(body, name)
    declarations.push({ name, body })
    return name
  }

  const typeOf = (values: JsonValue[], nameHint: string): string => {
    const c = collect(values)
    const parts: string[] = []
    for (const p of ['string', 'number', 'boolean'] as const) if (c.primitives.has(p)) parts.push(p)
    if (c.objects.length) parts.push(objectType(c.objects, nameHint))
    if (c.arrays.length) {
      const elements = c.arrays.flat()
      if (elements.length === 0) parts.push('unknown[]')
      else {
        const el = typeOf(elements, singular(nameHint))
        parts.push(el.includes(' | ') ? `(${el})[]` : `${el}[]`)
      }
    }
    if (c.primitives.has('null')) parts.push('null')
    if (parts.length === 0) return 'unknown'
    return parts.join(' | ')
  }

  const root = pascalCase(rootName)
  usedNames.add(root)
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    objectType([value], root, root)
  } else {
    const rootType = typeOf([value], `${root}Item`)
    declarations.push({ name: root, body: `__alias__${rootType}` })
  }

  const ordered = declarations.reverse()
  return (
    ordered
      .map(({ name, body }) => {
        if (body.startsWith('__alias__')) return `export type ${name} = ${body.slice(9)}`
        return useTypeAlias ? `export type ${name} = ${body}` : `export interface ${name} ${body}`
      })
      .join('\n\n') + '\n'
  )
}
