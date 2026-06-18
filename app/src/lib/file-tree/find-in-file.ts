/** A single match of a find query within a file. */
export interface IFindMatch {
  /** 0-based line index. */
  readonly line: number
  /** 0-based column (character offset within the line) of the match start. */
  readonly column: number
}

/**
 * Find every non-overlapping occurrence of `query` across `lines`, returned in
 * document order. Matching is case-insensitive unless `caseSensitive` is set.
 * An empty query matches nothing.
 */
export function findMatches(
  lines: ReadonlyArray<string>,
  query: string,
  caseSensitive: boolean = false
): ReadonlyArray<IFindMatch> {
  if (query.length === 0) {
    return []
  }

  const needle = caseSensitive ? query : query.toLowerCase()
  const matches = new Array<IFindMatch>()

  for (let line = 0; line < lines.length; line++) {
    const haystack = caseSensitive ? lines[line] : lines[line].toLowerCase()
    let from = 0
    let column = haystack.indexOf(needle, from)
    while (column !== -1) {
      matches.push({ line, column })
      from = column + needle.length
      column = haystack.indexOf(needle, from)
    }
  }

  return matches
}
