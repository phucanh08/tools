// Real-browser check of the production build (local only, not run in CI).
// Starts `vite preview` on dist/, drives a headless Chrome via playwright-core,
// loads home + every tool route, records console errors / page errors / CSP
// violations / horizontal overflow, exercises key interactions and saves
// screenshots to .artifacts/screenshots/.
//
// Usage: pnpm build && pnpm browser
// Chrome path: $CHROME_PATH or /Applications/Google Chrome.app (macOS).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME =
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
    (p) => existsSync(p),
  )
if (!CHROME) throw new Error('Chrome not found; set CHROME_PATH')
if (!existsSync('dist/index.html')) throw new Error('dist/ missing; run pnpm build first')

const SHOTS = '.artifacts/screenshots'
mkdirSync(SHOTS, { recursive: true })

const metaSrc = readFileSync('src/tools/meta.ts', 'utf8')
const ids = [...metaSrc.matchAll(/id: '([a-z0-9-]+\/[a-z0-9-]+)'/g)].map((m) => m[1])

const port = 4180
const base = `http://localhost:${port}`
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOut = ''
preview.stdout.on('data', (d) => (serverOut += d))
preview.stderr.on('data', (d) => (serverOut += d))

const problems = []
const tolerated = new Set()
const fail = (msg) => {
  problems.push(msg)
  console.error(`FAIL ${msg}`)
}
const ok = (msg) => console.log(`ok   ${msg}`)

async function waitReady() {
  for (let i = 0; i < 75; i++) {
    try {
      if ((await fetch(base + '/')).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`preview did not start:\n${serverOut}`)
}

// Expected by design: HTML Live Preview renders user HTML in a sandbox=""
// iframe while "Run scripts" is off, so Chrome reports the blocked <script>
// of the sample document. Only this exact message is tolerated.
const EXPECTED = [/^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/]

// Collects console errors, uncaught errors and CSP violations for a page.
function watch(page) {
  const log = []
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    if (EXPECTED.some((re) => re.test(m.text()))) {
      tolerated.add(m.text())
      return
    }
    log.push(`console.${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => log.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => {
    if (r.status() >= 400) log.push(`HTTP ${r.status()}: ${r.url()}`)
  })
  return log
}

// Runs in every frame before page scripts (not subject to the page CSP).
const INIT = () => {
  window.__csp = []
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'}`)
  })
}

async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts })
  await ctx.addInitScript(INIT)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  return ctx
}

async function cspOf(page) {
  return page.evaluate(() => window.__csp ?? [])
}

async function checkRoute(page, log, path, expectTitle) {
  log.length = 0
  const res = await page.goto(base + path, { waitUntil: 'networkidle' })
  if (!res || !res.ok()) return fail(`${path}: HTTP ${res?.status()}`)
  const h1 = page.locator('main h1')
  await h1.waitFor({ timeout: 10_000 })
  const title = (await h1.textContent())?.trim()
  if (expectTitle && title !== expectTitle) fail(`${path}: h1 "${title}" != "${expectTitle}"`)
  // Lazy tool chunk mounted (no spinner left, no error boundary).
  await page.waitForFunction(() => !document.querySelector('main .loading'), null, { timeout: 10_000 })
  if (await page.locator('main [role="alert"]').count()) {
    const alerts = await page.locator('main [role="alert"]').allTextContents()
    if (alerts.some((t) => /went wrong|could not be loaded/.test(t))) fail(`${path}: error boundary: ${alerts.join(' | ')}`)
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) fail(`${path}: horizontal overflow ${overflow}px`)
  const csp = await cspOf(page)
  if (csp.length) fail(`${path}: CSP violations: ${csp.join('; ')}`)
  if (log.length) fail(`${path}: ${log.join(' | ')}`)
  else ok(`${path} -> "${title}"`)
}

async function paneValue(page, label) {
  return page.getByLabel(label, { exact: true }).inputValue()
}

