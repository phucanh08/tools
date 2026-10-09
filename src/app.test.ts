import { describe, expect, it } from 'vitest'
import { normalizePath, routableHref } from './router'
import { CATEGORIES, TOOLS } from './tools/meta'
import { TOOL_LOADERS } from './tools/registry'
import { filterTools, findTool, groupByCategory } from './tools/search'

describe('tool registry', () => {
  it('has an icon for every tool and category', () => {
    for (const item of [...TOOLS, ...CATEGORIES]) expect(item.icon.trim().length).toBeGreaterThan(0)
  })
  it('has a loader for every tool id and nothing else', () => {
    expect(Object.keys(TOOL_LOADERS).sort()).toEqual(TOOLS.map((t) => t.id).sort())
  })
  it('tool ids are unique', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length)
  })
})

describe('router', () => {
  it('normalizes paths', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('/index.html')).toBe('/')
    expect(normalizePath('/json/format/')).toBe('/json/format')
    expect(normalizePath('/json/format.html')).toBe('/json/format')
    expect(normalizePath('/crypto/aes.HTML')).toBe('/crypto/aes')
  })

  const loc = { origin: 'https://tools.anhlp.com', pathname: '/json/format' }
  const a = (href: string, attrs: Record<string, string> = {}, target = '') => ({
    href,
    target,
    hasAttribute: (n: string) => n in attrs,
  })
  it('routes same-origin page links only', () => {
    expect(routableHref(a('https://tools.anhlp.com/crypto/aes'), loc)).toBe('/crypto/aes')
    expect(routableHref(a('https://tools.anhlp.com/?q=1'), loc)).toBe('/?q=1')
    expect(routableHref(a('https://example.com/crypto/aes'), loc)).toBeNull()
    expect(routableHref(a('https://tools.anhlp.com/crypto/aes', {}, '_blank'), loc)).toBeNull()
    expect(routableHref(a('https://tools.anhlp.com/x', { download: '' }), loc)).toBeNull()
    expect(routableHref(a('https://tools.anhlp.com/favicon.svg'), loc)).toBeNull()
    expect(routableHref(a('https://tools.anhlp.com/sandbox.html'), loc)).toBeNull()
    expect(routableHref(a('https://tools.anhlp.com/json/format#x'), loc)).toBeNull()
    expect(routableHref(a('blob:https://tools.anhlp.com/1234'), loc)).toBeNull()
  })
})

describe('search', () => {
  it('matches title, keywords and multiple terms', () => {
    expect(filterTools('').length).toBe(TOOLS.length)
    expect(filterTools('sha256').map((t) => t.id)).toContain('crypto/hash')
    expect(filterTools('JSON yaml').map((t) => t.id)).toEqual(['json/yaml'])
    expect(filterTools('zzzz-nothing')).toEqual([])
  })
  it('groups by category in category order', () => {
    const groups = groupByCategory(TOOLS)
    expect(groups.map((g) => g.category.id)).toEqual(['base64', 'json', 'html', 'crypto', 'misc'])
    expect(groups.reduce((n, g) => n + g.tools.length, 0)).toBe(TOOLS.length)
  })
  it('finds tools by path', () => {
    expect(findTool('/json/format')?.title).toBe('JSON Formatter')
    expect(findTool('/nope')).toBeUndefined()
  })
})
