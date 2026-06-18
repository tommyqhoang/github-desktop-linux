import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommitGraph } from '../../../src/ui/history/commit-graph'
import { buildCommitGraph } from '../../../src/lib/commit-graph'

const rows = buildCommitGraph([
  { sha: 'A', parentSHAs: ['B'] },
  { sha: 'B', parentSHAs: ['C'] },
  { sha: 'C', parentSHAs: [] },
])

const render = (index: number): string =>
  renderToStaticMarkup(
    React.createElement(CommitGraph, {
      row: rows[index],
      nextLanes: rows[index + 1]?.lanes ?? [],
    })
  )

describe('CommitGraph', () => {
  it('renders an svg with a node circle', () => {
    const html = render(1)
    expect(html).toContain('<svg')
    expect(html).toContain('<circle')
  })

  it('renders a line segment for each edge', () => {
    // Middle commit has an incoming child edge and an outgoing parent edge.
    const html = render(1)
    const lineCount = (html.match(/<line/g) ?? []).length
    expect(lineCount).toBeGreaterThanOrEqual(2)
  })

  it('sizes the svg to the number of columns', () => {
    const merge = buildCommitGraph([
      { sha: 'M', parentSHAs: ['A', 'B'] },
      { sha: 'A', parentSHAs: ['C'] },
      { sha: 'B', parentSHAs: ['C'] },
      { sha: 'C', parentSHAs: [] },
    ])
    const html = renderToStaticMarkup(
      React.createElement(CommitGraph, {
        row: merge[1], // row A: 2 columns
        nextLanes: merge[2].lanes,
      })
    )
    // 2 columns → width covers both lanes (lane width 14 → 28+).
    const widthMatch = html.match(/width="(\d+)"/)
    expect(widthMatch).not.toBeNull()
    expect(Number(widthMatch![1])).toBeGreaterThanOrEqual(28)
  })
})
