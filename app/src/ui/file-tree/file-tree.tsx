import * as React from 'react'
import { FileTreeItem } from './file-tree-item'
import { IRepoFileTreeState } from '../../lib/stores/file-tree-store'
import { FileTreeEntry } from '../../models/file-tree'

interface IFileTreeProps {
  readonly state: IRepoFileTreeState
  readonly onToggleFolder: (path: string) => void
  readonly onSelectFile: (path: string) => void
  readonly onContextMenu: (entry: FileTreeEntry) => void
  readonly onSubmitRename: (entry: FileTreeEntry, newName: string) => void
  readonly onCancelRename: () => void
  /** Begin inline rename of an entry (F2). Omitted => F2 does nothing. */
  readonly onBeginRename?: (entry: FileTreeEntry) => void
  /** Reload the tree after a listing failure. Omitted => no Retry button. */
  readonly onRetry?: () => void
}

interface IFileTreeState {
  /** Path of the row that owns the roving tabindex, or null for the default. */
  readonly focusedPath: string | null
}

interface IFlatRow {
  readonly entry: FileTreeEntry
  readonly depth: number
  /** Number of siblings in this row's directory. */
  readonly setSize: number
  /** 1-based position among those siblings. */
  readonly posInSet: number
}

/**
 * The Files sidebar tree. Flattens the cached directory listings into a
 * depth-ordered list, expanding only the folders the user has opened.
 */
export class FileTree extends React.Component<IFileTreeProps, IFileTreeState> {
  private readonly containerRef = React.createRef<HTMLDivElement>()
  /**
   * Path to focus once the tree re-renders after an inline rename ends via
   * the keyboard, so focus returns to the row instead of falling to <body>.
   */
  private pendingFocusPath: string | null = null

  public state: IFileTreeState = { focusedPath: null }

  /** The currently selected row's element, for reveal-on-select scrolling. */
  private selectedItemRef: HTMLElement | null = null

  public componentDidUpdate(prevProps: IFileTreeProps) {
    if (
      this.pendingFocusPath !== null &&
      this.props.state.renamingPath === null
    ) {
      const ix = this.flatten().findIndex(
        r => r.entry.path === this.pendingFocusPath
      )
      if (ix !== -1) {
        this.pendingFocusPath = null
        this.focusRow(ix)
      }
    }

    // When the active file changes (e.g. switching tabs), scroll its tree row
    // into view so the sidebar tracks what's being viewed.
    if (
      prevProps.state.activeFilePath !== this.props.state.activeFilePath &&
      this.selectedItemRef !== null
    ) {
      this.selectedItemRef.scrollIntoView({ block: 'nearest' })
    }
  }

  private onSelectedItemRef = (element: HTMLElement | null) => {
    this.selectedItemRef = element
  }

  /** Depth-first flatten starting at the root key (''). */
  private flatten(): ReadonlyArray<IFlatRow> {
    const { childrenByPath, expandedPaths } = this.props.state
    const rows: IFlatRow[] = []

    const walk = (path: string, depth: number) => {
      const children = childrenByPath.get(path)
      if (children === undefined) {
        return
      }
      children.forEach((entry, i) => {
        rows.push({
          entry,
          depth,
          setSize: children.length,
          posInSet: i + 1,
        })
        if (entry.kind === 'directory' && expandedPaths.has(entry.path)) {
          walk(entry.path, depth + 1)
        }
      })
    }

    walk('', 0)
    return rows
  }

  /** The path that currently owns the roving tabindex. */
  private tabStopPath(rows: ReadonlyArray<IFlatRow>): string | null {
    const { focusedPath } = this.state
    if (focusedPath !== null && rows.some(r => r.entry.path === focusedPath)) {
      return focusedPath
    }
    const { activeFilePath } = this.props.state
    if (
      activeFilePath !== null &&
      rows.some(r => r.entry.path === activeFilePath)
    ) {
      return activeFilePath
    }
    return rows[0]?.entry.path ?? null
  }

  private focusRow(index: number) {
    const items =
      this.containerRef.current?.querySelectorAll<HTMLElement>(
        '[role="treeitem"]'
      )
    items?.[index]?.focus()
  }

  private onItemFocus = (path: string) => {
    this.pendingFocusPath = null
    if (this.state.focusedPath !== path) {
      this.setState({ focusedPath: path })
    }
  }

  private isRenameInputFocused(): boolean {
    const active = document.activeElement
    return (
      active instanceof HTMLInputElement &&
      this.containerRef.current?.contains(active) === true
    )
  }

