// uuencode / uudecode (POSIX uuencode historical format). Pure functions, no DOM.
//
// Each body line starts with a length character (32 + byte count, max 45 bytes
// = "M"), followed by groups of 4 characters for every 3 bytes (32 + 6-bit
// value). Zero values are written as "`" instead of space so that trailing
// spaces cannot be lost. The last line is zero-padded to a multiple of 3 bytes;
// its length character says how many bytes are real.

const LINE_BYTES = 45

export interface UuOptions {
  filename?: string
  /** Octal permission mode, e.g. "644". */
  mode?: string
  eol?: '\n' | '\r\n'
}

const enc = (v: number) => (v === 0 ? '`' : String.fromCharCode(32 + v))

export function validateMode(mode: string): string | null {
  return /^[0-7]{3,4}$/.test(mode) ? null : 'Mode must be 3 or 4 octal digits (e.g. 644)'
}

export function validateFilename(name: string): string | null {
  if (name.trim() === '') return 'File name is required'
  if (/[\r\n]/.test(name)) return 'File name cannot contain line breaks'
  return null
}

export function uuencode(bytes: Uint8Array, opts: UuOptions = {}): string {
  const { filename = 'file.bin', mode = '644', eol = '\n' } = opts
  const modeError = validateMode(mode)
  if (modeError) throw new Error(modeError)
  const nameError = validateFilename(filename)
  if (nameError) throw new Error(nameError)
  const lines = [`begin ${mode} ${filename}`]
  for (let i = 0; i < bytes.length; i += LINE_BYTES) {
    const chunk = bytes.subarray(i, i + LINE_BYTES)
    let line = enc(chunk.length)
    for (let j = 0; j < chunk.length; j += 3) {
      const a = chunk[j] ?? 0
      const b = chunk[j + 1] ?? 0
      const c = chunk[j + 2] ?? 0
      line += enc(a >> 2) + enc(((a << 4) | (b >> 4)) & 63) + enc(((b << 2) | (c >> 6)) & 63) + enc(c & 63)
    }
    lines.push(line)
  }
  lines.push('`', 'end')
  return lines.join(eol) + eol
}

export interface UuDecoded {
  bytes: Uint8Array<ArrayBuffer>
  filename: string
  mode: string
  warnings: string[]
}

/**
 * Decodes the first "begin ... end" block. Accepts space or "`" for zero, CRLF
 * or LF, and lines whose trailing spaces were stripped.
 */
export function uudecode(text: string): UuDecoded {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /^begin\s/.test(l))
  if (start < 0) throw new Error('No "begin <mode> <filename>" line found')
  const header = /^begin\s+([0-7]{3,4})\s+(.+?)\s*$/.exec(lines[start] ?? '')
  if (!header) throw new Error(`Invalid header line "${lines[start]}": expected "begin <mode> <filename>"`)
  const [, mode = '', filename = ''] = header
  const out: number[] = []
  const warnings: string[] = []
  let ended = false
  let terminated = false
  for (let n = start + 1; n < lines.length; n++) {
    const raw = lines[n] ?? ''
    if (raw.trimEnd() === 'end') {
      ended = true
      break
    }
    if (terminated) {
      if (raw.trim() !== '') warnings.push(`Line ${n + 1}: data after the zero-length line was ignored`)
      continue
    }
    if (raw === '') {
      if (n === lines.length - 1) break // final newline of the text
      warnings.push(`Line ${n + 1}: empty line treated as the end of data`)
      terminated = true
      continue
    }
    // Length character: " " or "`" (0 bytes) up to "M" (45 bytes).
    const lengthChar = raw.charCodeAt(0)
    if (!((lengthChar >= 0x20 && lengthChar <= 0x4d) || lengthChar === 0x60)) {
      throw new Error(`Line ${n + 1}: invalid length character "${raw[0]}" (expected " " to "M", or "\`")`)
    }
    const count = (lengthChar - 32) & 63
    if (count === 0) {
      terminated = true
      continue
    }
    const needed = Math.ceil(count / 3) * 4
    let body = raw.slice(1)
    const bad = body.search(/[^\x20-\x60]/)
    if (bad >= 0) throw new Error(`Line ${n + 1}: invalid character "${body[bad]}" at column ${bad + 2}`)
    if (body.length < needed) {
      // Trailing spaces (value 0) are often stripped in transit, so a short line is
      // padded with zeros. Padding characters past the last byte carry no data;
      // only characters that hold data bits are worth a warning, and even those
      // may just be zero bytes whose spaces were stripped.
      const dataChars = Math.ceil((count * 4) / 3)
      const missing = dataChars - body.length
      if (missing > 0) {
        warnings.push(
          `Line ${n + 1}: ${missing} data character(s) missing, decoded as zero bits ` +
            `(trailing spaces may have been stripped, or the line is truncated)`,
        )
      }
      body = body.padEnd(needed, ' ')
    }
    if (body.length > needed + 1) warnings.push(`Line ${n + 1}: ${body.length - needed} extra character(s) ignored`)
    const line: number[] = []
    for (let j = 0; j < needed; j += 4) {
      const v = [0, 1, 2, 3].map((k) => (body.charCodeAt(j + k) - 32) & 63)
      const [a = 0, b = 0, c = 0, d = 0] = v
      line.push(((a << 2) | (b >> 4)) & 0xff, ((b << 4) | (c >> 2)) & 0xff, ((c << 6) | d) & 0xff)
    }
    out.push(...line.slice(0, count))
  }
  if (!ended) warnings.push('Missing "end" line; the data may be truncated')
  else if (!terminated) warnings.push('Missing zero-length ("`") line before "end"')
  return { bytes: new Uint8Array(out), filename, mode, warnings }
}

/** File name safe for a download: strips directories and control characters. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const clean = [...base].filter((c) => c >= ' ' && c !== '\x7f').join('').trim()
  return clean === '' || clean === '.' || clean === '..' ? 'file.bin' : clean
}
