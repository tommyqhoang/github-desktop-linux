import * as React from 'react'

const MAX_PREVIEW_LINES = 6

const TITLE_ID = 'paste-confirm-dialog-title'

/** Element focused before the dialog opened; restored when it unmounts. */
let previouslyFocused: HTMLElement | null = null

/**
 * Stable ref callback (module-level so re-renders don't re-run it). On mount
 * it remembers the focused element and moves focus to the safe default
 * (Cancel); on unmount it puts focus back where it came from.
 */
function onDialogRef(el: HTMLDivElement | null) {
  if (el !== null) {
    previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    el.querySelector<HTMLElement>('.paste-confirm-dialog__cancel')?.focus()
  } else if (previouslyFocused !== null) {
    const target = previouslyFocused
    previouslyFocused = null
    if (target.isConnected) {
      target.focus()
    }
  }
}

/** Tab-trap inside the dialog. */
function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
  const focusable = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')
  )
  if (focusable.length === 0) {
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  } else if (!focusable.includes(active as HTMLElement)) {
    e.preventDefault()
    first.focus()
  }
}

interface IPasteConfirmDialogProps {
  readonly text: string
  readonly onConfirm: (text: string) => void
  readonly onCancel: () => void
}

/**
 * Confirmation dialog shown when the user pastes multi-line or long text into
 * the terminal. Displays a line count, a preview of the first 6 lines, and
 * Paste/Cancel buttons.
 */
export function PasteConfirmDialog(props: IPasteConfirmDialogProps) {
  const { text, onConfirm, onCancel } = props
  const lines = text.split('\n')
  const lineCount = lines.length
  const previewLines = lines.slice(0, MAX_PREVIEW_LINES)
  const extraCount = lineCount - MAX_PREVIEW_LINES

  return (
    // The dialog container handles Escape and the Tab trap for its contents.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="paste-confirm-dialog"
      role="dialog"
      aria-modal={true}
      aria-labelledby={TITLE_ID}
      ref={onDialogRef}
      // eslint-disable-next-line react/jsx-no-bind
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        } else if (e.key === 'Tab') {
          trapTab(e)
        }
      }}
    >
      <div className="paste-confirm-dialog__content">
        <h3 className="paste-confirm-dialog__title" id={TITLE_ID}>
          {`Paste ${lineCount} lines into terminal?`}
        </h3>
        <pre className="paste-confirm-dialog__preview">
          {previewLines.join('\n')}
        </pre>
        {extraCount > 0 && (
          <p className="paste-confirm-dialog__more">
            {`…and ${extraCount} more`}
          </p>
        )}
        <div className="paste-confirm-dialog__actions">
          <button
            type="button"
            className="paste-confirm-dialog__cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="paste-confirm-dialog__confirm"
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => onConfirm(text)}
          >
            Paste anyway
          </button>
        </div>
      </div>
    </div>
  )
}
