import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import {
  IPRReviewSession,
  ReviewVerdict,
  groupThreadsByPath,
} from '../../models/pull-request-review'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

interface IPRReviewDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  /** Pull request number this dialog is reviewing. */
  readonly prNumber: number
  readonly session: IPRReviewSession | null
  readonly onDismissed: () => void
}

interface IPRReviewDialogState {
  readonly newCommentBody: string
  readonly newCommentPath: string
  readonly newCommentLine: string
  /** Local, dialog-level message (e.g. submit blocked). */
  readonly notice: string | null
}

/**
 * Read-mostly review dialog. v1 surface:
 *   - Lists threads grouped by file
 *   - Lets the user draft a single line comment by typing path+line+body
 *   - Sets a verdict (approve / request changes / comment)
 *   - Submits the review in one shot
 *
 * Diff-rendered inline comment widgets are deferred to a follow-up — they
 * require the existing diff component to host overlays which is out of
 * scope for v1.
 */
export class PRReviewDialog extends React.Component<
  IPRReviewDialogProps,
  IPRReviewDialogState
> {
  public constructor(props: IPRReviewDialogProps) {
    super(props)
    this.state = {
      newCommentBody: '',
      newCommentPath: '',
      newCommentLine: '',
      notice: null,
    }
  }

  public componentDidMount() {
    // Load the review threads here — not in the parent's render() — so the
    // fetch fires once when the dialog opens rather than on every unrelated
    // app re-render that occurs before the session resolves.
    const { session, prNumber, repository } = this.props
    if (
      session === null ||
      session.prNumber !== prNumber ||
      session.repoId !== repository.id
    ) {
      this.props.dispatcher.openPullRequestReview(repository, prNumber)
    }
  }

  public render() {
    const { session } = this.props
    const title = __DARWIN__ ? 'Review Pull Request' : 'Review pull request'
    return (
      <Dialog
        id="pr-review"
        title={title}
        loading={session?.status === 'submitting'}
        disabled={session?.status === 'submitting'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          {session === null
            ? this.renderEmpty()
            : session.status === 'loading'
              ? this.renderLoading()
              : session.status === 'error'
                ? this.renderLoadError(session)
                : this.renderReady(session)}
        </DialogContent>
        <DialogFooter>
          {this.renderSubmitHint(session)}
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Submit Review' : 'Submit review'}
            okButtonDisabled={
              session === null ||
              session.status !== 'ready' ||
              session.verdict.kind === 'pending'
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderEmpty() {
    return <Row>No active review session.</Row>
  }

  private renderLoading() {
    return (
      <Row>
        <span role="status">Loading review threads…</span>
      </Row>
    )
  }

  private renderLoadError(session: IPRReviewSession) {
    return (
      <>
        <Row>
          <span className="error" role="alert">
            Couldn't load this pull request's review.
            {session.error ? ` ${session.error.message}` : ''}
          </span>
        </Row>
        <Row>
          <button type="button" onClick={this.onRetryClick}>
            Retry
          </button>
        </Row>
      </>
    )
  }

  /** A visible reason why Submit is unavailable, if it is. */
  private renderSubmitHint(session: IPRReviewSession | null) {
    if (session === null || session.status !== 'ready') {
      return null
    }
    if (session.verdict.kind === 'pending') {
      return (
        <p className="pr-review-submit-hint" role="status">
          Choose a verdict (Comment, Approve or Request changes) to enable
          Submit.
        </p>
      )
    }
    return null
  }

  private onRetryClick = () => {
    this.props.dispatcher.openPullRequestReview(
      this.props.repository,
      this.props.prNumber
    )
  }

  private renderReady(session: IPRReviewSession) {
    const grouped = groupThreadsByPath(session.threads)
    return (
      <>
        {(session.error || this.state.notice) && (
          <Row>
            <span className="error" role="alert">
              {session.error?.message ?? this.state.notice}
            </span>
          </Row>
        )}
        {session.truncated === true && (
          <Row>
            <span role="status">
              Some review comments couldn't be loaded, so this list may be
              incomplete.
            </span>
          </Row>
        )}
        <Row>
          <h3>PR #{session.prNumber}</h3>
        </Row>
        {grouped.size === 0 && <Row>No comments yet.</Row>}
        {[...grouped.entries()].map(([path, threads]) => (
          <div key={path} className="pr-review-file">
            <h4>{path}</h4>
            {threads.map(t => (
              <div
                key={t.id}
                className={`pr-review-thread${t.resolved ? ' resolved' : ''}`}
              >
                <div className="pr-review-thread__line">Line {t.line}</div>
                {t.comments.map(c => (
                  <div key={c.id} className="pr-review-comment">
                    <strong>{c.author.login}</strong>
                    <span> · </span>
                    <span>{c.body}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        <Row>
          <h4>Add a line comment</h4>
        </Row>
        <Row>
          <TextBox
            label="Path"
            value={this.state.newCommentPath}
            onValueChanged={this.onNewCommentPathChange}
            onKeyDown={this.onDraftFieldKeyDown}
          />
        </Row>
        <Row>
          <TextBox
            label="Line"
            value={this.state.newCommentLine}
            onValueChanged={this.onNewCommentLineChange}
            onKeyDown={this.onDraftFieldKeyDown}
          />
        </Row>
        <Row>
          <TextBox
            label="Comment"
            value={this.state.newCommentBody}
            onValueChanged={this.onNewCommentBodyChange}
            onKeyDown={this.onDraftFieldKeyDown}
          />
        </Row>
        <Row>
          <button
            type="button"
            onClick={this.onAddDraftClick}
            disabled={
              this.state.newCommentBody.trim().length === 0 ||
              this.state.newCommentPath.trim().length === 0 ||
              !/^\d+$/.test(this.state.newCommentLine.trim())
            }
          >
            Add draft
          </button>
        </Row>
        {session.draftComments.length > 0 && (
          <>
            <Row>
              <strong>{session.draftComments.length} pending draft(s)</strong>
            </Row>
            <ul className="pr-review-drafts">
              {session.draftComments.map(d => (
                <li key={d.id} className="pr-review-draft">
                  <span>
                    {d.path}:{d.line} — {d.body}
                  </span>{' '}
                  <button
                    type="button"
                    // eslint-disable-next-line react/jsx-no-bind
                    onClick={() =>
                      this.props.dispatcher.discardReviewDraft(d.id)
                    }
                  >
                    Remove
                    <span className="sr-only">
                      {' '}
                      draft on {d.path} line {d.line}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <fieldset className="pr-review-verdict">
          <legend>Verdict</legend>
          {(['comment', 'approve', 'request_changes'] as const).map(kind => (
            <label key={kind}>
              <input
                type="radio"
                name="verdict"
                value={kind}
                checked={session.verdict.kind === kind}
                onChange={this.onVerdictChange}
              />
              {labelFor(kind)}
            </label>
          ))}
        </fieldset>
        <Row>
          <TextBox
            label="Summary"
            value={session.summary}
            onValueChanged={this.onSummaryChange}
          />
        </Row>
      </>
    )
  }

  private setVerdict(kind: ReviewVerdict['kind']) {
    if (kind === 'pending') {
      return
    }
    this.props.dispatcher.setReviewVerdict({ kind } as ReviewVerdict)
  }

  private onVerdictChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setVerdict(e.currentTarget.value as ReviewVerdict['kind'])
  }

  private onNewCommentPathChange = (p: string) => {
    this.setState({ newCommentPath: p })
  }

  private onNewCommentLineChange = (l: string) => {
    this.setState({ newCommentLine: l })
  }

  private onNewCommentBodyChange = (b: string) => {
    this.setState({ newCommentBody: b })
  }

  private onSummaryChange = (s: string) => {
    this.props.dispatcher.setReviewSummary(s)
  }

  /**
   * Enter in a draft field adds the draft. It must never fall through to the
   * dialog's form submit, which would post the whole review.
   */
  private onDraftFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      this.onAddDraftClick()
    }
  }

  private onAddDraftClick = () => {
    const path = this.state.newCommentPath.trim()
    const line = parseInt(this.state.newCommentLine.trim(), 10)
    const body = this.state.newCommentBody.trim()
    if (!path || !Number.isFinite(line) || !body) {
      return
    }
    this.props.dispatcher.addReviewDraft(path, line, 'RIGHT', body)
    this.setState({
      newCommentBody: '',
      newCommentLine: '',
    })
  }

  private onSubmit = async () => {
    const { session, repository } = this.props
    if (session === null || session.status !== 'ready') {
      return
    }
    if (session.verdict.kind === 'pending') {
      return
    }
    const owner = repository.gitHubRepository?.owner?.login
    const repo = repository.gitHubRepository?.name
    if (!owner || !repo) {
      this.setState({
        notice:
          "This repository isn't linked to GitHub, so the review can't be submitted.",
      })
      return
    }
    this.setState({ notice: null })
    const ok = await this.props.dispatcher.submitReview(owner, repo)
    if (ok) {
      this.props.onDismissed()
    }
  }
}

function labelFor(kind: ReviewVerdict['kind']): string {
  switch (kind) {
    case 'approve':
      return 'Approve'
    case 'request_changes':
      return 'Request changes'
    case 'comment':
      return 'Comment'
    default:
      return 'Pending'
  }
}
