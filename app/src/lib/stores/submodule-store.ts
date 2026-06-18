import { BaseStore } from './base-store'
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
}

const EMPTY_STATE: IRepoSubmoduleState = Object.freeze({
  entries: [],
  loading: false,
  error: null,
  loadedAt: null,
})

/** Cache of submodule entries by repository id. */
export class SubmoduleStore extends BaseStore {
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
   * Refresh the submodule list for the given repository. Concurrent calls for
   * the same repository coalesce.
   */
  public async loadSubmodules(repository: Repository): Promise<void> {
    if (!repository?.path) {
      return
    }

    const current = this.state.get(repository.id)
    if (current?.loading) {
      return
    }

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

  /** Drop the cached state for a repository. */
  public clear(repository: Repository): void {
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
