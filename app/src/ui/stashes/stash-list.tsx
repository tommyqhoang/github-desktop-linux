import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { StashListItem } from './stash-list-item'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ListLoadError } from '../lib/list-load-error'

interface IStashListProps {
  readonly entries: ReadonlyArray<IStashEntry>
  readonly loading: boolean
  readonly selectedSha: string | null
  readonly onSelect: (entry: IStashEntry) => void
  readonly onContextMenu?: (
    entry: IStashEntry,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onCreateClick: () => void
  /** The most recent load failure, if any. */
  readonly error?: Error | null
  readonly onRetry?: () => void
}

/**
 * Renders the list of stash entries for the active repository, plus a
 * "Stash changes" button that opens the create dialog.
 */
export class StashList extends React.PureComponent<IStashListProps> {
  public render() {
    return (
      <div className="stash-list" role="grid">
        <div className="stash-list__toolbar">
          <Button onClick={this.props.onCreateClick}>
            <Octicon symbol={octicons.plus} />
            <span>Stash changes</span>
          </Button>
        </div>
        {this.renderBody()}
        {this.props.error != null && this.props.entries.length > 0 && (
          <ListLoadError
            className="stash-list__placeholder"
            title="Couldn't refresh stashes"
            error={this.props.error}
            onRetry={this.props.onRetry}
          />
        )}
      </div>
    )
  }

  private renderBody() {
    const { entries, loading, selectedSha, error } = this.props

    if (error != null && entries.length === 0) {
      return (
        <ListLoadError
          className="stash-list__placeholder"
          title="Couldn't load stashes"
          error={error}
          onRetry={this.props.onRetry}
        />
      )
    }

    if (loading && entries.length === 0) {
      return (
        <div className="stash-list__placeholder" role="status">
          Loading stashes…
        </div>
      )
    }

    if (entries.length === 0) {
      return (
        <div className="stash-list__placeholder">
          No stashes. Click <strong>Stash changes</strong> to save your current
          working changes.
        </div>
      )
    }

    return (
      <div className="stash-list__items" aria-busy={loading}>
        {entries.map(entry => (
          <StashListItem
            key={entry.stashSha}
            entry={entry}
            selected={entry.stashSha === selectedSha}
            onClick={this.props.onSelect}
            onContextMenu={this.props.onContextMenu}
          />
        ))}
      </div>
    )
  }
}
