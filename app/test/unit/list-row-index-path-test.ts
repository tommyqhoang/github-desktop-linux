import { rowListIncludesIndexPath } from '../../src/ui/lib/list/list-row-index-path'

describe('rowListIncludesIndexPath', () => {
  const list = [
    { section: 0, row: 1 },
    { section: 2, row: 0 },
  ]

  it('matches an equal index path that is a different object', () => {
    expect(rowListIncludesIndexPath(list, { section: 2, row: 0 })).toBe(true)
  })

  it('does not match other index paths', () => {
    expect(rowListIncludesIndexPath(list, { section: 0, row: 0 })).toBe(false)
    expect(rowListIncludesIndexPath([], { section: 0, row: 0 })).toBe(false)
  })
})
