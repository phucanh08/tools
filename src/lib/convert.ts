// JSON <-> YAML and JSON <-> CSV conversions.
import Papa from 'papaparse'
import { parseAllDocuments, stringify as yamlStringify, YAMLError } from 'yaml'
import type { JsonValue } from './json'

export function jsonToYaml(value: JsonValue, indent = 2): string {
  return yamlStringify(value, { indent, lineWidth: 0, aliasDuplicateObjects: false })
}

/**
 * Parses YAML (1.2 core schema). Multiple documents become a JSON array.
 * Throws an Error with line/column on syntax errors.
 */
export function yamlToJson(text: string): JsonValue {
  const docs = parseAllDocuments(text, { prettyErrors: true })
  if (!Array.isArray(docs)) {
    // EmptyStream
    return null
  }
  const values: JsonValue[] = []
  for (const doc of docs) {
    const err = doc.errors[0]
    if (err) throw new Error(yamlErrorMessage(err))
    values.push(doc.toJS({ maxAliasCount: 1000 }) as JsonValue)
  }
  if (values.length === 0) return null
  return values.length === 1 ? values[0]! : values
}

function yamlErrorMessage(err: YAMLError): string {
  const pos = err.linePos?.[0]
  const firstLine = err.message.split('\n')[0] ?? err.message
  return pos ? `${firstLine.replace(/ at line \d+, column \d+:?$/, '')} (line ${pos.line}, column ${pos.col})` : firstLine
}

export interface JsonToCsvOptions {
  delimiter?: string
  /** Flatten nested objects into dotted column names (a.b.c). */
  flatten?: boolean
}

function flattenObject(obj: { [key: string]: JsonValue }, prefix = '', out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
      flattenObject(v, key, out)
    } else {
      out[key] = v
    }
  }
  return out
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function jsonToCsv(value: JsonValue, opts: JsonToCsvOptions = {}): string {
  const { delimiter = ',', flatten = true } = opts
  const rows: JsonValue[] = Array.isArray(value) ? value : [value]
  if (rows.length === 0) return ''
  const records: Record<string, unknown>[] = rows.map((row, i) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      if (Array.isArray(row)) {
        return Object.fromEntries(row.map((v, j) => [String(j), v]))
      }
      throw new Error(`Item ${i} is not an object; expected an array of objects`)
    }
    return flatten ? flattenObject(row) : { ...row }
  })
  const fields: string[] = []
  const seen = new Set<string>()
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k)
        fields.push(k)
      }
    }
  }
  const data = records.map((r) => fields.map((f) => cell(r[f])))
  return Papa.unparse({ fields, data }, { delimiter, newline: '\n', escapeFormulae: false })
}

export interface CsvToJsonOptions {
  /** Convert numbers/booleans/null. Default true. */
  inferTypes?: boolean
  /** Rebuild nested objects from dotted headers. Default false. */
  unflatten?: boolean
  delimiter?: string
}

function inferValue(s: string): JsonValue {
  if (s === '') return null
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s)
    // Keep large integers / long decimals as strings to avoid precision loss.
    if (Number.isFinite(n) && (String(n) === s || !/^-?\d{16,}$/.test(s))) return n
  }
  return s
}

function setPath(target: Record<string, JsonValue>, path: string, value: JsonValue) {
  const parts = path.split('.')
  let cur: Record<string, JsonValue> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!
    const next = cur[p]
    if (next === undefined || next === null || typeof next !== 'object' || Array.isArray(next)) {
      const created: Record<string, JsonValue> = {}
      Object.defineProperty(cur, p, { value: created, enumerable: true, writable: true, configurable: true })
      cur = created
    } else {
      cur = next as Record<string, JsonValue>
    }
  }
  Object.defineProperty(cur, parts[parts.length - 1]!, { value, enumerable: true, writable: true, configurable: true })
}

export function csvToJson(text: string, opts: CsvToJsonOptions = {}): JsonValue[] {
  const { inferTypes = true, unflatten = false, delimiter = '' } = opts
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    header: false,
    skipEmptyLines: 'greedy',
    delimiter,
  })
  const fatal = result.errors.find((e) => e.type === 'Quotes')
  if (fatal) throw new Error(`CSV: ${fatal.message} (row ${(fatal.row ?? 0) + 1})`)
  const [header, ...rows] = result.data
  if (!header) return []
  return rows.map((row) => {
    const obj: Record<string, JsonValue> = {}
    header.forEach((h, i) => {
      const raw = row[i] ?? ''
      const v = inferTypes ? inferValue(raw) : raw
      if (unflatten && h.includes('.')) setPath(obj, h, v)
      else Object.defineProperty(obj, h, { value: v, enumerable: true, writable: true, configurable: true })
    })
    return obj
  })
}
