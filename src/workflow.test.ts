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
  it('has CNAME for the custom domain', () => {
    expect(readFileSync('public/CNAME', 'utf8').trim()).toBe('tools.anhlp.com')
  })
})
