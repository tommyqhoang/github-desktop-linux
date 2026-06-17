import { readFile, stat } from 'fs/promises'
import * as Path from 'path'
import { Repository } from '../../models/repository'
import { FileViewerContents, MediaViewerContents } from '../../models/file-tree'
import { getMediaDescriptor } from './media'

/** Largest file the read-only viewer will render (2 MB). */
const MaxViewerFileSize = 2 * 1024 * 1024

/**
 * The last-modified time of a working-tree file in milliseconds, or null when
 * it can't be stat'd (e.g. it was deleted). Used to detect on-disk changes to
 * an already-open file without re-reading its contents.
 */
export async function statMtimeMs(
  repository: Repository,
  relativePath: string
): Promise<number | null> {
  try {
    const stats = await stat(Path.join(repository.path, relativePath))
    return stats.mtimeMs
  } catch {
    return null
  }
}

/** Largest media file rendered inline as a data URL (50 MB). */
const MaxMediaFileSize = 50 * 1024 * 1024

/**
 * Read an image or video file as a data URL for inline display. The result is
 * reported via `tooLarge` (without reading the file) when it exceeds
 * `MaxMediaFileSize`, since data URLs embed the whole payload in memory.
 */
export async function readMediaForViewer(
  repository: Repository,
  relativePath: string
): Promise<MediaViewerContents> {
  const descriptor = getMediaDescriptor(relativePath)
  if (descriptor === null) {
    throw new Error(`Not a recognised media file: ${relativePath}`)
  }

  const absolutePath = Path.join(repository.path, relativePath)

  const stats = await stat(absolutePath)
  if (stats.size > MaxMediaFileSize) {
    return { kind: descriptor.kind, dataUrl: '', tooLarge: true }
  }

  const buffer = await readFile(absolutePath)
  const dataUrl = `data:${descriptor.mediaType};base64,${buffer.toString(
    'base64'
  )}`
  return { kind: descriptor.kind, dataUrl, tooLarge: false }
}

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
