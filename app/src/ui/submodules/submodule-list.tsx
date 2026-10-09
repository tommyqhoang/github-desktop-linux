import * as React from 'react'
import { ISubmoduleStatusEntry } from '../../models/submodule'
import { SubmoduleListItem } from './submodule-list-item'
import { Button } from '../lib/button'
import { ListLoadError } from '../lib/list-load-error'

interface ISubmoduleListProps {
  readonly entries: ReadonlyArray<ISubmoduleStatusEntry>
  readonly loading: boolean
  /** Run `git submodule update --init --recursive` for every submodule. */
  readonly onUpdateAll: () => void
  /** Run `git submodule sync --recursive` for every submodule. */
  readonly onSyncAll: () => void
  /** Update (init/checkout) a single submodule. */
  readonly onUpdateSubmodule: (entry: ISubmoduleStatusEntry) => void
  /** The most recent load failure, if any. */
  readonly error?: Error | null
  readonly onRetry?: () => void
  /** True while an update/sync is running; disables every action. */
  readonly busy?: boolean
}

/**
 * Lists a repository's submodules with a toolbar for updating all submodules
 * and syncing remote URLs. The toolbar is always shown so the actions are
 * reachable even before any submodule is initialized.
 */
export class SubmoduleList extends React.Component<ISubmoduleListProps> {
  public render() {
    return (
      <div className="submodule-list">
        <div className="submodule-list__toolbar">
          <Button
            onClick={this.props.onUpdateAll}
            disabled={this.props.busy === true}
          >
            Update all
          </Button>
          <Button
            onClick={this.props.onSyncAll}
            disabled={this.props.busy === true}
            tooltip="Re-sync submodule remote URLs from .gitmodules"
          >
            Sync
          </Button>
        </div>
        <div className="submodule-list__body">{this.renderBody()}</div>
      </div>
    )
  }

  private renderBody(): React.JSX.Element {
    const { entries, loading, error, busy } = this.props

    if (error != null && entries.length === 0) {
      return (
        <ListLoadError
          className="submodule-list__empty"
          title="Couldn't load submodules"
          error={error}
          onRetry={this.props.onRetry}
        />
      )
    }

    if (loading && entries.length === 0) {
      return (
        <div className="submodule-list__loading" role="status">
          Loading submodules…
        </div>
      )
    }

    if (entries.length === 0) {
      return <div className="submodule-list__empty">No submodules found.</div>
    }

    return (
      <>
        {error != null && (
          <ListLoadError
            className="submodule-list__empty"
            title="Couldn't refresh submodules"
            error={error}
            onRetry={this.props.onRetry}
          />
        )}
        {(loading || busy === true) && (
          <span className="sr-only" role="status">
            {busy === true ? 'Updating submodules…' : 'Refreshing submodules…'}
          </span>
        )}
        <ul aria-busy={loading || busy === true}>
          {entries
            .filter((entry): entry is ISubmoduleStatusEntry => entry != null)
            .map(entry => (
              <SubmoduleListItem
                key={entry.path}
                entry={entry}
                onUpdate={this.props.onUpdateSubmodule}
                disabled={busy === true}
              />
            ))}
        </ul>
      </>
    )
  }
}
