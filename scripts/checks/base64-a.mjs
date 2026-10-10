// Browser-check hooks for the Base64 tools of group A (t-34ae.1).
// Imported by scripts/browser-check.mjs. Keep checks deterministic and offline.

/**
 * Screenshots taken in light and dark: [name, path, setup?]. setup(page) runs after
 * navigation and before the screenshot (e.g. fill a sample input).
 * @type {Array<[string, string, ((page: import('playwright-core').Page) => Promise<void>)?]>}
 */
export const shots = []

/**
 * Interaction checks. Report with fail(msg) / ok(msg); console and CSP errors are
 * collected by the caller after this returns.
 * @param {{ page: import('playwright-core').Page, base: string, fail: (m: string) => void, ok: (m: string) => void }} ctx
 */
export async function run(ctx) {
  void ctx
}
