import * as Path from 'path'
import { stat } from 'fs/promises'

async function defaultIsDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Pick the working directory for a newly opened terminal tab.
 *
 * New tabs inherit the directory the user is currently in (the active
 * session's OSC 7 `liveCwd`) so "open another tab" keeps their place
 * instead of dropping them back at the repository root. Falls back to
 * `fallback` (the repository root) when there is no live directory, it is
 * not an absolute path, or it no longer exists as a directory — spawning a
 * shell into a missing cwd would fail outright.
 */
export async function resolveNewTabCwd(
  liveCwd: string | null | undefined,
  fallback: string,
  isDirectory: (path: string) => Promise<boolean> = defaultIsDirectory
): Promise<string> {
  if (
    liveCwd === null ||
    liveCwd === undefined ||
    liveCwd.length === 0 ||
    !Path.isAbsolute(liveCwd)
  ) {
    return fallback
  }
  return (await isDirectory(liveCwd)) ? liveCwd : fallback
}
