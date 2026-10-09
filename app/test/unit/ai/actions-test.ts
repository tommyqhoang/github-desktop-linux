import {
  runReview,
  runSummary,
  runPRDescription,
  runConflictAssist,
} from '../../../src/lib/ai/actions'
import { IAIClient } from '../../../src/lib/ai/client'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'
import { getCommits } from '../../../src/lib/git'
import { writeFile } from 'fs-extra'
import * as Path from 'path'

/** A client that records the prompt it received and returns a canned reply. */
function fakeClient(reply: string): { client: IAIClient; prompts: string[] } {
  const prompts: string[] = []
  const client: IAIClient = {
    async complete(messages) {
      prompts.push(messages.map(m => m.content).join('\n'))
      return reply
    },
  }
  return { client, prompts }
}

describe('ai/actions', () => {
  it('runReview feeds the working diff to the client and parses findings', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'one\n' }],
      commitMessage: 'init',
    })
    await writeFile(Path.join(repo.path, 'a.txt'), 'one\nbug\n')

    const { client, prompts } = fakeClient(
      '[{"severity":"high","title":"Possible bug","detail":"check this"}]'
    )
    const findings = await runReview(repo, client)

    expect(prompts[0]).toContain('+bug')
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe('Possible bug')
  })

  it('runSummary throws when there are no working changes', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'a\n' }],
      commitMessage: 'init',
    })
    const { client } = fakeClient('summary')
    await expect(runSummary(repo, { kind: 'changes' }, client)).rejects.toThrow(
      /no changes/i
    )
  })

  it('runPRDescription parses the model JSON into title + body', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'base.txt', contents: 'b\n' }],
      commitMessage: 'base',
    })
    const [base] = await getCommits(repo, 'HEAD', 1)
    await makeCommit(repo, {
      entries: [{ path: 'f.txt', contents: 'feature\n' }],
      commitMessage: 'add feature',
    })

    const { client, prompts } = fakeClient(
      '{"title":"Add feature","body":"Adds f.txt"}'
    )
    const result = await runPRDescription(repo, base.sha, client)

    expect(prompts[0]).toContain('add feature')
    expect(result).toEqual({ title: 'Add feature', body: 'Adds f.txt' })
  })

  it('runPRDescription throws when the branch has no diff against base', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'base.txt', contents: 'b\n' }],
      commitMessage: 'base',
    })
    const [base] = await getCommits(repo, 'HEAD', 1)
    const { client, prompts } = fakeClient('{"title":"x"}')
    await expect(runPRDescription(repo, base.sha, client)).rejects.toThrow(
      /no changes/i
    )
    expect(prompts).toHaveLength(0)
  })

  it('runReview includes brand-new untracked files', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'one\n' }],
      commitMessage: 'init',
    })
    await writeFile(Path.join(repo.path, 'brand-new.ts'), 'const fresh = 1\n')
    const { client, prompts } = fakeClient('[]')
    await runReview(repo, client)
    expect(prompts[0]).toContain('brand-new.ts')
    expect(prompts[0]).toContain('+const fresh = 1')
  })

  it('runConflictAssist refuses secret and lockfile paths without sending them', async () => {
    const repo = await setupEmptyRepository()
    const conflict = '<<<<<<< HEAD\nA=1\n=======\nA=2\n>>>>>>> branch\n'
    await writeFile(Path.join(repo.path, '.env'), conflict)
    await writeFile(Path.join(repo.path, 'yarn.lock'), conflict)
    const { client, prompts } = fakeClient('{}')
    await expect(runConflictAssist(repo, '.env', client)).rejects.toThrow(
      /secrets/
    )
    await expect(runConflictAssist(repo, 'yarn.lock', client)).rejects.toThrow(
      /secrets|lockfile/
    )
    expect(prompts).toHaveLength(0)
  })

  it('runConflictAssist refuses paths outside the repository', async () => {
    const repo = await setupEmptyRepository()
    const { client } = fakeClient('{}')
    await expect(
      runConflictAssist(repo, '../outside.txt', client)
    ).rejects.toThrow(/outside the repository/)
  })

  it('passes the abort signal through to the client', async () => {
    const repo = await setupEmptyRepository()
    await makeCommit(repo, {
      entries: [{ path: 'a.txt', contents: 'one\n' }],
      commitMessage: 'init',
    })
    await writeFile(Path.join(repo.path, 'a.txt'), 'two\n')
    const seen: Array<AbortSignal | undefined> = []
    const client: IAIClient = {
      async complete(_m, opts) {
        seen.push(opts?.signal)
        return 'ok'
      },
    }
    const controller = new AbortController()
    await runSummary(repo, { kind: 'changes' }, client, controller.signal)
    expect(seen[0]).toBe(controller.signal)
  })
})
