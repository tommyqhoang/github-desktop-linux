import { execFile, spawn } from 'child_process'
import { createHash } from 'crypto'
import { constants } from 'fs'
import * as Fs from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { findNewerRelease, parseBuildId } from '../lib/fork-release-check'
import { ILinuxUpdateState } from '../lib/linux-update'
import type { handle } from './ipc-main'
import type { IpcMainInvokeEvent } from 'electron'

/** Register through ipc-main.handle, which rejects untrusted WebContents. */
export function registerLinuxUpdaterIPC(
  updater: LinuxUpdater,
  register: typeof handle
): void {
  const validate = (
    event: IpcMainInvokeEvent,
    args: ReadonlyArray<unknown>,
    check = false
  ) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      args.length !== (check ? 1 : 0) ||
      (check && typeof args[0] !== 'boolean')
    ) {
      throw new Error('Invalid Linux updater request')
    }
  }
  register('linux-update-state', async (event, ...args) => {
    validate(event, args)
    return updater.getState()
  })
  register('linux-update-check', async (event, ...args) => {
    validate(event, args, true)
    return updater.check(args[0])
  })
  register('linux-update-download', async (event, ...args) => {
    validate(event, args)
    return updater.download()
  })
  register('linux-update-install', async (event, ...args) => {
    validate(event, args)
    return updater.install()
  })
}

const repositoryURL = 'https://github.com/tommyqhoang/github-desktop-linux'
export const LinuxReleasesApiURL =
  'https://api.github.com/repos/tommyqhoang/github-desktop-linux/releases/latest'
const maxPackageBytes = 1024 * 1024 * 1024
const maxMetadataBytes = 1024 * 1024
const installedExecutable = '/usr/lib/github-desktop/github-desktop'
const unsupportedMessage =
  'Automatic updates require an installed Linux x64 .deb release of GitHub Desktop. AppImage, RPM, other architectures, and development builds are not supported.'

interface IReleaseAsset {
  readonly name: string
  readonly size: number
  readonly browser_download_url: string
}

interface ILinuxRelease {
  readonly version: string
  readonly releaseURL: string
  readonly package: IReleaseAsset
  readonly checksum: IReleaseAsset
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid GitHub release metadata')
  }
  return value as Record<string, unknown>
}

/** Validate the complete asset identity before allowing any network or disk use. */
export function selectLinuxRelease(
  value: unknown,
  currentVersion: string
): ILinuxRelease | null {
  const release = record(value)
  const tag = release.tag_name
  if (
    release.draft !== false ||
    release.prerelease !== false ||
    typeof tag !== 'string' ||
    !/^release-\d+\.\d+\.\d+-(?:build|linux)\.\d+$/.test(tag) ||
    parseBuildId(tag) === null ||
    release.html_url !== `${repositoryURL}/releases/tag/${tag}` ||
    !Array.isArray(release.assets)
  ) {
    throw new Error('Invalid or non-stable GitHub release metadata')
  }
  const version = tag.substring('release-'.length)
  const name = `GitHubDesktop-linux-amd64-${version}.deb`
  const assets = release.assets.map(record)
  const select = (assetName: string, limit: number): IReleaseAsset => {
    const matches = assets.filter(a => a.name === assetName)
    if (matches.length !== 1) {
      throw new Error(`Release must contain exactly one ${assetName}`)
    }
    const asset = matches[0]
    const expectedURL = `${repositoryURL}/releases/download/${tag}/${assetName}`
    if (
      asset.browser_download_url !== expectedURL ||
      typeof asset.size !== 'number' ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      asset.size > limit
    ) {
      throw new Error(`Invalid release asset: ${assetName}`)
    }
    return {
      name: assetName,
      size: asset.size,
      browser_download_url: expectedURL,
    }
  }
  const pkg = select(name, maxPackageBytes)
  const checksum = select(`${name}.sha256`, 1024)
  if (findNewerRelease([release], currentVersion) === null) {
    return null
  }
  return {
    version,
    releaseURL: release.html_url as string,
    package: pkg,
    checksum,
  }
}

