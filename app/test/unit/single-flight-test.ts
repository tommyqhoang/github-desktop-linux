import { SingleFlight } from '../../src/lib/single-flight'

/** A task whose completion the test controls. */
function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise<void>(r => setImmediate(r))

describe('SingleFlight', () => {
  it('runs a task immediately when idle', async () => {
    const sf = new SingleFlight<string, number>()
    const task = jest.fn(async () => 1)

    await expect(sf.run('a', task)).resolves.toBe(1)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('shares one trailing run between callers that arrive mid-flight', async () => {
    const sf = new SingleFlight<string, string>()
    const first = deferred<string>()
    const task = jest
      .fn<Promise<string>, []>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce('trailing')

    const a = sf.run('k', task)
    const b = sf.run('k', task)
    const c = sf.run('k', task)

    expect(b).toBe(c)
    expect(b).not.toBe(a)
    expect(task).toHaveBeenCalledTimes(1)

    first.resolve('first')
    await expect(a).resolves.toBe('first')
    await expect(b).resolves.toBe('trailing')
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('starts the trailing run only after the current one settles', async () => {
    const sf = new SingleFlight<string, void>()
    const first = deferred()
    const order: string[] = []

    const a = sf.run('k', async () => {
      order.push('first:start')
      await first.promise
      order.push('first:end')
    })
    const b = sf.run('k', async () => {
      order.push('trailing:start')
    })

    await tick()
    expect(order).toEqual(['first:start'])

    first.resolve()
    await Promise.all([a, b])
    expect(order).toEqual(['first:start', 'first:end', 'trailing:start'])
  })

  it('hands a late caller a result from a run that started after the call', async () => {
    const sf = new SingleFlight<string, string>()
    let state = 'before'
    const first = deferred()

    const a = sf.run('k', async () => {
      const seen = state
      await first.promise
      return seen
    })
    // A mutation lands while the first run is still going.
    state = 'after'
    const b = sf.run('k', async () => state)

    first.resolve()
    await expect(a).resolves.toBe('before')
    await expect(b).resolves.toBe('after')
  })

  it('runs the trailing task even when the current one rejects', async () => {
    const sf = new SingleFlight<string, string>()
    const first = deferred<string>()

    const a = sf.run('k', () => first.promise)
    const b = sf.run('k', async () => 'recovered')

    first.reject(new Error('boom'))
    await expect(a).rejects.toThrow('boom')
    await expect(b).resolves.toBe('recovered')
  })

  it('keeps keys independent', async () => {
    const sf = new SingleFlight<number, number>()
    const gate = deferred()
    const slow = jest.fn(async () => {
      await gate.promise
      return 1
    })
    const fast = jest.fn(async () => 2)

    const a = sf.run(1, slow)
    await expect(sf.run(2, fast)).resolves.toBe(2)
    expect(fast).toHaveBeenCalledTimes(1)
    expect(slow).toHaveBeenCalledTimes(1)

    gate.resolve()
    await a
  })

  it('goes idle again once everything has settled', async () => {
    const sf = new SingleFlight<string, number>()
    const task = jest.fn(async () => 1)

    await sf.run('k', task)
    await tick()
    await sf.run('k', task)

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('does not stack more than one trailing run however many callers wait', async () => {
    const sf = new SingleFlight<string, void>()
    const first = deferred()
    const task = jest
      .fn<Promise<void>, []>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined)

    const calls = Array.from({ length: 50 }, () => sf.run('k', task))
    first.resolve()
    await Promise.all(calls)

    expect(task).toHaveBeenCalledTimes(2)
  })

  describe('cancel', () => {
    it('skips the queued run and resolves its callers with the given value', async () => {
      const sf = new SingleFlight<string, string>()
      const first = deferred<string>()
      const queuedTask = jest.fn(async () => 'should not run')

      const a = sf.run('k', () => first.promise)
      const b = sf.run('k', queuedTask)
      sf.cancel('k', 'cancelled')

      first.resolve('first')
      await expect(a).resolves.toBe('first')
      await expect(b).resolves.toBe('cancelled')
      expect(queuedTask).not.toHaveBeenCalled()
    })

    it('leaves the run already in progress alone', async () => {
      const sf = new SingleFlight<string, string>()
      const first = deferred<string>()
      const a = sf.run('k', () => first.promise)

      sf.cancel('k', 'cancelled')
      first.resolve('first')

      await expect(a).resolves.toBe('first')
    })

    it('does not swallow a caller that arrives after the cancellation', async () => {
      const sf = new SingleFlight<string, string>()
      const first = deferred<string>()
      const a = sf.run('k', () => first.promise)
      const stale = sf.run('k', async () => 'stale')
      sf.cancel('k', 'cancelled')

      const fresh = sf.run('k', async () => 'fresh')
      expect(fresh).not.toBe(stale)

      first.resolve('first')
      await a
      await expect(stale).resolves.toBe('cancelled')
      await expect(fresh).resolves.toBe('fresh')
    })

    it('is a no-op when nothing is queued', () => {
      const sf = new SingleFlight<string, string>()
      expect(() => sf.cancel('missing', 'x')).not.toThrow()
    })
  })
})
