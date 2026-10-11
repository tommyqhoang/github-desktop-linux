import { splitBuffer } from '../../src/lib/split-buffer'

describe('splitBuffer', () => {
  const split = (s: string, d: string) =>
    splitBuffer(Buffer.from(s), d).map(b => b.toString())

  it('splits on a delimiter', () => {
    expect(split('a\0b\0c', '\0')).toEqual(['a', 'b', 'c'])
  })

  it('keeps empty segments between delimiters but drops a trailing one', () => {
    expect(split('a\0\0b\0', '\0')).toEqual(['a', '', 'b'])
  })

  it('returns the whole buffer when the delimiter is absent', () => {
    expect(split('abc', '\0')).toEqual(['abc'])
  })

  it('returns nothing for an empty buffer', () => {
    expect(split('', '\0')).toEqual([])
  })
})
