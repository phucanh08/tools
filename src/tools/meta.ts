// Pure tool metadata. Imported by both the app and vite.config.ts (to emit
// per-route HTML files), so it must not import anything browser-specific.

export type CategoryId = 'base64' | 'json' | 'html' | 'crypto' | 'misc'

export interface Category {
  id: CategoryId
  title: string
}

export interface ToolMeta {
  /** Route path without leading slash, e.g. "json/format". */
  id: string
  category: CategoryId
  title: string
  description: string
  keywords: string[]
}

export const CATEGORIES: Category[] = [
  { id: 'base64', title: 'Base64 & Encoding' },
  { id: 'json', title: 'JSON' },
  { id: 'html', title: 'HTML & Markdown' },
  { id: 'crypto', title: 'Crypto & Security' },
  { id: 'misc', title: 'Misc' },
]

export const TOOLS: ToolMeta[] = [
  // Base64
  {
    id: 'base64/text',
    category: 'base64',
    title: 'Base64 Text',
    description: 'Encode / decode text as Base64 (UTF-8 safe, URL-safe variant).',
    keywords: ['base64', 'encode', 'decode', 'url-safe', 'base64url', 'utf-8'],
  },
  {
    id: 'base64/file',
    category: 'base64',
    title: 'Base64 File',
    description: 'Convert a file to Base64 / data URL, or Base64 back to a downloadable file with image preview.',
    keywords: ['base64', 'file', 'data url', 'image', 'download', 'upload'],
  },
  {
    id: 'base64/hex',
    category: 'base64',
    title: 'Hex Converter',
    description: 'Convert between text, hex and Base64.',
    keywords: ['hex', 'base16', 'bytes', 'base64'],
  },
  {
    id: 'base64/validate',
    category: 'base64',
    title: 'Base64 Validator & Repair',
    description: 'Validate Base64, find the first invalid character, detect the variant and normalize or repair it.',
    keywords: ['base64', 'validate', 'validator', 'check', 'repair', 'fix', 'padding', 'url-safe', 'mime', 'normalize'],
  },
  {
    id: 'base64/media',
    category: 'base64',
    title: 'Base64 Media Viewer',
    description: 'Preview Base64 or data URLs as image, audio, video or PDF with type detection from magic bytes.',
    keywords: ['base64', 'image', 'audio', 'video', 'pdf', 'preview', 'viewer', 'decode', 'data url', 'mime'],
  },
  {
    id: 'base64/image',
    category: 'base64',
    title: 'Image → Base64',
    description: 'Turn an image into a data URI plus CSS, HTML, Markdown and JSON snippets with size overhead.',
    keywords: ['image', 'base64', 'data uri', 'css', 'html', 'img', 'markdown', 'json', 'embed', 'inline'],
  },
  {
    id: 'base64/basic-auth',
    category: 'base64',
    title: 'Basic Auth Header',
    description: 'Build or decode an HTTP Authorization: Basic header (UTF-8 safe).',
    keywords: ['basic auth', 'authorization', 'header', 'http', 'username', 'password', 'base64'],
  },
  {
    id: 'base64/charset',
    category: 'base64',
    title: 'Base64 with Charsets',
    description: 'Encode and decode Base64 text in UTF-16, ISO-8859-1, Windows-125x, Shift_JIS, GBK and more.',
    keywords: ['base64', 'charset', 'encoding', 'utf-16', 'latin1', 'iso-8859-1', 'windows-1252', 'shift_jis', 'gbk', 'euc-kr'],
  },
  {
    id: 'base64/compress',
    category: 'base64',
    title: 'Gzip / Deflate + Base64',
    description: 'Compress text with gzip or deflate to Base64 and back, with size comparison.',
    keywords: ['gzip', 'deflate', 'zlib', 'compress', 'decompress', 'inflate', 'base64'],
  },
  {
    id: 'base64/base-n',
    category: 'base64',
    title: 'Base32 / 58 / 85 / 36',
    description: 'Convert text or hex to Base32, Base32hex, Base58, Ascii85, Z85 and Base36 and back.',
    keywords: ['base32', 'base58', 'base85', 'ascii85', 'z85', 'base36', 'base-n', 'bitcoin', 'rfc4648'],
  },
  {
    id: 'base64/mime',
    category: 'base64',
    title: 'MIME Wrap & Uuencode',
    description: 'Wrap Base64 at 76 columns with CRLF (MIME) and encode or decode uuencode.',
    keywords: ['mime', 'wrap', '76', 'crlf', 'email', 'uuencode', 'uudecode', 'base64'],
  },
  // JSON
  {
    id: 'json/format',
    category: 'json',
    title: 'JSON Formatter',
    description: 'Format, minify and validate JSON with error line/column.',
    keywords: ['json', 'format', 'beautify', 'pretty', 'minify', 'validate', 'lint'],
  },
  {
    id: 'json/tree',
    category: 'json',
    title: 'JSON Tree Viewer',
    description: 'Explore JSON as a collapsible tree.',
    keywords: ['json', 'tree', 'viewer', 'explore'],
  },
  {
    id: 'json/yaml',
    category: 'json',
    title: 'JSON ↔ YAML',
    description: 'Convert JSON to YAML and YAML to JSON.',
    keywords: ['json', 'yaml', 'yml', 'convert'],
  },
  {
    id: 'json/csv',
    category: 'json',
    title: 'JSON ↔ CSV',
    description: 'Convert an array of objects to CSV and CSV back to JSON.',
    keywords: ['json', 'csv', 'table', 'spreadsheet', 'convert'],
  },
  {
    id: 'json/typescript',
    category: 'json',
    title: 'JSON → TypeScript',
    description: 'Generate TypeScript interfaces from a JSON sample.',
    keywords: ['json', 'typescript', 'ts', 'types', 'interface'],
  },
  {
    id: 'json/diff',
    category: 'json',
    title: 'JSON Diff',
    description: 'Structural diff between two JSON documents.',
    keywords: ['json', 'diff', 'compare'],
  },
  // HTML
  {
    id: 'html/entities',
    category: 'html',
    title: 'HTML Entities',
    description: 'Encode / decode HTML entities.',
    keywords: ['html', 'entities', 'escape', 'unescape', 'encode', 'decode'],
  },
  {
    id: 'html/format',
    category: 'html',
    title: 'HTML Beautify / Minify',
    description: 'Pretty-print or minify HTML.',
    keywords: ['html', 'beautify', 'format', 'minify', 'pretty'],
  },
  {
    id: 'html/preview',
    category: 'html',
    title: 'HTML Live Preview',
    description: 'Render HTML in a sandboxed iframe.',
    keywords: ['html', 'preview', 'render', 'sandbox', 'playground'],
  },
  {
    id: 'html/markdown',
    category: 'html',
    title: 'Markdown → HTML',
    description: 'Convert Markdown (GFM) to HTML with preview.',
    keywords: ['markdown', 'md', 'html', 'gfm', 'convert'],
  },
  {
    id: 'html/strip',
    category: 'html',
    title: 'Strip HTML Tags',
    description: 'Extract plain text from HTML.',
    keywords: ['html', 'strip', 'tags', 'text', 'plain'],
  },
  // Crypto
  {
    id: 'crypto/hash',
    category: 'crypto',
    title: 'Hash Generator',
    description: 'MD5, SHA-1, SHA-256/384/512 and SHA-3 for text and files.',
    keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'sha3', 'checksum', 'digest', 'file'],
  },
  {
    id: 'crypto/hmac',
    category: 'crypto',
    title: 'HMAC',
    description: 'Compute HMAC-SHA1/256/384/512.',
    keywords: ['hmac', 'mac', 'sha256', 'signature'],
  },
  {
    id: 'crypto/aes',
    category: 'crypto',
    title: 'AES-GCM Encrypt / Decrypt',
    description: 'Encrypt or decrypt text with a password (PBKDF2) or a raw AES key.',
    keywords: ['aes', 'gcm', 'encrypt', 'decrypt', 'password', 'pbkdf2', 'cipher'],
  },
  {
    id: 'crypto/keypair',
    category: 'crypto',
    title: 'Key Pair Generator',
    description: 'Generate RSA, ECDSA and Ed25519 key pairs as PEM.',
    keywords: ['rsa', 'ecdsa', 'ed25519', 'key', 'pem', 'generate', 'keypair', 'public', 'private'],
  },
  {
    id: 'crypto/rsa',
    category: 'crypto',
    title: 'RSA Encrypt / Decrypt',
    description: 'RSA-OAEP encryption with PEM keys.',
    keywords: ['rsa', 'oaep', 'encrypt', 'decrypt', 'pem'],
  },
  {
    id: 'crypto/sign',
    category: 'crypto',
    title: 'Sign / Verify',
    description: 'Digital signatures with RSA (PSS / PKCS#1 v1.5), ECDSA and Ed25519.',
    keywords: ['sign', 'verify', 'signature', 'rsa', 'pss', 'ecdsa', 'ed25519', 'pem'],
  },
  {
    id: 'crypto/random',
    category: 'crypto',
    title: 'Random Key / Secret',
    description: 'Generate cryptographically secure random bytes as hex or Base64.',
    keywords: ['random', 'key', 'secret', 'token', 'bytes', 'hex', 'base64'],
  },
  {
    id: 'crypto/password',
    category: 'crypto',
    title: 'Password Generator',
    description: 'Generate strong random passwords.',
    keywords: ['password', 'generator', 'random', 'passphrase'],
  },
  {
    id: 'crypto/uuid',
    category: 'crypto',
    title: 'UUID Generator',
    description: 'Generate UUID v4 and v7.',
    keywords: ['uuid', 'guid', 'v4', 'v7', 'id'],
  },
  {
    id: 'crypto/jwt',
    category: 'crypto',
    title: 'JWT Decoder / Verifier',
    description: 'Decode JWTs and verify HMAC, RSA, ECDSA and EdDSA signatures.',
    keywords: ['jwt', 'token', 'decode', 'verify', 'hs256', 'rs256', 'jws'],
  },
  {
    id: 'crypto/bcrypt',
    category: 'crypto',
    title: 'Bcrypt',
    description: 'Hash and verify passwords with bcrypt.',
    keywords: ['bcrypt', 'password', 'hash', 'verify'],
  },
  // Misc
  {
    id: 'misc/url',
    category: 'misc',
    title: 'URL Encode / Decode',
    description: 'Percent-encode or decode URLs and inspect URL parts.',
    keywords: ['url', 'uri', 'encode', 'decode', 'percent', 'query'],
  },
  {
    id: 'misc/timestamp',
    category: 'misc',
    title: 'Unix Timestamp',
    description: 'Convert Unix timestamps to dates and back.',
    keywords: ['unix', 'timestamp', 'epoch', 'date', 'time', 'iso'],
  },
]

export const SITE_NAME = 'Dev Tools'
export const SITE_URL = 'https://tools.anhlp.com'
