/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import { createHash } from 'crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  LinuxUpdater,
  LinuxReleasesApiURL,
  selectLinuxRelease,
  ILinuxUpdaterDependencies,
} from '../../src/main-process/linux-updater'

const version = '3.4.9-build.48'
const tag = `release-${version}`
const repositoryURL = 'https://github.com/tommyqhoang/github-desktop-linux'
const packageName = `GitHubDesktop-linux-amd64-${version}.deb`
const payload = Buffer.from('test package bytes')
const digest = createHash('sha256').update(payload).digest('hex')
const asset = (name: string, size: number) => ({
  name,
  size,
  browser_download_url: `${repositoryURL}/releases/download/${tag}/${name}`,
})
const release = () => ({
  tag_name: tag,
  html_url: `${repositoryURL}/releases/tag/${tag}`,
  draft: false,
  prerelease: false,
  assets: [
    asset(packageName, payload.length),
    asset(`${packageName}.sha256`, 64),
  ],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => (resolve = r))
  return { promise, resolve }
}

describe('Linux release selection', () => {
  it('selects only the matching amd64 deb and checksum using build ordering', () => {
    expect(selectLinuxRelease(release(), '3.4.9-linux.47')).toMatchObject({
      version,
      releaseURL: `${repositoryURL}/releases/tag/${tag}`,
      package: asset(packageName, payload.length),
    })
    expect(selectLinuxRelease(release(), version)).toBeNull()
    expect(selectLinuxRelease(release(), '3.5.0-build.1')).toBeNull()
  })

  it.each([
    { draft: true },
    { prerelease: true },
    { tag_name: ` ${tag}` },
    { tag_name: 'release-3.4.9-build.48/../../other' },
    { html_url: 'https://evil.example/release' },
    { assets: [] },
    { assets: [asset(packageName.replace('amd64', 'arm64'), 20)] },
    { assets: [asset(packageName, 0), asset(`${packageName}.sha256`, 64)] },
    {
      assets: [asset(packageName, 2 ** 31), asset(`${packageName}.sha256`, 64)],
    },
    {
      assets: [
        asset(packageName, 10),
        asset(packageName, 10),
        asset(`${packageName}.sha256`, 64),
      ],
    },
  ])('rejects invalid release metadata: %j', changes => {
    expect(() =>
      selectLinuxRelease({ ...release(), ...changes }, '3.4.9-build.47')
    ).toThrow()
  })

  it.each([
    'https://evil.example/update.deb',
    `${repositoryURL}/releases/download/other/${packageName}`,
    `${repositoryURL}/releases/download/${tag}/${packageName}?extra=1`,
    `${repositoryURL}/releases/download/${tag}/${packageName}#extra`,
    `${repositoryURL}/releases/download/${tag}/other.deb`,
  ])('rejects an asset URL not exactly bound to the release: %s', url => {
    const metadata = release()
    metadata.assets[0].browser_download_url = url
    expect(() => selectLinuxRelease(metadata, '3.4.9-build.47')).toThrow()
  })
})

