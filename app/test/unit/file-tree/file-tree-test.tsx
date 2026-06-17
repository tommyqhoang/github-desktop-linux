import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileTree } from '../../../src/ui/file-tree/file-tree'
import { FileTreeItem } from '../../../src/ui/file-tree/file-tree-item'
import { IRepoFileTreeState } from '../../../src/lib/stores/file-tree-store'
import { FileTreeEntry } from '../../../src/models/file-tree'

const noop = () => undefined

function makeState(
  partial: Partial<IRepoFileTreeState> = {}
): IRepoFileTreeState {
  return {
    expandedPaths: new Set(),
    childrenByPath: new Map<string, ReadonlyArray<FileTreeEntry>>([
      [
        '',
        [
          { name: 'app', path: 'app', kind: 'directory' },
          { name: 'a.ts', path: 'a.ts', kind: 'file' },
        ],
      ],
    ]),
    loadingPaths: new Set(),
    openFilePaths: [],
    activeFilePath: null,
    renamingPath: null,
    refreshToken: 0,
    error: null,
    ...partial,
  }
}

const renderTree = (state: IRepoFileTreeState): string =>
  renderToStaticMarkup(
    React.createElement(FileTree, {
      state,
      onToggleFolder: noop,
      onSelectFile: noop,
      onContextMenu: noop,
      onSubmitRename: noop,
      onCancelRename: noop,
    })
  )

describe('FileTree', () => {
  it('renders root entries', () => {
    const html = renderTree(makeState())
    expect(html).toContain('app')
    expect(html).toContain('a.ts')
  })

  it('renders an empty message when there are no files', () => {
    const html = renderTree(makeState({ childrenByPath: new Map([['', []]]) }))
    expect(html).toContain('No files to show')
  })

  it('shows children of an expanded folder', () => {
    const state = makeState({
      expandedPaths: new Set(['app']),
      childrenByPath: new Map<string, ReadonlyArray<FileTreeEntry>>([
        ['', [{ name: 'app', path: 'app', kind: 'directory' }]],
        ['app', [{ name: 'index.ts', path: 'app/index.ts', kind: 'file' }]],
      ]),
    })
    const html = renderTree(state)
    expect(html).toContain('index.ts')
  })

  it('hides children of a collapsed folder', () => {
    const state = makeState({
      expandedPaths: new Set(),
      childrenByPath: new Map<string, ReadonlyArray<FileTreeEntry>>([
        ['', [{ name: 'app', path: 'app', kind: 'directory' }]],
        ['app', [{ name: 'index.ts', path: 'app/index.ts', kind: 'file' }]],
      ]),
    })
    const html = renderTree(state)
    expect(html).not.toContain('index.ts')
  })
})

describe('FileTreeItem', () => {
  const baseProps = {
    depth: 0,
    isExpanded: false,
    isSelected: false,
    isLoading: false,
    isRenaming: false,
    onToggleFolder: noop,
    onSelectFile: noop,
    onContextMenu: noop,
    onSubmitRename: noop,
    onCancelRename: noop,
  }

  it('toggles folders and selects files via its click handler', () => {
    const onToggleFolder = jest.fn()
    const onSelectFile = jest.fn()

    const folder = new FileTreeItem({
      ...baseProps,
      entry: { name: 'app', path: 'app', kind: 'directory' },
      onToggleFolder,
      onSelectFile,
    })
    ;(folder as any).onClick()
    expect(onToggleFolder).toHaveBeenCalledWith('app')
    expect(onSelectFile).not.toHaveBeenCalled()

    const file = new FileTreeItem({
      ...baseProps,
      entry: { name: 'a.ts', path: 'a.ts', kind: 'file' },
      onToggleFolder,
      onSelectFile,
    })
    ;(file as any).onClick()
    expect(onSelectFile).toHaveBeenCalledWith('a.ts')
  })

  it('marks the selected row', () => {
    const html = renderToStaticMarkup(
      React.createElement(FileTreeItem, {
        ...baseProps,
        entry: { name: 'a.ts', path: 'a.ts', kind: 'file' },
        isSelected: true,
      })
    )
    expect(html).toContain('selected')
  })

  it('renders a rename input when renaming', () => {
    const html = renderToStaticMarkup(
      React.createElement(FileTreeItem, {
        ...baseProps,
        entry: { name: 'a.ts', path: 'a.ts', kind: 'file' },
        isRenaming: true,
      })
    )
    expect(html).toContain('file-tree-rename-input')
    expect(html).toContain('value="a.ts"')
  })

  it('opens the context menu on right-click', () => {
    const onContextMenu = jest.fn()
    const entry = { name: 'a.ts', path: 'a.ts', kind: 'file' as const }
    const item = new FileTreeItem({ ...baseProps, entry, onContextMenu })
    ;(item as any).onContextMenu({ preventDefault: noop })
    expect(onContextMenu).toHaveBeenCalledWith(entry)
  })

  it('submits a rename on Enter and cancels on Escape', () => {
    const onSubmitRename = jest.fn()
    const onCancelRename = jest.fn()
    const entry = { name: 'a.ts', path: 'a.ts', kind: 'file' as const }
    const item = new FileTreeItem({
      ...baseProps,
      entry,
      onSubmitRename,
      onCancelRename,
    })

    ;(item as any).onRenameKeyDown({
      key: 'Enter',
      preventDefault: noop,
      currentTarget: { value: 'b.ts' },
    })
    expect(onSubmitRename).toHaveBeenCalledWith(entry, 'b.ts')
    ;(item as any).onRenameKeyDown({
      key: 'Escape',
      preventDefault: noop,
      currentTarget: { value: 'whatever' },
    })
    expect(onCancelRename).toHaveBeenCalled()
  })
})