/** Main-process-only dependencies; none are accepted from IPC. */
export interface ILinuxUpdaterDependencies {
  readonly platform: string
  readonly arch: string
  readonly packaged: boolean
  readonly currentVersion: string
  readonly executablePath: string
  readonly userDataPath: string
  readonly relaunch: () => void
  readonly quit: () => void
  readonly onStateChanged: (state: ILinuxUpdateState) => void
  readonly fetch?: typeof fetch
  readonly realpath?: (path: string) => Promise<string>
  readonly execute?: (
    command: string,
    args: ReadonlyArray<string>
  ) => Promise<string>
  readonly requestTimeoutMs?: number
}

/** Never use a shell or a renderer-supplied executable, argument, or environment. */
async function execute(
  command: string,
  args: ReadonlyArray<string>
): Promise<string> {
  const env = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8' }
  if (command !== '/usr/bin/pkexec') {
    const result = await promisify(execFile)(command, [...args], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: maxMetadataBytes,
      env,
    })
    return result.stdout
  }
  // Do not time out/kill dpkg halfway through replacing an installed package.
  // Ignoring output avoids an execFile maxBuffer failure killing the installer.
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { env, stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve('')
      } else {
        reject(
          new Error(
            `Installation was cancelled or failed (${signal ?? code}). The app has not been restarted. If dpkg reported missing dependencies, repair them using your system package manager.`
          )
        )
      }
    })
  })
}

/** A serialized, explicit-install updater for the fork's installed Debian build. */
export class LinuxUpdater {
  private state: ILinuxUpdateState = {
    status: 'idle',
    version: null,
    error: null,
    progress: null,
    releaseURL: null,
  }
  private busy = false
  private support: Promise<boolean> | null = null
  private release: ILinuxRelease | null = null
  private staged: { directory: string; path: string; hash: string } | null =
    null
  private readonly fetcher: typeof fetch
  private readonly execute: NonNullable<ILinuxUpdaterDependencies['execute']>

  public constructor(private readonly deps: ILinuxUpdaterDependencies) {
    this.fetcher = deps.fetch ?? fetch
    this.execute = deps.execute ?? execute
    if (
      deps.platform !== 'linux' ||
      deps.arch !== 'x64' ||
      !deps.packaged ||
      parseBuildId(deps.currentVersion) === null ||
      deps.executablePath !== installedExecutable
    ) {
      this.state = {
        ...this.state,
        status: 'unsupported',
        error: unsupportedMessage,
      }
    }
  }

  private update(patch: Partial<ILinuxUpdateState>): ILinuxUpdateState {
    this.state = { ...this.state, ...patch }
    this.deps.onStateChanged({ ...this.state })
    return { ...this.state }
  }

  private async isSupported(): Promise<boolean> {
    if (this.state.status === 'unsupported') {
      return false
    }
    if (this.support === null) {
      this.support = (async () => {
        try {
          const executable = await (this.deps.realpath ?? Fs.realpath)(
            this.deps.executablePath
          )
          if (executable !== installedExecutable) {
            return false
          }
          const owner = await this.execute('/usr/bin/dpkg-query', [
            '-S',
            executable,
          ])
          if (
            owner.trim() !== `github-desktop: ${executable}` &&
            owner.trim() !== `github-desktop:amd64: ${executable}`
          ) {
            return false
          }
          const status = await this.execute('/usr/bin/dpkg-query', [
            '-W',
            '-f=${Status}\t${Architecture}\n',
            'github-desktop',
          ])
          return status.trim() === 'install ok installed\tamd64'
        } catch {
          return false
        }
      })()
    }
    if (await this.support) {
      return true
    }
    this.update({
      status: 'unsupported',
      error: unsupportedMessage,
      progress: null,
    })
    return false
  }

  public async getState(): Promise<ILinuxUpdateState> {
    if (!this.busy) {
      await this.isSupported()
    }
    return { ...this.state }
  }

