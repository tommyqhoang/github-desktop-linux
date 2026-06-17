import { FileTreeStore } from '../../../src/lib/stores/file-tree-store'
import { Repository } from '../../../src/models/repository'
import * as listDirectory from '../../../src/lib/file-tree/list-directory'

function makeRepo(id: number): Repository {
  return new Repository(`/tmp/repo-${id}`, id, null, false)
}

describe('FileTreeStore', () => {
  let readSpy: jest.SpyInstance

  beforeEach(() => {
    readSpy = jest
      .spyOn(listDirectory, 'readWorkingDirectory')
      .mockResolvedValue([
        { name: 'app', path: 'app', kind: 'directory' },
        { name: 'a.ts', path: 'a.ts', kind: 'file' },
      ])
  })

  afterEach(() => readSpy.mockRestore())

  it('loadRoot caches children under the empty-string key', async () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    await store.loadRoot(repo)
    const state = store.getState(repo)
    expect(state.childrenByPath.get('')?.map(e => e.name)).toEqual([
      'app',
      'a.ts',
    ])
  })

  it('expand loads and records the path; collapse removes it', async () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    await store.expand(repo, 'app')
    expect(store.getState(repo).expandedPaths.has('app')).toBe(true)
    expect(store.getState(repo).childrenByPath.has('app')).toBe(true)

    store.collapse(repo, 'app')
    expect(store.getState(repo).expandedPaths.has('app')).toBe(false)
  })

  it('coalesces concurrent expand calls for the same path', async () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    await Promise.all([store.expand(repo, 'app'), store.expand(repo, 'app')])
    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  it('openFile opens a tab and makes it active', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['a.ts'])
    expect(store.getState(repo).activeFilePath).toBe('a.ts')
  })

  it('openFile keeps tabs unique but appends new ones in order', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.openFile(repo, 'a.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['a.ts', 'b.ts'])
    // Re-opening focuses the existing tab.
    expect(store.getState(repo).activeFilePath).toBe('a.ts')
  })

  it('activateFile focuses an open tab and ignores unopened paths', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.activateFile(repo, 'a.ts')
    expect(store.getState(repo).activeFilePath).toBe('a.ts')

    store.activateFile(repo, 'missing.ts')
    expect(store.getState(repo).activeFilePath).toBe('a.ts')
  })

  it('moveFile reorders an open tab into another tab slot', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.openFile(repo, 'c.ts')

    store.moveFile(repo, 'a.ts', 'c.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['b.ts', 'c.ts', 'a.ts'])
    // The active tab is preserved across a reorder.
    expect(store.getState(repo).activeFilePath).toBe('c.ts')
  })

  it('moveFile ignores unknown or identical paths', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')

    store.moveFile(repo, 'a.ts', 'a.ts')
    store.moveFile(repo, 'a.ts', 'missing.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['a.ts', 'b.ts'])
  })

  it('revealFile expands ancestor folders and focuses the file', async () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'app/lib/a.ts')

    await store.revealFile(repo, 'app/lib/a.ts')
    const state = store.getState(repo)
    expect(state.expandedPaths.has('app')).toBe(true)
    expect(state.expandedPaths.has('app/lib')).toBe(true)
    expect(state.activeFilePath).toBe('app/lib/a.ts')
  })

  it('closeFile removes a tab and focuses the right-hand neighbour', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.openFile(repo, 'c.ts')
    store.activateFile(repo, 'b.ts')

    store.closeFile(repo, 'b.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['a.ts', 'c.ts'])
    expect(store.getState(repo).activeFilePath).toBe('c.ts')
  })

  it('closeFile falls back to the left neighbour when closing the last tab', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')

    store.closeFile(repo, 'b.ts')
    expect(store.getState(repo).activeFilePath).toBe('a.ts')
  })

  it('closeFile on an inactive tab keeps the active tab', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.activateFile(repo, 'b.ts')

    store.closeFile(repo, 'a.ts')
    expect(store.getState(repo).activeFilePath).toBe('b.ts')
  })

  it('closeAllFiles clears every tab', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')

    store.closeAllFiles(repo)
    expect(store.getState(repo).openFilePaths).toEqual([])
    expect(store.getState(repo).activeFilePath).toBeNull()
  })

  it('hasState reports whether the tree has been loaded', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    expect(store.hasState(repo)).toBe(false)
    store.openFile(repo, 'a.ts')
    expect(store.hasState(repo)).toBe(true)
  })

  it('closeFilesToLeft closes only the tabs left of the target', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.openFile(repo, 'c.ts')
    store.activateFile(repo, 'a.ts')

    store.closeFilesToLeft(repo, 'b.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['b.ts', 'c.ts'])
    // The active tab was removed, so it falls back to the target.
    expect(store.getState(repo).activeFilePath).toBe('b.ts')
  })

  it('closeFilesToLeft is a no-op for the leftmost tab', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')

    store.closeFilesToLeft(repo, 'a.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['a.ts', 'b.ts'])
  })

  it('closeFilesToRight closes only the tabs right of the target', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.openFile(repo, 'c.ts')
    store.activateFile(repo, 'c.ts')

    store.closeFilesToRight(repo, 'b.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['a.ts', 'b.ts'])
    // The active tab was removed, so it falls back to the target.
    expect(store.getState(repo).activeFilePath).toBe('b.ts')
  })

  it('closeFilesToRight keeps the active tab when it survives', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.openFile(repo, 'c.ts')
    store.activateFile(repo, 'a.ts')

    store.closeFilesToRight(repo, 'b.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['a.ts', 'b.ts'])
    expect(store.getState(repo).activeFilePath).toBe('a.ts')
  })

  it('closeOtherFiles leaves only the target tab, active', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.openFile(repo, 'b.ts')
    store.openFile(repo, 'c.ts')
    store.activateFile(repo, 'a.ts')

    store.closeOtherFiles(repo, 'b.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['b.ts'])
    expect(store.getState(repo).activeFilePath).toBe('b.ts')
  })

  it('closeFilesUnder closes a directory and its descendants', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'src/a.ts')
    store.openFile(repo, 'src/nested/b.ts')
    store.openFile(repo, 'README.md')
    store.activateFile(repo, 'src/a.ts')

    store.closeFilesUnder(repo, 'src')
    expect(store.getState(repo).openFilePaths).toEqual(['README.md'])
    // The active tab was under src, so it falls back to a remaining tab.
    expect(store.getState(repo).activeFilePath).toBe('README.md')
  })

  it('beginRename/cancelRename toggle the renaming path', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.beginRename(repo, 'a.ts')
    expect(store.getState(repo).renamingPath).toBe('a.ts')
    store.cancelRename(repo)
    expect(store.getState(repo).renamingPath).toBeNull()
  })

  it('reconcileRename rewrites the renamed file and its open tab', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'a.ts')
    store.beginRename(repo, 'a.ts')

    store.reconcileRename(repo, 'a.ts', 'b.ts')
    expect(store.getState(repo).openFilePaths).toEqual(['b.ts'])
    expect(store.getState(repo).activeFilePath).toBe('b.ts')
    expect(store.getState(repo).renamingPath).toBeNull()
  })

  it('reconcileRename rewrites descendants of a renamed directory', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.openFile(repo, 'src/a.ts')
    store.openFile(repo, 'src/nested/b.ts')

    store.reconcileRename(repo, 'src', 'lib')
    expect(store.getState(repo).openFilePaths).toEqual([
      'lib/a.ts',
      'lib/nested/b.ts',
    ])
  })

  it('refreshTree reloads expanded directories and bumps refreshToken', async () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    await store.expand(repo, 'app')
    const before = store.getState(repo).refreshToken
    readSpy.mockClear()

    await store.refreshTree(repo)

    // Root ('') and the expanded 'app' directory are both re-listed.
    expect(readSpy).toHaveBeenCalledTimes(2)
    expect(store.getState(repo).refreshToken).toBe(before + 1)
  })

  it('does not resurrect state cleared during an in-flight load', async () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    const pending = store.expand(repo, 'app')
    store.clear(repo)
    await pending
    expect(store.getAllState().has(repo.id)).toBe(false)
  })
})
