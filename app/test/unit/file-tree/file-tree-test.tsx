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

describe('FileTree accessibility', () => {
  const key = (k: string, path: string, over: any = {}) => ({
    key: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: jest.fn(),
    target: { getAttribute: () => 'treeitem', dataset: { path } },
    ...over,
  })

  const make = (
    state: IRepoFileTreeState,
    extra: Partial<React.ComponentProps<typeof FileTree>> = {}
  ) => {
    const props = {
      state,
      onToggleFolder: jest.fn(),
      onSelectFile: jest.fn(),
      onContextMenu: jest.fn(),
      onSubmitRename: jest.fn(),
      onCancelRename: jest.fn(),
      ...extra,
    }
    const tree = new FileTree(props)
    ;(tree as any).setState = (p: any) => {
      ;(tree as any).state = { ...(tree as any).state, ...p }
    }
    const focusRow = jest.fn()
    ;(tree as any).focusRow = focusRow
    return { tree, focusRow, props }
  }

  const nested = () =>
    makeState({
      expandedPaths: new Set(['app']),
      childrenByPath: new Map<string, ReadonlyArray<FileTreeEntry>>([
        [
          '',
          [
            { name: 'app', path: 'app', kind: 'directory' },
            { name: 'z.ts', path: 'z.ts', kind: 'file' },
          ],
        ],
        ['app', [{ name: 'b.ts', path: 'app/b.ts', kind: 'file' }]],
      ]),
    })

  it('exposes level, set size, position and a single Tab stop', () => {
    const html = renderTree(nested())
    expect(html).toContain('aria-label="Files"')
    expect(html).toContain('aria-level="2"')
    expect(html).toContain('aria-setsize="2"')
    expect(html).toContain('aria-posinset="2"')
    const rows = html.match(/<button[^>]*role="treeitem"[^>]*>/g)!
    expect(rows).toHaveLength(3)
    expect(rows.filter(r => r.includes('tabindex="0"'))).toHaveLength(1)
    expect(rows.filter(r => r.includes('tabindex="-1"'))).toHaveLength(2)
  })

  it('makes the selected file the Tab stop', () => {
    const html = renderTree({ ...nested(), activeFilePath: 'z.ts' })
    const zRow = html.match(/<button[^>]*data-path="z.ts"[^>]*>/)![0]
    expect(zRow).toContain('tabindex="0"')
  })

  it('ArrowDown/ArrowUp/Home/End move focus between rows', () => {
    const { tree, focusRow } = make(nested())
    ;(tree as any).onKeyDown(key('ArrowDown', 'app'))
    expect(focusRow).toHaveBeenLastCalledWith(1)
    ;(tree as any).onKeyDown(key('ArrowUp', 'z.ts'))
    expect(focusRow).toHaveBeenLastCalledWith(1)
    ;(tree as any).onKeyDown(key('End', 'app'))
    expect(focusRow).toHaveBeenLastCalledWith(2)
    ;(tree as any).onKeyDown(key('Home', 'z.ts'))
    expect(focusRow).toHaveBeenLastCalledWith(0)
  })

  it('ArrowRight expands a collapsed folder, else moves into it', () => {
    const collapsed = make(makeState())
    ;(collapsed.tree as any).onKeyDown(key('ArrowRight', 'app'))
    expect(collapsed.props.onToggleFolder).toHaveBeenCalledWith('app')

    const open = make(nested())
    ;(open.tree as any).onKeyDown(key('ArrowRight', 'app'))
    expect(open.props.onToggleFolder).not.toHaveBeenCalled()
    expect(open.focusRow).toHaveBeenCalledWith(1)
  })

  it('ArrowLeft collapses an open folder, else moves to the parent', () => {
    const open = make(nested())
    ;(open.tree as any).onKeyDown(key('ArrowLeft', 'app'))
    expect(open.props.onToggleFolder).toHaveBeenCalledWith('app')

    const child = make(nested())
    ;(child.tree as any).onKeyDown(key('ArrowLeft', 'app/b.ts'))
    expect(child.props.onToggleFolder).not.toHaveBeenCalled()
    expect(child.focusRow).toHaveBeenCalledWith(0)
  })

  it('F2 begins rename; keys from the rename input are ignored', () => {
    const onBeginRename = jest.fn()
    const { tree, focusRow } = make(nested(), { onBeginRename })
    ;(tree as any).onKeyDown(key('F2', 'z.ts'))
    expect(onBeginRename).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'z.ts' })
    )
    ;(tree as any).onKeyDown(
      key('ArrowDown', 'z.ts', {
        target: { getAttribute: () => null, dataset: {} },
      })
    )
    expect(focusRow).not.toHaveBeenCalled()
  })

  it('shows a loading status instead of "No files" while the root loads', () => {
    const html = renderTree(
      makeState({
        childrenByPath: new Map(),
        loadingPaths: new Set(['']),
      })
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading files')
    expect(html).not.toContain('No files to show')
  })

  it('shows an alert with Retry when listing failed', () => {
    const onRetry = jest.fn()
    const html = renderToStaticMarkup(
      React.createElement(FileTree, {
        state: makeState({
          childrenByPath: new Map(),
          error: new Error('EACCES'),
        }),
        onToggleFolder: noop,
        onSelectFile: noop,
        onContextMenu: noop,
        onSubmitRename: noop,
        onCancelRename: noop,
        onRetry,
      })
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('EACCES')
    expect(html).toContain('Retry')
    expect(html).not.toContain('No files to show')
  })
})

describe('FileTreeItem accessibility', () => {
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
  const entry = { name: 'a.ts', path: 'a.ts', kind: 'file' as const }

  it('announces the loading spinner to screen readers', () => {
    const html = renderToStaticMarkup(
      React.createElement(FileTreeItem, {
        ...baseProps,
        entry: { name: 'app', path: 'app', kind: 'directory' },
        isLoading: true,
      })
    )
    expect(html).toContain('class="sr-only">Loading<')
  })

  it('blur without a change cancels instead of committing', () => {
    const onSubmitRename = jest.fn()
    const onCancelRename = jest.fn()
    const item = new FileTreeItem({
      ...baseProps,
      entry,
      onSubmitRename,
      onCancelRename,
    })
    ;(item as any).onRenameBlur({ currentTarget: { value: 'a.ts' } })
    expect(onSubmitRename).not.toHaveBeenCalled()
    expect(onCancelRename).toHaveBeenCalled()
  })

  it('blur with a changed name commits', () => {
    const onSubmitRename = jest.fn()
    const item = new FileTreeItem({ ...baseProps, entry, onSubmitRename })
    ;(item as any).onRenameBlur({ currentTarget: { value: 'b.ts' } })
    expect(onSubmitRename).toHaveBeenCalledWith(entry, 'b.ts')
  })

  it('reports focus so the tree can move its roving tabindex', () => {
    const onFocusItem = jest.fn()
    const item = new FileTreeItem({ ...baseProps, entry, onFocusItem })
    ;(item as any).onFocus()
    expect(onFocusItem).toHaveBeenCalledWith('a.ts')
  })
})