  /** A repeated check never discards an already verified, ready update. */
  public async check(download: boolean): Promise<ILinuxUpdateState> {
    if (
      this.busy ||
      this.state.status === 'unsupported' ||
      this.state.status === 'installing'
    ) {
      return { ...this.state }
    }
    if (this.staged !== null) {
      return this.update({ status: 'ready', error: null, progress: null })
    }
    return this.run('checking', async () => {
      if (!(await this.isSupported())) {
        return
      }
      this.release = null
      this.update({ version: null, releaseURL: null })
      const text = await this.readText(LinuxReleasesApiURL, maxMetadataBytes)
      this.release = selectLinuxRelease(
        JSON.parse(text),
        this.deps.currentVersion
      )
      if (this.release === null) {
        this.update({ status: 'up-to-date', error: null, progress: null })
        return
      }
      this.update({
        status: 'available',
        version: this.release.version,
        releaseURL: this.release.releaseURL,
      })
      if (download) {
        await this.downloadRelease()
      }
    })
  }

  public async download(): Promise<ILinuxUpdateState> {
    if (
      this.busy ||
      this.state.status === 'unsupported' ||
      this.state.status === 'installing'
    ) {
      return { ...this.state }
    }
    if (this.staged !== null) {
      return this.update({ status: 'ready', error: null, progress: null })
    }
    return this.run('downloading', async () => {
      if (!(await this.isSupported())) {
        return
      }
      await this.downloadRelease()
    })
  }

  public async install(): Promise<ILinuxUpdateState> {
    if (
      this.busy ||
      this.state.status === 'unsupported' ||
      this.state.status === 'installing'
    ) {
      return { ...this.state }
    }
    return this.run('installing', async () => {
      if (!(await this.isSupported())) {
        return
      }
      const staged = this.staged
      if (staged === null || this.release === null) {
        throw new Error('Download and verify an update before installing it.')
      }
      try {
        await this.verifyStaged(staged, this.release.package.size)
      } catch (error) {
        this.staged = null
        await Fs.rm(staged.directory, { recursive: true, force: true })
        throw error
      }
      await this.execute('/usr/bin/pkexec', [
        '/usr/bin/dpkg',
        '-i',
        staged.path,
      ])
      this.deps.relaunch()
      this.deps.quit()
    })
  }

  private async run(
    status: ILinuxUpdateState['status'],
    action: () => Promise<void>
  ): Promise<ILinuxUpdateState> {
    this.busy = true
    this.update({ status, error: null, progress: null })
    try {
      await action()
    } catch (error) {
      this.update({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        progress: null,
      })
    } finally {
      this.busy = false
    }
    return { ...this.state }
  }

