import {
  getParentPath,
  renamedRelativePath,
  isValidEntryName,
} from '../../../src/lib/file-tree/file-operations'

describe('file-operations path helpers', () => {
  it('getParentPath returns the POSIX parent, or "" at the root', () => {
    expect(getParentPath('a.ts')).toBe('')
    expect(getParentPath('src/a.ts')).toBe('src')
    expect(getParentPath('src/nested/a.ts')).toBe('src/nested')
  })

  it('renamedRelativePath keeps the entry in its directory', () => {
    expect(renamedRelativePath('a.ts', 'b.ts')).toBe('b.ts')
    expect(renamedRelativePath('src/a.ts', 'b.ts')).toBe('src/b.ts')
  })

  it('isValidEntryName rejects paths and traversal', () => {
    expect(isValidEntryName('b.ts')).toBe(true)
    expect(isValidEntryName('  ')).toBe(false)
    expect(isValidEntryName('.')).toBe(false)
    expect(isValidEntryName('..')).toBe(false)
    expect(isValidEntryName('a/b.ts')).toBe(false)
    expect(isValidEntryName('a\\b.ts')).toBe(false)
  })
})
