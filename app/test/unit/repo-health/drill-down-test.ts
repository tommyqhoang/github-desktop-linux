import { resolveDrillDownSection } from '../../../src/lib/repo-health/drill-down'
import { RepositorySectionTab } from '../../../src/lib/app-state'

describe('resolveDrillDownSection', () => {
  it('routes uncommitted changes to the Changes tab', () => {
    expect(resolveDrillDownSection('changes')).toBe(
      RepositorySectionTab.Changes
    )
  })

  it('routes ahead/behind to the History tab', () => {
    expect(resolveDrillDownSection('ahead')).toBe(RepositorySectionTab.History)
    expect(resolveDrillDownSection('behind')).toBe(RepositorySectionTab.History)
  })

  it('routes CI status to the Actions tab', () => {
    expect(resolveDrillDownSection('ci')).toBe(RepositorySectionTab.Actions)
  })

  it('returns null for signals without a dedicated tab', () => {
    expect(resolveDrillDownSection('prs')).toBeNull()
    expect(resolveDrillDownSection('stale')).toBeNull()
    expect(resolveDrillDownSection('last')).toBeNull()
  })
})
