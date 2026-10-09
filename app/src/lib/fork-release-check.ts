/**
 * Update discovery for the Linux / macOS fork.
 *
 * Squirrel auto-update isn't available for these builds (Linux has no
 * autoUpdater and the macOS build is ad-hoc signed), so we poll the fork's
 * GitHub releases and tell the user when a newer build exists.
 */

export const ForkReleasesApiUrl =
  'https://api.github.com/repos/tommyqhoang/github-desktop-linux/releases?per_page=5'

export interface IForkRelease {
  /** Release tag, e.g. `release-3.4.9-build.47`. */
  readonly tag: string
  /** Page the user can download the build from. */
  readonly url: string
}

interface IBuildId {
  readonly base: readonly [number, number, number]
  readonly run: number
}

const buildIdRe = /^(?:release-)?(\d+)\.(\d+)\.(\d+)-(?:build|linux)\.(\d+)$/

/**
 * Parse `3.4.9-build.46` / `release-3.4.9-linux.43` into comparable parts.
 * Returns null for anything else (e.g. a plain dev version `3.4.9`).
 */
export function parseBuildId(value: string): IBuildId | null {
  const m = buildIdRe.exec(value.trim())
  if (m === null) {
    return null
  }
  return {
    base: [Number(m[1]), Number(m[2]), Number(m[3])],
    run: Number(m[4]),
  }
}

function isNewer(candidate: IBuildId, current: IBuildId): boolean {
  for (let i = 0; i < 3; i++) {
    if (candidate.base[i] !== current.base[i]) {
      return candidate.base[i] > current.base[i]
    }
  }
  return candidate.run > current.run
}

/**
 * Pick the newest release strictly newer than `currentVersion`, or null.
 * Unparseable tags and a non-release current version (a local dev build)
 * yield null, so developers aren't nagged.
 */
export function findNewerRelease(
  releases: ReadonlyArray<{ tag_name?: unknown; html_url?: unknown }>,
  currentVersion: string
): IForkRelease | null {
  const current = parseBuildId(currentVersion)
  if (current === null) {
    return null
  }
  let best: { id: IBuildId; release: IForkRelease } | null = null
  for (const r of releases) {
    if (typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') {
      continue
    }
    const id = parseBuildId(r.tag_name)
    if (id === null || !isNewer(id, current)) {
      continue
    }
    if (best === null || isNewer(id, best.id)) {
      best = { id, release: { tag: r.tag_name, url: r.html_url } }
    }
  }
  return best === null ? null : best.release
}

/**
 * Ask GitHub for the fork's recent releases and return a newer one, if any.
 * Network and API failures resolve to null — an update hint must never
 * surface as an error.
 */
export async function checkForForkUpdate(
  currentVersion: string,
  fetcher: typeof fetch = fetch
): Promise<IForkRelease | null> {
  if (parseBuildId(currentVersion) === null) {
    return null
  }
  try {
    const response = await fetcher(ForkReleasesApiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return null
    }
    const releases = await response.json()
    return Array.isArray(releases)
      ? findNewerRelease(releases, currentVersion)
      : null
  } catch {
    return null
  }
}
