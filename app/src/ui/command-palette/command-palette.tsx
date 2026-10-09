import * as React from 'react'
import classNames from 'classnames'
import { Dialog, DialogContent } from '../dialog'
import { ICommandPaletteItem } from '../../models/command-palette'
import { filterCommands } from '../../lib/command-palette'

interface ICommandPaletteProps {
  readonly items: ReadonlyArray<ICommandPaletteItem>
  readonly onDismissed: () => void
}

const LISTBOX_ID = 'command-palette-listbox'
const PAGE_SIZE = 5

const optionId = (index: number) => `command-palette-option-${index}`

interface ICommandPaletteState {
  readonly query: string
  /** Failure from the last attempted command, shown inline. */
  readonly error: { readonly title: string; readonly message: string } | null
  /** Index into the currently filtered list. */
  readonly selectedIndex: number
}

/**
 * A fuzzy command launcher. Type to filter the available actions, arrow up/down
 * to move the selection, and Enter to run it. Runs the chosen command's action
 * and dismisses itself.
 */
export class CommandPalette extends React.Component<
  ICommandPaletteProps,
  ICommandPaletteState
> {
  private unmounted = false

  public constructor(props: ICommandPaletteProps) {
    super(props)
    this.state = { query: '', selectedIndex: 0, error: null }
  }

  public componentDidUpdate(
    prevProps: ICommandPaletteProps,
    prevState: ICommandPaletteState
  ) {
    if (prevState.selectedIndex !== this.state.selectedIndex) {
      document
        .getElementById(optionId(this.state.selectedIndex))
        ?.scrollIntoView?.({ block: 'nearest' })
    }
  }

  public componentWillUnmount() {
    this.unmounted = true
  }

  private get filtered(): ReadonlyArray<ICommandPaletteItem> {
    return filterCommands(this.state.query, this.props.items)
  }

  public render() {
    const filtered = this.filtered
    const { error } = this.state
    return (
      <Dialog
        id="command-palette"
        title="Command Palette"
        onDismissed={this.props.onDismissed}
        onSubmit={this.activateSelected}
      >
        <DialogContent>
          <div className="text-box-component">
            <input
              type="text"
              autoFocus={true}
              placeholder="Type a command…"
              aria-label="Command"
              role="combobox"
              aria-expanded={filtered.length > 0}
              aria-controls={LISTBOX_ID}
              aria-autocomplete="list"
              aria-activedescendant={
                filtered.length > 0
                  ? optionId(this.state.selectedIndex)
                  : undefined
              }
              value={this.state.query}
              onChange={this.onInputChange}
              onKeyDown={this.onKeyDown}
            />
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {filtered.length === 0
              ? 'No commands found'
              : `${filtered.length} ${
                  filtered.length === 1 ? 'command' : 'commands'
                } available`}
          </div>
          {error && (
            <div className="command-palette-error" role="alert">
              {`Could not run “${error.title}”: ${error.message}`}
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="command-palette-empty">No commands found.</div>
          ) : (
            <ul
              className="command-palette-list"
              role="listbox"
              id={LISTBOX_ID}
              aria-label="Commands"
            >
              {filtered.map((item, index) => (
                // Keyboard handling lives on the combobox input
                // (aria-activedescendant); options are never focused.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <li
                  key={item.id}
                  id={optionId(index)}
                  role="option"
                  data-command-id={item.id}
                  aria-selected={index === this.state.selectedIndex}
                  className={classNames('command-palette-item', {
                    selected: index === this.state.selectedIndex,
                  })}
                  onClick={this.onItemClick}
                >
                  <span className="command-palette-item-title">
                    {item.title}
                  </span>
                  {item.subtitle !== undefined && (
                    <span className="command-palette-item-subtitle">
                      {item.subtitle}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  private activateById = (id: string | undefined) => {
    const item = this.props.items.find(i => i.id === id)
    if (item !== undefined) {
      this.activate(item)
    }
  }

  private onItemClick = (event: React.MouseEvent<HTMLLIElement>) => {
    this.activateById(event.currentTarget.dataset.commandId)
  }

  private onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Reset the selection to the top whenever the result set changes.
    this.setState({ query: event.target.value, selectedIndex: 0, error: null })
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const count = this.filtered.length
    if (count === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.setState(prev => ({
        selectedIndex: (prev.selectedIndex + 1) % count,
      }))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.setState(prev => ({
        selectedIndex: (prev.selectedIndex - 1 + count) % count,
      }))
    } else if (event.key === 'PageDown') {
      event.preventDefault()
      this.setState(prev => ({
        selectedIndex: Math.min(count - 1, prev.selectedIndex + PAGE_SIZE),
      }))
    } else if (event.key === 'PageUp') {
      event.preventDefault()
      this.setState(prev => ({
        selectedIndex: Math.max(0, prev.selectedIndex - PAGE_SIZE),
      }))
    } else if (
      (event.key === 'Home' || event.key === 'End') &&
      (event.ctrlKey || this.state.query === '')
    ) {
      // With text in the box Home/End keep moving the caret; Ctrl (or an
      // empty box) jumps the selection to the first/last result.
      event.preventDefault()
      this.setState({ selectedIndex: event.key === 'Home' ? 0 : count - 1 })
    }
  }

  private activateSelected = () => {
    const item = this.filtered[this.state.selectedIndex]
    if (item !== undefined) {
      this.activate(item)
    }
  }

  private activate(item: ICommandPaletteItem) {
    const fail = (err: unknown) => {
      if (this.unmounted) {
        return
      }
      this.setState({
        error: {
          title: item.title,
          message: err instanceof Error ? err.message : String(err),
        },
      })
    }

    let result: unknown
    try {
      result = item.action()
    } catch (err) {
      fail(err)
      return
    }

    // Actions may be async at runtime even though the model types them as
    // void; keep the palette open until they settle so a rejection can be
    // surfaced instead of vanishing as an unhandled promise.
    if (
      typeof result === 'object' &&
      result !== null &&
      typeof (result as PromiseLike<unknown>).then === 'function'
    ) {
      ;(result as PromiseLike<unknown>).then(() => {
        if (!this.unmounted) {
          this.props.onDismissed()
        }
      }, fail)
      return
    }

    this.props.onDismissed()
  }
}
