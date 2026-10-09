import { renderToStaticMarkup } from 'react-dom/server'
import { PRReviewDialog } from '../../../src/ui/pull-request-review/pr-review-dialog'
import { Repository } from '../../../src/models/repository'
import { IPRReviewSession } from '../../../src/models/pull-request-review'

const repo = new Repository('/tmp/r', 1, null, false)

const session = (over: Partial<IPRReviewSession> = {}): IPRReviewSession => ({
  prNumber: 7,
  repoId: 1,
  status: 'ready',
  threads: [],
  draftComments: [],
  verdict: { kind: 'pending' },
  summary: '',
  error: null,
  ...over,
})

function make(s: IPRReviewSession | null) {
  const dispatcher = {
    openPullRequestReview: jest.fn(),
    addReviewDraft: jest.fn(),
    discardReviewDraft: jest.fn(),
    submitReview: jest.fn().mockResolvedValue(true),
    setReviewVerdict: jest.fn(),
    setReviewSummary: jest.fn(),
  }
  const onDismissed = jest.fn()
  const dialog = new PRReviewDialog({
    dispatcher: dispatcher as any,
    repository: repo,
    prNumber: 7,
    session: s,
    onDismissed,
  })
  ;(dialog as any).setState = function (p: any) {
    this.state = { ...this.state, ...p }
  }
  return { dialog, dispatcher, onDismissed }
}

const html = (d: PRReviewDialog, s: IPRReviewSession) =>
  renderToStaticMarkup((d as any).renderReady(s))

describe('PRReviewDialog', () => {
  it('Enter in a draft field adds the draft and never submits', () => {
    const { dialog, dispatcher } = make(session())
    dialog.state = {
      ...dialog.state,
      newCommentPath: 'a.ts',
      newCommentLine: '3',
      newCommentBody: 'hello',
    }
    const preventDefault = jest.fn()
    ;(dialog as any).onDraftFieldKeyDown({ key: 'Enter', preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(dispatcher.addReviewDraft).toHaveBeenCalledWith(
      'a.ts',
      3,
      'RIGHT',
      'hello'
    )
    expect(dispatcher.submitReview).not.toHaveBeenCalled()
  })

  it('renders an error state with Retry that reopens the review', () => {
    const s = session({ status: 'error', error: new Error('boom') })
    const { dialog, dispatcher } = make(s)
    const out = renderToStaticMarkup((dialog as any).renderLoadError(s))
    expect(out).toContain('role="alert"')
    expect(out).toContain('boom')
    expect(out).toContain('Retry')
    ;(dialog as any).onRetryClick()
    expect(dispatcher.openPullRequestReview).toHaveBeenCalledWith(repo, 7)
  })

  it('lists drafts with a remove button that discards them', () => {
    const s = session({
      draftComments: [
        { id: 'd1', path: 'a.ts', line: 2, side: 'RIGHT', body: 'fix this' },
      ],
    })
    const { dialog } = make(s)
    const out = html(dialog, s)
    expect(out).toContain('fix this')
    expect(out).toContain('Remove')
  })

  it('wraps the verdict radios in a fieldset with a legend', () => {
    const { dialog } = make(session())
    const out = html(dialog, session())
    expect(out).toContain('<fieldset')
    expect(out).toContain('<legend>Verdict</legend>')
  })

  it('shows a visible hint while no verdict is chosen', () => {
    const { dialog } = make(session())
    const out = renderToStaticMarkup(
      (dialog as any).renderSubmitHint(session())
    )
    expect(out).toContain('Choose a verdict')
    expect(
      (dialog as any).renderSubmitHint(
        session({ verdict: { kind: 'approve' } })
      )
    ).toBeNull()
  })

  it('tells the user when the repository has no GitHub remote', async () => {
    const s = session({ verdict: { kind: 'approve' } })
    const { dialog, dispatcher } = make(s)
    await (dialog as any).onSubmit()
    expect(dialog.state.notice).toMatch(/isn't linked to GitHub/)
    expect(dispatcher.submitReview).not.toHaveBeenCalled()
  })

  it('shows a truncation notice', () => {
    const s = session({ truncated: true })
    const { dialog } = make(s)
    expect(html(dialog, s)).toContain('may be incomplete')
  })

  it('marks loading text as a status', () => {
    const { dialog } = make(null)
    expect(renderToStaticMarkup((dialog as any).renderLoading())).toContain(
      'role="status"'
    )
  })
})
