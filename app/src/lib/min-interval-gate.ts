/**
 * Lets a keyed action through at most once per `minIntervalMs`.
 *
 * Used to stop bursty triggers (e.g. repeated window-focus events while
 * alt-tabbing) from each kicking off a full set of git subprocesses.
 */
export class MinIntervalGate<K> {
  private readonly lastPassed = new Map<K, number>()

  public constructor(private readonly minIntervalMs: number) {}

  /**
   * Returns true, and starts a new interval for `key`, when the last pass was
   * at least `minIntervalMs` ago (or there was none). Returns false otherwise.
   */
  public tryPass(key: K, now: number = Date.now()): boolean {
    const last = this.lastPassed.get(key)
    if (last !== undefined && now - last < this.minIntervalMs) {
      return false
    }
    this.lastPassed.set(key, now)
    return true
  }

  /** Forget `key`, so its next attempt passes (e.g. the repo was removed). */
  public reset(key: K): void {
    this.lastPassed.delete(key)
  }
}
