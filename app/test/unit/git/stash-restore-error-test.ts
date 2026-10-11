import { createStashRestoreError } from '../../../src/lib/git/stash'
import { GitError } from '../../../src/lib/git/core'
import { IGitResult } from '../../../src/lib/git/core'

const result = (stderr: string) =>
  ({ stderr, combinedOutput: stderr, exitCode: 1 }) as IGitResult

describe('createStashRestoreError', () => {
  it('explains overwritten local changes and lists files', () => {
    const err = createStashRestoreError(
      result(
        'error: Your local changes to the following files would be overwritten by merge:\n\ta.txt\n\tdir/b.txt\nPlease commit your changes or stash them before you merge.\n'
      ),
      ['stash', 'pop']
    )
    expect(err).not.toBeInstanceOf(GitError)
    expect(err.message).toContain('Unable to restore the stash')
    expect(err.message).toContain('a.txt')
    expect(err.message).toContain('dir/b.txt')
  })

  it('falls back to a GitError for other failures', () => {
    const err = createStashRestoreError(result('fatal: boom'), ['stash'])
    expect(err).toBeInstanceOf(GitError)
  })
})
