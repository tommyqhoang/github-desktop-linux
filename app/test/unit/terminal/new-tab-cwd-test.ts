import { resolveNewTabCwd } from '../../../src/lib/terminal/new-tab-cwd'

const repoRoot = '/work/repo'
const yes = async () => true
const no = async () => false

describe('terminal/new-tab-cwd', () => {
  describe('resolveNewTabCwd', () => {
    it('inherits the live cwd when it is an existing directory', async () => {
      expect(await resolveNewTabCwd('/work/repo/src', repoRoot, yes)).toBe(
        '/work/repo/src'
      )
    })

    it('allows a live cwd outside the repository', async () => {
      expect(await resolveNewTabCwd('/tmp/scratch', repoRoot, yes)).toBe(
        '/tmp/scratch'
      )
    })

    it('falls back to the repo root when there is no live cwd', async () => {
      expect(await resolveNewTabCwd(null, repoRoot, yes)).toBe(repoRoot)
      expect(await resolveNewTabCwd(undefined, repoRoot, yes)).toBe(repoRoot)
      expect(await resolveNewTabCwd('', repoRoot, yes)).toBe(repoRoot)
    })

    it('falls back when the live cwd is not absolute', async () => {
      expect(await resolveNewTabCwd('src/lib', repoRoot, yes)).toBe(repoRoot)
    })

    it('falls back when the live cwd no longer exists', async () => {
      expect(await resolveNewTabCwd('/work/repo/gone', repoRoot, no)).toBe(
        repoRoot
      )
    })

    it('does not probe the filesystem when there is nothing to check', async () => {
      const probe = jest.fn(yes)
      await resolveNewTabCwd(null, repoRoot, probe)
      await resolveNewTabCwd('relative', repoRoot, probe)
      expect(probe).not.toHaveBeenCalled()
    })

    it('treats a real directory as valid and a real file as invalid', async () => {
      // Exercises the default fs-backed probe.
      expect(await resolveNewTabCwd(__dirname, repoRoot)).toBe(__dirname)
      expect(await resolveNewTabCwd(__filename, repoRoot)).toBe(repoRoot)
    })
  })
})
