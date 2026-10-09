import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SuggestedActionGroup } from '../../../src/ui/suggested-actions'

describe('SuggestedActionGroup', () => {
  it('does not throw in replace mode when there is no child', () => {
    expect(() =>
      renderToStaticMarkup(
        <SuggestedActionGroup type="primary" transitions="replace">
          {null}
        </SuggestedActionGroup>
      )
    ).not.toThrow()
  })

  it('renders the single child in replace mode', () => {
    const html = renderToStaticMarkup(
      <SuggestedActionGroup transitions="replace">
        <span>hello</span>
      </SuggestedActionGroup>
    )
    expect(html).toContain('hello')
  })
})
