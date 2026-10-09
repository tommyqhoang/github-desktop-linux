/**
 * Per-repository health collector.
 *
 * Composed from injectable probes so tests run without a real git invocation
 * or a network call. Each probe returns a Promise — we run them concurrently
 * and tolerate individual failures (one collector returning an error does not
 * poison the snapshot for other signals).
 */

import { Repository } from '../../models/repository'
import { IRepoHealth } from './types'
import { computeAttentionScore } from './aggregate-status'

export interface IRepoHealthProbes {
  /** Number of files in the working directory that aren't clean. */
  readonly uncommittedCount: (repo: Repository) => Promise<number>
  /** `[ahead, behind]` against the configured upstream. */
  readonly aheadBehind: (
    repo: Repository
  ) => Promise<{ ahead: number; behind: number }>
  /** Default branch CI status. */
  readonly defaultBranchStatus: (
    repo: Repository
  ) => Promise<IRepoHealth['defaultBranchStatus']>
  /** Number of open PRs targeting this repo. */
  readonly openPullRequestCount: (repo: Repository) => Promise<number>
  /** Unix seconds of last commit on the default branch (0 = unknown). */
  readonly lastActivityUnix: (repo: Repository) => Promise<number>
  /** Local branches with no commits in the last 60 days. */
  readonly staleBranchCount: (repo: Repository) => Promise<number>
}

export interface ICollectorOptions {
  readonly probes: IRepoHealthProbes
  readonly now?: () => number
}

/** Signals that can fail independently. */
export type RepoHealthSignalKey =
  'changes' | 'aheadBehind' | 'ci' | 'prs' | 'last' | 'stale'

/**
 * Run a probe, recording the signal name in `failed` and returning
 * `fallback` when it rejects (or throws synchronously).
 */
async function safe<T>(
  key: RepoHealthSignalKey,
  failed: RepoHealthSignalKey[],
  run: () => Promise<T>,
  fallback: T
): Promise<{ value: T; message: string | null }> {
  try {
    return { value: await run(), message: null }
  } catch (e) {
    failed.push(key)
    return {
      value: fallback,
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Collect every signal for a single repository. Signals run in parallel; a
 * rejected probe degrades to a default value but is recorded in
 * `failedSignals` so the UI can show it as unknown rather than 0. When the
 * git status probe itself fails the repository is considered unreadable and
 * `error` is set.
 */
export async function collectRepoHealth(
  repo: Repository,
  opts: ICollectorOptions
): Promise<IRepoHealth> {
  const now = (opts.now ?? Date.now)()
  const failed: RepoHealthSignalKey[] = []
  const p = opts.probes
  const [
    uncommitted,
    aheadBehind,
    defaultBranchStatus,
    openPullRequestCount,
    lastActivityUnix,
    staleBranchCount,
  ] = await Promise.all([
    safe('changes', failed, () => p.uncommittedCount(repo), 0),
    safe('aheadBehind', failed, () => p.aheadBehind(repo), {
      ahead: 0,
      behind: 0,
    }),
    safe<IRepoHealth['defaultBranchStatus']>(
      'ci',
      failed,
      () => p.defaultBranchStatus(repo),
      'unknown'
    ),
    safe('prs', failed, () => p.openPullRequestCount(repo), 0),
    safe('last', failed, () => p.lastActivityUnix(repo), 0),
    safe('stale', failed, () => p.staleBranchCount(repo), 0),
  ])

  const signals = {
    uncommittedCount: uncommitted.value,
    aheadBy: aheadBehind.value.ahead,
    behindBy: aheadBehind.value.behind,
    defaultBranchStatus: defaultBranchStatus.value,
    openPullRequestCount: openPullRequestCount.value,
  }

  return {
    repositoryId: repo.id,
    ...signals,
    lastActivityUnix: lastActivityUnix.value,
    staleBranchCount: staleBranchCount.value,
    attentionScore: computeAttentionScore(signals),
    collectedAt: now,
    // If git status itself failed the repo is unreadable (moved, deleted,
    // broken git): report it as an error rather than a clean repo.
    error:
      uncommitted.message !== null
        ? `Could not read repository status: ${uncommitted.message}`
        : null,
    failedSignals: failed,
  }
}

/**
 * Run multiple collectors in parallel with a concurrency cap.
 *
 * Returns an array of `IRepoHealth` aligned with the input order. Order is
 * preserved even when probes resolve out of order so callers can stably
 * render rows. When an `AbortSignal` is provided and aborts mid-run, the
 * remaining repos are skipped — the resulting array contains a `null`
 * placeholder for every skipped slot which callers must filter out.
 */
export async function collectMany(
  repos: ReadonlyArray<Repository>,
  opts: ICollectorOptions,
  concurrency: number = 4,
  signal?: AbortSignal,
  onResult?: (health: IRepoHealth) => void
): Promise<ReadonlyArray<IRepoHealth>> {
  if (concurrency < 1) {
    concurrency = 1
  }
  const results: Array<IRepoHealth | null> = new Array(repos.length).fill(null)
  let cursor = 0
  async function worker() {
    while (true) {
      if (signal?.aborted) {
        return
      }
      const idx = cursor++
      if (idx >= repos.length) {
        return
      }
      const health = await collectRepoHealth(repos[idx], opts)
      results[idx] = health
      onResult?.(health)
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, repos.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results.filter((r): r is IRepoHealth => r !== null)
}
