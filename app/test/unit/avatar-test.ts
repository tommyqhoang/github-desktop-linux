import { getAvatarUsersForCommit } from '../../src/models/avatar'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

const identity = (name: string, email: string) =>
  new CommitIdentity(name, email, new Date())

describe('getAvatarUsersForCommit', () => {
  it('lists a person once when they are author, co-author and committer', () => {
    const author = identity('Ada', 'ada@example.com')
    const committer = identity('Ada', 'ada@example.com')
    const commit = new Commit(
      'a'.repeat(40),
      'aaaaaaa',
      'summary',
      'body',
      author,
      committer,
      [],
      [
        { token: 'Co-Authored-By', value: 'Ada <ada@example.com>' },
        { token: 'Co-Authored-By', value: 'Bob <bob@example.com>' },
      ],
      []
    )

    const users = getAvatarUsersForCommit(null, commit)

    expect(users.map(u => u.email)).toEqual([
      'ada@example.com',
      'bob@example.com',
    ])
  })
})
