import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { IWorkflowRun, WorkflowRunStatus } from '../../models/workflow-run'

/** Why a repository has no Actions data to show (distinct from "no runs"). */
export type WorkflowRunsUnavailableReason =
  'signed-out' | 'not-github' | 'no-actions' | 'no-branch'

export interface IRepoWorkflowRunsState {
  readonly runs: ReadonlyArray<IWorkflowRun>
  readonly loading: boolean
  readonly error: Error | null
  readonly loadedAt: number | null
  readonly selectedWorkflowName: string | null
  /** Set when Actions data can't be shown for a known, non-error reason. */
  readonly unavailable: WorkflowRunsUnavailableReason | null
}

const EMPTY_STATE: IRepoWorkflowRunsState = Object.freeze({
  runs: [],
  loading: false,
  error: null,
  loadedAt: null,
  selectedWorkflowName: null,
  unavailable: null,
})

/** True while GitHub may still change the run's status or conclusion. */
export function isWorkflowRunActive(run: IWorkflowRun): boolean {
  return run.status !== WorkflowRunStatus.Completed
}

export class WorkflowRunsStore extends BaseStore {
  private state: Map<number, IRepoWorkflowRunsState> = new Map()
  private readonly inFlight = new Map<number, Promise<void>>()
  private readonly pollTimers = new Map<number, ReturnType<typeof setTimeout>>()

  /**
   * Run `load` unless a load for this repository is already in flight, in
   * which case every caller shares the existing promise. Rapid tab switches
   * and overlapping refreshes then cost one API request instead of several.
   */
  public coalesce(
    repositoryId: number,
    load: () => Promise<void>
  ): Promise<void> {
    const existing = this.inFlight.get(repositoryId)
    if (existing !== undefined) {
      return existing
    }
    const promise = load().finally(() => {
      this.inFlight.delete(repositoryId)
    })
    this.inFlight.set(repositoryId, promise)
    return promise
  }

  /** True when the repository has at least one non-completed run. */
  public hasActiveRuns(repositoryId: number): boolean {
    return (this.state.get(repositoryId)?.runs ?? []).some(isWorkflowRunActive)
  }

  /** True when runs were loaded no more than `maxAgeMs` ago. */
  public isFresh(
    repositoryId: number,
    maxAgeMs: number,
    now: number = Date.now()
  ): boolean {
    const loadedAt = this.state.get(repositoryId)?.loadedAt ?? null
    return loadedAt !== null && now - loadedAt <= maxAgeMs
  }

  /** Run `poll` once after `delayMs`, replacing any poll already pending. */
  public schedulePoll(
    repositoryId: number,
    delayMs: number,
    poll: () => void
  ): void {
    this.cancelPoll(repositoryId)
    this.pollTimers.set(
      repositoryId,
      setTimeout(() => {
        this.pollTimers.delete(repositoryId)
        poll()
      }, delayMs)
    )
  }

  /** Drop everything cached for a repository that has been removed. */
  public clear(repositoryId: number): void {
    this.cancelPoll(repositoryId)
    if (this.state.delete(repositoryId)) {
      this.emitUpdate()
    }
  }

  public cancelPoll(repositoryId: number): void {
    const timer = this.pollTimers.get(repositoryId)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.pollTimers.delete(repositoryId)
    }
  }

  public getState(repository: Repository): IRepoWorkflowRunsState {
    return this.state.get(repository.id) ?? EMPTY_STATE
  }

  public getAllState(): ReadonlyMap<number, IRepoWorkflowRunsState> {
    return this.state
  }

  public setLoading(repositoryId: number): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, { ...current, loading: true })
    this.emitUpdate()
  }

  public setRuns(
    repositoryId: number,
    runs: ReadonlyArray<IWorkflowRun>
  ): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, {
      ...current,
      runs,
      loading: false,
      error: null,
      loadedAt: Date.now(),
      unavailable: null,
    })
    this.emitUpdate()
  }

  /**
   * Record that Actions data can't be shown (signed out, not a GitHub repo,
   * Actions not available). Clears runs and any stale error.
   */
  public setUnavailable(
    repositoryId: number,
    unavailable: WorkflowRunsUnavailableReason
  ): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, {
      ...current,
      runs: [],
      loading: false,
      error: null,
      unavailable,
    })
    this.emitUpdate()
  }

  /**
   * Record a failed load. Previously loaded runs are kept so a transient
   * failure never wipes a populated list.
   */
  public setError(repositoryId: number, error: Error): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, {
      ...current,
      loading: false,
      error,
    })
    this.emitUpdate()
  }

  public setSelectedWorkflowName(
    repositoryId: number,
    name: string | null
  ): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, { ...current, selectedWorkflowName: name })
    this.emitUpdate()
  }
}
