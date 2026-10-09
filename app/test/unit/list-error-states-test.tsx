import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StashList } from '../../src/ui/stashes/stash-list'
import { WorktreeList } from '../../src/ui/worktrees/worktree-list'
import { SubmoduleList } from '../../src/ui/submodules/submodule-list'
import { SubmoduleWorkDirState } from '../../src/models/submodule'
import {
  WorkflowRunList,
  getDispatchableWorkflows,
  getUnavailableMessage,
} from '../../src/ui/workflow-runs/workflow-run-list'
import { describeDispatchError } from '../../src/ui/workflow-runs/workflow-run-dispatch-dialog'
import {
  mapWithConcurrency,
  WorktreeStatusConcurrency,
} from '../../src/lib/stores/worktree-store'
import { Repository } from '../../src/models/repository'

const noop = () => undefined
const boom = new Error('git exploded')

describe('list error states', () => {
  it('stash list shows an alert with Retry instead of the empty message', () => {
    const html = renderToStaticMarkup(
      <StashList
        entries={[]}
        loading={false}
        selectedSha={null}
        onSelect={noop}
        onCreateClick={noop}
        error={boom}
        onRetry={noop}
      />
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('git exploded')
    expect(html).toContain('Retry')
    expect(html).not.toContain('No stashes')
  })

  it('worktree list shows an alert with Retry', () => {
    const html = renderToStaticMarkup(
      <WorktreeList
        entries={[]}
        loading={false}
        onCreateWorktree={noop}
        onPruneWorktrees={noop}
        onRemoveWorktree={noop}
        error={boom}
        onRetry={noop}
      />
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Retry')
    expect(html).not.toContain('No linked worktrees')
  })

  it('worktree list keeps cached rows while reloading', () => {
    const html = renderToStaticMarkup(
      <WorktreeList
        entries={[
          {
            path: '/wt/a',
            head: 'abcdef0123',
            branch: 'a',
            isDetached: false,
            isBare: false,
            lockedReason: null,
            prunableReason: null,
            changesCount: 0,
          },
        ]}
        loading={true}
        onCreateWorktree={noop}
        onPruneWorktrees={noop}
        onRemoveWorktree={noop}
      />
    )
    expect(html).toContain('/wt/a')
    expect(html).not.toContain('Loading worktrees')
    expect(html).toContain('aria-busy="true"')
  })

  it('submodule list shows an alert with Retry', () => {
    const html = renderToStaticMarkup(
      <SubmoduleList
        entries={[]}
        loading={false}
        onUpdateAll={noop}
        onSyncAll={noop}
        onUpdateSubmodule={noop}
        error={boom}
        onRetry={noop}
      />
    )
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('No submodules found')
  })

  it('submodule list disables every action while busy and keeps rows', () => {
    const html = renderToStaticMarkup(
      <SubmoduleList
        entries={[
          {
            sha: 'abcdef0123456789',
            path: 'vendor/lib',
            describe: '',
            state: SubmoduleWorkDirState.UpToDate,
          },
        ]}
        loading={false}
        busy={true}
        onUpdateAll={noop}
        onSyncAll={noop}
        onUpdateSubmodule={noop}
      />
    )
    expect(html).toContain('vendor/lib')
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(3)
  })

  const repo = new Repository('/tmp/r', 1, null, false)
  const renderRuns = (props: object) =>
    renderToStaticMarkup(
      <WorkflowRunList
        entries={[]}
        loading={false}
        repository={repo}
        dispatcher={{} as any}
        accounts={[]}
        branch="main"
        {...props}
      />
    )

  it('workflow list renders distinct empty states', () => {
    expect(renderRuns({ unavailable: 'signed-out' })).toContain(
      'Sign in to GitHub'
    )
    expect(renderRuns({ unavailable: 'not-github' })).toContain(
      'isn’t on GitHub'
    )
    expect(renderRuns({ error: boom })).toContain('role="alert"')
    expect(renderRuns({})).toContain('No workflow runs yet')
    expect(getUnavailableMessage('no-actions')).toContain('Actions')
  })

  it('workflow list keeps runs and shows the error when a refresh fails', () => {
    const run: any = {
      id: 7,
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      runNumber: 3,
      event: 'push',
      headBranch: 'main',
      headSha: 'abc',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      runStartedAt: null,
      duration: null,
      workflowName: 'CI',
      htmlUrl: '',
    }
    const html = renderRuns({ entries: [run], error: boom, onRetry: noop })
    expect(html).toContain('role="alert"')
    expect(html).toContain('CI')
  })

  it('only offers active workflows for dispatch', () => {
    const result = getDispatchableWorkflows([
      { id: 1, name: 'a', path: 'a.yml', state: 'active' },
      { id: 2, name: 'b', path: 'b.yml', state: 'disabled_manually' },
      { id: 3, name: 'c', path: 'c.yml', state: 'deleted' },
    ])
    expect(result).toEqual([{ id: 1, name: 'a' }])
  })

  it('turns a bare HTTP 422 into an actionable dispatch message', () => {
    expect(describeDispatchError(new Error('... HTTP 422'))).toContain(
      'workflow_dispatch'
    )
    expect(describeDispatchError(new Error('other'))).toBe('other')
  })
})

describe('mapWithConcurrency', () => {
  it('never exceeds the limit and preserves order', async () => {
    let active = 0
    let peak = 0
    const out = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      WorktreeStatusConcurrency,
      async n => {
        active++
        peak = Math.max(peak, active)
        await new Promise(r => setTimeout(r, 5))
        active--
        return n * 2
      }
    )
    expect(peak).toBeLessThanOrEqual(WorktreeStatusConcurrency)
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
  })
})
