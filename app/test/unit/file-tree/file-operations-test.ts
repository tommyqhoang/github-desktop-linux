import { mkdtemp, writeFile, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Repository } from '../../../src/models/repository'
import {
  getParentPath,
  renamedRelativePath,
  isValidEntryName,
  renameEntry,
} from '../../../src/lib/file-tree/file-operations'

async function makeTempRepo(): Promise<Repository> {
  const dir = await mkdtemp(join(tmpdir(), 'file-tree-test-'))
  return new Repository(dir, 1, null, false)
}

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

describe('renameEntry', () => {
  it('renames a file and returns the new relative path', async () => {
    const repo = await makeTempRepo()
    await writeFile(join(repo.path, 'a.ts'), 'x')

    const newPath = await renameEntry(repo, 'a.ts', 'b.ts')

    expect(newPath).toBe('b.ts')
    await expect(access(join(repo.path, 'b.ts'))).resolves.toBeUndefined()
  })

  it('refuses to overwrite an existing target', async () => {
    const repo = await makeTempRepo()
    await writeFile(join(repo.path, 'a.ts'), 'x')
    await writeFile(join(repo.path, 'b.ts'), 'keep me')

    await expect(renameEntry(repo, 'a.ts', 'b.ts')).rejects.toThrow(
      /already exists/
    )
    // The original is untouched.
    await expect(access(join(repo.path, 'a.ts'))).resolves.toBeUndefined()
  })

  it('rejects an invalid name without renaming', async () => {
    const repo = await makeTempRepo()
    await writeFile(join(repo.path, 'a.ts'), 'x')

    await expect(renameEntry(repo, 'a.ts', 'sub/b.ts')).rejects.toThrow(
      /Invalid/
    )
  })
})
