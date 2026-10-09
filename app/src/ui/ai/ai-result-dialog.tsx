import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'

interface IAIResultDialogProps<T> {
  readonly title: string
  readonly loading: boolean
  readonly error: string | null
  /** The generated result, or null before it arrives. */
  readonly result: T | null
  /** Render the result body. Lets each feature own its result layout. */
  readonly renderResult: (result: T) => React.JSX.Element
  readonly onRegenerate: () => void
  /** Run the action again; offered in the error and empty states. */
  readonly onRetry?: () => void
  /** Optional primary action (e.g. insert into the commit message / PR form). */
  readonly onInsert?: () => void
  /** Label for the primary action button. Defaults to "Insert". */
  readonly insertLabel?: string
  /** Optional copy-to-clipboard action. */
  readonly onCopy?: () => void
  /** Clear an in-place error without closing the dialog or forcing a retry. */
  readonly onDismissError?: () => void
  readonly onDismissed: () => void
}

/**
 * Shared one-shot result surface for AI features. Renders loading, error, and
 * result states with a consistent action row (Insert / Copy / Regenerate). The
 * result body is supplied by the caller via `renderResult` so each feature
 * controls its own layout while sharing the chrome and actions.
 */
interface IAIResultDialogState {
  readonly copied: boolean
}

export class AIResultDialog<T = unknown> extends React.Component<
  IAIResultDialogProps<T>,
  IAIResultDialogState
> {
  private copiedTimer: number | null = null

  public constructor(props: IAIResultDialogProps<T>) {
    super(props)
    this.state = { copied: false }
  }

  public componentWillUnmount() {
    if (this.copiedTimer !== null) {
      window.clearTimeout(this.copiedTimer)
    }
  }

  /**
   * Pressing Enter inside the dialog must not dismiss it (the default when
   * `onSubmit` is omitted), so submit is a deliberate no-op; Insert and Close
   * have their own click handlers.
   */
  private onSubmit = () => {}

  private onCopyClick = () => {
    this.props.onCopy?.()
    this.setState({ copied: true })
    if (this.copiedTimer !== null) {
      window.clearTimeout(this.copiedTimer)
    }
    this.copiedTimer = window.setTimeout(() => {
      this.copiedTimer = null
      this.setState({ copied: false })
    }, 2000)
  }

  /** Text for the always-mounted live region (loading and result changes). */
  private liveMessage(): string {
    if (this.state.copied) {
      return 'Copied to clipboard'
    }
    if (this.props.loading) {
      return 'Generating…'
    }
    if (this.props.error === null && this.props.result !== null) {
      return 'Result ready'
    }
    return ''
  }

  public render() {
    return (
      <Dialog
        id="ai-result-dialog"
        title={this.props.title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <div className="sr-only" role="status" aria-live="polite">
            {this.liveMessage()}
          </div>
          {this.renderBody()}
        </DialogContent>
        <DialogFooter>{this.renderActions()}</DialogFooter>
      </Dialog>
    )
  }

  private renderBody(): React.JSX.Element {
    if (this.props.loading) {
      return (
        <div className="ai-result-dialog__loading" aria-hidden={true}>
          Generating…
        </div>
      )
    }
    if (this.props.error !== null) {
      return (
        <div className="ai-result-dialog__error">
          <div className="ai-result-dialog__error-message" role="alert">
            {this.props.error}
          </div>
          {this.props.onDismissError !== undefined && (
            <Button
              className="ai-result-dialog__error-dismiss"
              onClick={this.props.onDismissError}
            >
              Dismiss
            </Button>
          )}
        </div>
      )
    }
    if (this.props.result !== null) {
      return (
        <div className="ai-result-dialog__result">
          {this.props.renderResult(this.props.result)}
        </div>
      )
    }
    return (
      <div className="ai-result-dialog__empty">
        <p>No result to show.</p>
        {this.props.onRetry !== undefined && (
          <Button onClick={this.props.onRetry}>Try again</Button>
        )}
      </div>
    )
  }

  private renderActions(): React.JSX.Element {
    const { loading, result, onInsert, onCopy } = this.props
    const hasResult = !loading && result !== null
    return (
      <div className="ai-result-dialog__actions">
        <Button onClick={this.props.onRegenerate} disabled={loading}>
          Regenerate
        </Button>
        {hasResult && onCopy !== undefined && (
          <Button onClick={this.onCopyClick}>
            {this.state.copied ? 'Copied' : 'Copy'}
          </Button>
        )}
        {hasResult && onInsert !== undefined && (
          <Button type="submit" onClick={onInsert}>
            {this.props.insertLabel ?? 'Insert'}
          </Button>
        )}
        <Button onClick={this.props.onDismissed}>Close</Button>
      </div>
    )
  }
}
