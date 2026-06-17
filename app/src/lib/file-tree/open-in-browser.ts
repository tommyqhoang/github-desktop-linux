import * as Path from 'path'
import { Repository } from '../../models/repository'
import { shell } from '../app-shell'
import { encodePathAsUrl } from '../path'

/** Extensions the viewer offers to open in the default browser. */
const BrowserViewableExtensions = new Set(['.html', '.htm', '.pdf'])

/** Whether a path should be opened in the default browser rather than inline. */
export function isBrowserViewable(filePath: string): boolean {
  return BrowserViewableExtensions.has(Path.extname(filePath).toLowerCase())
}

/**
 * Open a working-tree file in the user's default browser via a `file://` URL.
 * Resolves to false when the OS reports it couldn't open the file.
 */
export function openInBrowser(
  repository: Repository,
  relativePath: string
): Promise<boolean> {
  const url = encodePathAsUrl(repository.path, relativePath)
  return shell.openExternal(url)
}
