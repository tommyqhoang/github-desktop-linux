import * as React from 'react'
import { IWorktreeEntry } from '../../models/worktree'
import { WorktreeListItem } from './worktree-list-item'
import { Button } from '../lib/button'
import { ListLoadError } from '../lib/list-load-error'

interface IWorktreeListProps {
  readonly entries: ReadonlyArray<IWorktreeEntry>
  readonly loading: boolean
  /** Open the "add worktree" dialog. */
  readonly onCreateWorktree: () => void
  /** Prune stale worktree bookkeeping. */
  readonly onPruneWorktrees: () => void
  /** Open the "remove worktree" confirmation for a specific entry. */
  readonly onRemoveWorktree: (entry: IWorktreeEntry) => void
  /** The most recent load failure, if any. */
  readonly error?: Error | null
  readonly onRetry?: () => void
  /** True while a mutating action (e.g. prune) is running. */
  readonly busy?: boolean
}

/**
 * Lists a repository's linked worktrees with a toolbar for adding a new
 * worktree and pruning stale ones. The toolbar is always shown so a user
 * with no linked worktrees can still create the first one.
 */
export class WorktreeList extends React.Component<IWorktreeListProps> {
  public render() {
    return (
      <div className="worktree-list">
        <div className="worktree-list__toolbar">
          <Button
            onClick={this.props.onCreateWorktree}
            disabled={this.props.busy === true}
          >
            Add worktree…
          </Button>
          <Button
            onClick={this.props.onPruneWorktrees}
            disabled={this.props.busy === true}
            tooltip="Remove bookkeeping for worktrees whose folder is gone"
          >
            Prune
          </Button>
        </div>
        <div className="worktree-list__body">{this.renderBody()}</div>
      </div>
    )
  }

  private renderBody(): React.JSX.Element {
    const { entries, loading, error } = this.props

    if (error != null && entries.length === 0) {
      return (
        <ListLoadError
          className="worktree-list__empty"
          title="Couldn't load worktrees"
          error={error}
          onRetry={this.props.onRetry}
        />
      )
    }

    if (loading && entries.length === 0) {
      return (
        <div className="worktree-list__loading" role="status">
          Loading worktrees…
        </div>
      )
    }

    if (entries.length === 0) {
      return (
        <div className="worktree-list__empty">No linked worktrees found.</div>
      )
    }

    return (
      <>
        {error != null && (
          <ListLoadError
            className="worktree-list__empty"
            title="Couldn't refresh worktrees"
            error={error}
            onRetry={this.props.onRetry}
          />
        )}
        {loading && (
          <span className="sr-only" role="status">
            Refreshing worktrees…
          </span>
        )}
        <ul aria-busy={loading}>
          {entries
            .filter((entry): entry is IWorktreeEntry => entry != null)
            .map(entry => (
              <WorktreeListItem
                key={entry.path}
                entry={entry}
                onRemove={this.props.onRemoveWorktree}
              />
            ))}
        </ul>
      </>
    )
  }
}
