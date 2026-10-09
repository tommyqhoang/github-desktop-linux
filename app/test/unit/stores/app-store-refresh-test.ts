import { AppStore } from '../../../src/lib/stores/app-store'
import { Repository } from '../../../src/models/repository'

const noopDisposable = () => ({ dispose: () => {} })

function makeStore(): AppStore {
  return new AppStore(
    { onDidUpdate: noopDisposable } as any,
    {
      repositories: [],
      onDidUpdate: noopDisposable,
      onDidError: noopDisposable,
      getRepositoryState: () => null,
    } as any,
    null as any,
    {
      getOptOut: () => false,
      onDidUpdate: noopDisposable,
      onDidError: noopDisposable,
    } as any,
    {
      getState: () => null,
      onDidAuthenticate: noopDisposable,
      onDidUpdate: noopDisposable,
      onDidError: noopDisposable,
    } as any,
    {
      onDidUpdate: noopDisposable,
      onDidError: noopDisposable,
      getActiveAccountByEndpoint: () => new Map(),
    } as any,
    { onDidUpdate: noopDisposable } as any,
    {
      onPullRequestsChanged: noopDisposable,
      onIsLoadingPullRequests: noopDisposable,
    } as any,
    null as any,
    {
      getState: () => new Map(),
      onDidUpdate: noopDisposable,
      onDidError: noopDisposable,
    } as any,
    {
      onChecksFailedNotification: noopDisposable,
      onPullRequestReviewSubmitNotification: noopDisposable,
      onPullRequestCommentNotification: noopDisposable,
    } as any
  )
}

const repo = (id = 5) => new Repository(`/tmp/repo-${id}`, id, null, false)

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(res => (resolve = res))
  return { promise, resolve }
}

describe('AppStore status loading', () => {
  it('never runs two status loads for a repository at once', async () => {
    const store = makeStore()
    let active = 0
    let maxActive = 0
    let runs = 0
    const gates: Array<ReturnType<typeof deferred>> = []
    ;(store as any).loadStatusCore = jest.fn(async () => {
      runs++
      active++
      maxActive = Math.max(maxActive, active)
      const gate = deferred()
      gates.push(gate)
      await gate.promise
      active--
      return null
    })

    const r = repo()
    const calls = Array.from({ length: 8 }, () => store._loadStatus(r))
    // Let both queued runs proceed one after the other.
    while (gates.length < 1) {
      await new Promise(res => setImmediate(res))
    }
    gates[0].resolve()
    while (gates.length < 2) {
      await new Promise(res => setImmediate(res))
    }
    gates[1].resolve()
    await Promise.all(calls)

    expect(maxActive).toBe(1)
    expect(runs).toBe(2)
  })

  it('does not let an older, slower load finish after a newer one', async () => {
    const store = makeStore()
    const finished: string[] = []
    const first = deferred()
    let call = 0
    ;(store as any).loadStatusCore = jest.fn(async () => {
      const id = ++call === 1 ? 'older' : 'newer'
      if (id === 'older') {
        await first.promise
      }
      finished.push(id)
      return null
    })

    const r = repo()
    const older = store._loadStatus(r)
    const newer = store._loadStatus(r)
    first.resolve()
    await Promise.all([older, newer])

    expect(finished).toEqual(['older', 'newer'])
  })

  it('honours clearPartialState even when folded into a queued run', async () => {
    const store = makeStore()
    const seen: boolean[] = []
    const gate = deferred()
    ;(store as any).loadStatusCore = jest.fn(
      async (_r: Repository, clear: boolean) => {
        seen.push(clear)
        if (seen.length === 1) {
          await gate.promise
        }
        return null
      }
    )

    const r = repo()
    const a = store._loadStatus(r, false)
    // `b` creates the queued run without asking for a clear; `c` joins it
    // later and does. The request must not be lost just because `c` wasn't
    // the caller that queued the run.
    const b = store._loadStatus(r, false)
    const c = store._loadStatus(r, true)
    gate.resolve()
    await Promise.all([a, b, c])

    // The first run was started without it; the shared trailing run must
    // still carry the request made by `c`.
    expect(seen).toEqual([false, true])
  })

  it('does not leak a clearPartialState request into later loads', async () => {
    const store = makeStore()
    const seen: boolean[] = []
    ;(store as any).loadStatusCore = jest.fn(
      async (_r: Repository, clear: boolean) => {
        seen.push(clear)
        return null
      }
    )

    const r = repo()
    await store._loadStatus(r, true)
    await store._loadStatus(r, false)

    expect(seen).toEqual([true, false])
  })

  it('keeps repositories independent', async () => {
    const store = makeStore()
    const gate = deferred()
    ;(store as any).loadStatusCore = jest.fn(async (r: Repository) => {
      if (r.id === 1) {
        await gate.promise
      }
      return null
    })

    const slow = store._loadStatus(repo(1))
    await store._loadStatus(repo(2))
    expect((store as any).loadStatusCore).toHaveBeenCalledTimes(2)

    gate.resolve()
    await slow
  })
})

