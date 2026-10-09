import { BaseStore } from './base-store'
import { SingleFlight } from '../single-flight'
import { Repository } from '../../models/repository'
import { ISubmoduleStatusEntry } from '../../models/submodule'
import { getSubmodules } from '../git/submodule'

/**
 * Per-repository submodule list cache. Tracks whether a refresh is in flight so
 * the UI can show a spinner without double-issuing git commands.
 */
export interface IRepoSubmoduleState {
  readonly entries: ReadonlyArray<ISubmoduleStatusEntry>
  readonly loading: boolean
  readonly error: Error | null
  readonly loadedAt: number | null
  /** True while an update/sync is running for this repository. */
  readonly busy: boolean
}

const EMPTY_STATE: IRepoSubmoduleState = Object.freeze({
  entries: [],
  loading: false,
  error: null,
  loadedAt: null,
  busy: false,
})

/** Cache of submodule entries by repository id. */
export class SubmoduleStore extends BaseStore {
  private readonly flight = new SingleFlight<number, void>()
  private state: Map<number, IRepoSubmoduleState> = new Map()

  /** Get the cached state for a repository, or an empty state if not loaded. */
  public getState(repository: Repository): IRepoSubmoduleState {
    return this.state.get(repository.id) ?? EMPTY_STATE
  }

  /** Get the full state map. */
  public getAllState(): ReadonlyMap<number, IRepoSubmoduleState> {
    return this.state
  }

  /**
   * Refresh the submodule list for the given repository. Overlapping calls
   * share one trailing refresh that starts after the current one settles, so a
   * caller that just updated or synced submodules never gets a list read
   * before its change.
   */
  public loadSubmodules(repository: Repository): Promise<void> {
    if (!repository?.path) {
      return Promise.resolve()
    }
    return this.flight.run(repository.id, () =>
      this.doLoadSubmodules(repository)
    )
  }

  private async doLoadSubmodules(repository: Repository): Promise<void> {
    const current = this.state.get(repository.id)

    this.update(repository.id, current ?? EMPTY_STATE, { loading: true })

    try {
      const entries = await getSubmodules(repository)

      // The store may have been cleared (e.g., user removed the repo) while we
      // were awaiting git. A missing entry now means an intervening clear() —
      // don't resurrect the dropped state.
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

  /** True while an update/sync is running for the repository. */
  public isBusy(repository: Repository): boolean {
    return this.state.get(repository.id)?.busy ?? false
  }

  /**
   * Run a mutating submodule operation with the repository marked busy so the
   * UI can disable its actions. A second call while one is running is
   * ignored (resolves `false`). The list is refreshed afterwards whether or
   * not the operation failed, and the operation's error is rethrown.
   */
  public async runExclusive(
    repository: Repository,
    operation: () => Promise<void>
  ): Promise<boolean> {
    if (this.isBusy(repository)) {
      return false
    }
    this.update(repository.id, this.state.get(repository.id) ?? EMPTY_STATE, {
      busy: true,
    })
    try {
      await operation()
    } finally {
      const base = this.state.get(repository.id)
      if (base !== undefined) {
        this.update(repository.id, base, { busy: false })
      }
      await this.loadSubmodules(repository)
    }
    return true
  }

  /** Drop the cached state for a repository. */
  public clear(repository: Repository): void {
    // A refresh queued behind the one in flight must not repopulate the cache
    // for a repository that is being dropped.
    this.flight.cancel(repository.id, undefined)
    this.state.delete(repository.id)
    this.emitUpdate()
  }

  private update(
    repositoryId: number,
    current: IRepoSubmoduleState,
    partial: Partial<IRepoSubmoduleState>
  ): void {
    const next = { ...current, ...partial }
    this.state.set(repositoryId, next)
    this.emitUpdate()
  }
}
