import { isBrowserViewable } from '../../../src/lib/file-tree/open-in-browser'

describe('isBrowserViewable', () => {
  it('matches html and pdf files', () => {
    expect(isBrowserViewable('index.html')).toBe(true)
    expect(isBrowserViewable('page.htm')).toBe(true)
    expect(isBrowserViewable('report.PDF')).toBe(true)
  })

  it('does not match other files', () => {
    expect(isBrowserViewable('index.ts')).toBe(false)
    expect(isBrowserViewable('data.csv')).toBe(false)
    expect(isBrowserViewable('logo.png')).toBe(false)
  })
})