async function interactions(page, log) {
  // 1. Base64 text encode + copy button.
  log.length = 0
  await page.goto(base + '/base64/text', { waitUntil: 'networkidle' })
  const text = 'héllo wörld 👋 <tools>'
  await page.getByLabel('Text (UTF-8)', { exact: true }).fill(text)
  const b64 = await paneValue(page, 'Base64')
  const expected = Buffer.from(text, 'utf8').toString('base64')
  if (b64 !== expected) fail(`base64 encode: got "${b64}", want "${expected}"`)
  else ok(`base64 encode -> ${b64}`)
  await page.getByRole('button', { name: 'Copy Base64' }).click()
  await page.getByRole('button', { name: 'Copy Base64' }).getByText('Copied ✓').waitFor({ timeout: 3000 })
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  if (clip !== expected) fail(`copy button: clipboard "${clip}"`)
  else ok('copy button -> clipboard matches output, label "Copied ✓"')

  // 2. JSON format.
  await page.goto(base + '/json/format', { waitUntil: 'networkidle' })
  await page.getByLabel('Input JSON', { exact: true }).fill('{"b":1,"a":[1,2,{"c":null}]}')
  const formatted = await paneValue(page, 'Formatted')
  const want = JSON.stringify({ b: 1, a: [1, 2, { c: null }] }, null, 2)
  if (formatted !== want) fail(`json format: got ${JSON.stringify(formatted)}`)
  else ok('json format -> 2-space pretty output')
  await page.getByLabel('Input JSON', { exact: true }).fill('{"a": 1,,}')
  if (!(await page.locator('main [role="alert"]').count())) fail('json format: invalid JSON shows no error')
  else ok(`json format invalid -> "${(await page.locator('main [role="alert"]').first().textContent())?.trim()}"`)

  // 3. HTML preview: inert by default, scripts via sandbox handshake.
  await page.goto(base + '/html/preview', { waitUntil: 'networkidle' })
  if ((await page.locator('iframe[title="HTML preview"]').getAttribute('sandbox')) !== '')
    fail('html preview: inert frame is not sandbox=""')
  await page.getByLabel('Run scripts').check()
  const frameEl = page.locator('iframe[title="HTML preview (scripts enabled)"]')
  await frameEl.waitFor()
  if ((await frameEl.getAttribute('sandbox')) !== 'allow-scripts') fail('html preview: sandbox attr is not exactly allow-scripts')
  const frame = page.frameLocator('iframe[title="HTML preview (scripts enabled)"]')
  await frame.locator('h1', { hasText: 'Hello!' }).waitFor({ timeout: 5000 })
  await frame.locator('#b').click()
  await frame.getByText('Scripts are running.').waitFor({ timeout: 3000 })
  const isolated = await (await frameEl.elementHandle())
    .contentFrame()
    .then((f) =>
      f.evaluate(() => {
        try {
          return window.parent.document ? 'parent-accessible' : 'isolated'
        } catch {
          return 'isolated'
        }
      }),
    )
  if (isolated !== 'isolated') fail('html preview: sandbox frame can access parent document')
  else ok('html preview -> sandbox handshake rendered, script ran on click, frame isolated from parent')

  // 4. AES-GCM password encrypt -> decrypt round trip.
  await page.goto(base + '/crypto/aes', { waitUntil: 'networkidle' })
  const secret = 'top secret ✓ message'
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery')
  await page.getByLabel('Plaintext', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Encrypt', exact: true }).click()
  await page.waitForFunction(() => {
    const t = [...document.querySelectorAll('textarea')].find((x) => x.readOnly)
    return t && t.value.length > 0
  }, null, { timeout: 30_000 })
  const cipher = await paneValue(page, 'Encrypted string')
  await page.getByRole('radio', { name: 'Decrypt' }).click()
  await page.getByLabel('Encrypted string', { exact: true }).fill(cipher)
  await page.getByRole('button', { name: 'Decrypt', exact: true }).click()
  await page.waitForFunction((s) => [...document.querySelectorAll('textarea')].some((x) => x.readOnly && x.value === s), secret, {
    timeout: 30_000,
  })
  ok(`aes -> encrypt (${cipher.slice(0, 32)}…) then decrypt round-trips`)

  // 5. Key pair generation (default algorithm).
  await page.goto(base + '/crypto/keypair', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Generate key pair' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((x) => x.value.includes('BEGIN PUBLIC KEY')), null, {
    timeout: 30_000,
  })
  const priv = await paneValue(page, 'Private key')
  if (!priv.includes('BEGIN PRIVATE KEY')) fail('keypair: private key PEM missing')
  else ok(`keypair -> ${(await page.getByLabel('Algorithm').inputValue())} PEM public + private generated`)

  const csp = await cspOf(page)
  if (csp.length) fail(`interactions: CSP violations: ${csp.join('; ')}`)
  if (log.length) fail(`interactions: ${log.join(' | ')}`)
}

