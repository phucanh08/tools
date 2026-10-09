import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

describe('deploy workflow + static config', () => {
  const wf = parse(readFileSync('.github/workflows/deploy.yml', 'utf8'))
  it('deploys to Pages on push to main and manual dispatch with correct permissions', () => {
    expect(wf.on.push.branches).toEqual(['main'])
    expect(wf.on).toHaveProperty('workflow_dispatch')
    expect(wf.permissions).toMatchObject({ pages: 'write', 'id-token': 'write', contents: 'read' })
    expect(wf.concurrency.group).toBe('pages')
    const uses = [...wf.jobs.build.steps, ...wf.jobs.deploy.steps].map((s: { uses?: string }) => s.uses).filter(Boolean)
    expect(uses.join(' ')).toMatch(/actions\/configure-pages@.*actions\/upload-pages-artifact@.*actions\/deploy-pages@/)
    expect(wf.jobs.deploy.environment.name).toBe('github-pages')
  })
  it('runs the headless-Chrome browser check after the build and before the Pages artifact upload', () => {
    type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string> }
    const steps: Step[] = wf.jobs.build.steps
    const at = (pred: (s: Step) => boolean) => steps.findIndex(pred)
    const build = at((s) => s.run === 'pnpm build')
    const browser = at((s) => /^pnpm browser$/m.test(s.run ?? ''))
    const upload = at((s) => (s.uses ?? '').startsWith('actions/upload-pages-artifact@'))
    expect(build).toBeGreaterThanOrEqual(0)
    expect(browser).toBeGreaterThan(build)
    expect(upload).toBeGreaterThan(browser)
    expect(steps[browser]?.env?.CHROME_PATH).toBe('/usr/bin/google-chrome')
    // A failing browser check must fail the build job, which `deploy` depends on.
    expect(steps[browser]).not.toHaveProperty('continue-on-error')
    expect(wf.jobs.deploy.needs).toBe('build')
  })
  it('has CNAME for the custom domain', () => {
    expect(readFileSync('public/CNAME', 'utf8').trim()).toBe('tools.anhlp.com')
  })
})
