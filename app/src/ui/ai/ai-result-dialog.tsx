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
  readonly renderResult: (result: T) => JSX.Element
  readonly onRegenerate: () => void
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
export class AIResultDialog<T = unknown> extends React.Component<
  IAIResultDialogProps<T>
> {
  public render() {
    return (
      <Dialog
        id="ai-result-dialog"
        title={this.props.title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
      >
        <DialogContent>{this.renderBody()}</DialogContent>
        <DialogFooter>{this.renderActions()}</DialogFooter>
      </Dialog>
    )
  }

  private renderBody(): JSX.Element {
    if (this.props.loading) {
      return (
        <div className="ai-result-dialog__loading" role="status">
          Generating…
        </div>
      )
    }
    if (this.props.error !== null) {
      return (
        <div className="ai-result-dialog__error">
          <div className="ai-result-dialog__error-message">
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
    return <div className="ai-result-dialog__empty" />
  }

  private renderActions(): JSX.Element {
    const { loading, result, onInsert, onCopy } = this.props
    const hasResult = !loading && result !== null
    return (
      <div className="ai-result-dialog__actions">
        <Button onClick={this.props.onRegenerate} disabled={loading}>
          Regenerate
        </Button>
        {hasResult && onCopy !== undefined && (
          <Button onClick={onCopy}>Copy</Button>
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
