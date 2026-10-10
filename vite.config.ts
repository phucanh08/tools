import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SITE_NAME, SITE_URL, TOOLS } from './src/tools/meta.ts'

// Content-Security-Policy applied to the production build only (the dev server
// needs inline scripts for React Fast Refresh). connect-src 'self' ensures the
// app cannot send user input to third parties even if a dependency tried to.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cspPlugin(): Plugin {
  return {
    name: 'tools:csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

/**
 * GitHub Pages has no SPA rewrites. For every known tool route we emit
 * `<route>.html` (GitHub Pages serves `/json/format` from `json/format.html`
 * with HTTP 200), plus `404.html` as a fallback for anything else.
 */
function staticRoutesPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'tools:static-routes',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    async writeBundle() {
      const indexHtml = await readFile(join(outDir, 'index.html'), 'utf8')
      const withMeta = (title: string, description: string) =>
        indexHtml
          .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
          .replace(
            /<meta name="description" content="[^"]*" \/>/,
            `<meta name="description" content="${escapeHtml(description)}" />`,
          )
      for (const tool of TOOLS) {
        const file = join(outDir, `${tool.id}.html`)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, withMeta(`${tool.title} · ${SITE_NAME}`, tool.description))
      }
      await writeFile(join(outDir, '404.html'), indexHtml)
      const urls = ['', ...TOOLS.map((t) => t.id)].map((p) => `  <url><loc>${SITE_URL}/${p}</loc></url>`)
      await writeFile(
        join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      )
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), cspPlugin(), staticRoutesPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
