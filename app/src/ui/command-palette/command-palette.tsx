import * as React from 'react'
import classNames from 'classnames'
import { Dialog, DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { ICommandPaletteItem } from '../../models/command-palette'
import { filterCommands } from '../../lib/command-palette'

interface ICommandPaletteProps {
  readonly items: ReadonlyArray<ICommandPaletteItem>
  readonly onDismissed: () => void
}

interface ICommandPaletteState {
  readonly query: string
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
  public constructor(props: ICommandPaletteProps) {
    super(props)
    this.state = { query: '', selectedIndex: 0 }
  }

  private get filtered(): ReadonlyArray<ICommandPaletteItem> {
    return filterCommands(this.state.query, this.props.items)
  }

  public render() {
    const filtered = this.filtered
    return (
      <Dialog
        id="command-palette"
        title="Command Palette"
        onDismissed={this.props.onDismissed}
        onSubmit={this.activateSelected}
      >
        <DialogContent>
          <TextBox
            autoFocus={true}
            placeholder="Type a command…"
            ariaLabel="Command"
            value={this.state.query}
            onValueChanged={this.onQueryChanged}
            onKeyDown={this.onKeyDown}
          />
          {filtered.length === 0 ? (
            <div className="command-palette-empty">No commands found.</div>
          ) : (
            <ul className="command-palette-list" role="listbox">
              {filtered.map((item, index) => (
                <li
                  key={item.id}
                  role="option"
                  data-command-id={item.id}
                  aria-selected={index === this.state.selectedIndex}
                  className={classNames('command-palette-item', {
                    selected: index === this.state.selectedIndex,
                  })}
                  onClick={this.onItemClick}
                  onKeyDown={this.onItemKeyDown}
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

  private onItemKeyDown = (event: React.KeyboardEvent<HTMLLIElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.activateById(event.currentTarget.dataset.commandId)
    }
  }

  private onQueryChanged = (query: string) => {
    // Reset the selection to the top whenever the result set changes.
    this.setState({ query, selectedIndex: 0 })
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
    }
  }

  private activateSelected = () => {
    const item = this.filtered[this.state.selectedIndex]
    if (item !== undefined) {
      this.activate(item)
    }
  }

  private activate(item: ICommandPaletteItem) {
    item.action()
    this.props.onDismissed()
  }
}
