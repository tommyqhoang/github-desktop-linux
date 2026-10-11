import { matchMentionableUsers } from '../../src/lib/stores/github-user-store'
import { IMentionableUser } from '../../src/lib/databases/github-user-database'

const user = (login: string, name: string | null) =>
  ({
    login,
    name,
    email: `${login}@example.com`,
    avatarURL: '',
  }) as unknown as IMentionableUser

describe('matchMentionableUsers', () => {
  const users = [
    user('zed', null),
    user('alice', 'Alice Smith'),
    user('bob', null),
  ]

  it('does not match the literal text "null" for users without a name', () => {
    expect(matchMentionableUsers(users, 'null')).toEqual([])
  })

  it('ranks earlier matches first, then by login', () => {
    const hits = matchMentionableUsers(
      [user('xalice', null), user('alice', null), user('alicia', null)],
      'ali'
    )
    expect(hits.map(h => h.login)).toEqual(['alice', 'alicia', 'xalice'])
  })

  it('matches on real name and respects maxHits', () => {
    expect(matchMentionableUsers(users, 'smith').map(h => h.login)).toEqual([
      'alice',
    ])
    expect(matchMentionableUsers(users, '', 2)).toHaveLength(2)
  })
})
