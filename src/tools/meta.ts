// Pure tool metadata. Imported by both the app and vite.config.ts (to emit
// per-route HTML files), so it must not import anything browser-specific.

export type CategoryId = 'base64' | 'json' | 'html' | 'crypto' | 'misc'

export interface Category {
  id: CategoryId
  title: string
  icon: string
}

export interface ToolMeta {
  /** Route path without leading slash, e.g. "json/format". */
  id: string
  category: CategoryId
  title: string
  icon: string
  description: string
  keywords: string[]
}

export const CATEGORIES: Category[] = [
  { id: 'base64', title: 'Base64 & Encoding', icon: '📦' },
  { id: 'json', title: 'JSON', icon: '🗂️' },
  { id: 'html', title: 'HTML & Markdown', icon: '📄' },
  { id: 'crypto', title: 'Crypto & Security', icon: '🔐' },
  { id: 'misc', title: 'Misc', icon: '🧰' },
]

export const TOOLS: ToolMeta[] = [
  // Base64
  {
    id: 'base64/text',
    category: 'base64',
    title: 'Base64 Text',
    icon: '🔤',
    description: 'Encode / decode text as Base64 (UTF-8 safe, URL-safe variant).',
    keywords: ['base64', 'encode', 'decode', 'url-safe', 'base64url', 'utf-8'],
  },
  {
    id: 'base64/file',
    category: 'base64',
    title: 'Base64 File',
    icon: '📎',
    description: 'Convert a file to Base64 / data URL, or Base64 back to a downloadable file with image preview.',
    keywords: ['base64', 'file', 'data url', 'image', 'download', 'upload'],
  },
  {
    id: 'base64/hex',
    category: 'base64',
    title: 'Hex Converter',
    icon: '🔢',
    description: 'Convert between text, hex and Base64.',
    keywords: ['hex', 'base16', 'bytes', 'base64'],
  },
  // JSON
  {
    id: 'json/format',
    category: 'json',
    title: 'JSON Formatter',
    icon: '📝',
    description: 'Format, minify and validate JSON with error line/column.',
    keywords: ['json', 'format', 'beautify', 'pretty', 'minify', 'validate', 'lint'],
  },
  {
    id: 'json/tree',
    category: 'json',
    title: 'JSON Tree Viewer',
    icon: '🌳',
    description: 'Explore JSON as a collapsible tree.',
    keywords: ['json', 'tree', 'viewer', 'explore'],
  },
  {
    id: 'json/yaml',
    category: 'json',
    title: 'JSON ↔ YAML',
    icon: '🔄',
    description: 'Convert JSON to YAML and YAML to JSON.',
    keywords: ['json', 'yaml', 'yml', 'convert'],
  },
  {
    id: 'json/csv',
    category: 'json',
    title: 'JSON ↔ CSV',
    icon: '📊',
    description: 'Convert an array of objects to CSV and CSV back to JSON.',
    keywords: ['json', 'csv', 'table', 'spreadsheet', 'convert'],
  },
  {
    id: 'json/typescript',
    category: 'json',
    title: 'JSON → TypeScript',
    icon: '🏷️',
    description: 'Generate TypeScript interfaces from a JSON sample.',
    keywords: ['json', 'typescript', 'ts', 'types', 'interface'],
  },
  {
    id: 'json/diff',
    category: 'json',
    title: 'JSON Diff',
    icon: '⚖️',
    description: 'Structural diff between two JSON documents.',
    keywords: ['json', 'diff', 'compare'],
  },
  // HTML
  {
    id: 'html/entities',
    category: 'html',
    title: 'HTML Entities',
    icon: '🔣',
    description: 'Encode / decode HTML entities.',
    keywords: ['html', 'entities', 'escape', 'unescape', 'encode', 'decode'],
  },
  {
    id: 'html/format',
    category: 'html',
    title: 'HTML Beautify / Minify',
    icon: '🧹',
    description: 'Pretty-print or minify HTML.',
    keywords: ['html', 'beautify', 'format', 'minify', 'pretty'],
  },
  {
    id: 'html/preview',
    category: 'html',
    title: 'HTML Live Preview',
    icon: '🖼️',
    description: 'Render HTML in a sandboxed iframe.',
    keywords: ['html', 'preview', 'render', 'sandbox', 'playground'],
  },
  {
    id: 'html/markdown',
    category: 'html',
    title: 'Markdown → HTML',
    icon: '📄',
    description: 'Convert Markdown (GFM) to HTML with preview.',
    keywords: ['markdown', 'md', 'html', 'gfm', 'convert'],
  },
  {
    id: 'html/strip',
    category: 'html',
    title: 'Strip HTML Tags',
    icon: '✂️',
    description: 'Extract plain text from HTML.',
    keywords: ['html', 'strip', 'tags', 'text', 'plain'],
  },
  // Crypto
  {
    id: 'crypto/hash',
    category: 'crypto',
    title: 'Hash Generator',
    icon: '#️⃣',
    description: 'MD5, SHA-1, SHA-256/384/512 and SHA-3 for text and files.',
    keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', 'sha3', 'checksum', 'digest', 'file'],
  },
  {
    id: 'crypto/hmac',
    category: 'crypto',
    title: 'HMAC',
    icon: '🛡️',
    description: 'Compute HMAC-SHA1/256/384/512.',
    keywords: ['hmac', 'mac', 'sha256', 'signature'],
  },
  {
    id: 'crypto/aes',
    category: 'crypto',
    title: 'AES-GCM Encrypt / Decrypt',
    icon: '🔒',
    description: 'Encrypt or decrypt text with a password (PBKDF2) or a raw AES key.',
    keywords: ['aes', 'gcm', 'encrypt', 'decrypt', 'password', 'pbkdf2', 'cipher'],
  },
  {
    id: 'crypto/keypair',
    category: 'crypto',
    title: 'Key Pair Generator',
    icon: '🗝️',
    description: 'Generate RSA, ECDSA and Ed25519 key pairs as PEM.',
    keywords: ['rsa', 'ecdsa', 'ed25519', 'key', 'pem', 'generate', 'keypair', 'public', 'private'],
  },
  {
    id: 'crypto/rsa',
    category: 'crypto',
    title: 'RSA Encrypt / Decrypt',
    icon: '🔑',
    description: 'RSA-OAEP encryption with PEM keys.',
    keywords: ['rsa', 'oaep', 'encrypt', 'decrypt', 'pem'],
  },
  {
    id: 'crypto/sign',
    category: 'crypto',
    title: 'Sign / Verify',
    icon: '✍️',
    description: 'Digital signatures with RSA (PSS / PKCS#1 v1.5), ECDSA and Ed25519.',
    keywords: ['sign', 'verify', 'signature', 'rsa', 'pss', 'ecdsa', 'ed25519', 'pem'],
  },
  {
    id: 'crypto/random',
    category: 'crypto',
    title: 'Random Key / Secret',
    icon: '🎲',
    description: 'Generate cryptographically secure random bytes as hex or Base64.',
    keywords: ['random', 'key', 'secret', 'token', 'bytes', 'hex', 'base64'],
  },
  {
    id: 'crypto/password',
    category: 'crypto',
    title: 'Password Generator',
    icon: '🔐',
    description: 'Generate strong random passwords.',
    keywords: ['password', 'generator', 'random', 'passphrase'],
  },
  {
    id: 'crypto/uuid',
    category: 'crypto',
    title: 'UUID Generator',
    icon: '🆔',
    description: 'Generate UUID v4 and v7.',
    keywords: ['uuid', 'guid', 'v4', 'v7', 'id'],
  },
  {
    id: 'crypto/jwt',
    category: 'crypto',
    title: 'JWT Decoder / Verifier',
    icon: '🎟️',
    description: 'Decode JWTs and verify HMAC, RSA, ECDSA and EdDSA signatures.',
    keywords: ['jwt', 'token', 'decode', 'verify', 'hs256', 'rs256', 'jws'],
  },
  {
    id: 'crypto/bcrypt',
    category: 'crypto',
    title: 'Bcrypt',
    icon: '🔏',
    description: 'Hash and verify passwords with bcrypt.',
    keywords: ['bcrypt', 'password', 'hash', 'verify'],
  },
  // Misc
  {
    id: 'misc/url',
    category: 'misc',
    title: 'URL Encode / Decode',
    icon: '🔗',
    description: 'Percent-encode or decode URLs and inspect URL parts.',
    keywords: ['url', 'uri', 'encode', 'decode', 'percent', 'query'],
  },
  {
    id: 'misc/timestamp',
    category: 'misc',
    title: 'Unix Timestamp',
    icon: '🕒',
    description: 'Convert Unix timestamps to dates and back.',
    keywords: ['unix', 'timestamp', 'epoch', 'date', 'time', 'iso'],
  },
]

export const SITE_NAME = 'Dev Tools'
export const SITE_URL = 'https://tools.anhlp.com'
