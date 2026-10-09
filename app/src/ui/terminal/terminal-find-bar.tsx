import * as React from 'react'

interface IProps {
  readonly visible: boolean
  readonly onClose: () => void
  /** Returns false when nothing matched; void/true are treated as found. */
  readonly onFindNext: (text: string) => boolean | void
  readonly onFindPrevious: (text: string) => boolean | void
}

interface IState {
  readonly text: string
  /** Result of the last search, announced via a polite live region. */
  readonly status: 'idle' | 'found' | 'none'
}

/**
 * Inline find bar for the terminal panel. Pure presentational component:
 * owns the search-text input state and dispatches search intents up to
 * the parent, which routes them to the active session's xterm.js search
 * addon.
 */
export class TerminalFindBar extends React.Component<IProps, IState> {
  private inputRef = React.createRef<HTMLInputElement>()
  public state: IState = { text: '', status: 'idle' }

  public componentDidUpdate(prevProps: IProps) {
    if (!prevProps.visible && this.props.visible) {
      this.inputRef.current?.focus()
      this.inputRef.current?.select()
    }
  }

  public render() {
    if (!this.props.visible) {
      return null
    }
    return (
      <div className="terminal-find-bar" role="search">
        <input
          ref={this.inputRef}
          type="search"
          className="terminal-find-bar__input"
          aria-label="Find in terminal"
          placeholder="Find in terminal"
          value={this.state.text}
          onChange={this.onChange}
          onKeyDown={this.onKeyDown}
        />
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Previous match (Shift+Enter)"
          onClick={this.onPrevClick}
        >
          ↑
        </button>
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Next match (Enter)"
          onClick={this.onNextClick}
        >
          ↓
        </button>
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Close find bar (Esc)"
          onClick={this.props.onClose}
        >
          ×
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {this.state.status === 'none'
            ? 'No results'
            : this.state.status === 'found'
              ? 'Match found'
              : ''}
        </span>
      </div>
    )
  }

  private onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ text: e.target.value, status: 'idle' })
  }

  private search(forward: boolean) {
    const { text } = this.state
    if (text.length === 0) {
      this.setState({ status: 'idle' })
      return
    }
    const found = forward
      ? this.props.onFindNext(text)
      : this.props.onFindPrevious(text)
    this.setState({ status: found === false ? 'none' : 'found' })
  }

  private onPrevClick = () => {
    this.search(false)
  }

  private onNextClick = () => {
    this.search(true)
  }

  private onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.props.onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      this.search(!e.shiftKey)
    }
  }
}
