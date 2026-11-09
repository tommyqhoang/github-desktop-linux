import * as React from 'react'
import { basename } from 'path'
import memoizeOne from 'memoize-one'
import { mapStatus } from '../../lib/status'

import { AppFileStatusKind, CommittedFileChange } from '../../models/status'
import { ClickSource, List } from '../lib/list'
import { Button } from '../lib/button'
import { ChangedFileDirectory } from '../lib/changed-file-directory'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { CommittedFileItem } from './committed-file-item'
import { buildChangesTreeRows } from '../changes/changes-tree'
import type { ChangesTreeRow } from '../changes/changes-tree'

interface IFileListProps {
  readonly files: ReadonlyArray<CommittedFileChange>
  readonly selectedFile: CommittedFileChange | null
  readonly onSelectedFileChanged: (file: CommittedFileChange) => void
  readonly onRowDoubleClick: (row: number, source: ClickSource) => void
  readonly availableWidth: number
  readonly onContextMenu?: (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
  /** Whether to show the changed file count beside the tree toggle. */
  readonly showFileCount?: boolean
}

interface IFileListState {
  readonly focusedRow: number | null
  readonly isTreeView: boolean
  readonly collapsedPaths: ReadonlySet<string>
  readonly selectedDirectoryPath: string | null
}

/** Display changed files for commits, stashes, and pull requests. */
export class FileList extends React.Component<IFileListProps, IFileListState> {
  public constructor(props: IFileListProps) {
    super(props)

    this.state = {
      focusedRow: null,
      isTreeView: false,
      collapsedPaths: new Set(),
      selectedDirectoryPath: null,
    }
  }

  public componentWillReceiveProps(nextProps: IFileListProps) {
    if (nextProps.files !== this.props.files) {
      this.setState({ focusedRow: null, selectedDirectoryPath: null })
    } else if (
      nextProps.selectedFile?.path !== this.props.selectedFile?.path
    ) {
      this.setState({ selectedDirectoryPath: null })
    }
  }

  private buildVisibleRows = memoizeOne(
    (
      files: ReadonlyArray<CommittedFileChange>,
      isTreeView: boolean,
      collapsedPaths: ReadonlySet<string>
    ): ReadonlyArray<ChangesTreeRow<CommittedFileChange>> =>
      isTreeView
        ? buildChangesTreeRows(files, collapsedPaths)
        : files.map<ChangesTreeRow<CommittedFileChange>>(file => ({
            kind: 'file',
            file,
            depth: 0,
          }))
  )

  private get visibleRows(): ReadonlyArray<ChangesTreeRow<CommittedFileChange>> {
    return this.buildVisibleRows(
      this.props.files,
      this.state.isTreeView,
      this.state.collapsedPaths
    )
  }

  private onSelectedRowChanged = (row: number) => {
    const listRow = this.visibleRows[row]
    if (listRow.kind === 'directory') {
      this.setState({ selectedDirectoryPath: listRow.path })
      return
    }

    this.setState({ selectedDirectoryPath: null })
    this.props.onSelectedFileChanged(listRow.file)
  }

  private renderFile = (row: number) => {
    const listRow = this.visibleRows[row]
    if (listRow.kind === 'directory') {
      return (
        <ChangedFileDirectory
          name={listRow.name}
          depth={listRow.depth}
          expanded={listRow.expanded}
        />
      )
    }

    const { file, depth } = listRow
    const displayPath =
      this.state.isTreeView &&
      depth > 0 &&
      file.status.kind !== AppFileStatusKind.Renamed &&
      file.status.kind !== AppFileStatusKind.Copied
        ? basename(file.path)
        : undefined

    return (
      <CommittedFileItem
        file={file}
        availableWidth={this.props.availableWidth}
        focused={this.state.focusedRow === row}
        depth={depth}
        displayPath={displayPath}
      />
    )
  }

  private selectedRowsForFile(): ReadonlyArray<number> {
    const { selectedDirectoryPath, isTreeView } = this.state
    const visibleRows = this.visibleRows
    if (isTreeView && selectedDirectoryPath !== null) {
      const directoryIndex = visibleRows.findIndex(
        row => row.kind === 'directory' && row.path === selectedDirectoryPath
      )
      if (directoryIndex >= 0) {
        return [directoryIndex]
      }
    }

    const selectedPath = this.props.selectedFile?.path
    const fileIndex = visibleRows.findIndex(
      row => row.kind === 'file' && row.file.path === selectedPath
    )
    return fileIndex >= 0 ? [fileIndex] : []
  }

