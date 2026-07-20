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
})
