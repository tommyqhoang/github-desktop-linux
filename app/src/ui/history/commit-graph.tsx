import * as React from 'react'
import { computeGraphSegments, ICommitGraphRow } from '../../lib/commit-graph'

interface ICommitGraphProps {
  readonly row: ICommitGraphRow
  /** Lane occupancy of the row below, used to route pass-through lanes. */
  readonly nextLanes: ReadonlyArray<string | null>
  /** Pixel width allotted to each lane column. */
  readonly laneWidth?: number
  /** Pixel height of the commit row. */
  readonly rowHeight?: number
}

const DEFAULT_LANE_WIDTH = 14
const DEFAULT_ROW_HEIGHT = 50
const NODE_RADIUS = 3.5

/** Stable palette so each lane keeps a consistent colour down the graph. */
const COLORS = [
  '#0969da',
  '#1a7f37',
  '#cf222e',
  '#bf3989',
  '#9a6700',
  '#8250df',
  '#bc4c00',
]

function colorFor(index: number): string {
  return COLORS[((index % COLORS.length) + COLORS.length) % COLORS.length]
}

/**
 * Renders the branch-graph cell for a single commit row: lane lines routed
 * from {@link computeGraphSegments} plus the commit's node. The SVG is sized to
 * the row's column count and stretches to the commit row height so lines meet
 * the cells above and below.
 */
export class CommitGraph extends React.Component<ICommitGraphProps> {
  public render() {
    const { row, nextLanes } = this.props
    const laneWidth = this.props.laneWidth ?? DEFAULT_LANE_WIDTH
    const rowHeight = this.props.rowHeight ?? DEFAULT_ROW_HEIGHT
    const width = Math.max(row.totalColumns, 1) * laneWidth

    const x = (column: number) => column * laneWidth + laneWidth / 2
    const y = (unit: number) => unit * rowHeight

    const segments = computeGraphSegments(row, nextLanes)

    return (
      <svg
        className="commit-graph"
        width={width}
        height={rowHeight}
        aria-hidden={true}
      >
        {segments.map((s, i) => (
          <line
            key={i}
            x1={x(s.x1)}
            y1={y(s.y1)}
            x2={x(s.x2)}
            y2={y(s.y2)}
            stroke={colorFor(s.color)}
            strokeWidth={1.5}
            fill="none"
          />
        ))}
        <circle
          cx={x(row.column)}
          cy={y(0.5)}
          r={NODE_RADIUS}
          fill={colorFor(row.column)}
        />
      </svg>
    )
  }
}
