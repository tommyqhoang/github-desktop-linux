import {
  getBranchCommitSummaries,
  getBranchDiffText,
  getCommitDiffText,
  getWorkingDiffText,
  AI_DIFF_EXCLUDED_PATHS,
} from '../../../src/lib/ai/git-context'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { getCommits } from '../../../src/lib/git'
import { writeFile, outputFile } from 'fs-extra'
import { exec } from 'dugite'
import { Repository } from '../../../src/models/repository'
import * as Path from 'path'

describe('ai/git-context', () => {
  it('getWorkingDiffText returns the uncommitted diff against HEAD', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'one\n' }],
      commitMessage: 'init',
    })
    await writeFile(Path.join(repo.path, 'file.txt'), 'one\ntwo\n')

    const diff = await getWorkingDiffText(repo)
    expect(diff).toContain('+two')
    expect(diff).toContain('file.txt')
  })

  it('getWorkingDiffText returns empty string for a clean tree', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\n' }],
      commitMessage: 'init',
    })
    expect((await getWorkingDiffText(repo)).trim()).toBe('')
  })

  it('getCommitDiffText returns the diff for a commit', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\n' }],
      commitMessage: 'first',
    })
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\nb\n' }],
      commitMessage: 'second',
    })
    const [head] = await getCommits(repo, 'HEAD', 1)
    const diff = await getCommitDiffText(repo, head.sha)
    expect(diff).toContain('+b')
  })

  it('getBranchCommitSummaries lists commit summaries above a base', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'base.txt', contents: 'b\n' }],
      commitMessage: 'base commit',
    })
    const [base] = await getCommits(repo, 'HEAD', 1)
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\n' }],
      commitMessage: 'feature one',
    })
    await makeCommit(repo, {
      entries: [{ path: 'b.txt', contents: 'b\n' }],
      commitMessage: 'feature two',
    })

    const summaries = await getBranchCommitSummaries(repo, base.sha)
    expect(summaries).toContain('feature one')
    expect(summaries).toContain('feature two')
    expect(summaries).not.toContain('base commit')
  })

  /**
   * Like `makeCommit`, but creates parent directories first (the shared helper
   * writes files with a plain `writeFile`, which fails for nested paths).
   */
  async function commitFiles(
    repo: Repository,
    entries: ReadonlyArray<{ path: string; contents: string }>,
    commitMessage: string
  ) {
    for (const entry of entries) {
      await outputFile(Path.join(repo.path, entry.path), entry.contents)
      await exec(['add', entry.path], repo.path)
    }
    await exec(['commit', '-m', commitMessage], repo.path)
  }

  describe('files kept out of the prompt', () => {
    const SECRET = 'AWS_SECRET_ACCESS_KEY=hunter2-do-not-leak'

    /** A repo with a tracked source file, secrets, and lockfiles, all changed. */
    async function repoWithSensitiveChanges() {
      const repo = await setupEmptyRepository()
      await commitFiles(
        repo,
        [
          { path: 'src/app.ts', contents: 'export const a = 1\n' },
          { path: '.env', contents: 'TOKEN=old\n' },
          { path: 'config/.env.production', contents: 'TOKEN=old\n' },
          { path: 'certs/server.pem', contents: 'old-pem\n' },
          { path: 'keys/deploy.key', contents: 'old-key\n' },
          { path: 'yarn.lock', contents: '# lock v1\n' },
          { path: 'web/package-lock.json', contents: '{}\n' },
          { path: 'go.sum', contents: 'a v1 h1:x\n' },
        ],
        'init'
      )
      return repo
    }

    async function changeEverything(repo: { path: string }) {
      const edits: Array<[string, string]> = [
        ['src/app.ts', 'export const a = 2 // REAL-CHANGE\n'],
        ['.env', `${SECRET}\n`],
        ['config/.env.production', `${SECRET}\n`],
        ['certs/server.pem', `${SECRET}\n`],
        ['keys/deploy.key', `${SECRET}\n`],
        ['yarn.lock', `${SECRET}\n`],
        ['web/package-lock.json', `${SECRET}\n`],
        ['go.sum', `${SECRET}\n`],
      ]
      for (const [path, contents] of edits) {
        await outputFile(Path.join(repo.path, path), contents)
      }
    }

    it('keeps secrets and lockfiles out of the working diff but keeps real code', async () => {
      const repo = await repoWithSensitiveChanges()
      await changeEverything(repo)

      const diff = await getWorkingDiffText(repo)

      expect(diff).toContain('REAL-CHANGE')
      expect(diff).toContain('src/app.ts')
      expect(diff).not.toContain('hunter2')
      expect(diff).not.toMatch(/\.env|server\.pem|deploy\.key|yarn\.lock/)
      expect(diff).not.toMatch(/package-lock\.json|go\.sum/)
    })

    it('returns an empty diff when only excluded files changed', async () => {
      const repo = await repoWithSensitiveChanges()
      await writeFile(Path.join(repo.path, '.env'), `${SECRET}\n`)
      await writeFile(Path.join(repo.path, 'yarn.lock'), `${SECRET}\n`)

      expect((await getWorkingDiffText(repo)).trim()).toBe('')
    })

    it('applies the same filter to a single commit', async () => {
      const repo = await repoWithSensitiveChanges()
      await commitFiles(
        repo,
        [
          {
            path: 'src/app.ts',
            contents: 'export const a = 2 // REAL-CHANGE\n',
          },
          { path: '.env', contents: `${SECRET}\n` },
          { path: 'yarn.lock', contents: `${SECRET}\n` },
        ],
        'change'
      )
      const [head] = await getCommits(repo, 'HEAD', 1)

      const diff = await getCommitDiffText(repo, head.sha)

      expect(diff).toContain('REAL-CHANGE')
      expect(diff).toContain('change')
      expect(diff).not.toContain('hunter2')
    })

    it('applies the same filter to a branch diff', async () => {
      const repo = await repoWithSensitiveChanges()
      const [base] = await getCommits(repo, 'HEAD', 1)
      await commitFiles(
        repo,
        [
          {
            path: 'src/app.ts',
            contents: 'export const a = 2 // REAL-CHANGE\n',
          },
          { path: 'certs/server.pem', contents: `${SECRET}\n` },
          { path: 'web/package-lock.json', contents: `${SECRET}\n` },
        ],
        'feature'
      )

      const diff = await getBranchDiffText(repo, base.sha)

      expect(diff).toContain('REAL-CHANGE')
      expect(diff).not.toContain('hunter2')
    })

    it('does not exclude look-alike names that are real source', async () => {
      const repo = await setupEmptyRepository()
      await commitFiles(
        repo,
        [
          { path: 'src/environment.ts', contents: 'a\n' },
          { path: 'src/keyboard.ts', contents: 'a\n' },
          { path: 'docs/locking.md', contents: 'a\n' },
        ],
        'init'
      )
      for (const f of [
        'src/environment.ts',
        'src/keyboard.ts',
        'docs/locking.md',
      ]) {
        await writeFile(Path.join(repo.path, f), 'changed\n')
      }

      const diff = await getWorkingDiffText(repo)

      expect(diff).toContain('src/environment.ts')
      expect(diff).toContain('src/keyboard.ts')
      expect(diff).toContain('docs/locking.md')
    })

    it('lists the patterns it excludes', () => {
      expect(AI_DIFF_EXCLUDED_PATHS).toEqual(
        expect.arrayContaining(['**/.env', '**/*.pem', '**/yarn.lock'])
      )
    })
  })
})
