import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import {
  IInteractiveRebaseEntry,
  RebaseTodoAction,
} from '../../models/multi-commit-operation'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IInteractiveRebaseDialogProps {
  readonly repository: Repository
  readonly commits: ReadonlyArray<Commit>
  readonly lastRetainedCommitRef: string | null
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IInteractiveRebaseDialogState {
  readonly entries: ReadonlyArray<IInteractiveRebaseEntry>
  readonly dragIndex: number | null
  readonly dragOverIndex: number | null
  /** Polite live-region text describing the last keyboard reorder. */
  readonly announcement: string
}

const ACTION_LABELS: Record<RebaseTodoAction, string> = {
  pick: 'Pick',
  squash: 'Squash',
  fixup: 'Fixup',
  drop: 'Drop',
}

const rowId = (sha: string) => `interactive-rebase-row-${sha}`
const moveUpId = (sha: string) => `interactive-rebase-up-${sha}`
const moveDownId = (sha: string) => `interactive-rebase-down-${sha}`

export class InteractiveRebaseDialog extends React.Component<
  IInteractiveRebaseDialogProps,
  IInteractiveRebaseDialogState
> {
  public constructor(props: IInteractiveRebaseDialogProps) {
    super(props)
    this.state = {
      entries: props.commits.map(commit => ({ commit, action: 'pick' })),
      dragIndex: null,
      dragOverIndex: null,
      announcement: '',
    }
  }

  /**
   * Move the entry at `from` to `to` (keyboard / button path). `focusId` is
   * the DOM id to focus once the list re-renders (falls back to the row).
   */
  private moveEntry(from: number, to: number, focusId: string) {
    const { entries } = this.state
    if (from === to || to < 0 || to >= entries.length) {
      return
    }
    const next = [...entries]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    this.setState(
      {
        entries: next,
        announcement: `Moved ${moved.commit.summary} to position ${to + 1} of ${
          next.length
        }`,
      },
      () => {
        const el = document.getElementById(focusId)
        const target =
          el !== null && !(el as HTMLButtonElement).disabled
            ? el
            : document.getElementById(rowId(moved.commit.sha))
        target?.focus()
      }
    )
  }

  private onRowKeyDown = (e: React.KeyboardEvent<HTMLElement>, i: number) => {
    // Only the row itself: Alt+Down opens a focused <select>.
    if (e.target !== e.currentTarget || !e.altKey) {
      return
    }
    const sha = this.state.entries[i].commit.sha
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.moveEntry(i, i - 1, rowId(sha))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.moveEntry(i, i + 1, rowId(sha))
    }
  }

  private onActionChange = (index: number, action: RebaseTodoAction) => {
    const entries = [...this.state.entries]
    entries[index] = { ...entries[index], action }
    this.setState({ entries })
  }

  private onDragStart = (index: number) => {
    this.setState({ dragIndex: index })
  }

  private onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    this.setState({ dragOverIndex: index })
  }

  private onDrop = (toIndex: number) => {
    const { dragIndex, entries } = this.state
    if (dragIndex === null || dragIndex === toIndex) {
      this.setState({ dragIndex: null, dragOverIndex: null })
      return
    }
    const next = [...entries]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(toIndex, 0, moved)
    this.setState({ entries: next, dragIndex: null, dragOverIndex: null })
  }

  private onDragEnd = () => {
    this.setState({ dragIndex: null, dragOverIndex: null })
  }

  private onConfirm = async () => {
    const { repository, lastRetainedCommitRef, dispatcher, onDismissed } =
      this.props
    onDismissed()
    await dispatcher.startInteractiveRebase(
      repository,
      this.state.entries,
      lastRetainedCommitRef
    )
  }

  private hasOnlyPicks(): boolean {
    return this.state.entries.every(e => e.action === 'pick')
  }

  private allDropped(): boolean {
    return this.state.entries.every(e => e.action === 'drop')
  }

  /**
   * The commits are displayed newest-first, so the last non-dropped entry is
   * the oldest commit git will replay — the first line of the generated todo.
   * Git refuses to `squash`/`fixup` that first line ("cannot squash without a
   * previous commit"), so flag it here to keep the user out of that error.
   */
  private oldestKeptIsSquash(): boolean {
    const kept = this.state.entries.filter(e => e.action !== 'drop')
    const oldest = kept.at(-1)
    return (
      oldest !== undefined &&
      (oldest.action === 'squash' || oldest.action === 'fixup')
    )
  }

  public render() {
    const { entries, dragOverIndex, dragIndex } = this.state
    const oldestKeptIsSquash = this.oldestKeptIsSquash()
    const disabled = this.allDropped() || oldestKeptIsSquash

    return (
      <Dialog
        id="interactive-rebase"
        title="Interactive Rebase"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="interactive-rebase-description">
            Commits are listed newest first. Reorder them or set an action for
            each — drag a row, or focus it and press Alt+Up or Alt+Down. Squash
            combines a commit into the older one below it; Fixup does the same
            but discards the message; Drop removes the commit entirely.
          </p>
          <div className="interactive-rebase-list" role="list">
            {entries.map((entry, i) => (
              // Rows are focusable so keyboard users can reorder them with
              // Alt+Arrow keys.
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <div
                key={entry.commit.sha}
                id={rowId(entry.commit.sha)}
                role="listitem"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                // eslint-disable-next-line react/jsx-no-bind
                onKeyDown={e => this.onRowKeyDown(e, i)}
                className={`interactive-rebase-row${
                  entry.action === 'drop' ? ' interactive-rebase-row--drop' : ''
                }${
                  dragOverIndex === i ? ' interactive-rebase-row--dragover' : ''
                }`}
                draggable={true}
                // eslint-disable-next-line react/jsx-no-bind
                onDragStart={() => this.onDragStart(i)}
                // eslint-disable-next-line react/jsx-no-bind
                onDragOver={e => this.onDragOver(e, i)}
                // eslint-disable-next-line react/jsx-no-bind
                onDrop={() => this.onDrop(i)}
                onDragEnd={this.onDragEnd}
              >
                <span
                  className="interactive-rebase-drag-handle"
                  aria-hidden="true"
                >
                  <Octicon symbol={OcticonSymbol.grabber} />
                </span>
                <code className="interactive-rebase-sha">
                  {entry.commit.sha.substring(0, 7)}
                </code>
                <span className="interactive-rebase-summary">
                  {entry.commit.summary}
                </span>
                {dragIndex !== null &&
                  dragOverIndex === i &&
                  dragIndex !== i && (
                    <span className="interactive-rebase-drop-marker">
                      Drop here
                    </span>
                  )}
                <button
                  type="button"
                  id={moveUpId(entry.commit.sha)}
                  className="interactive-rebase-move"
                  disabled={i === 0}
                  aria-label={`Move ${entry.commit.summary} up`}
                  // eslint-disable-next-line react/jsx-no-bind
                  onClick={() =>
                    this.moveEntry(i, i - 1, moveUpId(entry.commit.sha))
                  }
                >
                  <Octicon symbol={OcticonSymbol.arrowUp} />
                </button>
                <button
                  type="button"
                  id={moveDownId(entry.commit.sha)}
                  className="interactive-rebase-move"
                  disabled={i === entries.length - 1}
                  aria-label={`Move ${entry.commit.summary} down`}
                  // eslint-disable-next-line react/jsx-no-bind
                  onClick={() =>
                    this.moveEntry(i, i + 1, moveDownId(entry.commit.sha))
                  }
                >
                  <Octicon symbol={OcticonSymbol.arrowDown} />
                </button>
                <select
                  className="interactive-rebase-action"
                  value={entry.action}
                  aria-label={`Action for ${entry.commit.summary}`}
                  // eslint-disable-next-line react/jsx-no-bind
                  onChange={e =>
                    this.onActionChange(i, e.target.value as RebaseTodoAction)
                  }
                >
                  {(Object.keys(ACTION_LABELS) as Array<RebaseTodoAction>).map(
                    a => (
                      <option key={a} value={a}>
                        {ACTION_LABELS[a]}
                      </option>
                    )
                  )}
                </select>
              </div>
            ))}
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {this.state.announcement}
          </div>
          {this.allDropped() && (
            <p className="interactive-rebase-warning" role="status">
              Keep at least one commit.
            </p>
          )}
          {oldestKeptIsSquash && (
            <p className="interactive-rebase-warning" role="alert">
              The oldest commit can't be squashed or fixed up — there's no
              earlier commit to combine it into. Set it to Pick, or drop it.
            </p>
          )}
          {this.hasOnlyPicks() && (
            <p className="interactive-rebase-hint">
              Tip: Drag rows (or use Alt+Up/Alt+Down) to reorder commits, or
              change the action to squash or drop commits.
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Start Rebase"
            okButtonDisabled={disabled}
            onOkButtonClick={this.onConfirm}
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
