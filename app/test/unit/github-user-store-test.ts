import { mentionableUserFromAPI } from '../../src/lib/stores/github-user-store'

describe('mentionableUserFromAPI', () => {
  const endpoint = 'https://api.github.com'
  const user = {
    id: 123456,
    login: 'octocat',
    name: 'The Octocat',
    email: null,
    avatar_url: 'https://avatars.githubusercontent.com/u/123456',
  }

  it('uses the modern attributable noreply address for a private email', () => {
    expect(mentionableUserFromAPI(user, endpoint).email).toBe(
      '123456+octocat@users.noreply.github.com'
    )
  })

  it('preserves a public profile email', () => {
    expect(
      mentionableUserFromAPI(
        { ...user, email: 'octocat@example.com' },
        endpoint
      ).email
    ).toBe('octocat@example.com')
  })
})
