import * as React from 'react'
import { Button } from './button'

interface IListLoadErrorProps {
  /** Short description of what failed, e.g. "Couldn't load stashes". */
  readonly title: string
  readonly error: Error
  readonly onRetry?: () => void
  readonly className?: string
}

/**
 * Inline, announced error message for a list whose load failed, with an
 * optional Retry button. Used instead of letting a failed load masquerade as
 * an empty list.
 */
export class ListLoadError extends React.PureComponent<IListLoadErrorProps> {
  public render() {
    const { title, error, onRetry, className } = this.props
    return (
      <div className={className ?? 'list-load-error'} role="alert">
        <div>
          {title}: {error.message}
        </div>
        {onRetry !== undefined && <Button onClick={onRetry}>Retry</Button>}
      </div>
    )
  }
}
