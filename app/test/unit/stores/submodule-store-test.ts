import { Repository } from '../../../src/models/repository'
import { SubmoduleStore } from '../../../src/lib/stores/submodule-store'
import { getSubmodules } from '../../../src/lib/git/submodule'
import {
  ISubmoduleStatusEntry,
  SubmoduleWorkDirState,
} from '../../../src/models/submodule'

jest.mock('../../../src/lib/git/submodule', () => ({
  getSubmodules: jest.fn(),
}))

const mockedGetSubmodules = getSubmodules as jest.MockedFunction<
  typeof getSubmodules
>

function makeRepo(id: number, path: string): Repository {
  return new Repository(path, id, null, false)
}

function entry(path: string): ISubmoduleStatusEntry {
  return {
    sha: '1111111111111111111111111111111111111111',
    path,
    describe: 'v1',
    state: SubmoduleWorkDirState.UpToDate,
  }
}

describe('SubmoduleStore', () => {
  let store: SubmoduleStore

  beforeEach(() => {
    store = new SubmoduleStore()
    mockedGetSubmodules.mockReset()
  })

  it('returns empty state for an unknown repository', () => {
    const state = store.getState(makeRepo(1, '/tmp/repo'))
    expect(state.entries).toHaveLength(0)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.loadedAt).toBeNull()
  })

  it('loads submodule entries into state', async () => {
    const repo = makeRepo(1, '/tmp/repo')
    mockedGetSubmodules.mockResolvedValueOnce([entry('vendor/a')])

    await store.loadSubmodules(repo)

    const state = store.getState(repo)
    expect(state.entries.map(e => e.path)).toEqual(['vendor/a'])
    expect(state.loading).toBe(false)
    expect(state.loadedAt).not.toBeNull()
  })

  it('coalesces concurrent loads for the same repository', async () => {
    const repo = makeRepo(1, '/tmp/repo')
    let release: (v: ISubmoduleStatusEntry[]) => void = () => {}
    mockedGetSubmodules.mockReturnValueOnce(
      new Promise<ISubmoduleStatusEntry[]>(resolve => (release = resolve))
    )

    const first = store.loadSubmodules(repo)
    const second = store.loadSubmodules(repo)
    release([entry('vendor/a')])
    await Promise.all([first, second])

    // The second call should have bailed because a load was in flight.
    expect(mockedGetSubmodules).toHaveBeenCalledTimes(1)
  })

  it('records an error when loading fails', async () => {
    const repo = makeRepo(1, '/tmp/repo')
    mockedGetSubmodules.mockRejectedValueOnce(new Error('boom'))
    store.onDidError(() => {})

    await store.loadSubmodules(repo)

    expect(store.getState(repo).error?.message).toBe('boom')
    expect(store.getState(repo).loading).toBe(false)
  })

  it('does not resurrect state cleared while a load is in flight', async () => {
    const repo = makeRepo(1, '/tmp/repo')
    mockedGetSubmodules.mockResolvedValueOnce([])
    await store.loadSubmodules(repo)
    expect(store.getAllState().has(1)).toBe(true)

    let release: (v: ISubmoduleStatusEntry[]) => void = () => {}
    mockedGetSubmodules.mockReturnValueOnce(
      new Promise<ISubmoduleStatusEntry[]>(resolve => (release = resolve))
    )
    const inFlight = store.loadSubmodules(repo)
    store.clear(repo)
    expect(store.getAllState().has(1)).toBe(false)

    release([])
    await inFlight

    expect(store.getAllState().has(1)).toBe(false)
  })
})
