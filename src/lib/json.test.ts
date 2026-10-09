import { describe, expect, it } from 'vitest'
import { csvToJson, jsonToCsv, jsonToYaml, yamlToJson } from './convert'
import { diffJson, formatJson, minifyJson, parseJson, type JsonValue } from './json'
import { jsonToTypeScript } from './json-to-ts'

describe('parseJson', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{"a":[1,2,{"b":null}]}')).toEqual({ ok: true, value: { a: [1, 2, { b: null }] } })
  })

  it.each([
    ['{"a": 1,}', 'Trailing comma', 1, 9],
    ['{\n  "a": 1\n  "b": 2\n}', 'expected "," or "}"', 3, 3],
    ["{'a': 1}", 'double-quoted property name', 1, 2],
    ['[1, 2', 'expected "," or "]"', 1, 6],
    ['{"a": tru}', 'expected a value', 1, 7],
    ['{"a": 01}', 'Leading zeros', 1, 8],
    ['"abc', 'Unterminated string', 1, 1],
    ['{"a": "x\ny"}', 'control character', 1, 9],
    ['{} x', 'after the JSON value', 1, 4],
    ['', 'empty', 1, 1],
  ])('reports %j with line/column', (text, msg, line, column) => {
    const r = parseJson(text)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.message).toContain(msg)
      expect([r.error.line, r.error.column]).toEqual([line, column])
    }
  })

  it('formats with indent choices, sorts keys, minifies', () => {
    const v = { b: 1, a: [true] } as JsonValue
    expect(formatJson(v, 2)).toBe('{\n  "b": 1,\n  "a": [\n    true\n  ]\n}')
    expect(formatJson(v, '\t', true)).toBe('{\n\t"a": [\n\t\ttrue\n\t],\n\t"b": 1\n}')
    expect(minifyJson(v)).toBe('{"b":1,"a":[true]}')
  })

  it('sortKeys keeps a "__proto__" key as data', () => {
    const r = parseJson('{"__proto__": {"x": 1}, "a": 2}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(formatJson(r.value, 2, true)).toContain('"__proto__"')
  })
})

describe('JSON <-> YAML', () => {
  it('round-trips', () => {
    const v = { name: 'tools', list: [1, 'two', { three: 3 }], nested: { ok: true, none: null }, s: 'a: b' }
    const yaml = jsonToYaml(v)
    expect(yaml).toContain('name: tools')
    expect(yamlToJson(yaml)).toEqual(v)
  })
  it('parses multi-document YAML into an array', () => {
    expect(yamlToJson('a: 1\n---\nb: 2\n')).toEqual([{ a: 1 }, { b: 2 }])
  })
  it('reports YAML errors with a line', () => {
    expect(() => yamlToJson('a: [1, 2\nb: 3')).toThrow(/line \d+/)
  })
})

describe('JSON <-> CSV', () => {
  it('converts an array of objects, quoting as needed, and back', () => {
    const v: JsonValue = [
      { id: 1, name: 'Alice, A.', note: 'say "hi"' },
      { id: 2, name: 'Bob', extra: true },
    ]
    const csv = jsonToCsv(v)
    expect(csv).toBe('id,name,note,extra\n1,"Alice, A.","say ""hi""",\n2,Bob,,true')
    expect(csvToJson(csv)).toEqual([
      { id: 1, name: 'Alice, A.', note: 'say "hi"', extra: null },
      { id: 2, name: 'Bob', note: null, extra: true },
    ])
  })
  it('flattens nested objects and unflattens them back', () => {
    const v = [{ a: { b: 1, c: 'x' }, tags: ['t1', 't2'] }]
    const csv = jsonToCsv(v)
    expect(csv).toBe('a.b,a.c,tags\n1,x,"[""t1"",""t2""]"')
    expect(csvToJson(csv, { unflatten: true })).toEqual([{ a: { b: 1, c: 'x' }, tags: '["t1","t2"]' }])
  })
  it('keeps values like zip codes and huge integers as strings', () => {
    expect(csvToJson('zip,big\n007,12345678901234567890')).toEqual([{ zip: '007', big: '12345678901234567890' }])
  })
  it('rejects non-object items', () => {
    expect(() => jsonToCsv([1, 2] as JsonValue)).toThrow(/not an object/)
  })
})

describe('JSON -> TypeScript', () => {
  it('generates nested interfaces with optional fields and unions', () => {
    const ts = jsonToTypeScript({
      id: 1,
      name: 'x',
      'first-name': 'y',
      tags: ['a'],
      users: [
        { id: 1, email: 'a@b.c', address: { city: 'HN' } },
        { id: 2, email: null },
      ],
      mixed: [1, 'a'],
      empty: [],
    })
    expect(ts).toBe(
      [
        'export interface Root {',
        '  id: number',
        '  name: string',
        '  "first-name": string',
        '  tags: string[]',
        '  users: User[]',
        '  mixed: (string | number)[]',
        '  empty: unknown[]',
        '}',
        '',
        'export interface User {',
        '  id: number',
        '  email: string | null',
        '  address?: Address',
        '}',
        '',
        'export interface Address {',
        '  city: string',
        '}',
        '',
      ].join('\n'),
    )
  })
  it('handles top-level arrays and primitives', () => {
    expect(jsonToTypeScript([{ a: 1 }])).toBe('export type Root = RootItem[]\n\nexport interface RootItem {\n  a: number\n}\n')
    expect(jsonToTypeScript('x')).toBe('export type Root = string\n')
  })
  it('deduplicates identical shapes and avoids name clashes with root', () => {
    const ts = jsonToTypeScript({ root: { a: 1 }, other: { a: 1 } })
    expect(ts).toContain('export interface Root {\n  root: Root2\n  other: Root2\n}')
  })
})

describe('diffJson', () => {
  it('lists added, removed, changed and type changes', () => {
    const a = { x: 1, y: [1, 2], z: { k: 'v' }, t: '1' }
    const b = { x: 2, y: [1], z: { k: 'v', n: true }, t: 1 }
    expect(diffJson(a, b)).toEqual([
      { path: '$.x', kind: 'changed', before: 1, after: 2 },
      { path: '$.y[1]', kind: 'removed', before: 2 },
      { path: '$.z.n', kind: 'added', after: true },
      { path: '$.t', kind: 'type', before: '1', after: 1 },
    ])
    expect(diffJson({ 'a b': 1 }, { 'a b': 1 })).toEqual([])
    expect(diffJson({ 'a b': 1 }, {})[0]!.path).toBe('$["a b"]')
  })
})
