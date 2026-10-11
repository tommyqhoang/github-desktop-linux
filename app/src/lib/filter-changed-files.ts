import { AppFileStatusKind } from '../models/status'
import { DiffSelectionType } from '../models/diff'

export function filterChangedFilesByPath<T extends { readonly path: string }>(
  files: ReadonlyArray<T>,
  filterText: string
): ReadonlyArray<T> {
  const terms = filterText
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 0)

  if (terms.length === 0) {
    return files
  }

  return files.filter(file => {
    const path = file.path.toLocaleLowerCase()
    return terms.every(term => path.includes(term))
  })
}

/** Status buckets the changes list can be narrowed to. */
export type ChangedFilesStatusFilter =
  'all' | 'modified' | 'new' | 'deleted' | 'included' | 'excluded'

export const changedFilesStatusFilters: ReadonlyArray<{
  readonly id: ChangedFilesStatusFilter
  readonly label: string
}> = [
  { id: 'all', label: 'All changes' },
  { id: 'modified', label: 'Modified' },
  { id: 'new', label: 'New' },
  { id: 'deleted', label: 'Deleted' },
  { id: 'included', label: 'Included in commit' },
  { id: 'excluded', label: 'Excluded from commit' },
]

interface IFilterableFile {
  readonly path: string
  readonly status: { readonly kind: string }
  readonly selection: { getSelectionType(): DiffSelectionType }
}

function matchesStatus(
  file: IFilterableFile,
  filter: ChangedFilesStatusFilter
) {
  switch (filter) {
    case 'all':
      return true
    case 'modified':
      return file.status.kind === AppFileStatusKind.Modified
    case 'new':
      return (
        file.status.kind === AppFileStatusKind.New ||
        file.status.kind === AppFileStatusKind.Untracked
      )
    case 'deleted':
      return file.status.kind === AppFileStatusKind.Deleted
    case 'included':
      return file.selection.getSelectionType() !== DiffSelectionType.None
    case 'excluded':
      return file.selection.getSelectionType() === DiffSelectionType.None
  }
}

/** Narrow files by path text and then by status bucket. */
export function filterChangedFiles<T extends IFilterableFile>(
  files: ReadonlyArray<T>,
  filterText: string,
  statusFilter: ChangedFilesStatusFilter = 'all'
): ReadonlyArray<T> {
  const byPath = filterChangedFilesByPath(files, filterText)
  return statusFilter === 'all'
    ? byPath
    : byPath.filter(f => matchesStatus(f, statusFilter))
}