  private onSubmitRename = (entry: FileTreeEntry, newName: string) => {
    // Enter (input still focused) returns focus to the renamed row; a blur
    // commit must not steal focus from wherever the user went.
    if (this.isRenameInputFocused()) {
      const slash = entry.path.lastIndexOf('/')
      const dir = slash === -1 ? '' : entry.path.slice(0, slash + 1)
      this.pendingFocusPath = `${dir}${newName}`
    }
    this.props.onSubmitRename(entry, newName)
  }

  private onCancelRename = () => {
    if (this.isRenameInputFocused()) {
      this.pendingFocusPath = this.props.state.renamingPath
    }
    this.props.onCancelRename()
  }

  /** WAI-ARIA tree pattern keyboard navigation over the flattened rows. */
  private onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    // Ignore keys from the inline rename <input> (it sits inside a treeitem).
    if (
      target.getAttribute('role') !== 'treeitem' ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey
    ) {
      return
    }
    const rows = this.flatten()
    const ix = rows.findIndex(r => r.entry.path === target.dataset.path)
    if (ix === -1) {
      return
    }
    const row = rows[ix]
    const isDir = row.entry.kind === 'directory'
    const isExpanded = this.props.state.expandedPaths.has(row.entry.path)

    let next: number | null = null
    switch (e.key) {
      case 'ArrowDown':
        next = Math.min(rows.length - 1, ix + 1)
        break
      case 'ArrowUp':
        next = Math.max(0, ix - 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = rows.length - 1
        break
      case 'ArrowRight':
        if (isDir && !isExpanded) {
          e.preventDefault()
          this.props.onToggleFolder(row.entry.path)
          return
        }
        if (isDir && rows[ix + 1]?.depth > row.depth) {
          next = ix + 1
        }
        break
      case 'ArrowLeft':
        if (isDir && isExpanded) {
          e.preventDefault()
          this.props.onToggleFolder(row.entry.path)
          return
        }
        for (let i = ix - 1; i >= 0; i--) {
          if (rows[i].depth < row.depth) {
            next = i
            break
          }
        }
        break
      case 'F2':
        if (this.props.onBeginRename !== undefined) {
          e.preventDefault()
          this.props.onBeginRename(row.entry)
        }
        return
      default:
        return
    }
    e.preventDefault()
    if (next !== null) {
      this.focusRow(next)
    }
  }

  public render() {
    const { state } = this.props
    const rows = this.flatten()

    if (rows.length === 0) {
      if (state.loadingPaths.has('')) {
        return (
          <div className="file-tree empty" role="status" aria-live="polite">
            Loading files…
          </div>
        )
      }
      if (state.error !== null) {
        return (
          <div className="file-tree empty" role="alert">
            {`Couldn't load files: ${state.error.message}`}
            {this.renderRetry()}
          </div>
        )
      }
      return <div className="file-tree empty">No files to show</div>
    }

    const tabStop = this.tabStopPath(rows)

    return (
      // Rows carry the roving tabindex, so the tree itself isn't a Tab stop.
      // eslint-disable-next-line jsx-a11y/interactive-supports-focus
      <div
        className="file-tree"
        role="tree"
        aria-label="Files"
        ref={this.containerRef}
        // The keyboard handler lives on the tree (events bubble from rows).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        onKeyDown={this.onKeyDown}
      >
        {state.error !== null && (
          <div className="file-tree-error" role="alert">
            {`Couldn't load some files: ${state.error.message}`}
            {this.renderRetry()}
          </div>
        )}
        {rows.map(row => {
          const isSelected = state.activeFilePath === row.entry.path
          return (
            <FileTreeItem
              key={row.entry.path}
              entry={row.entry}
              depth={row.depth}
              isExpanded={state.expandedPaths.has(row.entry.path)}
              isSelected={isSelected}
              isLoading={state.loadingPaths.has(row.entry.path)}
              isRenaming={state.renamingPath === row.entry.path}
              level={row.depth + 1}
              setSize={row.setSize}
              posInSet={row.posInSet}
              tabIndex={row.entry.path === tabStop ? 0 : -1}
              onFocusItem={this.onItemFocus}
              innerRef={isSelected ? this.onSelectedItemRef : undefined}
              onToggleFolder={this.props.onToggleFolder}
              onSelectFile={this.props.onSelectFile}
              onContextMenu={this.props.onContextMenu}
              onSubmitRename={this.onSubmitRename}
              onCancelRename={this.onCancelRename}
            />
          )
        })}
      </div>
    )
  }

  private renderRetry() {
    if (this.props.onRetry === undefined) {
      return null
    }
    return (
      <button
        type="button"
        className="file-tree-retry"
        onClick={this.props.onRetry}
      >
        Retry
      </button>
    )
  }
}
