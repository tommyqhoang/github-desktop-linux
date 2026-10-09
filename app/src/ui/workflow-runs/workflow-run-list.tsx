import * as React from 'react'
import {
  IWorkflowRun,
  WorkflowRunStatus,
  WorkflowRunConclusion,
  WorkflowRunFilter,
} from '../../models/workflow-run'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { Dispatcher } from '../dispatcher'
import { WorkflowRunListItem } from './workflow-run-list-item'
import { WorkflowRunToolbar } from './workflow-run-toolbar'
import { PopupType } from '../../models/popup'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import { API, IAPIWorkflow } from '../../lib/api'
import { WorkflowRunsUnavailableReason } from '../../lib/stores/workflow-runs-store'
import { ListLoadError } from '../lib/list-load-error'

interface IWorkflowRunListProps {
  readonly entries: ReadonlyArray<IWorkflowRun>
  readonly loading: boolean
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly branch: string

  /** The most recent load failure; previously loaded runs stay listed. */
  readonly error?: Error | null

  /** Why Actions data can't be shown (not an error), if known. */
  readonly unavailable?: WorkflowRunsUnavailableReason | null

  /** Reload the runs (Retry button). */
  readonly onRetry?: () => void

  /**
   * Invoked when a run row is activated. When provided, the run is
   * selected for the detail pane; when omitted, the run opens on GitHub.
   */
  readonly onSelectRun?: (entry: IWorkflowRun) => void

  /** The id of the currently selected run, highlighted in the list. */
  readonly selectedRunId?: number | null
}

interface IWorkflowRunListState {
  readonly filter: WorkflowRunFilter
  /** True while "Run workflow" is fetching the list of workflows. */
  readonly preparingDispatch: boolean
}

/**
 * Lists workflow runs for a repository with a status filter toolbar.
 * Shows loading and empty states. The "Run workflow" button fetches
 * available workflows and opens the dispatch popup.
 */
export class WorkflowRunList extends React.Component<
  IWorkflowRunListProps,
  IWorkflowRunListState
> {
  public constructor(props: IWorkflowRunListProps) {
    super(props)
    this.state = {
      filter: 'all',
      preparingDispatch: false,
    }
  }

  public render() {
    return (
      <div className="workflow-run-list">
        <WorkflowRunToolbar
          selectedFilter={this.state.filter}
          onFilterChange={this.onFilterChange}
          onRunWorkflow={this.onRunWorkflow}
          runWorkflowDisabled={this.state.preparingDispatch}
        />
        {this.renderBody()}
      </div>
    )
  }

  private renderBody(): React.JSX.Element {
    const { entries, loading, error, unavailable } = this.props

    if (unavailable != null && entries.length === 0) {
      return (
        <div className="workflow-run-list-empty" role="status">
          {getUnavailableMessage(unavailable)}
        </div>
      )
    }

    if (error != null && entries.length === 0) {
      return (
        <ListLoadError
          className="workflow-run-list-empty"
          title="Couldn’t load workflow runs"
          error={error}
          onRetry={this.props.onRetry}
        />
      )
    }

    if (loading && entries.length === 0) {
      return (
        <div className="workflow-run-list-loading" role="status">
          Loading workflow runs…
        </div>
      )
    }

    const filtered = this.getFilteredEntries()
    if (filtered.length === 0) {
      return (
        <div className="workflow-run-list-empty">
          {entries.length === 0
            ? 'No workflow runs yet. Trigger one with “Run workflow”, or push a commit to a branch with a configured workflow.'
            : 'No runs match this filter.'}
        </div>
      )
    }

    return (
      <div className="workflow-run-list-items" role="grid" aria-busy={loading}>
        {error != null && (
          <ListLoadError
            className="workflow-run-list-empty"
            title="Couldn’t refresh workflow runs"
            error={error}
            onRetry={this.props.onRetry}
          />
        )}
        {filtered.map(entry => (
          <WorkflowRunListItem
            key={entry.id}
            entry={entry}
            onRunClick={this.onRunClick}
            selected={entry.id === this.props.selectedRunId}
          />
        ))}
      </div>
    )
  }

  private getFilteredEntries(): ReadonlyArray<IWorkflowRun> {
    const { entries } = this.props
    const { filter } = this.state
    if (filter === 'all') {
      return entries
    }
    if (filter === 'success') {
      return entries.filter(
        e =>
          e.status === WorkflowRunStatus.Completed &&
          e.conclusion === WorkflowRunConclusion.Success
      )
    }
    if (filter === 'failure') {
      return entries.filter(
        e =>
          e.status === WorkflowRunStatus.Completed &&
          e.conclusion === WorkflowRunConclusion.Failure
      )
    }
    if (filter === 'cancelled') {
      return entries.filter(
        e =>
          e.status === WorkflowRunStatus.Completed &&
          e.conclusion === WorkflowRunConclusion.Cancelled
      )
    }
    return entries.filter(e => e.status === filter)
  }

  private onFilterChange = (filter: WorkflowRunFilter) => {
    this.setState({ filter })
  }

  private onRunClick = (entry: IWorkflowRun) => {
    if (this.props.onSelectRun) {
      this.props.onSelectRun(entry)
    } else {
      this.props.dispatcher.openInBrowser(entry.htmlUrl)
    }
  }

  private onRunWorkflow = async () => {
    if (this.state.preparingDispatch) {
      return
    }
    const { repository, dispatcher, accounts, branch } = this.props
    const account = getAccountForRepository(accounts, repository)
    if (account === null || repository.gitHubRepository === null) {
      dispatcher.postError(
        new Error(
          'Sign in to a GitHub account for this repository to run workflows.'
        )
      )
      return
    }

    const { owner, name } = repository.gitHubRepository

    this.setState({ preparingDispatch: true })
    try {
      const api = API.fromAccount(account)
      const response = await api.fetchWorkflows(owner.login, name)

      if (response === null) {
        dispatcher.postError(
          new Error(
            'GitHub Actions isn’t available for this repository, or your account can’t see its workflows.'
          )
        )
        return
      }

      const workflows = getDispatchableWorkflows(response.workflows)

      if (workflows.length === 0) {
        dispatcher.postError(
          new Error(
            response.workflows.length === 0
              ? 'This repository has no workflows.'
              : 'None of this repository’s workflows are active, so none can be run.'
          )
        )
        return
      }

      await dispatcher.showPopup({
        type: PopupType.WorkflowRunDispatch,
        repository,
        branch,
        workflows,
      })
    } catch (error) {
      dispatcher.postError(
        error instanceof Error ? error : new Error(String(error))
      )
    } finally {
      this.setState({ preparingDispatch: false })
    }
  }
}

/** Only active workflows can be dispatched (not deleted/disabled ones). */
export function getDispatchableWorkflows(
  workflows: ReadonlyArray<IAPIWorkflow>
): ReadonlyArray<{ id: number; name: string }> {
  return workflows
    .filter(w => w.state === 'active')
    .map(w => ({ id: w.id, name: w.name }))
}

/** User-facing explanation for each "Actions unavailable" reason. */
export function getUnavailableMessage(
  reason: WorkflowRunsUnavailableReason
): string {
  switch (reason) {
    case 'signed-out':
      return 'Sign in to GitHub to see Actions.'
    case 'not-github':
      return 'This repository isn’t on GitHub, so it has no Actions.'
    case 'no-actions':
      return 'GitHub Actions isn’t available for this repository, or your account can’t see it.'
    case 'no-branch':
      return 'Check out a branch to see its workflow runs.'
  }
}
