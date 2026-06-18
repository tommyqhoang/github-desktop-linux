import {
  buildCommitGraph,
  computeGraphSegments,
} from '../../src/lib/commit-graph'

/** Minimal commit shape the graph builder needs. */
function c(sha: string, parents: string[]) {
  return { sha, parentSHAs: parents }
}

describe('buildCommitGraph', () => {
  it('returns an empty graph for no commits', () => {
    expect(buildCommitGraph([])).toEqual([])
  })

  it('places a linear history in a single column', () => {
    const rows = buildCommitGraph([c('A', ['B']), c('B', ['C']), c('C', [])])
    expect(rows.map(r => r.sha)).toEqual(['A', 'B', 'C'])
    expect(rows.map(r => r.column)).toEqual([0, 0, 0])
  })

  it('opens a lane for the first commit even with no child above it', () => {
    const rows = buildCommitGraph([c('A', ['B'])])
    // The tip has no incoming lane from above.
    expect(rows[0].lanes).toEqual([])
    expect(rows[0].column).toBe(0)
  })

  it('assigns a second column to a diverging branch and merges back', () => {
    // M is a merge of A and B; both descend from root C.
    const rows = buildCommitGraph([
      c('M', ['A', 'B']),
      c('A', ['C']),
      c('B', ['C']),
      c('C', []),
    ])
    const byline = Object.fromEntries(rows.map(r => [r.sha, r]))

    expect(byline['M'].column).toBe(0)
    expect(byline['A'].column).toBe(0)
    expect(byline['B'].column).toBe(1)
    expect(byline['C'].column).toBe(0)

    // The merge commit opens a second lane for its second parent.
    expect(byline['A'].lanes).toEqual(['A', 'B'])
    // By the time we reach C, two lanes both await C — the merge point.
    expect(byline['C'].lanes).toEqual(['C', 'C'])
  })

  it('reuses a freed column after a branch merges', () => {
    // After B merges into C, lane 1 frees up and a later independent tip D
    // should reuse column 1 rather than opening column 2.
    const rows = buildCommitGraph([
      c('A', ['C']),
      c('B', ['C']),
      c('C', ['E']),
      c('D', ['E']), // unrelated tip appearing later
      c('E', []),
    ])
    const byline = Object.fromEntries(rows.map(r => [r.sha, r]))
    expect(byline['A'].column).toBe(0)
    expect(byline['B'].column).toBe(1)
    // C consumes lane 0 and lane 1's waits-for-C, collapsing to one lane.
    expect(byline['C'].column).toBe(0)
    // D reuses the freed second column.
    expect(byline['D'].column).toBe(1)
  })

  it('records the bottom columns each commit routes its parents into', () => {
    const rows = buildCommitGraph([
      c('M', ['A', 'B']),
      c('A', ['C']),
      c('B', ['C']),
      c('C', []),
    ])
    const byline = Object.fromEntries(rows.map(r => [r.sha, r]))
    // M's first parent A stays in M's column (0); second parent B opens col 1.
    expect(byline['M'].parentColumns).toEqual([0, 1])
    // A's single parent C stays in A's column (0).
    expect(byline['A'].parentColumns).toEqual([0])
    // A root commit routes no parents.
    expect(byline['C'].parentColumns).toEqual([])
  })

  it('exposes the total number of occupied columns per row', () => {
    const rows = buildCommitGraph([
      c('M', ['A', 'B']),
      c('A', ['C']),
      c('B', ['C']),
      c('C', []),
    ])
    const byline = Object.fromEntries(rows.map(r => [r.sha, r]))
    // Row A has lanes for A and B.
    expect(byline['A'].totalColumns).toBe(2)
  })
})

describe('computeGraphSegments', () => {
  const rows = buildCommitGraph([c('A', ['B']), c('B', ['C']), c('C', [])])

  it('draws only a downward parent edge for the top commit', () => {
    const segs = computeGraphSegments(rows[0], rows[1].lanes)
    expect(segs).toEqual([{ x1: 0, y1: 0.5, x2: 0, y2: 1, color: 0 }])
  })

  it('draws an incoming child edge and an outgoing parent edge for a middle commit', () => {
    const segs = computeGraphSegments(rows[1], rows[2].lanes)
    expect(segs).toContainEqual({ x1: 0, y1: 0, x2: 0, y2: 0.5, color: 0 })
    expect(segs).toContainEqual({ x1: 0, y1: 0.5, x2: 0, y2: 1, color: 0 })
  })

  it('draws only an incoming edge for a root commit', () => {
    const segs = computeGraphSegments(rows[2], [])
    expect(segs).toEqual([{ x1: 0, y1: 0, x2: 0, y2: 0.5, color: 0 }])
  })

  it('routes a merge: a pass-through lane plus a diagonal parent edge', () => {
    const merge = buildCommitGraph([
      c('M', ['A', 'B']),
      c('A', ['C']),
      c('B', ['C']),
      c('C', []),
    ])
    // Row B (column 1) carries A's lane (heading to C) straight through column
    // 0, and B's own parent C continues at column 1.
    const segs = computeGraphSegments(merge[2], merge[3].lanes)
    expect(segs).toContainEqual({ x1: 0, y1: 0, x2: 0, y2: 1, color: 0 })
    expect(segs).toContainEqual({ x1: 1, y1: 0, x2: 1, y2: 0.5, color: 1 })
    expect(segs).toContainEqual({ x1: 1, y1: 0.5, x2: 1, y2: 1, color: 1 })
  })
})
