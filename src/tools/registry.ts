// Maps every tool id (see meta.ts) to its lazily loaded page component.
// Each import() becomes its own chunk, so a tool's dependencies are only
// downloaded when that tool is opened.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface ToolModule {
  default: ComponentType
}

export const TOOL_LOADERS: Record<string, () => Promise<ToolModule>> = {
  'base64/text': () => import('./base64/Base64Text'),
  'base64/file': () => import('./base64/Base64File'),
  'base64/hex': () => import('./base64/HexConverter'),
  'json/format': () => import('./json/JsonFormat'),
  'json/tree': () => import('./json/JsonTree'),
  'json/yaml': () => import('./json/JsonYaml'),
  'json/csv': () => import('./json/JsonCsv'),
  'json/typescript': () => import('./json/JsonTypescript'),
  'json/diff': () => import('./json/JsonDiff'),
  'html/entities': () => import('./html/HtmlEntities'),
  'html/format': () => import('./html/HtmlFormat'),
  'html/preview': () => import('./html/HtmlPreview'),
  'html/markdown': () => import('./html/Markdown'),
  'html/strip': () => import('./html/StripTags'),
  'crypto/hash': () => import('./crypto/Hash'),
  'crypto/hmac': () => import('./crypto/Hmac'),
  'crypto/aes': () => import('./crypto/Aes'),
  'crypto/keypair': () => import('./crypto/KeyPair'),
  'crypto/rsa': () => import('./crypto/Rsa'),
  'crypto/sign': () => import('./crypto/Sign'),
  'crypto/random': () => import('./crypto/RandomBytes'),
  'crypto/password': () => import('./crypto/Password'),
  'crypto/uuid': () => import('./crypto/Uuid'),
  'crypto/jwt': () => import('./crypto/Jwt'),
  'crypto/bcrypt': () => import('./crypto/Bcrypt'),
  'misc/url': () => import('./misc/UrlTool'),
  'misc/timestamp': () => import('./misc/Timestamp'),
}

export const TOOL_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = Object.fromEntries(
  Object.entries(TOOL_LOADERS).map(([id, load]) => [id, lazy(load)]),
)
