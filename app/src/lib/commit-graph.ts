/** The minimal commit shape the graph builder needs. */
export interface ICommitGraphInput {
  readonly sha: string
  readonly parentSHAs: ReadonlyArray<string>
}

/** A single rendered row of the commit graph. */
export interface ICommitGraphRow {
  readonly sha: string
  /** The column (0-based) the commit's node sits in. */
  readonly column: number
  /**
   * Lane occupancy entering this row from the row above (the top edge). Each
   * slot holds the SHA that lane is heading toward, or `null` when free. This
   * is the bottom-edge occupancy of the previous row.
   */
  readonly lanes: ReadonlyArray<string | null>
  /**
   * The bottom-edge column each of this commit's parents is routed into,
   * parallel to the commit's parent order. Empty for a root commit. The first
   * parent always shares the commit's own column.
   */
  readonly parentColumns: ReadonlyArray<number>
  /** Number of columns this row occupies (top edge, node, and bottom edge). */
  readonly totalColumns: number
}

/**
 * A line segment to draw inside a single commit's graph cell. Coordinates are
 * in lane/row units: `x` is the column, `y` runs 0 (top edge) → 0.5 (node
 * centre) → 1 (bottom edge). A renderer maps these onto pixels.
 */
export interface IGraphSegment {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  /** Lane/colour index used to pick a stable stroke colour. */
  readonly color: number
}

/**
 * Compute the line segments to draw in a commit's graph cell, given the row
 * and the lane occupancy of the row below (`nextLanes`). Incoming child edges
 * run from the top edge to the node centre; outgoing parent edges run from the
 * node centre to the bottom edge; unrelated lanes pass straight through.
 */
export function computeGraphSegments(
  row: ICommitGraphRow,
  nextLanes: ReadonlyArray<string | null>
): ReadonlyArray<IGraphSegment> {
  const segments = new Array<IGraphSegment>()
  const node = row.column

  for (let t = 0; t < row.lanes.length; t++) {
    const sha = row.lanes[t]
    if (sha === null) {
      continue
    }
    if (sha === row.sha) {
      // A child lane merging into this commit's node.
      segments.push({ x1: t, y1: 0, x2: node, y2: 0.5, color: t })
    } else {
      // An unrelated lane passing this row; continue it to its bottom column.
      const b = nextLanes.indexOf(sha)
      segments.push({ x1: t, y1: 0, x2: b === -1 ? t : b, y2: 1, color: t })
    }
  }

  for (const pc of row.parentColumns) {
    segments.push({ x1: node, y1: 0.5, x2: pc, y2: 1, color: pc })
  }

  return segments
}

/**
 * Assign branch lanes to a newest-first list of commits so a DAG can be drawn
 * beside a linear commit list.
 *
 * The algorithm walks commits top-to-bottom keeping a list of "active" lanes,
 * each waiting for the next commit it should reach. For each commit:
 *  - lanes already waiting for it merge into its node (its leftmost waiting
 *    lane becomes the node column);
 *  - a commit no lane waits for (a branch tip) takes the leftmost free lane;
 *  - the commit's first parent continues in the node's lane, and any extra
 *    parents (merges) open new lanes.
 * Trailing free lanes are compacted so columns are reused once a branch ends.
 */
export function buildCommitGraph(
  commits: ReadonlyArray<ICommitGraphInput>
): ReadonlyArray<ICommitGraphRow> {
  const rows = new Array<ICommitGraphRow>()
  const active = new Array<string | null>()

  for (const commit of commits) {
    const lanes = active.slice()

    // Columns currently waiting for this commit (its children's lanes).
    const waiting = new Array<number>()
    for (let i = 0; i < active.length; i++) {
      if (active[i] === commit.sha) {
        waiting.push(i)
      }
    }

    let column: number
    if (waiting.length > 0) {
      column = waiting[0]
      // Merge every lane that was heading here into the node's column.
      for (const i of waiting) {
        active[i] = null
      }
    } else {
      // A tip with no child in the window: take the leftmost free lane.
      column = active.indexOf(null)
      if (column === -1) {
        column = active.length
        active.push(null)
      }
    }

    const parents = commit.parentSHAs
    const parentColumns = new Array<number>()
    if (parents.length === 0) {
      active[column] = null
    } else {
      active[column] = parents[0]
      parentColumns.push(column)
      for (let p = 1; p < parents.length; p++) {
        let free = active.indexOf(null)
        if (free === -1) {
          free = active.length
          active.push(parents[p])
        } else {
          active[free] = parents[p]
        }
        parentColumns.push(free)
      }
    }

    // Reuse freed columns: drop trailing empty lanes.
    while (active.length > 0 && active[active.length - 1] === null) {
      active.pop()
    }

    rows.push({
      sha: commit.sha,
      column,
      lanes,
      parentColumns,
      totalColumns: Math.max(lanes.length, column + 1, active.length),
    })
  }

  return rows
}