  private onRowContextMenu = (
    row: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const listRow = this.visibleRows[row]
    if (listRow.kind === 'directory') {
      event.preventDefault()
      return
    }

    this.props.onContextMenu?.(listRow.file, event)
  }

  private onRowDoubleClick = (row: number, source: ClickSource) => {
    const listRow = this.visibleRows[row]
    if (listRow.kind !== 'file') {
      return
    }

    const originalRow = this.props.files.findIndex(
      file => file.path === listRow.file.path
    )
    if (originalRow >= 0) {
      this.props.onRowDoubleClick(originalRow, source)
    }
  }

  private onRowClick = (row: number, _source: ClickSource) => {
    const listRow = this.visibleRows[row]
    if (listRow?.kind === 'directory') {
      this.onDirectoryToggle(listRow.path)
    }
  }

  private onRowKeyDown = (
    row: number,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    const listRow = this.visibleRows[row]
    if (
      listRow?.kind === 'directory' &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      this.onDirectoryToggle(listRow.path)
      event.preventDefault()
    }
  }

  private onTreeViewToggle = () => {
    this.setState({
      isTreeView: !this.state.isTreeView,
      selectedDirectoryPath: null,
      focusedRow: null,
    })
  }

  private onDirectoryToggle = (path: string) => {
    const collapsedPaths = new Set(this.state.collapsedPaths)
    if (collapsedPaths.has(path)) {
      collapsedPaths.delete(path)
    } else {
      collapsedPaths.add(path)
    }

    const visibleRows = this.state.isTreeView
      ? buildChangesTreeRows(this.props.files, collapsedPaths)
      : this.visibleRows
    const directoryRow = visibleRows.findIndex(
      row => row.kind === 'directory' && row.path === path
    )
    this.setState({
      collapsedPaths,
      selectedDirectoryPath: path,
      focusedRow: directoryRow >= 0 ? directoryRow : null,
    })
  }

  private getFileAriaLabel = (row: number): string | undefined => {
    const listRow = this.visibleRows[row]
    if (listRow?.kind === 'directory') {
      const expansionState = listRow.expanded ? 'expanded' : 'collapsed'
      const action = listRow.expanded ? 'collapse' : 'expand'
      return `Folder ${listRow.path}, ${expansionState}. Press Enter or Space to ${action}.`
    }

    if (listRow === undefined) {
      return undefined
    }

    const file = listRow.file
    const { path, status } = file
    const fileStatus = mapStatus(status)
    return `${path} ${fileStatus}`
  }

  private renderHeader() {
    const { files, showFileCount } = this.props
    const fileCount = files.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const className = showFileCount
      ? 'file-list-header with-count'
      : 'file-list-header no-count'

    return (
      <div className={className}>
        {showFileCount && (
          <span>
            {fileCount} changed {filesPlural}
          </span>
        )}
        <Button
          size="small"
          className="file-list-tree-toggle"
          ariaLabel="Toggle folder tree view"
          ariaPressed={this.state.isTreeView}
          tooltip="Toggle folder tree view"
          disabled={files.length === 0}
          onClick={this.onTreeViewToggle}
        >
          <Octicon symbol={octicons.fileDirectory} />
        </Button>
      </div>
    )
  }

  public render() {
    return (
      <div className="file-list has-tree-toggle">
        {this.renderHeader()}
        <List
          rowRenderer={this.renderFile}
          rowCount={this.visibleRows.length}
          rowHeight={29}
          selectedRows={this.selectedRowsForFile()}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onRowClick={this.onRowClick}
          onRowDoubleClick={this.onRowDoubleClick}
          onRowKeyDown={this.onRowKeyDown}
          onRowContextMenu={this.onRowContextMenu}
          onRowKeyboardFocus={this.onRowFocus}
          onRowBlur={this.onRowBlur}
          getRowAriaLabel={this.getFileAriaLabel}
          invalidationProps={{
            files: this.props.files,
            focusedRow: this.state.focusedRow,
            isTreeView: this.state.isTreeView,
            collapsedPaths: this.state.collapsedPaths,
            selectedDirectoryPath: this.state.selectedDirectoryPath,
          }}
        />
      </div>
    )
  }

  private onRowFocus = (row: number) => {
    this.setState({ focusedRow: row })
  }

  private onRowBlur = (row: number) => {
    if (this.state.focusedRow === row) {
      this.setState({ focusedRow: null })
    }
  }
}
