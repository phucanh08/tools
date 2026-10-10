// Browser-check hooks for the Base64 tools of group B (t-34ae.1).
// Imported by scripts/browser-check.mjs. Keep checks deterministic and offline.

const pane = (page, label) => page.getByLabel(label, { exact: true })

/** Waits until a textarea has a non-empty value (async tools) and returns it. */
async function valueOf(page, label, timeout = 10_000) {
  const el = pane(page, label)
  await el.waitFor({ timeout })
  const handle = await el.elementHandle()
  await page.waitForFunction((t) => t.value.length > 0, handle, { timeout })
  return el.inputValue()
}

const SAMPLE_UU = 'begin 644 cat.txt\n#0V%T\n`\nend\n'

/**
 * Screenshots taken in light and dark: [name, path, setup?]. setup(page) runs after
 * navigation and before the screenshot (e.g. fill a sample input).
 * @type {Array<[string, string, ((page: import('playwright-core').Page) => Promise<void>)?]>}
 */
export const shots = [
  [
    'base64-charset',
    '/base64/charset',
    async (page) => {
      await page.getByLabel('Charset', { exact: true }).selectOption('windows-1258')
      await pane(page, 'Text').fill('Tiếng Việt — 日本')
      await valueOf(page, 'Base64')
    },
  ],
  [
    'base64-compress',
    '/base64/compress',
    async (page) => {
      await pane(page, 'Text (UTF-8)').fill('The quick brown fox jumps over the lazy dog. '.repeat(20))
      await valueOf(page, 'Compressed Base64')
      await page.locator('main .kv').waitFor()
    },
  ],
  [
    'base64-base-n',
    '/base64/base-n',
    async (page) => {
      await pane(page, 'Text (UTF-8)').fill('foobar')
      await valueOf(page, 'Base32')
    },
  ],
  [
    'base64-mime',
    '/base64/mime',
    async (page) => {
      await page.getByRole('radio', { name: 'Uuencode', exact: true }).click()
      await page.getByRole('radio', { name: 'Decode', exact: true }).click()
      await pane(page, 'Uuencoded input').fill(SAMPLE_UU)
      await valueOf(page, 'Decoded text')
    },
  ],
]

/**
 * Interaction checks. Report with fail(msg) / ok(msg); console and CSP errors are
 * collected by the caller after this returns.
 * @param {{ page: import('playwright-core').Page, base: string, fail: (m: string) => void, ok: (m: string) => void }} ctx
 */
