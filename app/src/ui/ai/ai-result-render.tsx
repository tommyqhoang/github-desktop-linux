import * as React from 'react'
import { IAIPRDescription } from '../../lib/ai/pr-description'
import { IReviewFinding } from '../../lib/ai/review-changes'
import { IConflictSuggestion } from '../../lib/ai/conflict-assist'

/** A tagged AI result so the dialog can render and copy each kind correctly. */
export type AIResult =
  | { readonly kind: 'pr-description'; readonly value: IAIPRDescription }
  | { readonly kind: 'summary'; readonly value: string }
  | { readonly kind: 'review'; readonly value: ReadonlyArray<IReviewFinding> }
  | { readonly kind: 'conflict'; readonly value: IConflictSuggestion }

/** Render an AI result body for display inside the result dialog. */
export function renderAIResult(result: AIResult): JSX.Element {
  switch (result.kind) {
    case 'pr-description':
      return (
        <div className="ai-pr-description">
          <h3 className="ai-pr-description__title">{result.value.title}</h3>
          <pre className="ai-pr-description__body">{result.value.body}</pre>
        </div>
      )
    case 'summary':
      return <pre className="ai-summary">{result.value}</pre>
    case 'review':
      return renderReview(result.value)
    case 'conflict':
      return (
        <div className="ai-conflict">
          <p className="ai-conflict__explanation">{result.value.explanation}</p>
          <h4>Suggested resolution</h4>
          <pre className="ai-conflict__resolution">
            {result.value.resolution}
          </pre>
        </div>
      )
  }
}

function renderReview(findings: ReadonlyArray<IReviewFinding>): JSX.Element {
  if (findings.length === 0) {
    return <div className="ai-review__empty">No issues found. 🎉</div>
  }
  return (
    <ul className="ai-review">
      {findings.map((f, i) => (
        <li key={i} className={`ai-review__item severity-${f.severity}`}>
          <span className={`ai-review__severity severity-${f.severity}`}>
            {f.severity}
          </span>
          <span className="ai-review__title">
            {f.title}
            {f.file !== undefined ? ` (${f.file})` : ''}
          </span>
          {f.detail.length > 0 && (
            <span className="ai-review__detail">{f.detail}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Plain-text form of a result, for the Copy action. */
export function aiResultCopyText(result: AIResult): string {
  switch (result.kind) {
    case 'pr-description':
      return `${result.value.title}\n\n${result.value.body}`.trimEnd()
    case 'summary':
      return result.value
    case 'conflict':
      return result.value.resolution
    case 'review':
      return result.value
        .map(
          f =>
            `[${f.severity}] ${f.title}${
              f.file !== undefined ? ` (${f.file})` : ''
            }${f.detail.length > 0 ? `\n  ${f.detail}` : ''}`
        )
        .join('\n')
  }
}
