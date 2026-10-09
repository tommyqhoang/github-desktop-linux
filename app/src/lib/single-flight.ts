interface IQueued<T> {
  readonly promise: Promise<T>
  /** Set by `cancel()`; the queued task then resolves with `value` instead. */
  readonly state: { cancelled: { readonly value: T } | null }
}

interface IFlight<T> {
  readonly running: Promise<T>
  queued: IQueued<T> | null
}

/**
 * Keyed "single flight with a trailing run".
 *
 * Callers that arrive while a run for the same key is in progress share ONE
 * further run that starts only after the current one settles. That bounds the
 * work to at most one running plus one queued task per key (instead of a pile
 * of concurrent subprocesses), while guaranteeing the promise a caller gets
 * back belongs to a run that *started after the call*, so it can never hand
 * back a result that predates the change that prompted the call.
 *
 * This differs from plain promise-sharing, where a late caller would be given
 * the in-flight promise and observe pre-mutation data.
 */
export class SingleFlight<K, T> {
  private readonly flights = new Map<K, IFlight<T>>()

  public run(key: K, task: () => Promise<T>): Promise<T> {
    const flight = this.flights.get(key)
    if (flight === undefined) {
      return this.start(key, task)
    }

    if (flight.queued === null) {
      const state: IQueued<T>['state'] = { cancelled: null }
      // Start the trailing run whether the current one resolved or rejected;
      // its own failure must not poison the next run.
      const go = () =>
        state.cancelled !== null
          ? Promise.resolve(state.cancelled.value)
          : this.start(key, task)
      flight.queued = { promise: flight.running.then(go, go), state }
    }
    return flight.queued.promise
  }

  /**
   * Drop the queued trailing run for `key` (if any) without running it; its
   * callers resolve with `value`. The run already in progress is left alone.
   * Callers arriving afterwards get a fresh trailing run as usual, so a
   * legitimate new request is never swallowed by an earlier cancellation.
   */
  public cancel(key: K, value: T): void {
    const flight = this.flights.get(key)
    if (flight?.queued) {
      flight.queued.state.cancelled = { value }
      flight.queued = null
    }
  }

  private start(key: K, task: () => Promise<T>): Promise<T> {
    const running = task()
    const flight: IFlight<T> = { running, queued: null }
    this.flights.set(key, flight)

    const release = () => {
      // A trailing run replaces this entry; only clear our own.
      if (this.flights.get(key) === flight) {
        this.flights.delete(key)
      }
    }
    running.then(release, release)
    return running
  }
}
