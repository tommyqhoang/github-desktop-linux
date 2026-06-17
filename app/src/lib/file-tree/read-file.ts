import { readFile, stat } from 'fs/promises'
import * as Path from 'path'
import { Repository } from '../../models/repository'
import { FileViewerContents } from '../../models/file-tree'

/** Largest file the read-only viewer will render (2 MB). */
const MaxViewerFileSize = 2 * 1024 * 1024

/** Number of leading bytes scanned for a NUL byte during binary detection. */
const BinarySniffLength = 8 * 1024

/**
 * Read a working-tree file for the read-only viewer. Files larger than
 * `MaxViewerFileSize` are reported via `tooLarge` without being read into
 * memory, and binary files (NUL byte within the first 8 KB) are reported via
 * `isBinary`. In both cases `content` is empty.
 */
export async function readFileForViewer(
  repository: Repository,
  relativePath: string
): Promise<FileViewerContents> {
  const absolutePath = Path.join(repository.path, relativePath)

  const stats = await stat(absolutePath)
  if (stats.size > MaxViewerFileSize) {
    return { content: '', isBinary: false, tooLarge: true }
  }

  const buffer = await readFile(absolutePath)

  const sniffLength = Math.min(buffer.length, BinarySniffLength)
  const nulIndex = buffer.indexOf(0)
  if (nulIndex !== -1 && nulIndex < sniffLength) {
    return { content: '', isBinary: true, tooLarge: false }
  }

  return { content: buffer.toString('utf8'), isBinary: false, tooLarge: false }
}
