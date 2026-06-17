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

  it('does not resurrect state cleared during an in-flight load', async () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    const pending = store.expand(repo, 'app')
    store.clear(repo)
    await pending
    expect(store.getAllState().has(repo.id)).toBe(false)
  })
})
