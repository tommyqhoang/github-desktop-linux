import { AppFileStatusKind } from '../../src/models/status'
import { DiffSelectionType } from '../../src/models/diff'

import {
  filterChangedFiles,
  filterChangedFilesByPath,
} from '../../src/lib/filter-changed-files'

describe('filterChangedFilesByPath', () => {
  const files = [
    { path: 'app/src/ui/changes/changes-list.tsx' },
    { path: 'README.md' },
    { path: 'script/package.ts' },
  ]

  it('returns all files for blank filters', () => {
    expect(filterChangedFilesByPath(files, '')).toEqual(files)
    expect(filterChangedFilesByPath(files, '   ')).toEqual(files)
  })

  it('matches paths case-insensitively', () => {
    expect(filterChangedFilesByPath(files, 'README')).toEqual([files[1]])
    expect(filterChangedFilesByPath(files, 'CHANGES')).toEqual([files[0]])
  })

  it('matches multiple terms in any path segment', () => {
    expect(filterChangedFilesByPath(files, 'src list')).toEqual([files[0]])
    expect(filterChangedFilesByPath(files, 'package script')).toEqual([
      files[2],
    ])
  })
})

describe('filterChangedFiles', () => {
  const file = (
    path: string,
    kind: AppFileStatusKind,
    sel: DiffSelectionType
  ) => ({
    path,
    status: { kind },
    selection: { getSelectionType: () => sel },
  })
  const files = [
    file('a.ts', AppFileStatusKind.Modified, DiffSelectionType.All),
    file('b.ts', AppFileStatusKind.New, DiffSelectionType.None),
    file('c.ts', AppFileStatusKind.Untracked, DiffSelectionType.All),
    file('d.ts', AppFileStatusKind.Deleted, DiffSelectionType.Partial),
  ]
  const paths = (f: ReadonlyArray<{ path: string }>) => f.map(x => x.path)

  it('filters by status bucket', () => {
    expect(paths(filterChangedFiles(files, '', 'modified'))).toEqual(['a.ts'])
    expect(paths(filterChangedFiles(files, '', 'new'))).toEqual([
      'b.ts',
      'c.ts',
    ])
    expect(paths(filterChangedFiles(files, '', 'deleted'))).toEqual(['d.ts'])
    expect(paths(filterChangedFiles(files, '', 'excluded'))).toEqual(['b.ts'])
    expect(paths(filterChangedFiles(files, '', 'included'))).toEqual([
      'a.ts',
      'c.ts',
      'd.ts',
    ])
  })

  it('combines text and status', () => {
    expect(paths(filterChangedFiles(files, 'c', 'new'))).toEqual(['c.ts'])
    expect(paths(filterChangedFiles(files, 'a', 'all'))).toEqual(['a.ts'])
  })
})
