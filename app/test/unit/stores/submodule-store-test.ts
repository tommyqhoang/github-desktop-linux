import { SubmoduleStore } from '../../../src/lib/stores/submodule-store'
import { Repository } from '../../../src/models/repository'
import * as SubmoduleGit from '../../../src/lib/git/submodule'

describe('SubmoduleStore.runExclusive', () => {
  const repo = new Repository('/tmp/sm-repo', 5, null, false)
  let store: SubmoduleStore

  beforeEach(() => {
    store = new SubmoduleStore()
    jest.spyOn(SubmoduleGit, 'getSubmodules').mockResolvedValue([])
  })
  afterEach(() => jest.restoreAllMocks())

  it('marks the repository busy while running and refreshes afterwards', async () => {
    let release: () => void = () => undefined
    const op = jest.fn(
      () => new Promise<void>(resolve => (release = () => resolve()))
    )
    const pending = store.runExclusive(repo, op)
    expect(store.isBusy(repo)).toBe(true)
    release()
    expect(await pending).toBe(true)
    expect(store.isBusy(repo)).toBe(false)
    expect(SubmoduleGit.getSubmodules).toHaveBeenCalled()
  })

  it('ignores a second call while one is running', async () => {
    let release: () => void = () => undefined
    const first = store.runExclusive(
      repo,
      () => new Promise<void>(resolve => (release = () => resolve()))
    )
    const second = jest.fn()
    expect(await store.runExclusive(repo, second)).toBe(false)
    expect(second).not.toHaveBeenCalled()
    release()
    await first
  })

  it('rethrows a failure, clears busy and still refreshes the list', async () => {
    await expect(
      store.runExclusive(repo, () => Promise.reject(new Error('update failed')))
    ).rejects.toThrow('update failed')
    expect(store.isBusy(repo)).toBe(false)
    expect(SubmoduleGit.getSubmodules).toHaveBeenCalled()
  })
})
