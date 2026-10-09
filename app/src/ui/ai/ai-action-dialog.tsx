import * as React from 'react'
import { clipboard } from '../lib/clipboard'
import { Repository } from '../../models/repository'
import { AIResultDialog } from './ai-result-dialog'
import { AIResult, aiResultCopyText, renderAIResult } from './ai-result-render'
import {
  runConflictAssist,
  runPRDescription,
  runReview,
  runSummary,
} from '../../lib/ai/actions'
import { AIAction } from '../../models/ai-action'

interface IAIActionDialogProps {
  readonly repository: Repository
  readonly action: AIAction
  readonly onDismissed: () => void
}

interface IAIActionDialogState {
  readonly loading: boolean
  readonly error: string | null
  readonly result: AIResult | null
}

function titleFor(action: AIAction): string {
  switch (action.kind) {
    case 'pr-description':
      return 'AI Pull Request Description'
    case 'review':
      return 'AI Review of Your Changes'
    case 'summarize-changes':
      return 'AI Summary of Your Changes'
    case 'summarize-commit':
      return 'AI Commit Summary'
    case 'conflict':
      return 'AI Conflict Assist'
  }
}

/**
 * Host for a one-shot AI action. Runs the matching orchestrator on mount,
 * tracks loading/error/result, and presents the result in the shared
 * {@link AIResultDialog} with a Copy action and Regenerate.
 */
export class AIActionDialog extends React.Component<
  IAIActionDialogProps,
  IAIActionDialogState
> {
  private runToken = 0
  private isMounted_ = false
  private abortController: AbortController | null = null

  public constructor(props: IAIActionDialogProps) {
    super(props)
    this.state = { loading: true, error: null, result: null }
  }

  public componentDidMount() {
    this.isMounted_ = true
    this.run()
  }

  public componentWillUnmount() {
    // Stop any in-flight request from calling setState after the dialog closes.
    this.isMounted_ = false
    this.abortController?.abort()
  }

  private run = async () => {
    const token = ++this.runToken
    // Cancel any earlier request still in flight (Regenerate, dismiss).
    this.abortController?.abort()
    const controller = new AbortController()
    this.abortController = controller
    this.setState({ loading: true, error: null, result: null })
    try {
      const result = await this.execute(controller.signal)
      if (this.isMounted_ && token === this.runToken) {
        this.setState({ loading: false, result })
      }
    } catch (e) {
      if (this.isMounted_ && token === this.runToken) {
        const error = e instanceof Error ? e.message : String(e)
        this.setState({ loading: false, error })
      }
    }
  }

  private async execute(signal: AbortSignal): Promise<AIResult> {
    const { repository, action } = this.props
    switch (action.kind) {
      case 'pr-description':
        return {
          kind: 'pr-description',
          value: await runPRDescription(
            repository,
            action.baseRef,
            undefined,
            signal
          ),
        }
      case 'review':
        return {
          kind: 'review',
          value: await runReview(repository, undefined, signal),
        }
      case 'summarize-changes':
        return {
          kind: 'summary',
          value: await runSummary(
            repository,
            { kind: 'changes' },
            undefined,
            signal
          ),
        }
      case 'summarize-commit':
        return {
          kind: 'summary',
          value: await runSummary(
            repository,
            { kind: 'commit', sha: action.sha },
            undefined,
            signal
          ),
        }
      case 'conflict':
        return {
          kind: 'conflict',
          value: await runConflictAssist(
            repository,
            action.filePath,
            undefined,
            signal
          ),
        }
    }
  }

  private onCopy = () => {
    if (this.state.result !== null) {
      clipboard.writeText(aiResultCopyText(this.state.result))
    }
  }

  private onDismissed = () => {
    this.abortController?.abort()
    this.props.onDismissed()
  }

  private onDismissError = () => {
    this.setState({ error: null })
  }

  public render() {
    const { result } = this.state
    return (
      <AIResultDialog<AIResult>
        title={titleFor(this.props.action)}
        loading={this.state.loading}
        error={this.state.error}
        result={result}
        renderResult={renderAIResult}
        onRegenerate={this.run}
        onRetry={this.run}
        onCopy={result !== null ? this.onCopy : undefined}
        onDismissError={this.onDismissError}
        onDismissed={this.onDismissed}
      />
    )
  }
}
