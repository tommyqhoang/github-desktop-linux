import { readdir } from 'fs/promises'
import * as Path from 'path'
import { git } from '../git/core'
import { Repository } from '../../models/repository'
import { FileTreeEntry } from '../../models/file-tree'

/**
 * List the immediate children of a directory within the repository's working
 * tree, hiding `.git` and anything excluded by the repository's gitignore
 * rules. The listing is non-recursive (lazy) — callers expand one directory
 * at a time. Directories sort before files; each group is sorted
 * case-insensitively by name.
 *
 * @param repository    The repository whose working tree is being browsed.
 * @param relativePath  POSIX path of the directory relative to the repo root,
 *                      or '' for the root itself.
 */
export async function readWorkingDirectory(
  repository: Repository,
  relativePath: string
): Promise<ReadonlyArray<FileTreeEntry>> {
  const absoluteDir = Path.join(repository.path, relativePath)
  const dirents = await readdir(absoluteDir, { withFileTypes: true })

  const candidates: FileTreeEntry[] = dirents
    // Hide the repository's own git directory (root level only).
    .filter(d => !(relativePath === '' && d.name === '.git'))
    .map(d => ({
      name: d.name,
      path: relativePath === '' ? d.name : `${relativePath}/${d.name}`,
      kind: d.isDirectory() ? ('directory' as const) : ('file' as const),
    }))

  const ignored = await getIgnoredPaths(
    repository,
    candidates.map(c => c.path)
  )

  return candidates.filter(c => !ignored.has(c.path)).sort(compareEntries)
}

/** Sort directories before files, then case-insensitive by name. */
function compareEntries(a: FileTreeEntry, b: FileTreeEntry): number {
  if (a.kind !== b.kind) {
    return a.kind === 'directory' ? -1 : 1
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'accent' })
}

/**
 * Return the subset of `paths` that git considers ignored. Uses a single
 * `git check-ignore` invocation, feeding the candidate paths on stdin so the
 * argument list can never overflow. Exit code 1 means "nothing matched".
 */
async function getIgnoredPaths(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<ReadonlySet<string>> {
  if (paths.length === 0) {
    return new Set()
  }

  const result = await git(
    ['check-ignore', '-z', '--stdin'],
    repository.path,
    'checkIgnore',
    {
      successExitCodes: new Set([0, 1]),
      stdin: paths.join('\0'),
    }
  )

  if (result.exitCode === 1 || result.stdout.length === 0) {
    return new Set()
  }

  return new Set(result.stdout.split('\0').filter(p => p.length > 0))
}