describe('Linux updater', () => {
  let directory: string
  let deps: ILinuxUpdaterDependencies
  let fetcher: jest.Mock
  let execute: jest.Mock
  let relaunch: jest.Mock
  let quit: jest.Mock

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'linux-updater-test-'))
    fetcher = jest.fn(async (url: string) => {
      if (url === LinuxReleasesApiURL) {
        return new Response(JSON.stringify(release()))
      }
      if (url.endsWith('.sha256')) {
        return new Response(digest)
      }
      return new Response(payload)
    })
    execute = jest.fn(async (command: string, args: ReadonlyArray<string>) => {
      if (args[0] === '-S') {
        return 'github-desktop: /usr/lib/github-desktop/github-desktop\n'
      }
      if (args[0] === '-W') {
        return 'install ok installed\tamd64\n'
      }
      return ''
    })
    relaunch = jest.fn()
    quit = jest.fn()
    deps = {
      platform: 'linux',
      arch: 'x64',
      packaged: true,
      currentVersion: '3.4.9-build.47',
      executablePath: '/usr/lib/github-desktop/github-desktop',
      userDataPath: directory,
      realpath: async p => p,
      fetch: fetcher,
      execute,
      relaunch,
      quit,
      onStateChanged: jest.fn(),
    }
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it.each([
    { platform: 'darwin' },
    { arch: 'arm64' },
    { packaged: false },
    { currentVersion: '3.4.9' },
    { executablePath: '/tmp/github-desktop' },
  ])('does not update unsupported installations: %j', changes => {
    const updater = new LinuxUpdater({ ...deps, ...changes })
    return updater.check(true).then(state => {
      expect(state.status).toBe('unsupported')
      expect(fetcher).not.toHaveBeenCalled()
    })
  })

  it('requires dpkg ownership and installed amd64 package status', async () => {
    execute.mockResolvedValue(
      'other-package: /usr/lib/github-desktop/github-desktop'
    )
    const updater = new LinuxUpdater(deps)
    expect((await updater.check(true)).status).toBe('unsupported')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports HTTP failures as errors, not up-to-date', async () => {
    fetcher.mockResolvedValue(new Response('rate limited', { status: 403 }))
    expect(await new LinuxUpdater(deps).check(false)).toMatchObject({
      status: 'error',
      error: expect.stringContaining('403'),
    })
  })

  it('checks without downloading and reports a genuine up-to-date release', async () => {
    const updater = new LinuxUpdater(deps)
    expect((await updater.check(false)).status).toBe('available')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(
      (
        await new LinuxUpdater({ ...deps, currentVersion: version }).check(
          false
        )
      ).status
    ).toBe('up-to-date')
  })

  it('streams to private staging, verifies SHA256, and preserves ready on recheck', async () => {
    const updater = new LinuxUpdater(deps)
    expect((await updater.check(true)).status).toBe('ready')
    const [folder] = await readdir(directory)
    const staged = join(directory, folder, packageName)
    expect(await readFile(staged)).toEqual(payload)
    expect((await stat(join(directory, folder))).mode & 0o777).toBe(0o700)
    expect((await stat(staged)).mode & 0o777).toBe(0o600)
    expect((await updater.check(true)).status).toBe('ready')
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(relaunch).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })

  it('removes staging after a checksum mismatch', async () => {
    fetcher.mockImplementation(
      async (url: string) =>
        new Response(
          url === LinuxReleasesApiURL
            ? JSON.stringify(release())
            : url.endsWith('.sha256')
              ? '0'.repeat(64)
              : payload
        )
    )
    const state = await new LinuxUpdater(deps).check(true)
    expect(state.status).toBe('error')
    expect(state.error).toMatch(/SHA256/)
    expect(await readdir(directory)).toEqual([])
  })

  it('rejects an invalid checksum before downloading the package', async () => {
    fetcher.mockImplementation(
      async (url: string) =>
        new Response(
          url === LinuxReleasesApiURL
            ? JSON.stringify(release())
            : 'not a checksum'
        )
    )
    expect((await new LinuxUpdater(deps).check(true)).status).toBe('error')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(await readdir(directory)).toEqual([])
  })

  it('rejects an oversized or truncated package and removes partial files', async () => {
    fetcher.mockImplementation(
      async (url: string) =>
        new Response(
          url === LinuxReleasesApiURL
            ? JSON.stringify(release())
            : url.endsWith('.sha256')
              ? digest
              : Buffer.concat([payload, payload])
        )
    )
    expect((await new LinuxUpdater(deps).check(true)).status).toBe('error')
    expect(await readdir(directory)).toEqual([])
  })

  it('reverifies the staged file before requesting privilege', async () => {
    const updater = new LinuxUpdater(deps)
    await updater.check(true)
    const [folder] = await readdir(directory)
    await writeFile(
      join(directory, folder, packageName),
      Buffer.alloc(payload.length)
    )
    expect((await updater.install()).status).toBe('error')
    expect(
      execute.mock.calls.some(([command]) => command === '/usr/bin/pkexec')
    ).toBe(false)
    expect(quit).not.toHaveBeenCalled()
    expect(await readdir(directory)).toEqual([])
  })

  it.each([126, 127, 1])(
    'keeps the app running on installer failure or cancellation (%s)',
    async code => {
      const updater = new LinuxUpdater(deps)
      await updater.check(true)
      execute.mockRejectedValueOnce(
        new Error(`Installer exited with code ${code}`)
      )
      expect((await updater.install()).status).toBe('error')
      expect(quit).not.toHaveBeenCalled()
      expect(relaunch).not.toHaveBeenCalled()
    }
  )

  it('installs only its verified file and relaunches only after success', async () => {
    const updater = new LinuxUpdater(deps)
    await updater.check(true)
    const installer = deferred<string>()
    execute.mockReturnValueOnce(installer.promise)
    const installing = updater.install()
    // Wait for real asynchronous disk verification to reach the fake installer.
    while (
      !execute.mock.calls.some(([command]) => command === '/usr/bin/pkexec')
    ) {
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect(quit).not.toHaveBeenCalled()
    expect(relaunch).not.toHaveBeenCalled()
    expect((await updater.check(true)).status).toBe('installing')
    expect((await updater.download()).status).toBe('installing')
    expect((await updater.install()).status).toBe('installing')
    const [folder] = await readdir(directory)
    expect(execute).toHaveBeenLastCalledWith('/usr/bin/pkexec', [
      '/usr/bin/dpkg',
      '-i',
      join(directory, folder, packageName),
    ])
    installer.resolve('')
    await installing
    expect(relaunch).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(relaunch.mock.invocationCallOrder[0]).toBeLessThan(
      quit.mock.invocationCallOrder[0]
    )
  })

  it('does not overlap checks, downloads, or installs', async () => {
    const response = deferred<Response>()
    fetcher.mockReturnValueOnce(response.promise)
    const updater = new LinuxUpdater(deps)
    const checking = updater.check(false)
    expect((await updater.check(true)).status).toBe('checking')
    expect((await updater.download()).status).toBe('checking')
    expect((await updater.install()).status).toBe('checking')
    response.resolve(new Response(JSON.stringify(release())))
    expect((await checking).status).toBe('available')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('bounds metadata without buffering the entire response', async () => {
    fetcher.mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1)))
    expect((await new LinuxUpdater(deps).check(false)).status).toBe('error')
  })

  it('rejects asset redirects to untrusted hosts', async () => {
    fetcher.mockImplementation(async (url: string) =>
      url === LinuxReleasesApiURL
        ? new Response(JSON.stringify(release()))
        : new Response(null, {
            status: 302,
            headers: { location: 'https://evil.example/package' },
          })
    )
    expect((await new LinuxUpdater(deps).check(true)).status).toBe('error')
    expect(
      fetcher.mock.calls.some(([url]) => url.includes('evil.example'))
    ).toBe(false)
  })

  it('aborts timed-out requests and leaves an actionable error', async () => {
    fetcher.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new Error('Request timed out'))
          )
        })
    )
    expect(
      (await new LinuxUpdater({ ...deps, requestTimeoutMs: 10 }).check(false))
        .status
    ).toBe('error')
  })
})
