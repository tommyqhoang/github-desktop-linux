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
}

interface IFlatRow {
  readonly entry: FileTreeEntry
  readonly depth: number
}

/**
 * The Files sidebar tree. Flattens the cached directory listings into a
 * depth-ordered list, expanding only the folders the user has opened.
 */
export class FileTree extends React.Component<IFileTreeProps> {
  /** The currently selected row's element, for reveal-on-select scrolling. */
  private selectedItemRef: HTMLElement | null = null

  public componentDidUpdate(prevProps: IFileTreeProps) {
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
      for (const entry of children) {
        rows.push({ entry, depth })
        if (entry.kind === 'directory' && expandedPaths.has(entry.path)) {
          walk(entry.path, depth + 1)
        }
      }
    }

    walk('', 0)
    return rows
  }

  public render() {
    const { state } = this.props
    const rows = this.flatten()

    if (rows.length === 0) {
      return <div className="file-tree empty">No files to show</div>
    }

    return (
      <div className="file-tree" role="tree">
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
              innerRef={isSelected ? this.onSelectedItemRef : undefined}
              onToggleFolder={this.props.onToggleFolder}
              onSelectFile={this.props.onSelectFile}
              onContextMenu={this.props.onContextMenu}
              onSubmitRename={this.props.onSubmitRename}
              onCancelRename={this.props.onCancelRename}
            />
          )
        })}
      </div>
    )
  }
}
