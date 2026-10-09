// HTML helpers. Entity handling uses `he` (full HTML5 named-reference table).
import he from 'he'

export type EntityMode = 'minimal' | 'non-ascii' | 'all'

export function encodeEntities(text: string, mode: EntityMode = 'minimal', named = true): string {
  if (mode === 'minimal') {
    return text.replace(/[&<>"']/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
    )
  }
  return he.encode(text, {
    useNamedReferences: named,
    encodeEverything: mode === 'all',
    allowUnsafeSymbols: false,
  })
}

export function decodeEntities(text: string): string {
  return he.decode(text)
}

const RAW_TEXT = ['pre', 'textarea', 'script', 'style']
const BLOCK_TAGS = new Set(
  (
    'html head body title meta link base script style noscript template ' +
    'address article aside blockquote details dialog dd div dl dt fieldset figcaption figure footer form ' +
    'h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section summary table thead tbody tfoot tr td th ' +
    'caption colgroup col ul option optgroup select br iframe video audio source canvas svg'
  ).split(' '),
)

/**
 * Conservative HTML minifier: removes comments (except conditional comments),
 * collapses whitespace runs, and drops whitespace adjacent to block-level tags.
 * Content of <pre>, <textarea>, <script> and <style> is preserved verbatim.
 */
/* eslint-disable no-control-regex -- NUL is used as an internal placeholder delimiter */
export function minifyHtml(html: string): string {
  const preserved: string[] = []
  const rawRe = new RegExp(`<(${RAW_TEXT.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi')
  // NUL is used as a placeholder delimiter below (and is a parse error in HTML anyway).
  let s = html.replace(/\u0000/g, '').replace(rawRe, (m) => {
    preserved.push(m)
    return `\u0000${preserved.length - 1}\u0000`
  })
  s = s.replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
  s = s.replace(/\s+/g, ' ')
  // Remove whitespace next to block-level tags (opening or closing).
  s = s.replace(/\s*(<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>)\s*/g, (m, tag: string, name: string) =>
    BLOCK_TAGS.has(name.toLowerCase()) ? tag : m,
  )
  s = s.replace(/\s*(<!doctype[^>]*>)\s*/gi, '$1')
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => preserved[Number(i)]!)
  return s.trim()
}
/* eslint-enable no-control-regex */

/**
 * Extract text from HTML. Uses DOMParser (inert: scripts never execute and
 * resources are not loaded). Block elements and <br> become line breaks.
 */
export function stripTags(html: string, opts: { keepLineBreaks?: boolean } = {}): string {
  const { keepLineBreaks = true } = opts
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript, template').forEach((el) => el.remove())
  const body = doc.body
  if (!body) return ''
  // Source whitespace is not significant in HTML (outside <pre>/<textarea>).
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('pre, textarea')) {
      node.textContent = (node.textContent ?? '').replace(/\s+/g, ' ')
    }
  }
  doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'))
  body.querySelectorAll('*').forEach((el) => {
    if (BLOCK_TAGS.has(el.tagName.toLowerCase())) el.append('\n')
  })
  const text = body.textContent ?? ''
  if (!keepLineBreaks) return text.replace(/\s+/g, ' ').trim()
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t\f\r]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
