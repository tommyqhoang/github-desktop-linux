import {
  getBranchCommitSummaries,
  getCommitDiffText,
  getWorkingDiffText,
} from '../../../src/lib/ai/git-context'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { getCommits } from '../../../src/lib/git'
import { writeFile } from 'fs-extra'
import * as Path from 'path'

describe('ai/git-context', () => {
  it('getWorkingDiffText returns the uncommitted diff against HEAD', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'one\n' }],
      commitMessage: 'init',
    })
    await writeFile(Path.join(repo.path, 'file.txt'), 'one\ntwo\n')

    const diff = await getWorkingDiffText(repo)
    expect(diff).toContain('+two')
    expect(diff).toContain('file.txt')
  })

  it('getWorkingDiffText returns empty string for a clean tree', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\n' }],
      commitMessage: 'init',
    })
    expect((await getWorkingDiffText(repo)).trim()).toBe('')
  })

  it('getCommitDiffText returns the diff for a commit', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\n' }],
      commitMessage: 'first',
    })
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\nb\n' }],
      commitMessage: 'second',
    })
    const [head] = await getCommits(repo, 'HEAD', 1)
    const diff = await getCommitDiffText(repo, head.sha)
    expect(diff).toContain('+b')
  })

  it('getBranchCommitSummaries lists commit summaries above a base', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'base.txt', contents: 'b\n' }],
      commitMessage: 'base commit',
    })
    const [base] = await getCommits(repo, 'HEAD', 1)
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\n' }],
      commitMessage: 'feature one',
    })
    await makeCommit(repo, {
      entries: [{ path: 'b.txt', contents: 'b\n' }],
      commitMessage: 'feature two',
    })

    const summaries = await getBranchCommitSummaries(repo, base.sha)
    expect(summaries).toContain('feature one')
    expect(summaries).toContain('feature two')
    expect(summaries).not.toContain('base commit')
  })
})
