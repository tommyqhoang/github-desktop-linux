import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AIResultDialog } from '../../../src/ui/ai/ai-result-dialog'

function render(props: Partial<React.ComponentProps<typeof AIResultDialog>>) {
  const merged = {
    title: 'AI',
    loading: false,
    error: null,
    result: null,
    renderResult: (r: unknown) => <div className="r">{String(r)}</div>,
    onRegenerate: () => undefined,
    onDismissed: () => undefined,
    ...props,
  } as React.ComponentProps<typeof AIResultDialog>
  return renderToStaticMarkup(React.createElement(AIResultDialog, merged))
}

describe('AIResultDialog', () => {
  it('shows a generating state while loading', () => {
    const html = render({ loading: true })
    expect(html.toLowerCase()).toContain('generating')
  })

  it('shows the error and a Regenerate action on failure', () => {
    const html = render({ error: 'boom' })
    expect(html).toContain('boom')
    expect(html).toContain('Regenerate')
  })

  it('shows a Dismiss button for the error only when onDismissError is given', () => {
    const without = render({ error: 'boom' })
    expect(without).not.toContain('>Dismiss<')
    const withHandler = render({
      error: 'boom',
      onDismissError: () => undefined,
    })
    expect(withHandler).toContain('Dismiss')
  })

  it('renders the result via the render prop with action buttons', () => {
    const html = render({
      result: 'the answer',
      onInsert: () => undefined,
      onCopy: () => undefined,
    })
    expect(html).toContain('the answer')
    expect(html).toContain('Insert')
    expect(html).toContain('Copy')
    expect(html).toContain('Regenerate')
  })

  it('omits the Insert button when no onInsert handler is given', () => {
    const html = render({ result: 'x' })
    expect(html).not.toContain('>Insert<')
  })

  it('uses a custom insert label when provided', () => {
    const html = render({
      result: 'x',
      onInsert: () => undefined,
      insertLabel: 'Apply',
    })
    expect(html).toContain('Apply')
  })

  it('marks the error as an alert and keeps an always-mounted live region', () => {
    const html = render({ error: 'boom' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="polite"')
  })

  it('offers Try again in the empty state once an error was dismissed', () => {
    const html = render({ onRetry: () => undefined })
    expect(html).toContain('Try again')
  })

  it('announces a ready result', () => {
    expect(render({ result: 'x' })).toContain('Result ready')
  })

  it('does not dismiss the dialog when Enter submits the form', () => {
    const onDismissed = jest.fn()
    const dialog = new AIResultDialog({
      title: 't',
      loading: false,
      error: null,
      result: null,
      renderResult: () => <div />,
      onRegenerate: () => undefined,
      onDismissed,
    })
    ;(dialog as any).onSubmit()
    expect(onDismissed).not.toHaveBeenCalled()
  })

  it('shows Copied feedback after copying', () => {
    jest.useFakeTimers()
    const onCopy = jest.fn()
    const dialog = new AIResultDialog({
      title: 't',
      loading: false,
      error: null,
      result: 'x',
      renderResult: () => <div />,
      onRegenerate: () => undefined,
      onDismissed: () => undefined,
      onCopy,
    })
    ;(dialog as any).setState = function (p: any) {
      this.state = { ...this.state, ...p }
    }
    ;(dialog as any).onCopyClick()
    expect(onCopy).toHaveBeenCalled()
    expect((dialog as any).liveMessage()).toBe('Copied to clipboard')
    jest.runAllTimers()
    expect((dialog as any).liveMessage()).toBe('Result ready')
    jest.useRealTimers()
  })
})
