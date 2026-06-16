import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { FileTreeEntry } from '../../models/file-tree'
import { readWorkingDirectory } from '../file-tree/list-directory'

/** Per-repository cache of expanded folders, their children, and selection. */
export interface IRepoFileTreeState {
  /** Paths of folders the user has expanded (root '' is implicitly expanded). */
  readonly expandedPaths: ReadonlySet<string>
  /** Cached directory listings keyed by directory path ('' is the root). */
  readonly childrenByPath: ReadonlyMap<string, ReadonlyArray<FileTreeEntry>>
  /** Directory paths with a listing currently in flight. */
  readonly loadingPaths: ReadonlySet<string>
  /** The file currently shown in the viewer, or null. */
  readonly selectedFilePath: string | null
  readonly error: Error | null
}

const EMPTY_STATE: IRepoFileTreeState = Object.freeze({
  expandedPaths: new Set<string>(),
  childrenByPath: new Map<string, ReadonlyArray<FileTreeEntry>>(),
  loadingPaths: new Set<string>(),
  selectedFilePath: null,
  error: null,
})

/** Cache of working-tree structure by repository id. */
export class FileTreeStore extends BaseStore {
  private state: Map<number, IRepoFileTreeState> = new Map()
  /** In-flight directory loads keyed by `${repositoryId}:${path}`. */
  private readonly inFlight = new Set<string>()

  /** Cached state for a repository, or an empty state if not loaded. */
  public getState(repository: Repository): IRepoFileTreeState {
    return this.state.get(repository.id) ?? EMPTY_STATE
  }

  /** The full state map (consumed by the app store for IAppState). */
  public getAllState(): ReadonlyMap<number, IRepoFileTreeState> {
    return this.state
  }

  /** Load (or reload) the root directory listing. */
  public loadRoot(repository: Repository): Promise<void> {
    return this.loadDirectory(repository, '')
  }

  /** Expand a folder, lazily loading its children if not cached. */
  public async expand(repository: Repository, path: string): Promise<void> {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const expandedPaths = new Set(current.expandedPaths)
    expandedPaths.add(path)
    this.update(repository.id, current, { expandedPaths })

    if (!current.childrenByPath.has(path)) {
      await this.loadDirectory(repository, path)
    }
  }

  /** Collapse a folder (its cached children are retained). */
  public collapse(repository: Repository, path: string): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const expandedPaths = new Set(current.expandedPaths)
    expandedPaths.delete(path)
    this.update(repository.id, current, { expandedPaths })
  }

  /** Set the file shown in the viewer. */
  public selectFile(repository: Repository, path: string): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    this.update(repository.id, current, { selectedFilePath: path })
  }

  /** Drop all cached state for a repository. */
  public clear(repository: Repository): void {
    this.state.delete(repository.id)
    this.emitUpdate()
  }

  private async loadDirectory(
    repository: Repository,
    path: string
  ): Promise<void> {
    const key = `${repository.id}:${path}`
    if (this.inFlight.has(key)) {
      return
    }
    this.inFlight.add(key)

    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const loadingPaths = new Set(current.loadingPaths)
    loadingPaths.add(path)
    this.update(repository.id, current, { loadingPaths })

    try {
      const entries = await readWorkingDirectory(repository, path)

      // The repository may have been cleared (e.g. removed) while git ran.
      // Keying by id prevents cross-repo writes; this guard prevents
      // resurrecting a dropped repository's state.
      if (!this.state.has(repository.id)) {
        return
      }

      const next = this.state.get(repository.id) ?? EMPTY_STATE
      const childrenByPath = new Map(next.childrenByPath)
      childrenByPath.set(path, entries)
      const nextLoading = new Set(next.loadingPaths)
      nextLoading.delete(path)
      this.update(repository.id, next, {
        childrenByPath,
        loadingPaths: nextLoading,
        error: null,
      })
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      if (!this.state.has(repository.id)) {
        this.emitError(error)
        return
      }
      const next = this.state.get(repository.id) ?? EMPTY_STATE
      const nextLoading = new Set(next.loadingPaths)
      nextLoading.delete(path)
      this.update(repository.id, next, { loadingPaths: nextLoading, error })
      this.emitError(error)
    } finally {
      this.inFlight.delete(key)
    }
  }

  private update(
    repositoryId: number,
    current: IRepoFileTreeState,
    partial: Partial<IRepoFileTreeState>
  ): void {
    this.state.set(repositoryId, { ...current, ...partial })
    this.emitUpdate()
  }
}
