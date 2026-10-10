// MIME-style line wrapping of Base64 (RFC 2045 §6.8: at most 76 characters per
// line, CRLF line breaks). Pure functions, no DOM access.

export type LineEnding = '\r\n' | '\n'

export const MIME_LINE_LENGTH = 76

/** Removes all whitespace (spaces, tabs, CR, LF). */
export function unwrapLines(text: string): string {
  return text.replace(/\s+/g, '')
}

/**
 * Re-wraps text at `width` characters per line. Existing whitespace is removed
 * first, so wrapping is idempotent. No line break is added after the last line.
 */
export function wrapLines(text: string, width = MIME_LINE_LENGTH, eol: LineEnding = '\r\n'): string {
  if (!Number.isInteger(width) || width < 1) throw new Error('Line width must be a whole number of at least 1')
  const s = unwrapLines(text)
  const lines: string[] = []
  for (let i = 0; i < s.length; i += width) lines.push(s.slice(i, i + width))
  return lines.join(eol)
}

export interface LineStats {
  lines: number
  longest: number
  crlf: number
  lf: number
}

/** Line count, longest line and line-ending counts (for showing what was unwrapped). */
export function lineStats(text: string): LineStats {
  if (text === '') return { lines: 0, longest: 0, crlf: 0, lf: 0 }
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length - crlf
  const lines = text.split(/\r?\n/)
  // A loop, not Math.max(...lines): spreading ~150k+ arguments throws RangeError.
  let longest = 0
  for (const l of lines) if (l.length > longest) longest = l.length
  return { lines: lines.length, longest, crlf, lf }
}
