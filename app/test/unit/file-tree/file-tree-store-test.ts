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

  it('selectFile records the selected path', () => {
    const store = new FileTreeStore()
    const repo = makeRepo(1)
    store.selectFile(repo, 'a.ts')
    expect(store.getState(repo).selectedFilePath).toBe('a.ts')
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
