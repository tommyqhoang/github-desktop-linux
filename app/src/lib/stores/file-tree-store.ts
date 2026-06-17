import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { FileTreeEntry } from '../../models/file-tree'
import { readWorkingDirectory } from '../file-tree/list-directory'

/** Per-repository cache of expanded folders, their children, and open tabs. */
export interface IRepoFileTreeState {
  /** Paths of folders the user has expanded (root '' is implicitly expanded). */
  readonly expandedPaths: ReadonlySet<string>
  /** Cached directory listings keyed by directory path ('' is the root). */
  readonly childrenByPath: ReadonlyMap<string, ReadonlyArray<FileTreeEntry>>
  /** Directory paths with a listing currently in flight. */
  readonly loadingPaths: ReadonlySet<string>
  /** Open file tabs, in tab order (left to right). */
  readonly openFilePaths: ReadonlyArray<string>
  /** The active (focused) tab shown in the viewer, or null when none is open. */
  readonly activeFilePath: string | null
  /** The tree entry currently being renamed inline, or null. */
  readonly renamingPath: string | null
  /**
   * Bumped whenever the working tree is re-scanned (e.g. after a pull or
   * checkout) so the viewer can re-check its open file for on-disk changes.
   */
  readonly refreshToken: number
  readonly error: Error | null
}

const EMPTY_STATE: IRepoFileTreeState = Object.freeze({
  expandedPaths: new Set<string>(),
  childrenByPath: new Map<string, ReadonlyArray<FileTreeEntry>>(),
  loadingPaths: new Set<string>(),
  openFilePaths: [],
  activeFilePath: null,
  renamingPath: null,
  refreshToken: 0,
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

  /**
   * Open a file in the viewer: append a tab if it isn't already open and make
   * it the active tab. Re-opening an already-open file just focuses its tab.
   */
  public openFile(repository: Repository, path: string): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const openFilePaths = current.openFilePaths.includes(path)
      ? current.openFilePaths
      : [...current.openFilePaths, path]
    this.update(repository.id, current, { openFilePaths, activeFilePath: path })
  }

  /** Focus an already-open tab without changing the set of open tabs. */
  public activateFile(repository: Repository, path: string): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    if (!current.openFilePaths.includes(path)) {
      return
    }
    this.update(repository.id, current, { activeFilePath: path })
  }

  /**
   * Close a single tab. If the closed tab was active, focus the neighbour to
   * its right, falling back to the one on its left (or null when none remain).
   */
  public closeFile(repository: Repository, path: string): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const index = current.openFilePaths.indexOf(path)
    if (index === -1) {
      return
    }

    const openFilePaths = current.openFilePaths.filter(p => p !== path)

    let activeFilePath = current.activeFilePath
    if (current.activeFilePath === path) {
      activeFilePath = openFilePaths[index] ?? openFilePaths[index - 1] ?? null
    }

    this.update(repository.id, current, { openFilePaths, activeFilePath })
  }

  /** Close every open tab. */
  public closeAllFiles(repository: Repository): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    if (current.openFilePaths.length === 0) {
      return
    }
    this.update(repository.id, current, {
      openFilePaths: [],
      activeFilePath: null,
    })
  }

  /**
   * Close `path` and every tab nested beneath it (used when an entry — possibly
   * a directory — is deleted). The active tab falls back to the first remaining.
   */
  public closeFilesUnder(repository: Repository, path: string): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const prefix = `${path}/`
    const openFilePaths = current.openFilePaths.filter(
      p => p !== path && !p.startsWith(prefix)
    )
    if (openFilePaths.length === current.openFilePaths.length) {
      return
    }

    const stillActive =
      current.activeFilePath !== null &&
      openFilePaths.includes(current.activeFilePath)
    const activeFilePath = stillActive
      ? current.activeFilePath
      : openFilePaths[0] ?? null

    this.update(repository.id, current, { openFilePaths, activeFilePath })
  }

  /** Mark a tree entry as being renamed inline. */
  public beginRename(repository: Repository, path: string): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    this.update(repository.id, current, { renamingPath: path })
  }

  /** Clear any in-progress inline rename. */
  public cancelRename(repository: Repository): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    if (current.renamingPath === null) {
      return
    }
    this.update(repository.id, current, { renamingPath: null })
  }

  /**
   * Rewrite open tabs after an entry has been renamed on disk, handling both the
   * entry itself and (for a directory) any descendants, then clear the rename
   * flag.
   */
  public reconcileRename(
    repository: Repository,
    oldPath: string,
    newPath: string
  ): void {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const prefix = `${oldPath}/`
    const rewrite = (p: string): string =>
      p === oldPath
        ? newPath
        : p.startsWith(prefix)
        ? newPath + p.slice(oldPath.length)
        : p

    const openFilePaths = current.openFilePaths.map(rewrite)
    const activeFilePath =
      current.activeFilePath === null ? null : rewrite(current.activeFilePath)

    this.update(repository.id, current, {
      openFilePaths,
      activeFilePath,
      renamingPath: null,
    })
  }

  /** Re-read a directory listing, overwriting any cached entries. */
  public reloadDirectory(repository: Repository, path: string): Promise<void> {
    return this.loadDirectory(repository, path)
  }

  /**
   * Re-scan the working tree: reload the root and every currently-expanded
   * directory so new/removed files surface, then bump `refreshToken` to signal
   * open viewers to re-check their files. Called when the working tree may have
   * changed underneath us (pull, checkout, discard, …).
   */
  public async refreshTree(repository: Repository): Promise<void> {
    const current = this.state.get(repository.id) ?? EMPTY_STATE
    const paths = ['', ...current.expandedPaths]
    await Promise.all(paths.map(p => this.loadDirectory(repository, p)))

    // The repository may have been removed while the listings were in flight.
    if (!this.state.has(repository.id)) {
      return
    }
    const next = this.state.get(repository.id) ?? EMPTY_STATE
    this.update(repository.id, next, { refreshToken: next.refreshToken + 1 })
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
