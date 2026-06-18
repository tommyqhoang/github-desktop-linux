import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RepoHealthRow } from '../../../src/ui/repo-health/repo-health-row'
import { Repository } from '../../../src/models/repository'
import { IRepoHealth } from '../../../src/lib/repo-health/types'
import { RepositorySectionTab } from '../../../src/lib/app-state'

const repo = new Repository('/tmp/repo', 1, null, false)

const health: IRepoHealth = {
  repositoryId: 1,
  uncommittedCount: 3,
  aheadBy: 2,
  behindBy: 1,
  defaultBranchStatus: 'failure',
  openPullRequestCount: 4,
  lastActivityUnix: Math.floor(Date.now() / 1000),
  staleBranchCount: 0,
  attentionScore: 40,
  collectedAt: Date.now(),
  error: null,
}

function render(onDrillDown?: any): string {
  return renderToStaticMarkup(
    React.createElement(RepoHealthRow, {
      repository: repo,
      health,
      refreshing: false,
      onClick: () => undefined,
      onDrillDown,
    })
  )
}

describe('RepoHealthRow drill-down', () => {
  it('renders drillable signals as buttons when onDrillDown is provided', () => {
    const html = render(() => undefined)
    // Changes / Ahead / Behind / CI resolve to a section → buttons.
    const buttonCount = (html.match(/<button/g) ?? []).length
    expect(buttonCount).toBeGreaterThanOrEqual(4)
  })

  it('does not render signal buttons without an onDrillDown handler', () => {
    const html = render(undefined)
    expect(html).not.toContain('repo-health-card__cell-button')
  })

  it('invokes onDrillDown with the resolved section for a signal', () => {
    const onDrillDown = jest.fn()
    const row = new RepoHealthRow({
      repository: repo,
      health,
      refreshing: false,
      onClick: () => undefined,
      onDrillDown,
    })
    // Activating the "changes" signal routes to the Changes tab.
    ;(row as any).onSignalActivate('changes')
    expect(onDrillDown).toHaveBeenCalledWith(repo, RepositorySectionTab.Changes)
  })

  it('falls back to a plain repo selection for non-tab signals', () => {
    const onDrillDown = jest.fn()
    const onClick = jest.fn()
    const row = new RepoHealthRow({
      repository: repo,
      health,
      refreshing: false,
      onClick,
      onDrillDown,
    })
    // "prs" has no dedicated tab → selects the repo without a section.
    ;(row as any).onSignalActivate('prs')
    expect(onDrillDown).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledWith(repo)
  })
})
