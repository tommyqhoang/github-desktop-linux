import * as React from 'react'
import {
  ISubmoduleStatusEntry,
  SubmoduleWorkDirState,
} from '../../models/submodule'
import { Button } from '../lib/button'

interface ISubmoduleListItemProps {
  readonly entry: ISubmoduleStatusEntry
  /** Invoked when the user asks to update (init/checkout) this submodule. */
  readonly onUpdate: (entry: ISubmoduleStatusEntry) => void
}

/** Human-readable label + badge modifier for each work-dir state. */
const StateLabels: Record<
  SubmoduleWorkDirState,
  { readonly label: string; readonly kind: string } | null
> = {
  [SubmoduleWorkDirState.UpToDate]: null,
  [SubmoduleWorkDirState.Uninitialized]: {
    label: 'Uninitialized',
    kind: 'uninitialized',
  },
  [SubmoduleWorkDirState.OutOfDate]: {
    label: 'Out of date',
    kind: 'outofdate',
  },
  [SubmoduleWorkDirState.Conflicted]: { label: 'Conflict', kind: 'conflicted' },
}

/**
 * A single submodule row: its path, the `git describe` of its checked-out
 * commit, a short sha, a status badge for non-up-to-date states, and an
 * Update action that initializes or checks out the recorded commit.
 */
export class SubmoduleListItem extends React.Component<ISubmoduleListItemProps> {
  public render() {
    const { entry } = this.props
    const badge = StateLabels[entry.state]
    return (
      <li className="submodule-list__item">
        <div className="submodule-list__item-main">
          <div className="submodule-list__path">{entry.path}</div>
          <div className="submodule-list__meta">
            {entry.describe.length > 0 && (
              <span className="submodule-list__describe">{entry.describe}</span>
            )}
            <span className="submodule-list__sha">{entry.sha.slice(0, 8)}</span>
            {badge !== null && (
              <span
                className={`submodule-list__badge submodule-list__badge--${badge.kind}`}
              >
                {badge.label}
              </span>
            )}
          </div>
        </div>
        <Button
          className="submodule-list__update"
          onClick={this.onUpdateClick}
          tooltip={`Update the submodule at ${entry.path}`}
        >
          Update
        </Button>
      </li>
    )
  }

  private onUpdateClick = () => {
    this.props.onUpdate(this.props.entry)
  }
}
