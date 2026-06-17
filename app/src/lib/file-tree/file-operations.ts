import { rename, access } from 'fs/promises'
import * as Path from 'path'
import { Repository } from '../../models/repository'
import { shell } from '../app-shell'

/** Whether a path exists on disk. */
async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath)
    return true
  } catch {
    return false
  }
}

/**
 * The repo-relative parent directory of a path, POSIX-style. Returns '' (the
 * root key used by the file tree) for a top-level entry.
 */
export function getParentPath(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index === -1 ? '' : relativePath.slice(0, index)
}

/** The repo-relative path an entry would have after being renamed to `newName`. */
export function renamedRelativePath(
  relativePath: string,
  newName: string
): string {
  const parent = getParentPath(relativePath)
  return parent === '' ? newName : `${parent}/${newName}`
}

/** Whether `newName` is a usable single path segment (not a path or traversal). */
export function isValidEntryName(newName: string): boolean {
  const trimmed = newName.trim()
  return (
    trimmed !== '' &&
    trimmed !== '.' &&
    trimmed !== '..' &&
    !trimmed.includes('/') &&
    !trimmed.includes('\\') &&
    !trimmed.includes('\0')
  )
}

/**
 * Rename a working-tree entry within its current directory and return the new
 * repo-relative path. Throws on an invalid name or when the rename fails.
 */
export async function renameEntry(
  repository: Repository,
  oldRelativePath: string,
  newName: string
): Promise<string> {
  const trimmed = newName.trim()
  if (!isValidEntryName(trimmed)) {
    throw new Error(`Invalid file name: "${newName}"`)
  }

  const newRelativePath = renamedRelativePath(oldRelativePath, trimmed)
  if (newRelativePath === oldRelativePath) {
    return oldRelativePath
  }

  const newAbsolutePath = Path.join(repository.path, newRelativePath)
  // fs.rename would silently overwrite an existing target — refuse instead so
  // a rename can't clobber another file.
  if (await pathExists(newAbsolutePath)) {
    throw new Error(`A file named "${trimmed}" already exists.`)
  }

  await rename(Path.join(repository.path, oldRelativePath), newAbsolutePath)
  return newRelativePath
}

/** Move a working-tree entry to the OS trash (recoverable delete). */
export function deleteEntry(
  repository: Repository,
  relativePath: string
): Promise<void> {
  return shell.moveItemToTrash(Path.join(repository.path, relativePath))
}
