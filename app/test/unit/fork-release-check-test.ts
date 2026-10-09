import {
  checkForForkUpdate,
  findNewerRelease,
  parseBuildId,
} from '../../src/lib/fork-release-check'

const rel = (tag: string) => ({ tag_name: tag, html_url: `https://x/${tag}` })

describe('fork release check', () => {
  it('parses build ids with either suffix', () => {
    expect(parseBuildId('3.4.9-build.46')).toEqual({ base: [3, 4, 9], run: 46 })
    expect(parseBuildId('release-3.4.9-linux.43')).toEqual({
      base: [3, 4, 9],
      run: 43,
    })
    expect(parseBuildId('3.4.9')).toBeNull()
    expect(parseBuildId('nightly')).toBeNull()
  })

  it('finds the newest strictly-newer release across suffixes', () => {
    const found = findNewerRelease(
      [
        rel('release-3.4.9-linux.46'),
        rel('release-3.4.9-build.48'),
        rel('release-3.4.9-build.47'),
        rel('junk'),
      ],
      '3.4.9-linux.46'
    )
    expect(found?.tag).toBe('release-3.4.9-build.48')
  })

  it('prefers a higher base version over a higher run number', () => {
    const found = findNewerRelease(
      [rel('release-3.4.9-build.99'), rel('release-3.5.0-build.1')],
      '3.4.9-build.10'
    )
    expect(found?.tag).toBe('release-3.5.0-build.1')
  })

  it('returns null when up to date, or for dev builds', () => {
    expect(
      findNewerRelease([rel('release-3.4.9-build.46')], '3.4.9-build.46')
    ).toBeNull()
    expect(
      findNewerRelease([rel('release-3.4.9-build.46')], '3.4.9')
    ).toBeNull()
  })

  it('swallows network failures and bad payloads', async () => {
    const boom = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await checkForForkUpdate('3.4.9-build.1', boom)).toBeNull()
    const notOk = (async () => ({ ok: false })) as unknown as typeof fetch
    expect(await checkForForkUpdate('3.4.9-build.1', notOk)).toBeNull()
    const obj = (async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch
    expect(await checkForForkUpdate('3.4.9-build.1', obj)).toBeNull()
  })

  it('returns the newer release from a successful response', async () => {
    const ok = (async () => ({
      ok: true,
      json: async () => [rel('release-3.4.9-build.5')],
    })) as unknown as typeof fetch
    expect((await checkForForkUpdate('3.4.9-build.1', ok))?.url).toBe(
      'https://x/release-3.4.9-build.5'
    )
  })
})
