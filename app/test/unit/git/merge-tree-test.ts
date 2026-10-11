import * as FSE from 'fs-extra'
import * as path from 'path'
import { exec } from 'dugite'

import { setupEmptyRepository } from '../../helpers/repositories'
import { determineMergeability } from '../../../src/lib/git/merge-tree'
import { Branch, BranchType } from '../../../src/models/branch'
import { ComputedAction } from '../../../src/models/computed-action'
import { Repository } from '../../../src/models/repository'

async function commitFile(repo: Repository, name: string, content: string) {
  await FSE.writeFile(path.join(repo.path, name), content)
  await exec(['add', name], repo.path)
  await exec(['commit', '-m', `edit ${name}`], repo.path)
  const result = await exec(['rev-parse', 'HEAD'], repo.path)
  return result.stdout.trim()
}

const branchAt = (name: string, sha: string) =>
  new Branch(
    name,
    null,
    { sha, author: null } as unknown as Branch['tip'],
    BranchType.Local,
    `refs/heads/${name}`
  )

describe('determineMergeability', () => {
  let repo: Repository
  let baseSha: string

  beforeEach(async () => {
    repo = await setupEmptyRepository()
    await commitFile(repo, 'a.txt', 'one\n')
    baseSha = await commitFile(repo, 'b.txt', 'one\n')
  })

  async function branchWith(name: string, files: Record<string, string>) {
    await exec(['checkout', '-b', name, baseSha], repo.path)
    let sha = baseSha
    for (const [file, content] of Object.entries(files)) {
      sha = await commitFile(repo, file, content)
    }
    return branchAt(name, sha)
  }

  it('reports a clean merge for changes to different files', async () => {
    const ours = await branchWith('ours', { 'a.txt': 'ours\n' })
    const theirs = await branchWith('theirs', { 'b.txt': 'theirs\n' })

    const result = await determineMergeability(repo, ours, theirs)
    expect(result.kind).toBe(ComputedAction.Clean)
  })

  it('counts every conflicted file', async () => {
    const ours = await branchWith('ours', {
      'a.txt': 'ours\n',
      'b.txt': 'ours\n',
    })
    const theirs = await branchWith('theirs', {
      'a.txt': 'theirs\n',
      'b.txt': 'theirs\n',
    })

    const result = await determineMergeability(repo, ours, theirs)
    expect(result).toEqual({
      kind: ComputedAction.Conflicts,
      conflictedFiles: 2,
    })
  })

  it('reports unrelated histories as invalid', async () => {
    const ours = await branchWith('ours', { 'a.txt': 'ours\n' })
    await exec(['checkout', '--orphan', 'orphan'], repo.path)
    const sha = await commitFile(repo, 'c.txt', 'orphan\n')

    const result = await determineMergeability(
      repo,
      ours,
      branchAt('orphan', sha)
    )
    expect(result.kind).toBe(ComputedAction.Invalid)
  })
})
