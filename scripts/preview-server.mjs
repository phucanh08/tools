// Serves dist/ with Vite's preview server in-process (same config and headers
// as `vite preview`) so teardown is an awaited close() rather than a signal to
// a `pnpm exec` wrapper that may or may not forward it to the real server.
import { createConnection } from 'node:net'
import { preview } from 'vite'

/** True when something accepts TCP connections on 127.0.0.1/::1:port. */
function listening(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const s = createConnection({ host, port })
      s.once('connect', () => {
        s.destroy()
        resolve(true)
      })
      s.once('error', () => resolve(false))
    })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean))
}

export async function startPreview(port) {
  const server = await preview({
    logLevel: 'warn',
    preview: { port, strictPort: true, host: 'localhost', open: false },
  })
  let closed = false
  return {
    base: `http://localhost:${port}`,
    /** Closes the server (idempotent) and throws if the port is still served. */
    async close() {
      if (closed) return
      closed = true
      await server.close()
      if (await listening(port)) throw new Error(`port ${port} still has a listener after closing the preview server`)
    },
  }
}
