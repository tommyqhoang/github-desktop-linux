import { dirname } from 'path'
import { remove } from 'fs-extra'
import { git } from '../git/core'
import { getTempFilePath } from '../file-system'
import { getCommits } from '../git/log'
import { revRange } from '../git/rev-list'
import { Repository } from '../../models/repository'

/**
 * Raw `git diff`/`git show` text helpers used to build AI prompts. These return
 * plain patch text (not the structured `IDiff`) because the model only needs
 * the textual diff, which keeps the orchestrators simple.
 */

/**
 * Paths never sent to the AI provider. Credentials and key material would
 * leave the machine inside the diff text, and lockfiles are large generated
 * noise that crowds real changes out of the prompt budget.
 *
 * These are git pathspecs (`:(exclude,glob)`), so they apply to the diff
 * itself rather than being filtered out of text afterwards.
 */
export const AI_DIFF_EXCLUDED_PATHS: ReadonlyArray<string> = [
  // Secrets and key material
  '**/.env',
  '**/.env.*',
  '**/.npmrc',
  '**/.netrc',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.keystore',
  '**/id_rsa*',
  '**/id_ed25519*',
  // Generated lockfiles
  '**/yarn.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/Gemfile.lock',
  '**/composer.lock',
  '**/go.sum',
]

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`)
}

// Every excluded pattern is `**/<basename glob>`, so matching the basename is
// equivalent to the git pathspec.
const excludedBasenameMatchers = AI_DIFF_EXCLUDED_PATHS.map(p =>
  globToRegExp(p.replace(/^\*\*\//, ''))
)

/**
 * Whether a repository-relative path is excluded from AI prompts (secrets,
 * key material, lockfiles). Same rule set as the diff pathspecs, for callers
 * that read file contents directly instead of going through `git diff`.
 */
export function isAIExcludedPath(relativePath: string): boolean {
  const base = relativePath.split(/[\\/]/).pop() ?? relativePath
  return excludedBasenameMatchers.some(re => re.test(base))
}

const excludePathspecs = (): ReadonlyArray<string> => [
  '--',
  '.',
  ...AI_DIFF_EXCLUDED_PATHS.map(p => `:(exclude,glob)${p}`),
]

/**
 * The combined working-tree diff against HEAD, including brand-new untracked
 * files. `git diff HEAD` alone ignores untracked files, so changes are staged
 * with `--intent-to-add` into a throwaway index (the real index is untouched
 * and no blobs are written) and diffed against HEAD.
 */
export async function getWorkingDiffText(
  repository: Repository
): Promise<string> {
  let indexPath: string | null = null
  try {
    indexPath = await getTempFilePath('desktop-ai-working-diff-index')
    const env = { GIT_INDEX_FILE: indexPath }
    await git(['read-tree', 'HEAD'], repository.path, 'aiWorkingDiff', { env })
    await git(
      ['add', '--all', '--intent-to-add', ...excludePathspecs()],
      repository.path,
      'aiWorkingDiff',
      { env }
    )
    const result = await git(
      ['diff', 'HEAD', '--no-color', ...excludePathspecs()],
      repository.path,
      'aiWorkingDiff',
      { env, successExitCodes: new Set([0, 1]) }
    )
    return result.stdout
  } catch {
    // e.g. no commits yet, or the temp index couldn't be created: fall back
    // to the tracked-changes-only diff.
    const result = await git(
      ['diff', 'HEAD', '--no-color', ...excludePathspecs()],
      repository.path,
      'aiWorkingDiff',
      { successExitCodes: new Set([0, 1]) }
    )
    return result.stdout
  } finally {
    if (indexPath !== null) {
      await remove(dirname(indexPath)).catch(() => {})
    }
  }
}

/** The diff of the current branch against its merge-base with `baseRef`. */
export async function getBranchDiffText(
  repository: Repository,
  baseRef: string
): Promise<string> {
  const result = await git(
    ['diff', `${baseRef}...HEAD`, '--no-color', ...excludePathspecs()],
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
    ['show', '--no-color', '--format=medium', sha, ...excludePathspecs()],
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
