import { WorkflowRunsStore } from '../../src/lib/stores/workflow-runs-store'
import { IWorkflowRun, WorkflowRunStatus } from '../../src/models/workflow-run'

function makeRun(id: number, status: WorkflowRunStatus): IWorkflowRun {
  return { id, status } as IWorkflowRun
}

describe('WorkflowRunsStore', () => {
  describe('coalesce', () => {
    it('shares one in-flight load between concurrent callers', async () => {
      const store = new WorkflowRunsStore()
      let release!: () => void
      const load = jest.fn(
        () =>
          new Promise<void>(resolve => {
            release = resolve
          })
      )

      const a = store.coalesce(1, load)
      const b = store.coalesce(1, load)

      expect(b).toBe(a)
      expect(load).toHaveBeenCalledTimes(1)
      release()
      await a
    })

    it('does not coalesce loads for different repositories', async () => {
      const store = new WorkflowRunsStore()
      const load = jest.fn(async () => {})

      await Promise.all([store.coalesce(1, load), store.coalesce(2, load)])

      expect(load).toHaveBeenCalledTimes(2)
    })

    it('starts a new load once the previous one has settled', async () => {
      const store = new WorkflowRunsStore()
      const load = jest.fn(async () => {})

      await store.coalesce(1, load)
      await store.coalesce(1, load)

      expect(load).toHaveBeenCalledTimes(2)
    })

    it('releases the slot when the load rejects', async () => {
      const store = new WorkflowRunsStore()

      await expect(
        store.coalesce(1, () => Promise.reject(new Error('boom')))
      ).rejects.toThrow('boom')

      const load = jest.fn(async () => {})
      await store.coalesce(1, load)
      expect(load).toHaveBeenCalledTimes(1)
    })
  })

  describe('hasActiveRuns', () => {
    it('is false with no runs loaded', () => {
      expect(new WorkflowRunsStore().hasActiveRuns(1)).toBe(false)
    })

    it('is false when every run has completed', () => {
      const store = new WorkflowRunsStore()
      store.setRuns(1, [makeRun(1, WorkflowRunStatus.Completed)])
      expect(store.hasActiveRuns(1)).toBe(false)
    })

    it.each([
      WorkflowRunStatus.Queued,
      WorkflowRunStatus.InProgress,
      WorkflowRunStatus.Waiting,
      WorkflowRunStatus.Pending,
      WorkflowRunStatus.Requested,
    ])('is true when a run is %s', status => {
      const store = new WorkflowRunsStore()
      store.setRuns(1, [
        makeRun(1, WorkflowRunStatus.Completed),
        makeRun(2, status),
      ])
      expect(store.hasActiveRuns(1)).toBe(true)
    })
  })

  describe('isFresh', () => {
    it('is false before anything has loaded', () => {
      expect(new WorkflowRunsStore().isFresh(1, 10_000)).toBe(false)
    })

    it('is true within the window and false after it', () => {
      const store = new WorkflowRunsStore()
      store.setRuns(1, [])
      const loadedAt = store.getAllState().get(1)!.loadedAt!

      expect(store.isFresh(1, 10_000, loadedAt + 9_999)).toBe(true)
      expect(store.isFresh(1, 10_000, loadedAt + 10_001)).toBe(false)
    })
  })

  describe('polling', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('fires the poll once after the delay', () => {
      const store = new WorkflowRunsStore()
      const poll = jest.fn()

      store.schedulePoll(1, 15_000, poll)
      jest.advanceTimersByTime(14_999)
      expect(poll).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1)
      expect(poll).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(60_000)
      expect(poll).toHaveBeenCalledTimes(1)
    })

    it('replaces a pending poll for the same repository', () => {
      const store = new WorkflowRunsStore()
      const first = jest.fn()
      const second = jest.fn()

      store.schedulePoll(1, 15_000, first)
      store.schedulePoll(1, 15_000, second)
      jest.advanceTimersByTime(15_000)

      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledTimes(1)
    })

    it('cancelPoll stops a pending poll', () => {
      const store = new WorkflowRunsStore()
      const poll = jest.fn()

      store.schedulePoll(1, 15_000, poll)
      store.cancelPoll(1)
      jest.advanceTimersByTime(60_000)

      expect(poll).not.toHaveBeenCalled()
    })

    it('keeps polls for other repositories independent', () => {
      const store = new WorkflowRunsStore()
      const one = jest.fn()
      const two = jest.fn()

      store.schedulePoll(1, 15_000, one)
      store.schedulePoll(2, 15_000, two)
      store.cancelPoll(1)
      jest.advanceTimersByTime(15_000)

      expect(one).not.toHaveBeenCalled()
      expect(two).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('drops cached runs and cancels a pending poll', () => {
      const store = new WorkflowRunsStore()
      const poll = jest.fn()
      store.setRuns(1, [makeRun(1, WorkflowRunStatus.InProgress)])
      store.schedulePoll(1, 15_000, poll)

      store.clear(1)
      jest.advanceTimersByTime(60_000)

      expect(store.getAllState().has(1)).toBe(false)
      expect(poll).not.toHaveBeenCalled()
    })

    it('only emits an update when something was cached', () => {
      const store = new WorkflowRunsStore()
      const onUpdate = jest.fn()
      store.onDidUpdate(onUpdate)

      store.clear(1)
      expect(onUpdate).not.toHaveBeenCalled()

      store.setRuns(1, [])
      onUpdate.mockClear()
      store.clear(1)
      expect(onUpdate).toHaveBeenCalledTimes(1)
    })

    it('leaves other repositories alone', () => {
      const store = new WorkflowRunsStore()
      store.setRuns(1, [])
      store.setRuns(2, [])

      store.clear(1)

      expect(store.getAllState().has(2)).toBe(true)
    })
  })
})
