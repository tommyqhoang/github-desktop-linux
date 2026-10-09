import { readFile, realpath, stat } from 'fs/promises'
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

/** Message shown when a symlink resolves outside the repository. */
export const OutsideRepositoryMessage =
  'This link points outside the repository'

/**
 * Whether `absolutePath` resolves (through symlinks) to somewhere inside the
 * repository root. Paths that cannot be resolved count as outside.
 */
export async function isInsideRepository(
  repository: Repository,
  absolutePath: string
): Promise<boolean> {
  try {
    const [root, target] = await Promise.all([
      realpath(repository.path),
      realpath(absolutePath),
    ])
    const rel = Path.relative(root, target)
    return !(
      rel === '..' ||
      rel.startsWith(`..${Path.sep}`) ||
      Path.isAbsolute(rel)
    )
  } catch {
    return false
  }
}

/**
 * Throw when `absolutePath` resolves (through symlinks) to somewhere outside
 * the repository root, so the viewer never reads arbitrary files via a link.
 */
async function assertInsideRepository(
  repository: Repository,
  absolutePath: string
): Promise<void> {
  const [root, target] = await Promise.all([
    realpath(repository.path),
    realpath(absolutePath),
  ])
  const rel = Path.relative(root, target)
  if (rel === '..' || rel.startsWith(`..${Path.sep}`) || Path.isAbsolute(rel)) {
    throw new Error(OutsideRepositoryMessage)
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
  await assertInsideRepository(repository, absolutePath)

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
  await assertInsideRepository(repository, absolutePath)

  const stats = await stat(absolutePath)
  if (stats.size > MaxViewerFileSize) {
    return { content: '', isBinary: false, tooLarge: true }
  }

  const buffer = await readFile(absolutePath)

  // UTF-16 text is full of NUL bytes; a BOM marks it as text, not binary.
  const hasUtf16Bom =
    buffer.length >= 2 &&
    ((buffer[0] === 0xff && buffer[1] === 0xfe) ||
      (buffer[0] === 0xfe && buffer[1] === 0xff))

  const sniffLength = Math.min(buffer.length, BinarySniffLength)
  const nulIndex = buffer.indexOf(0)
  if (!hasUtf16Bom && nulIndex !== -1 && nulIndex < sniffLength) {
    return { content: '', isBinary: true, tooLarge: false }
  }

  return { content: decodeText(buffer), isBinary: false, tooLarge: false }
}

/** Decode a text buffer, honouring UTF-8 / UTF-16 byte-order marks. */
function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le')
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16BE: swap byte pairs, then decode as little-endian.
    const body = Buffer.from(buffer.subarray(2))
    body.swap16()
    return body.toString('utf16le')
  }
  const text = buffer.toString('utf8')
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
