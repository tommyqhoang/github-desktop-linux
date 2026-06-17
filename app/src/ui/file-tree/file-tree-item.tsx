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
  readonly isRenaming: boolean
  readonly onToggleFolder: (path: string) => void
  readonly onSelectFile: (path: string) => void
  readonly onContextMenu: (entry: FileTreeEntry) => void
  readonly onSubmitRename: (entry: FileTreeEntry, newName: string) => void
  readonly onCancelRename: () => void
}

/** A single row in the Files tree: a folder (with chevron) or a file. */
export class FileTreeItem extends React.Component<IFileTreeItemProps> {
  /** Guards against the blur handler firing after an explicit submit/cancel. */
  private renameSettled = false

  private onClick = () => {
    const { entry } = this.props
    if (entry.kind === 'directory') {
      this.props.onToggleFolder(entry.path)
    } else {
      this.props.onSelectFile(entry.path)
    }
  }

  private onContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    this.props.onContextMenu(this.props.entry)
  }

  /** Focus and pre-select the rename field (minus extension) when it mounts. */
  private onRenameInputRef = (input: HTMLInputElement | null) => {
    if (input === null) {
      return
    }
    this.renameSettled = false
    input.focus()
    const dot = input.value.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
  }

  private onRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.settleRename()
      this.props.onSubmitRename(this.props.entry, event.currentTarget.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.settleRename()
      this.props.onCancelRename()
    }
  }

  private onRenameBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (this.renameSettled) {
      return
    }
    this.settleRename()
    this.props.onSubmitRename(this.props.entry, event.currentTarget.value)
  }

  private settleRename() {
    this.renameSettled = true
  }

  public render() {
    const { entry, depth, isExpanded, isSelected, isLoading, isRenaming } =
      this.props
    const isDirectory = entry.kind === 'directory'

    const className = 'file-tree-item' + (isSelected ? ' selected' : '')

    const icon = isDirectory
      ? isExpanded
        ? octicons.chevronDown
        : octicons.chevronRight
      : octicons.file

    if (isRenaming) {
      return (
        <div
          className={className}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          role="treeitem"
          aria-selected={isSelected}
        >
          <Octicon className="file-tree-icon" symbol={icon} />
          <input
            type="text"
            className="file-tree-rename-input"
            defaultValue={entry.name}
            ref={this.onRenameInputRef}
            onKeyDown={this.onRenameKeyDown}
            onBlur={this.onRenameBlur}
            aria-label={`Rename ${entry.name}`}
          />
        </div>
      )
    }

    return (
      <button
        type="button"
        className={className}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isDirectory ? isExpanded : undefined}
        onClick={this.onClick}
        onContextMenu={this.onContextMenu}
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
