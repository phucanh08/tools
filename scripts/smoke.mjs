// Smoke test for the production build: checks the static files GitHub Pages
// will serve, then starts Vite's preview server and fetches the home page, a
// deep link and a static asset.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startPreview } from './preview-server.mjs'

const dist = 'dist'
const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`)
  process.exitCode = 1
}

const must = (file) => {
  if (!existsSync(join(dist, file))) fail(`missing ${dist}/${file}`)
}
for (const f of ['index.html', '404.html', 'CNAME', 'sandbox.html', 'sandbox.js', 'theme-init.js', 'sitemap.xml']) must(f)
const cname = readFileSync(join(dist, 'CNAME'), 'utf8').trim()
if (cname !== 'tools.anhlp.com') fail(`CNAME is "${cname}"`)

const metaSrc = readFileSync('src/tools/meta.ts', 'utf8')
const ids = [...metaSrc.matchAll(/id: '([a-z0-9-]+\/[a-z0-9-]+)'/g)].map((m) => m[1])
if (ids.length < 20) fail(`expected >= 20 tool routes in meta.ts, found ${ids.length}`)
for (const id of ids) must(`${id}.html`)

const index = readFileSync(join(dist, 'index.html'), 'utf8')
if (!index.includes('Content-Security-Policy')) fail('CSP meta missing from index.html')
if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(index)) fail('inline script found in index.html (blocked by CSP)')

let preview
try {
  preview = await startPreview(4179)
  const base = preview.base
  const checks = [
    ['/', 'id="root"'],
    ['/json/format', 'JSON Formatter'],
    ['/crypto/aes.html', 'AES-GCM'],
    ['/sandbox.html', 'sandbox.js'],
  ]
  for (const [path, needle] of checks) {
    const r = await fetch(base + path)
    const body = await r.text()
    if (!r.ok) fail(`${path} -> HTTP ${r.status}`)
    else if (!body.includes(needle)) fail(`${path} does not contain "${needle}"`)
    else console.log(`ok  ${path} -> ${r.status}`)
  }
  const js = /src="(\/assets\/[^"]+\.js)"/.exec(index)?.[1]
  if (!js) fail('no entry script in index.html')
  else {
    const r = await fetch(base + js)
    if (!r.ok) fail(`${js} -> HTTP ${r.status}`)
    else console.log(`ok  ${js} -> ${r.status}`)
  }
} catch (e) {
  fail(e.message)
} finally {
  await preview
    ?.close()
    .then(() => console.log('ok  preview server closed, port 4179 free'))
    .catch((e) => fail(e.message))
}
if (!process.exitCode) console.log(`smoke: OK (${ids.length} tool routes)`)
