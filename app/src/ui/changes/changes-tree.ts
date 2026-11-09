export type ChangesTreeRow<T extends { readonly path: string }> =
  | {
      readonly kind: 'directory'
      readonly name: string
      readonly path: string
      readonly depth: number
      readonly expanded: boolean
    }
  | {
      readonly kind: 'file'
      readonly file: T
      readonly depth: number
    }

type IChangesTreeDirectory<T extends { readonly path: string }> = {
  readonly name: string
  readonly path: string
  readonly directories: Map<string, IChangesTreeDirectory<T>>
  readonly files: Array<T>
}

const directoryNameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
})

/** Build a depth-first list of changed files and their containing folders. */
export function buildChangesTreeRows<T extends { readonly path: string }>(
  files: ReadonlyArray<T>,
  collapsedPaths: ReadonlySet<string>
): ReadonlyArray<ChangesTreeRow<T>> {
  const root: IChangesTreeDirectory<T> = {
    name: '',
    path: '',
    directories: new Map(),
    files: [],
  }

  for (const file of files) {
    const segments = file.path.split('/').filter(segment => segment.length > 0)
    let parent = root

    for (const [index, name] of segments.entries()) {
      if (index === segments.length - 1) {
        parent.files.push(file)
        continue
      }

      const path = parent.path.length === 0 ? name : `${parent.path}/${name}`
      let directory = parent.directories.get(name)
      if (directory === undefined) {
        directory = {
          name,
          path,
          directories: new Map(),
          files: [],
        }
        parent.directories.set(name, directory)
      }
      parent = directory
    }
  }

  const rows: Array<ChangesTreeRow<T>> = []
  const appendRows = (
    directory: IChangesTreeDirectory<T>,
    depth: number
  ) => {
    const directories = Array.from(directory.directories.values()).sort(
      (a, b) => directoryNameCollator.compare(a.name, b.name)
    )
    const directFiles = directory.files
      .slice()
      .sort((a, b) => directoryNameCollator.compare(a.path, b.path))

    for (const child of directories) {
      const expanded = !collapsedPaths.has(child.path)
      rows.push({
        kind: 'directory',
        name: child.name,
        path: child.path,
        depth,
        expanded,
      })

      if (expanded) {
        appendRows(child, depth + 1)
      }
    }

    for (const file of directFiles) {
      rows.push({ kind: 'file', file, depth })
    }
  }

  appendRows(root, 0)
  return rows
}
