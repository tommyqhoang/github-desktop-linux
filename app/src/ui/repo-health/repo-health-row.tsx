import * as React from 'react'
import { Repository } from '../../models/repository'
import { IRepoHealth } from '../../lib/repo-health/types'
import { RepositorySectionTab } from '../../lib/app-state'
import {
  RepoHealthSignal,
  resolveDrillDownSection,
} from '../../lib/repo-health/drill-down'
import { TooltippedContent } from '../lib/tooltipped-content'

interface IRepoHealthRowProps {
  readonly repository: Repository
  readonly health: IRepoHealth | null
  readonly refreshing: boolean
  readonly onClick: (repo: Repository) => void
  /**
   * Open the repository at a specific section. When omitted, individual
   * signals are not clickable and only the whole card selects the repo.
   */
  readonly onDrillDown?: (
    repo: Repository,
    section: RepositorySectionTab
  ) => void
}

export class RepoHealthRow extends React.PureComponent<IRepoHealthRowProps> {
  public render() {
    const { repository, health, refreshing } = this.props
    const score = health?.attentionScore ?? 0
    const tier =
      score >= 50 ? 'high' : score >= 20 ? 'mid' : score > 0 ? 'low' : 'ok'
    return (
      <div
        className={`repo-health-card tier-${tier}${
          refreshing ? ' refreshing' : ''
        }`}
        onClick={this.onClick}
        role="button"
        tabIndex={0}
        onKeyDown={this.onKeyDown}
      >
        <div className="repo-health-card__header">
          <span className="repo-health-card__name">
            {repository.name || repository.path}
          </span>
          <span className={`repo-health-card__score score-${tier}`}>
            {refreshing ? '…' : score}
          </span>
        </div>
        <TooltippedContent
          tagName="div"
          className="repo-health-card__path"
          tooltip={repository.path}
        >
          {repository.path}
        </TooltippedContent>
        {health === null ? (
          <div className="repo-health-card__hint">
            {refreshing ? 'Loading…' : 'Awaiting refresh'}
          </div>
        ) : health.error ? (
          <TooltippedContent
            tagName="div"
            className="repo-health-card__error"
            tooltip={health.error}
          >
            ⚠ {health.error}
          </TooltippedContent>
        ) : (
          this.renderSignals(health)
        )}
      </div>
    )
  }

  private renderSignals(h: IRepoHealth) {
    const cells: React.ReactNode[] = []
    cells.push(
      this.signalCell('changes', {
        label: 'Changes',
        value: h.uncommittedCount,
        warn: h.uncommittedCount > 0,
      })
    )
    cells.push(
      this.signalCell('ahead', {
        label: 'Ahead',
        value: h.aheadBy,
        warn: h.aheadBy > 0,
      })
    )
    cells.push(
      this.signalCell('behind', {
        label: 'Behind',
        value: h.behindBy,
        warn: h.behindBy > 0,
        bad: h.behindBy > 5,
      })
    )
    cells.push(
      this.signalCell('prs', {
        label: 'Open PRs',
        value: h.openPullRequestCount,
      })
    )
    cells.push(
      this.signalCell('ci', {
        label: 'CI',
        value: ciLabel(h.defaultBranchStatus),
        valueTitle: ciStatusText(h.defaultBranchStatus),
        bad: h.defaultBranchStatus === 'failure',
        warn: h.defaultBranchStatus === 'pending',
      })
    )
    cells.push(
      this.signalCell('stale', {
        label: 'Stale branches',
        value: h.staleBranchCount,
        warn: h.staleBranchCount > 5,
      })
    )
    cells.push(
      this.signalCell('last', {
        label: 'Last commit',
        value: formatRelativeUnix(h.lastActivityUnix),
      })
    )
    return <div className="repo-health-card__signals">{cells}</div>
  }