export async function run({ page, base, fail, ok }) {
  // 5. Charsets: Shift_JIS encode (bytes 93 FA 96 7B 8C EA), then auto-detect on decode.
  await page.goto(base + '/base64/charset', { waitUntil: 'networkidle' })
  await page.getByLabel('Charset', { exact: true }).selectOption('shift_jis')
  await pane(page, 'Text').fill('日本語')
  const sjis = await valueOf(page, 'Base64')
  if (sjis !== 'k/qWe4zq') fail(`charset: Shift_JIS "日本語" -> "${sjis}", want "k/qWe4zq"`)
  else ok('charset: Shift_JIS "日本語" -> k/qWe4zq')
  await pane(page, 'Text').fill('日本 한')
  const warn = page.locator('main .msg-warn', { hasText: 'replaced with' })
  if (!(await warn.count()) || !(await warn.first().textContent())?.includes('한')) fail('charset: unmappable "한" not reported')
  else ok('charset: unmappable character reported with a warning')
  await page.getByLabel('Charset', { exact: true }).selectOption('windows-1258')
  await pane(page, 'Text').fill('Tiếng Việt')
  const viet = await valueOf(page, 'Base64')
  if (viet !== 'VGnq7G5nIFZp6vJ0') fail(`charset: Windows-1258 "Tiếng Việt" -> "${viet}"`)
  else ok('charset: Windows-1258 "Tiếng Việt" -> VGnq7G5nIFZp6vJ0 (decomposed tone marks)')
  await page.getByRole('radio', { name: 'Base64 → Text', exact: true }).click()
  // EUC-KR "한국어 텍스트입니다" encoded by the browser's own WHATWG tables (Node: C7 D1 B1 B9 BE EE ...).
  await pane(page, 'Base64').fill('x9Gxub7uIMXYvbrGrsDUtM+02S4=')
  const korean = await valueOf(page, 'Decoded text')
  const detected = (await page.locator('main .msg', { hasText: 'Detected' }).first().textContent()) ?? ''
  if (korean !== '한국어 텍스트입니다.' || !detected.includes('EUC-KR')) fail(`charset: auto-detect EUC-KR -> "${korean}" / "${detected}"`)
  else ok('charset: auto-detect -> EUC-KR, decoded Korean text')

  // 6. Gzip round trip in the browser.
  await page.goto(base + '/base64/compress', { waitUntil: 'networkidle' })
  const original = 'Xin chào 👋 '.repeat(40)
  await pane(page, 'Text (UTF-8)').fill(original)
  const gz = await valueOf(page, 'Compressed Base64')
  if (!gz.startsWith('H4sI')) fail(`compress: gzip Base64 does not start with H4sI: ${gz.slice(0, 16)}`)
  await page.getByRole('radio', { name: 'Base64 → Decompress', exact: true }).click()
  await pane(page, 'Compressed Base64').fill(gz)
  const back = await valueOf(page, 'Decompressed text')
  const fmt = (await page.locator('main .kv dd').first().textContent()) ?? ''
  if (back !== original || !fmt.includes('detected from header')) fail(`compress: round trip mismatch (${back.length} chars, format "${fmt}")`)
  else ok(`compress: gzip round trip (${gz.length} Base64 chars), format auto-detected`)
  await pane(page, 'Compressed Base64').fill('H4sIAAAAAAAAA8tIzcnJBwCGphA2')
  await page.locator('main [role="alert"]').first().waitFor({ timeout: 5000 }).catch(() => {})
  const err = (await page.locator('main [role="alert"]').first().textContent().catch(() => '')) ?? ''
  if (!/Could not decompress as gzip/.test(err)) fail(`compress: corrupt gzip shows no clear error ("${err}")`)
  else ok(`compress: corrupt data -> "${err.trim()}"`)

  // 7. Base-N: RFC 4648 Base32 and the Z85 spec vector.
  await page.goto(base + '/base64/base-n', { waitUntil: 'networkidle' })
  await pane(page, 'Text (UTF-8)').fill('foobar')
  const b32 = await valueOf(page, 'Base32')
  if (b32 !== 'MZXW6YTBOI======') fail(`base-n: Base32 "foobar" -> "${b32}"`)
  else ok('base-n: Base32 "foobar" -> MZXW6YTBOI======')
  await page.getByLabel('Encoding', { exact: true }).selectOption('z85')
  await page.getByRole('radio', { name: 'Hex', exact: true }).click()
  await pane(page, 'Hex').fill('86 4F D2 6F B5 59 F7 5B')
  const z85 = await valueOf(page, 'Z85')
  if (z85 !== 'HelloWorld') fail(`base-n: Z85 -> "${z85}"`)
  else ok('base-n: Z85 864FD26FB559F75B -> HelloWorld')

  // 8. Uuencode "Cat" and MIME wrap with CRLF kept on copy.
  await page.goto(base + '/base64/mime', { waitUntil: 'networkidle' })
  await pane(page, 'Base64 input').fill('QUJD'.repeat(40))
  await valueOf(page, 'Wrapped Base64')
  await page.getByRole('button', { name: 'Copy Wrapped Base64' }).click()
  await page.getByRole('button', { name: 'Copy Wrapped Base64' }).getByText('Copied ✓').waitFor({ timeout: 3000 })
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  const lines = clip.split('\r\n')
  if (lines.length !== 3 || lines[0].length !== 76 || clip.replace(/\r\n/g, '').includes('\n')) fail(`mime: wrapped copy ${JSON.stringify(clip.slice(0, 90))}`)
  else ok('mime: wrapped at 76 columns, clipboard keeps CRLF')
  await page.getByRole('radio', { name: 'Uuencode', exact: true }).click()
  await page.getByLabel('File name', { exact: true }).fill('cat.txt')
  await pane(page, 'Text (UTF-8)').fill('Cat')
  const uu = await valueOf(page, 'Uuencoded')
  if (!uu.includes('#0V%T') || !uu.startsWith('begin 644 cat.txt')) fail(`uuencode: "Cat" -> ${JSON.stringify(uu)}`)
  else ok('uuencode: "Cat" -> begin 644 cat.txt / #0V%T')
  await page.getByRole('radio', { name: 'Decode', exact: true }).click()
  await pane(page, 'Uuencoded input').fill(uu)
  const cat = await valueOf(page, 'Decoded text')
  if (cat !== 'Cat') fail(`uudecode: got "${cat}"`)
  else ok('uudecode: round trip -> "Cat"')
}
