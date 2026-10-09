# Dev Tools — tools.anhlp.com

A static, client-side collection of developer utilities: Base64 & encoding,
JSON, HTML & Markdown, crypto & security, and a few misc helpers (27 tools).
Everything runs in the browser — no backend, no analytics, no uploads. A strict
Content-Security-Policy (`connect-src 'self'`) keeps user input on the page.

Built with Vite + React + TypeScript (strict), styled with plain CSS (a calm,
document-style workspace layout with light/dark themes and no web fonts).

## Tools

| Category | Routes |
| --- | --- |
| Base64 & Encoding | `/base64/text`, `/base64/file`, `/base64/hex` |
| JSON | `/json/format`, `/json/tree`, `/json/yaml`, `/json/csv`, `/json/typescript`, `/json/diff` |
| HTML & Markdown | `/html/entities`, `/html/format`, `/html/preview`, `/html/markdown`, `/html/strip` |
| Crypto & Security | `/crypto/hash`, `/crypto/hmac`, `/crypto/aes`, `/crypto/keypair`, `/crypto/rsa`, `/crypto/sign`, `/crypto/random`, `/crypto/password`, `/crypto/uuid`, `/crypto/jwt`, `/crypto/bcrypt` |
| Misc | `/misc/url`, `/misc/timestamp` |

Tool metadata (ids, titles, icons, search keywords) lives in
`src/tools/meta.ts`; components are lazy-loaded via `src/tools/registry.ts`.
Crypto uses Web Crypto plus `@noble/hashes` (MD5/SHA-3) and `bcryptjs`.

## Local development

Requirements: Node.js ≥ 22.12 and pnpm 10 (`corepack enable` picks up the
version pinned in `package.json`).

```sh
pnpm install
pnpm dev        # http://localhost:5173 (no CSP in dev, for React Fast Refresh)
pnpm build      # production build into dist/
pnpm preview    # serve dist/ locally
```

## Verification

```sh
pnpm typecheck  # tsc -b
pnpm lint       # eslint
pnpm test       # vitest (unit tests for encoders, JSON, HTML, crypto, router, workflow)
pnpm build
pnpm smoke      # checks dist/ files, CSP meta, per-route HTML, and fetches via vite preview
pnpm check      # all of the above in order

pnpm browser    # headless Chrome over `vite preview` (needs a prior build; also runs in CI)
```

`pnpm browser` (`scripts/browser-check.mjs`, uses `playwright-core` with the
installed Google Chrome; override with `CHROME_PATH`) loads the home page,
all tool routes and a 404, fails on console errors, CSP violations or
horizontal overflow, exercises key interactions (Base64 encode + copy, JSON
format, HTML preview sandbox, AES encrypt→decrypt, key-pair generation, mobile
drawer, theme toggle) and writes screenshots to `.artifacts/screenshots/`
(git-ignored). `pnpm smoke` and `pnpm browser` start Vite's preview server
in-process (`scripts/preview-server.mjs`) and fail if its port still has a
listener after shutdown.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` runs on every push to `main` (and manually via
*Run workflow*): install → typecheck → lint → test → build → smoke → browser
check → upload `dist/` → deploy with `actions/deploy-pages`. Any failing step,
including the headless-Chrome browser check, stops the deploy. The browser
check uses the Google Chrome preinstalled on GitHub's Ubuntu runner images
(`CHROME_PATH=/usr/bin/google-chrome`); its screenshots are uploaded as the
`browser-screenshots` workflow artifact (kept 7 days).

The workflow stays on pnpm 10 with `pnpm/action-setup`; its successor
`pnpm/setup` only supports pnpm 11+.

One-time repository setup:

1. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. *Settings → Pages → Custom domain*: `tools.anhlp.com` (the build also ships
   `public/CNAME`). Enable **Enforce HTTPS** once the certificate is issued.

GitHub Pages has no SPA rewrites, so the build emits one HTML file per tool
route (`dist/json/format.html`, …) plus `404.html` and `sitemap.xml`; deep
links return HTTP 200.

### DNS (Cloudflare)

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `tools` | `phucanh08.github.io` | **DNS only** (grey cloud) |

Keep the record DNS-only so GitHub can verify the domain and issue the
Let's Encrypt certificate. Optionally verify the domain under GitHub
*Settings → Pages → Verified domains* to prevent takeover.

## Security notes

- Production CSP is injected as a `<meta>` tag at build time (`vite.config.ts`);
  no inline scripts are allowed (`public/theme-init.js` is an external file).
- HTML Live Preview renders untrusted HTML in `sandbox=""` iframes; with
  *Run scripts* on it uses `/sandbox.html` in a `sandbox="allow-scripts"`
  (opaque-origin) frame — never `allow-same-origin`.
- Randomness always comes from `crypto.getRandomValues` (lint-enforced).
