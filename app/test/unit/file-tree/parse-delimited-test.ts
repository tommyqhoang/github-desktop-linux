import {
  parseDelimited,
  getDelimitedKind,
} from '../../../src/lib/file-tree/parse-delimited'

describe('getDelimitedKind', () => {
  it('recognises csv and tsv', () => {
    expect(getDelimitedKind('data.csv')).toEqual({ delimiter: ',' })
    expect(getDelimitedKind('data.TSV')).toEqual({ delimiter: '\t' })
    expect(getDelimitedKind('index.ts')).toBeNull()
  })
})

describe('parseDelimited', () => {
  it('parses simple rows', () => {
    expect(parseDelimited('a,b,c\n1,2,3', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('ignores a single trailing newline', () => {
    expect(parseDelimited('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles \\r\\n line endings', () => {
    expect(parseDelimited('a,b\r\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles quoted fields with commas, quotes, and newlines', () => {
    const text = '"last, first","quote ""x""","line1\nline2"'
    expect(parseDelimited(text, ',')).toEqual([
      ['last, first', 'quote "x"', 'line1\nline2'],
    ])
  })

  it('preserves empty fields', () => {
    expect(parseDelimited('a,,c', ',')).toEqual([['a', '', 'c']])
  })

  it('parses tab-delimited text', () => {
    expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('returns no rows for empty input', () => {
    expect(parseDelimited('', ',')).toEqual([])
  })
})