  private async downloadRelease(): Promise<void> {
    const release = this.release
    if (release === null) {
      throw new Error('Check for an update before downloading it.')
    }
    this.update({ status: 'downloading', progress: 0, error: null })
    const hash = (
      await this.readText(release.checksum.browser_download_url, 1024)
    ).trim()
    // The fork publishes a raw SHA256 digest, not an arbitrary checksum command.
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      throw new Error('Invalid SHA256 checksum asset')
    }
    await Fs.mkdir(this.deps.userDataPath, { recursive: true })
    const directory = await Fs.mkdtemp(
      join(this.deps.userDataPath, 'linux-update-')
    )
    const path = join(directory, release.package.name)
    try {
      await Fs.chmod(directory, 0o700)
      const file = await Fs.open(path, 'wx', 0o600)
      const sha256 = createHash('sha256')
      let received = 0
      let lastProgress = -1
      try {
        await this.receive(
          release.package.browser_download_url,
          release.package.size,
          async chunk => {
            await file.writeFile(chunk)
            sha256.update(chunk)
            received += chunk.length
            const progress = Math.floor((received * 100) / release.package.size)
            if (progress !== lastProgress) {
              lastProgress = progress
              this.update({ progress })
            }
          },
          10 * 60 * 1000
        )
        if (received !== release.package.size) {
          throw new Error('Incomplete update download')
        }
        if (sha256.digest('hex') !== hash.toLowerCase()) {
          throw new Error('SHA256 verification failed')
        }
        await file.sync()
      } finally {
        await file.close()
      }
      this.staged = { directory, path, hash: hash.toLowerCase() }
      this.update({ status: 'ready', progress: null, error: null })
    } catch (error) {
      await Fs.rm(directory, { recursive: true, force: true })
      throw error
    }
  }

  private async verifyStaged(
    staged: { path: string; hash: string },
    size: number
  ): Promise<void> {
    const file = await Fs.open(
      staged.path,
      constants.O_RDONLY | constants.O_NOFOLLOW
    )
    try {
      const stat = await file.stat()
      if (
        !stat.isFile() ||
        stat.size !== size ||
        stat.nlink !== 1 ||
        (stat.mode & 0o077) !== 0 ||
        stat.uid !== process.getuid?.()
      ) {
        throw new Error('Staged update is not a private regular file')
      }
      const sha256 = createHash('sha256')
      const buffer = Buffer.alloc(64 * 1024)
      let received = 0
      for (;;) {
        const { bytesRead } = await file.read(buffer, 0, buffer.length, null)
        if (bytesRead === 0) {
          break
        }
        received += bytesRead
        if (received > size) {
          throw new Error('Staged update size changed')
        }
        sha256.update(buffer.subarray(0, bytesRead))
      }
      if (received !== size || sha256.digest('hex') !== staged.hash) {
        throw new Error('SHA256 verification failed before installation')
      }
    } finally {
      await file.close()
    }
  }

  private async readText(url: string, limit: number): Promise<string> {
    const chunks: Array<Buffer> = []
    await this.receive(url, limit, async chunk => {
      chunks.push(Buffer.from(chunk))
    })
    return Buffer.concat(chunks).toString('utf8')
  }

  /** Manual redirects ensure neither metadata nor assets can escape HTTPS/GitHub. */
  private async receive(
    url: string,
    limit: number,
    consume: (chunk: Uint8Array) => Promise<void>,
    timeout = 30000
  ): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      this.deps.requestTimeoutMs ?? timeout
    )
    let response: Response | undefined
    try {
      let target = url
      for (let redirects = 0; ; redirects++) {
        response = await this.fetcher(target, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept:
              url === LinuxReleasesApiURL
                ? 'application/vnd.github+json'
                : 'application/octet-stream',
            'User-Agent': 'GitHubDesktop-Linux-Updater',
          },
        })
        if (![301, 302, 303, 307, 308].includes(response.status)) {
          break
        }
        await response.body?.cancel()
        if (url === LinuxReleasesApiURL || redirects >= 3) {
          throw new Error('Unexpected update redirect')
        }
        const location = response.headers.get('location')
        if (location === null) {
          throw new Error('Missing update redirect location')
        }
        const redirected = new URL(location, target)
        if (
          redirected.protocol !== 'https:' ||
          redirected.port !== '' ||
          redirected.username !== '' ||
          redirected.password !== '' ||
          redirected.hash !== '' ||
          ![
            'release-assets.githubusercontent.com',
            'objects.githubusercontent.com',
          ].includes(redirected.hostname)
        ) {
          throw new Error('Untrusted update redirect')
        }
        target = redirected.href
      }
      if (!response.ok) {
        throw new Error(`Update request failed: HTTP ${response.status}`)
      }
      const length = response.headers.get('content-length')
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) > limit)
      ) {
        throw new Error('Update response exceeds size limit')
      }
      if (response.body === null) {
        throw new Error('Empty update response')
      }
      const reader = response.body.getReader()
      let received = 0
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) {
            break
          }
          received += value.length
          if (received > limit) {
            throw new Error('Update response exceeds size limit')
          }
          await consume(value)
        }
      } finally {
        await reader.cancel()
        reader.releaseLock()
      }
    } finally {
      controller.abort()
      clearTimeout(timer)
    }
  }
}
