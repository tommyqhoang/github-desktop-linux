import * as Path from 'path'
import { BaseStore } from './base-store'
import { SingleFlight } from '../single-flight'
import { Repository } from '../../models/repository'
import { IWorktreeEntry } from '../../models/worktree'
import { listWorkTrees, getWorktreeStatusCount } from '../git/worktree'

/**
 * Per-repository worktree list cache. Whether a refresh is currently in flight
 * is tracked so that the UI can show a spinner without double-issuing git
 * commands.
 */
export interface IRepoWorktreeState {
  readonly entries: ReadonlyArray<IWorktreeEntry>
  readonly loading: boolean
  readonly error: Error | null
  readonly loadedAt: number | null
}

const EMPTY_STATE: IRepoWorktreeState = Object.freeze({
  entries: [],
  loading: false,
  error: null,
  loadedAt: null,
})

/** Max `git status` processes run at once when counting worktree changes. */
export const WorktreeStatusConcurrency = 4

/** Map `items` through `fn` with at most `limit` calls in flight, in order. */
export async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<ReadonlyArray<R>> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  )
  return results
}

/**
 * Cache of worktree entries by repository id.
 */
export class WorktreeStore extends BaseStore {
  private readonly flight = new SingleFlight<number, void>()
  private state: Map<number, IRepoWorktreeState> = new Map()

  /** Get the cached state for a repository, or an empty state if not loaded. */
  public getState(repository: Repository): IRepoWorktreeState {
    return this.state.get(repository.id) ?? EMPTY_STATE
  }

  /** Get the full state map. */
  public getAllState(): ReadonlyMap<number, IRepoWorktreeState> {
    return this.state
  }

  /**
   * Refresh the worktree list for the given repository. Overlapping calls share
   * one trailing refresh that starts after the current one settles, so a caller
   * that just added or removed a worktree never gets a list read before it.
   */
  public loadWorktrees(repository: Repository): Promise<void> {
    if (!repository?.path) {
      return Promise.resolve()
    }
    return this.flight.run(repository.id, () =>
      this.doLoadWorktrees(repository)
    )
  }

  private async doLoadWorktrees(repository: Repository): Promise<void> {
    const current = this.state.get(repository.id)

    this.update(repository.id, current ?? EMPTY_STATE, { loading: true })

    try {
      const worktrees = await listWorkTrees(repository)
      // Exclude the main worktree and get change counts for linked worktrees.
      const repositoryPath = Path.resolve(repository.path)
      const linked = worktrees.filter(
        wt => wt?.path != null && Path.resolve(wt.path) !== repositoryPath
      )
      const entries = await mapWithConcurrency(
        linked,
        WorktreeStatusConcurrency,
        async (wt): Promise<IWorktreeEntry> => ({
          ...wt,
          changesCount: await getWorktreeStatusCount(wt.path),
        })
      )

      // The store may have been cleared (e.g., user removed the repo)
      // while we were awaiting git. `loadWorktrees` always seeds a
      // loading entry above, so a missing entry now means an intervening
      // clear() — don't resurrect the dropped state.
      if (!this.state.has(repository.id)) {
        return
      }

      this.update(repository.id, this.state.get(repository.id) ?? EMPTY_STATE, {
        entries,
        loading: false,
        error: null,
        loadedAt: Date.now(),
      })
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      // Same clear-during-load guard as the success path: don't recreate
      // state for a repository that was dropped while git was running.
      if (!this.state.has(repository.id)) {
        this.emitError(error)
        return
      }
      this.update(repository.id, this.state.get(repository.id) ?? EMPTY_STATE, {
        loading: false,
        error,
      })
      this.emitError(error)
    }
  }

  /**
   * Drop the cached state for a repository.
   */
  public clear(repository: Repository): void {
    // A refresh queued behind the one in flight must not repopulate the cache
    // for a repository that is being dropped.
    this.flight.cancel(repository.id, undefined)
    this.state.delete(repository.id)
    this.emitUpdate()
  }

  private update(
    repositoryId: number,
    current: IRepoWorktreeState,
    partial: Partial<IRepoWorktreeState>
  ): void {
    const next = { ...current, ...partial }
    this.state.set(repositoryId, next)
    this.emitUpdate()
  }
}
