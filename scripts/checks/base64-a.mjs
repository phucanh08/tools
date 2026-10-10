// Browser-check hooks for the Base64 tools of group A (t-34ae.1).
// Imported by scripts/browser-check.mjs. Keep checks deterministic and offline.
import { deflateSync } from 'node:zlib'

// ---- In-memory fixtures (no files on disk) ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** A valid size×size RGB gradient PNG (PNG spec: signature, IHDR, IDAT, IEND). */
function makePng(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type RGB
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3)
    for (let x = 0; x < size; x++) {
      raw[row + 1 + x * 3] = (x * 255) / size
      raw[row + 2 + x * 3] = (y * 255) / size
      raw[row + 3 + x * 3] = 200
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
/** A 0.1 s 8 kHz 8-bit mono PCM WAV (RIFF/WAVE, fmt + data chunks). */
function makeWav() {
  const samples = Buffer.alloc(800)
  for (let i = 0; i < samples.length; i++) samples[i] = 128 + Math.round(60 * Math.sin((i / 8000) * 2 * Math.PI * 440))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + samples.length, 4)
  h.write('WAVEfmt ', 8, 'ascii')
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(8000, 24)
  h.writeUInt32LE(8000, 28)
  h.writeUInt16LE(1, 32)
  h.writeUInt16LE(8, 34)
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(samples.length, 40)
  return Buffer.concat([h, samples])
}

const PNG = makePng(64)
const PNG_B64 = PNG.toString('base64')
const WAV_B64 = makeWav().toString('base64')
const CORRUPT_SAMPLE = '"SGVsbG8s IFdv!cmxkIQ="'

const fill = (page, label, value) => page.getByLabel(label, { exact: true }).fill(value)
const value = (page, label) => page.getByLabel(label, { exact: true }).inputValue()

/**
 * Screenshots taken in light and dark: [name, path, setup?]. setup(page) runs after
 * navigation and before the screenshot (e.g. fill a sample input).
 * @type {Array<[string, string, ((page: import('playwright-core').Page) => Promise<void>)?]>}
 */
export const shots = [
  ['base64-validate', '/base64/validate', (page) => fill(page, 'Base64 input', CORRUPT_SAMPLE)],
  [
    'base64-media',
    '/base64/media',
    async (page) => {
      await fill(page, 'Base64 or data URL', `data:image/jpeg;base64,${PNG_B64}`)
      await page.locator('main .image-preview img[src^="blob:"]').waitFor()
      await page.waitForFunction(() => document.querySelector('main .image-preview img')?.complete)
    },
  ],
  [
    'base64-image',
    '/base64/image',
    async (page) => {
      await page.locator('main input[type="file"]').setInputFiles({ name: 'sample-logo.png', mimeType: 'image/png', buffer: PNG })
      await page.getByLabel('HTML <img>', { exact: true }).waitFor()
    },
  ],
  [
    'base64-basic-auth',
    '/base64/basic-auth',
    async (page) => {
      await fill(page, 'User name', 'Aladdin')
      await fill(page, 'Password', 'open sesame')
    },
  ],
]

/**
 * Interaction checks. Report with fail(msg) / ok(msg); console and CSP errors are
 * collected by the caller after this returns.
 * @param {{ page: import('playwright-core').Page, base: string, fail: (m: string) => void, ok: (m: string) => void }} ctx
 */
