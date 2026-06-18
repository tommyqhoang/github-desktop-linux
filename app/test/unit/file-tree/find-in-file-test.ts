import { findMatches } from '../../../src/lib/file-tree/find-in-file'

describe('findMatches', () => {
  const lines = ['const foo = 1', 'const bar = foo', 'FOO bar foo']

  it('returns no matches for an empty query', () => {
    expect(findMatches(lines, '')).toEqual([])
  })

  it('finds a single match with its line and column', () => {
    const matches = findMatches(lines, 'bar')
    // 'bar' appears on line 1 (col 6) and line 2 (col 4).
    expect(matches).toContainEqual({ line: 1, column: 6 })
    expect(matches).toContainEqual({ line: 2, column: 4 })
  })

  it('is case-insensitive by default', () => {
    const matches = findMatches(lines, 'foo')
    // line 0 col 6, line 1 col 12, line 2 col 0 (FOO), line 2 col 8 (foo)
    expect(matches).toEqual([
      { line: 0, column: 6 },
      { line: 1, column: 12 },
      { line: 2, column: 0 },
      { line: 2, column: 8 },
    ])
  })

  it('respects case sensitivity when requested', () => {
    const matches = findMatches(lines, 'foo', true)
    // Only lowercase 'foo' matches: line 0, line 1, line 2 col 8.
    expect(matches).toEqual([
      { line: 0, column: 6 },
      { line: 1, column: 12 },
      { line: 2, column: 8 },
    ])
  })

  it('finds multiple non-overlapping matches on the same line', () => {
    expect(findMatches(['aaaa'], 'aa')).toEqual([
      { line: 0, column: 0 },
      { line: 0, column: 2 },
    ])
  })

  it('returns matches in document order across lines', () => {
    const matches = findMatches(['x', 'x', 'x'], 'x')
    expect(matches.map(m => m.line)).toEqual([0, 1, 2])
  })
})