async function screenshots(browser) {
  const shots = []
  for (const scheme of ['light', 'dark']) {
    const ctx = await newContext(browser, { colorScheme: scheme })
    const page = await ctx.newPage()
    for (const [name, path] of [
      ['home', '/'],
      ['json-format', '/json/format'],
      ['crypto-aes', '/crypto/aes'],
      ['html-preview', '/html/preview'],
      ['base64-text', '/base64/text'],
    ]) {
      await page.goto(base + path, { waitUntil: 'networkidle' })
      if (name === 'json-format') await page.getByRole('button', { name: /sample/i }).first().click().catch(() => {})
      const file = `${SHOTS}/${name}-${scheme}.png`
      await page.screenshot({ path: file, fullPage: true })
      shots.push(file)
    }
    await ctx.close()
  }
  // Mobile: drawer closed, open, and closes after navigation.
  const ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const log = watch(page)
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${SHOTS}/mobile-home-light.png`, fullPage: false })
  shots.push(`${SHOTS}/mobile-home-light.png`)
  if (await page.locator('#sidebar').isVisible()) fail('mobile: sidebar visible before opening menu')
  const menu = page.getByRole('button', { name: 'Toggle tool menu' })
  await menu.click()
  if (!(await page.locator('#sidebar').isVisible())) fail('mobile: sidebar not visible after menu click')
  if ((await menu.getAttribute('aria-expanded')) !== 'true') fail('mobile: aria-expanded not true')
  // Escape: first clears the filter (drawer stays open), second closes the drawer.
  const filter = page.getByLabel('Filter tools')
  await filter.fill('json')
  await filter.press('Escape')
  if ((await filter.inputValue()) !== '' || !(await page.locator('#sidebar').isVisible()))
    fail('mobile: first Escape should clear the filter and keep the drawer open')
  await filter.press('Escape')
  if (await page.locator('#sidebar').isVisible()) fail('mobile: second Escape should close the drawer')
  await menu.click()
  await page.screenshot({ path: `${SHOTS}/mobile-drawer-light.png` })
  shots.push(`${SHOTS}/mobile-drawer-light.png`)
  await page.locator('#sidebar').getByRole('link', { name: 'JSON Formatter' }).click()
  await page.locator('main h1', { hasText: 'JSON Formatter' }).waitFor()
  await page.waitForFunction(() => !document.querySelector('main .loading'), null, { timeout: 10_000 })
  if (await page.locator('#sidebar').isVisible()) fail('mobile: drawer did not close after navigation')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) fail(`mobile /json/format: horizontal overflow ${overflow}px`)
  await page.screenshot({ path: `${SHOTS}/mobile-json-format-light.png`, fullPage: true })
  shots.push(`${SHOTS}/mobile-json-format-light.png`)
  if (log.length) fail(`mobile: ${log.join(' | ')}`)
  else ok('mobile drawer opens, closes on navigation, no overflow')
  await ctx.close()

  // Theme toggle persists across reload.
  const tctx = await newContext(browser, { colorScheme: 'light' })
  const tp = await tctx.newPage()
  await tp.goto(base + '/', { waitUntil: 'networkidle' })
  await tp.getByRole('radio', { name: 'Dark theme' }).click()
  await tp.reload({ waitUntil: 'networkidle' })
  const theme = await tp.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor])
  if (theme[0] !== 'dark' || theme[1] !== 'rgb(25, 25, 25)') fail(`theme toggle: after reload ${JSON.stringify(theme)}`)
  else ok(`theme toggle -> dark persisted, body bg ${theme[1]}`)
  await tctx.close()
  return shots
}

let browser
try {
  await waitReady()
  browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const ctx = await newContext(browser)
  const page = await ctx.newPage()
  const log = watch(page)

  await checkRoute(page, log, '/', 'Developer tools')
  for (const id of ids) await checkRoute(page, log, `/${id}`)
  await checkRoute(page, log, '/no/such-tool', 'Page not found')

  // Client-side navigation from home to a tool via the sidebar.
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.locator('#sidebar').getByRole('link', { name: 'Hash Generator' }).click()
  await page.locator('main h1', { hasText: 'Hash Generator' }).waitFor()
  if (new URL(page.url()).pathname !== '/crypto/hash') fail(`sidebar nav: url ${page.url()}`)
  else ok('sidebar client-side navigation -> /crypto/hash')

  await interactions(page, log)
  await ctx.close()
  const shots = await screenshots(browser)
  console.log(`screenshots (${shots.length}):\n  ${shots.join('\n  ')}`)
} catch (e) {
  fail(e.stack ?? String(e))
} finally {
  await browser?.close()
  preview.kill()
}

// The inert preview of the sample (which contains a <script>) must have been blocked.
if (!problems.length && tolerated.size === 0) fail('expected the inert preview to block the sample script')
if (tolerated.size) console.log(`tolerated (expected by design):\n  ${[...tolerated].join('\n  ')}`)
if (problems.length) {
  console.error(`browser-check: ${problems.length} problem(s)`)
  process.exitCode = 1
} else console.log(`browser-check: OK (${ids.length} tool routes + home + 404, 0 console/CSP errors)`)
