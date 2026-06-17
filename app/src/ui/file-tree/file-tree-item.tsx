import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { FileTreeEntry } from '../../models/file-tree'

interface IFileTreeItemProps {
  readonly entry: FileTreeEntry
  readonly depth: number
  readonly isExpanded: boolean
  readonly isSelected: boolean
  readonly isLoading: boolean
  readonly onToggleFolder: (path: string) => void
  readonly onSelectFile: (path: string) => void
}

/** A single row in the Files tree: a folder (with chevron) or a file. */
export class FileTreeItem extends React.Component<IFileTreeItemProps> {
  private onClick = () => {
    const { entry } = this.props
    if (entry.kind === 'directory') {
      this.props.onToggleFolder(entry.path)
    } else {
      this.props.onSelectFile(entry.path)
    }
  }

  public render() {
    const { entry, depth, isExpanded, isSelected, isLoading } = this.props
    const isDirectory = entry.kind === 'directory'

    const className = 'file-tree-item' + (isSelected ? ' selected' : '')

    const icon = isDirectory
      ? isExpanded
        ? octicons.chevronDown
        : octicons.chevronRight
      : octicons.file

    return (
      <button
        type="button"
        className={className}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isDirectory ? isExpanded : undefined}
        onClick={this.onClick}
      >
        <Octicon className="file-tree-icon" symbol={icon} />
        <span className="file-tree-name">{entry.name}</span>
        {isLoading && (
          <Octicon className="file-tree-spinner" symbol={octicons.sync} />
        )}
      </button>
    )
  }
}