describe('AppStore focus-triggered refresh', () => {
  it('shares one refresh across a burst of focus events', async () => {
    const store = makeStore()
    const refresh = jest.fn(async () => {})
    ;(store as any)._refreshOrRecoverRepository = refresh

    const r = repo()
    await store._refreshAndMaybeFetchRepository(r)
    await store._refreshAndMaybeFetchRepository(r)
    await store._refreshAndMaybeFetchRepository(r)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('throttles each repository on its own', async () => {
    const store = makeStore()
    const refresh = jest.fn(async () => {})
    ;(store as any)._refreshOrRecoverRepository = refresh

    await store._refreshAndMaybeFetchRepository(repo(1))
    await store._refreshAndMaybeFetchRepository(repo(2))

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('refreshes again once the window has passed', async () => {
    jest.useFakeTimers()
    try {
      jest.setSystemTime(1_000_000)
      const store = makeStore()
      const refresh = jest.fn(async () => {})
      ;(store as any)._refreshOrRecoverRepository = refresh

      const r = repo()
      await store._refreshAndMaybeFetchRepository(r)
      jest.setSystemTime(1_000_000 + 3_000)
      await store._refreshAndMaybeFetchRepository(r)

      expect(refresh).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('AppStore repository removal', () => {
  it('drops every per-repository cache', () => {
    const store = makeStore() as any
    const r = repo(9)
    const spies = {
      stash: jest.spyOn(store.stashStore, 'clear'),
      worktree: jest.spyOn(store.worktreeStore, 'clear'),
      submodule: jest.spyOn(store.submoduleStore, 'clear'),
      fileTree: jest.spyOn(store.fileTreeStore, 'clear'),
      workflow: jest.spyOn(store.workflowRunsStore, 'clear'),
      health: jest.spyOn(store.repoHealthStore, 'forget'),
      git: jest.spyOn(store.gitStoreCache, 'remove'),
    }

    store.forgetRepositoryCaches(r)

    expect(spies.stash).toHaveBeenCalledWith(r)
    expect(spies.worktree).toHaveBeenCalledWith(r)
    expect(spies.submodule).toHaveBeenCalledWith(r)
    expect(spies.fileTree).toHaveBeenCalledWith(r)
    expect(spies.workflow).toHaveBeenCalledWith(9)
    expect(spies.health).toHaveBeenCalledWith(9)
    expect(spies.git).toHaveBeenCalledWith(r)
  })

  it('cancels a queued status refresh so it cannot touch a removed repo', async () => {
    const store = makeStore() as any
    const gate = deferred()
    const core = jest.fn(async () => {
      if (core.mock.calls.length === 1) {
        await gate.promise
      }
      return null
    })
    store.loadStatusCore = core

    const r = repo(9)
    const running = store._loadStatus(r)
    const queued = store._loadStatus(r)
    store.forgetRepositoryCaches(r)

    gate.resolve()
    await Promise.all([running, queued])

    expect(core).toHaveBeenCalledTimes(1)
  })

  it('lets the removed repository be focus-refreshed again if re-added', async () => {
    const store = makeStore() as any
    const refresh = jest.fn(async () => {})
    store._refreshOrRecoverRepository = refresh
    const r = repo(9)

    await store._refreshAndMaybeFetchRepository(r)
    store.forgetRepositoryCaches(r)
    await store._refreshAndMaybeFetchRepository(r)

    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
