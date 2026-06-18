import { git } from '../git/core'
import { getCommits } from '../git/log'
import { revRange } from '../git/rev-list'
import { Repository } from '../../models/repository'

/**
 * Raw `git diff`/`git show` text helpers used to build AI prompts. These return
 * plain patch text (not the structured `IDiff`) because the model only needs
 * the textual diff, which keeps the orchestrators simple.
 */

/** The combined working-tree diff against HEAD (tracked changes). */
export async function getWorkingDiffText(
  repository: Repository
): Promise<string> {
  const result = await git(
    ['diff', 'HEAD', '--no-color'],
    repository.path,
    'aiWorkingDiff',
    { successExitCodes: new Set([0, 1]) }
  )
  return result.stdout
}

/** The diff of the current branch against its merge-base with `baseRef`. */
export async function getBranchDiffText(
  repository: Repository,
  baseRef: string
): Promise<string> {
  const result = await git(
    ['diff', `${baseRef}...HEAD`, '--no-color'],
    repository.path,
    'aiBranchDiff',
    { successExitCodes: new Set([0, 1]) }
  )
  return result.stdout
}

/** The full diff for a single commit. */
export async function getCommitDiffText(
  repository: Repository,
  sha: string
): Promise<string> {
  const result = await git(
    ['show', '--no-color', '--format=medium', sha],
    repository.path,
    'aiCommitDiff'
  )
  return result.stdout
}

/** Commit summaries on the current branch above `baseRef`, oldest-last. */
export async function getBranchCommitSummaries(
  repository: Repository,
  baseRef: string
): Promise<ReadonlyArray<string>> {
  const commits = await getCommits(repository, revRange(baseRef, 'HEAD'), 100)
  return commits.map(c => c.summary)
}
