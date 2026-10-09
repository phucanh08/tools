// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { stripTags } from './html'

describe('stripTags', () => {
  it('extracts text, drops scripts/styles, keeps block line breaks', () => {
    const html = `<html><head><style>p{color:red}</style></head><body>
      <h1>Title</h1><p>Hello <b>world</b> &amp; friends<br>next line</p>
      <script>alert(1)</script><ul><li>one</li><li>two</li></ul></body></html>`
    expect(stripTags(html)).toBe('Title\nHello world & friends\nnext line\none\ntwo')
  })
  it('can collapse to a single line', () => {
    expect(stripTags('<p>a</p><p>b  c</p>', { keepLineBreaks: false })).toBe('a b c')
  })
})
