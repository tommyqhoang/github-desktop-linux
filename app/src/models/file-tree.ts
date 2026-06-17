/** A single entry (file or directory) in the repository's working tree. */
export type FileTreeEntry = {
  /** Base name, e.g. "index.ts". */
  readonly name: string
  /** Path relative to the repository root, POSIX-style, e.g. "app/src/index.ts". */
  readonly path: string
  readonly kind: 'file' | 'directory'
}

/** The contents of a file as prepared for the read-only viewer. */
export type FileViewerContents = {
  /** UTF-8 text content. Empty when `isBinary` or `tooLarge` is true. */
  readonly content: string
  /** True when the file appears to be binary (contains a NUL byte). */
  readonly isBinary: boolean
  /** True when the file exceeds the viewer's size cap. */
  readonly tooLarge: boolean
}
