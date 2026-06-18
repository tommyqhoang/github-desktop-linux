import { getBlame, parseBlamePorcelain } from '../../../src/lib/git/blame'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'

describe('git/blame', () => {
  describe('parseBlamePorcelain', () => {
    it('parses a single line attributed to one commit', () => {
      const output = [
        '1234567890123456789012345678901234567890 1 1 1',
        'author Jane Doe',
        'author-mail <jane@example.com>',
        'author-time 1600000000',
        'author-tz +0000',
        'committer Jane Doe',
        'committer-mail <jane@example.com>',
        'committer-time 1600000000',
        'committer-tz +0000',
        'summary Initial commit',
        'filename hello.txt',
        '\thello world',
      ].join('\n')

      const blame = parseBlamePorcelain(output)

      expect(blame).toHaveLength(1)
      expect(blame[0]).toEqual({
        sha: '1234567890123456789012345678901234567890',
        author: 'Jane Doe',
        authorMail: 'jane@example.com',
        authorTime: 1600000000,
        summary: 'Initial commit',
        previousSha: null,
        lineNumber: 1,
        content: 'hello world',
      })
    })

    it('reuses cached commit info for lines that repeat a commit', () => {
      const output = [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 2',
        'author Jane Doe',
        'author-mail <jane@example.com>',
        'author-time 1600000000',
        'author-tz +0000',
        'summary First',
        'filename hello.txt',
        '\tline one',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2 2',
        '\tline two',
      ].join('\n')

      const blame = parseBlamePorcelain(output)

      expect(blame).toHaveLength(2)
      expect(blame[0].lineNumber).toBe(1)
      expect(blame[0].content).toBe('line one')
      expect(blame[1].lineNumber).toBe(2)
      expect(blame[1].content).toBe('line two')
      // Second line repeats the commit; metadata comes from the cache.
      expect(blame[1].sha).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      expect(blame[1].author).toBe('Jane Doe')
      expect(blame[1].summary).toBe('First')
    })

    it('captures the previous commit sha when present', () => {
      const output = [
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3 3 1',
        'author Bob',
        'author-mail <bob@example.com>',
        'author-time 1610000000',
        'author-tz +0000',
        'summary Tweak',
        'previous cccccccccccccccccccccccccccccccccccccccc hello.txt',
        'filename hello.txt',
        '\tchanged line',
      ].join('\n')

      const blame = parseBlamePorcelain(output)

      expect(blame).toHaveLength(1)
      expect(blame[0].previousSha).toBe(
        'cccccccccccccccccccccccccccccccccccccccc'
      )
    })

    it('preserves tab characters within line content', () => {
      const output = [
        'dddddddddddddddddddddddddddddddddddddddd 1 1 1',
        'author A',
        'author-mail <a@example.com>',
        'author-time 1',
        'author-tz +0000',
        'summary s',
        'filename f',
        '\tindented\tvalue',
      ].join('\n')

      const blame = parseBlamePorcelain(output)

      expect(blame[0].content).toBe('indented\tvalue')
    })

    it('returns an empty array for empty output', () => {
      expect(parseBlamePorcelain('')).toEqual([])
    })
  })

  describe('getBlame', () => {
    it('attributes each line to the commit that introduced it', async () => {
      const repository = await setupEmptyRepository()

      await makeCommit(repository, {
        entries: [{ path: 'file.txt', contents: 'line one\nline two\n' }],
        commitMessage: 'first',
      })
      await makeCommit(repository, {
        entries: [
          { path: 'file.txt', contents: 'line one\nline two\nline three\n' },
        ],
        commitMessage: 'add third line',
      })

      const blame = await getBlame(repository, 'file.txt')

      expect(blame).toHaveLength(3)
      expect(blame.map(l => l.content)).toEqual([
        'line one',
        'line two',
        'line three',
      ])
      // The first two lines share the original commit; the third is newer.
      expect(blame[0].sha).toBe(blame[1].sha)
      expect(blame[2].sha).not.toBe(blame[0].sha)
      expect(blame[2].summary).toBe('add third line')
      expect(blame[0].author).not.toBe('')
    })
  })
})