export async function run({ page, base, fail, ok }) {
  // 1. Validator: first invalid character, then repair.
  await page.goto(base + '/base64/validate', { waitUntil: 'networkidle' })
  await fill(page, 'Base64 input', 'Zm9v!YmFy')
  const alert = (await page.locator('main [role="alert"]').first().textContent()) ?? ''
  if (!/position 5 \(line 1, column 5\)/.test(alert) || !alert.includes('"!" (U+0021)')) fail(`validator: wrong error "${alert}"`)
  else ok('validator -> flags "!" at position 5')
  const repaired = await value(page, 'Output Base64')
  if (repaired !== 'Zm9vYmFy') fail(`validator repair: got "${repaired}"`)
  else ok('validator repair -> Zm9vYmFy')
  await fill(page, 'Base64 input', 'SGk IQ==')
  await page.getByLabel('Spaces were "+"').check()
  const plus = await value(page, 'Output Base64')
  if (plus !== Buffer.from('Hi>!').toString('base64')) fail(`validator spaces-as-plus: got "${plus}"`)
  await fill(page, 'Base64 input', '-_-__g')
  await page.getByRole('radio', { name: 'Standard', exact: true }).click()
  const std = await value(page, 'Output Base64')
  if (std !== '+/+//g==') fail(`validator url-safe -> standard: got "${std}"`)
  else ok('validator -> spaces-as-plus and URL-safe → standard conversion')

  // 2. Media viewer: blob: previews, mismatch warning, HTML never rendered.
  await page.goto(base + '/base64/media', { waitUntil: 'networkidle' })
  await fill(page, 'Base64 or data URL', `data:image/jpeg;base64,${PNG_B64}`)
  const img = page.locator('main .image-preview img')
  await img.and(page.locator('[src^="blob:"]')).waitFor({ timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('main .image-preview img')?.naturalWidth === 64, null, { timeout: 5000 })
  if (!(await page.getByText('but the bytes are').count())) fail('media: no declared/detected type mismatch warning')
  else ok('media -> PNG previewed via blob: <img> (64×64), JPEG/PNG mismatch reported')
  await fill(page, 'Base64 or data URL', WAV_B64)
  const audio = page.locator('main audio[src^="blob:"]')
  await audio.waitFor({ timeout: 5000 })
  await page.waitForFunction(() => (document.querySelector('main audio')?.readyState ?? 0) >= 1, null, { timeout: 5000 })
  if (await page.locator('main .image-preview img').count()) fail('media: stale image preview after switching to audio')
  else ok('media -> WAV previewed via blob: <audio>, metadata loaded')
  await fill(page, 'Base64 or data URL', Buffer.from('<html><body><script>alert(1)</script></body></html>').toString('base64'))
  await page.getByText('HTML is never rendered here').waitFor({ timeout: 5000 })
  if (await page.locator('main img, main audio, main video, main iframe').count()) fail('media: HTML input produced a rendered element')
  else ok('media -> HTML is download-only (no img/audio/video/iframe)')

  // 3. Image → Base64 snippets.
  await page.goto(base + '/base64/image', { waitUntil: 'networkidle' })
  await page.locator('main input[type="file"]').setInputFiles({ name: 'tiny "logo".png', mimeType: 'image/png', buffer: PNG })
  await page.getByLabel('HTML <img>', { exact: true }).waitFor({ timeout: 5000 })
  const dataUri = `data:image/png;base64,${PNG_B64}`
  const html = await value(page, 'HTML <img>')
  const uri = await value(page, 'Data URI')
  const md = await value(page, 'Markdown image')
  if (uri !== dataUri) fail('image: data URI mismatch')
  else if (html !== `<img src="${dataUri}" alt="tiny &quot;logo&quot;" width="64" height="64">`) fail(`image: html snippet "${html.slice(-80)}"`)
  else if (md !== `![tiny "logo"](${dataUri})`) fail('image: markdown snippet mismatch')
  else ok('image -> data URI, escaped HTML <img> with 64×64, Markdown snippets')

  // 4. Basic Auth encode + decode (UTF-8).
  await page.goto(base + '/base64/basic-auth', { waitUntil: 'networkidle' })
  await fill(page, 'User name', 'user')
  await fill(page, 'Password', 'pässword')
  const token = Buffer.from('user:pässword').toString('base64')
  const header = await value(page, 'Authorization header')
  if (header !== `Authorization: Basic ${token}`) fail(`basic auth encode: got "${header}"`)
  else ok(`basic auth encode -> ${header}`)
  await page.getByRole('radio', { name: 'Decode header' }).click()
  await fill(page, 'Header or token', `  authorization:   BASIC  ${token} `)
  const user = await page.getByTestId('basic-user').textContent()
  const password = await page.getByTestId('basic-password').textContent()
  if (user !== 'user' || password !== 'pässword') fail(`basic auth decode: got ${JSON.stringify([user, password])}`)
  else ok('basic auth decode -> user / pässword')
}
