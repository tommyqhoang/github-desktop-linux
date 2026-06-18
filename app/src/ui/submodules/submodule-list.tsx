import * as React from 'react'
import { ISubmoduleStatusEntry } from '../../models/submodule'
import { SubmoduleListItem } from './submodule-list-item'
import { Button } from '../lib/button'

interface ISubmoduleListProps {
  readonly entries: ReadonlyArray<ISubmoduleStatusEntry>
  readonly loading: boolean
  /** Run `git submodule update --init --recursive` for every submodule. */
  readonly onUpdateAll: () => void
  /** Run `git submodule sync --recursive` for every submodule. */
  readonly onSyncAll: () => void
  /** Update (init/checkout) a single submodule. */
  readonly onUpdateSubmodule: (entry: ISubmoduleStatusEntry) => void
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
          <Button onClick={this.props.onUpdateAll}>Update all</Button>
          <Button
            onClick={this.props.onSyncAll}
            tooltip="Re-sync submodule remote URLs from .gitmodules"
          >
            Sync
          </Button>
        </div>
        <div className="submodule-list__body">{this.renderBody()}</div>
      </div>
    )
  }

  private renderBody(): JSX.Element {
    if (this.props.loading) {
      return (
        <div className="submodule-list__loading" role="status">
          Loading submodules…
        </div>
      )
    }

    if (this.props.entries.length === 0) {
      return <div className="submodule-list__empty">No submodules found.</div>
    }

    return (
      <ul>
        {this.props.entries
          .filter((entry): entry is ISubmoduleStatusEntry => entry != null)
          .map(entry => (
            <SubmoduleListItem
              key={entry.path}
              entry={entry}
              onUpdate={this.props.onUpdateSubmodule}
            />
          ))}
      </ul>
    )
  }
}