  /**
   * Build a signal cell, making it clickable when a drill-down handler is
   * supplied and the signal maps to a repository section.
   */
  private signalCell(signal: RepoHealthSignal, cell: ISignalCellProps) {
    const drillable =
      this.props.onDrillDown !== undefined &&
      resolveDrillDownSection(signal) !== null
    return (
      <SignalCell
        key={signal}
        {...cell}
        // eslint-disable-next-line react/jsx-no-bind
        onActivate={drillable ? () => this.onSignalActivate(signal) : undefined}
      />
    )
  }

  /**
   * Activate a signal: drill into its section when one exists, otherwise fall
   * back to plainly selecting the repository.
   */
  private onSignalActivate = (signal: RepoHealthSignal) => {
    const section = resolveDrillDownSection(signal)
    if (section !== null && this.props.onDrillDown !== undefined) {
      this.props.onDrillDown(this.props.repository, section)
    } else {
      this.props.onClick(this.props.repository)
    }
  }

  private onClick = () => this.props.onClick(this.props.repository)

  private onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.props.onClick(this.props.repository)
    }
  }
}

interface ISignalCellProps {
  readonly label: string
  readonly value: string | number
  readonly warn?: boolean
  readonly bad?: boolean
  /**
   * Optional human-readable description of `value`. Supply this when `value`
   * is a glyph (e.g. the CI status check/cross) that conveys meaning visually
   * but is opaque to screen readers. The glyph is then hidden from assistive
   * tech and this text is exposed instead, so the cell reads as e.g.
   * "CI failing".
   */
  readonly valueTitle?: string
  /** When set, the cell renders as a button that drills into a section. */
  readonly onActivate?: () => void
}

function SignalCell({
  label,
  value,
  warn,
  bad,
  valueTitle,
  onActivate,
}: ISignalCellProps) {
  const cls = bad ? ' bad' : warn ? ' warn' : ''
  const inner = (
    <>
      <span className="repo-health-card__cell-label">{label}</span>
      {valueTitle !== undefined ? (
        <span className="repo-health-card__cell-value">
          <span aria-hidden={true}>{value}</span>
          <span className="sr-only">{valueTitle}</span>
        </span>
      ) : (
        <span className="repo-health-card__cell-value">{value}</span>
      )}
    </>
  )

  if (onActivate !== undefined) {
    const onClick = (e: React.MouseEvent) => {
      // Don't also trigger the card's whole-row select.
      e.stopPropagation()
      onActivate()
    }
    return (
      <button
        type="button"
        className={`repo-health-card__cell repo-health-card__cell-button${cls}`}
        // eslint-disable-next-line react/jsx-no-bind
        onClick={onClick}
      >
        {inner}
      </button>
    )
  }

  return <div className={`repo-health-card__cell${cls}`}>{inner}</div>
}

function ciLabel(state: IRepoHealth['defaultBranchStatus']): string {
  switch (state) {
    case 'success':
      return '✓'
    case 'failure':
      return '✗'
    case 'pending':
      return '…'
    default:
      return '—'
  }
}

/** Screen-reader / tooltip text for the CI status glyph. */
function ciStatusText(state: IRepoHealth['defaultBranchStatus']): string {
  switch (state) {
    case 'success':
      return 'passing'
    case 'failure':
      return 'failing'
    case 'pending':
      return 'pending'
    default:
      return 'no status'
  }
}

function formatRelativeUnix(unix: number): string {
  if (!Number.isFinite(unix) || unix <= 0) {
    return '—'
  }
  const ageSec = Math.floor(Date.now() / 1000) - unix
  if (ageSec < 60) {
    return 'just now'
  }
  if (ageSec < 3600) {
    return `${Math.floor(ageSec / 60)}m ago`
  }
  if (ageSec < 86400) {
    return `${Math.floor(ageSec / 3600)}h ago`
  }
  if (ageSec < 86400 * 30) {
    return `${Math.floor(ageSec / 86400)}d ago`
  }
  if (ageSec < 86400 * 365) {
    return `${Math.floor(ageSec / (86400 * 30))}mo ago`
  }
  return `${Math.floor(ageSec / (86400 * 365))}y ago`
}
