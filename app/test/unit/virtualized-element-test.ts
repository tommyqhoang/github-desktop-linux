import { getVirtualizedElement } from '../../src/ui/lib/list/virtualized-element'

describe('getVirtualizedElement', () => {
  it('returns the scrolling container of a Grid', () => {
    const element = document.createElement('div')
    expect(getVirtualizedElement({ _scrollingContainer: element })).toBe(
      element
    )
  })

  it('returns the scrolling container of the Grid inside a List', () => {
    const element = document.createElement('div')
    expect(
      getVirtualizedElement({ Grid: { _scrollingContainer: element } })
    ).toBe(element)
  })

  it('returns null when the instance is missing or not mounted', () => {
    expect(getVirtualizedElement(null)).toBeNull()
    expect(getVirtualizedElement(undefined)).toBeNull()
    expect(getVirtualizedElement({})).toBeNull()
    expect(getVirtualizedElement({ Grid: null })).toBeNull()
  })
})
