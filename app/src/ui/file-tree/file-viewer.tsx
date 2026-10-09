import * as React from 'react'
import * as Path from 'path'
import memoizeOne from 'memoize-one'
import { Repository } from '../../models/repository'
import { FileViewerContents, MediaViewerContents } from '../../models/file-tree'
import {
  readFileForViewer,
  readMediaForViewer,
  statMtimeMs,
} from '../../lib/file-tree/read-file'
import { getMediaDescriptor } from '../../lib/file-tree/media'
import {
  getDelimitedKind,
  parseDelimited,
} from '../../lib/file-tree/parse-delimited'
import {
  isBrowserViewable,
  openInBrowser,
} from '../../lib/file-tree/open-in-browser'
import { highlight } from '../../lib/highlighter/worker'
import { ITokens } from '../../lib/highlighter/types'
import { syntaxHighlightLine } from '../diff/diff-helpers'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import { Button } from '../lib/button'
import { Emoji } from '../../lib/emoji'
import { getBlame } from '../../lib/git/blame'
import { Blame } from '../../models/blame'
import { findMatches } from '../../lib/file-tree/find-in-file'
import { TextBox } from '../lib/text-box'

/** File extensions rendered as formatted Markdown rather than source. */
const MarkdownExtensions = new Set(['.md', '.markdown', '.mdown', '.mkd'])

/** Whether a path is shown in a formatted view that doesn't need highlighting. */
function isFormattedView(filePath: string): boolean {
  return (
    MarkdownExtensions.has(Path.extname(filePath).toLowerCase()) ||
    getDelimitedKind(filePath) !== null
  )
}

interface IFileViewerProps {
  readonly repository: Repository
  readonly filePath: string | null
  /** Emoji lookup used when rendering Markdown files. */
  readonly emoji: Map<string, Emoji>
  /**
   * Changes whenever the working tree is re-scanned. When it changes the viewer
   * re-checks the open file's modification time and reloads if it changed on
   * disk (e.g. after a pull or checkout).
   */
  readonly reloadToken: number
  /**
   * Bumped by the parent (on Ctrl/Cmd+F) to open the find-in-file bar. The
   * viewer opens find whenever this value increases.
   */
  readonly openFindToken?: number
}

interface IFileViewerState {
  readonly loading: boolean
  readonly contents: FileViewerContents | null
  /** Set instead of `contents` when the file is a renderable image/video. */
  readonly media: MediaViewerContents | null
  /** True for HTML/PDF files that are opened in the default browser instead. */
  readonly browserViewable: boolean
  readonly tokens: ITokens
  readonly error: Error | null
  /** Whether the per-line blame gutter is shown for the code view. */
  readonly showBlame: boolean
  /** Loaded blame for the open file, or null when not yet/loaded. */
  readonly blame: Blame | null
  /** True when loading blame failed (e.g. an untracked file). */
  readonly blameError: boolean
  /** Whether the find-in-file bar is shown. */
  readonly findVisible: boolean
  /** Current find query. */
  readonly findQuery: string
  /** Index of the active match within the current match list. */
  readonly activeMatchIndex: number
}

const TabSize = 4

/** Read-only, syntax-highlighted viewer for a single working-tree file. */
export class FileViewer extends React.Component<
  IFileViewerProps,
  IFileViewerState
> {
  /** Guards against stale async results when the selection changes mid-load. */
  private loadToken = 0

  /** mtime (ms) of the file currently displayed, for change detection. */
  private loadedMtimeMs: number | null = null

  /** Blame guard, paired with loadToken so stale blame results are dropped. */
  private blameToken = 0

  /** The code row for the active find match, so it can be scrolled into view. */
  private activeLineElement: HTMLTableRowElement | null = null

  // Splitting and scanning a large file is O(size); the render, the find bar
  // and match stepping all need the result, so compute each at most once per
  // (content, query) instead of on every call.
  private readonly splitLines = memoizeOne((content: string) =>
    content.split('\n')
  )
  private readonly computeMatches = memoizeOne(
    (content: string, query: string) =>
      findMatches(this.splitLines(content), query)
  )
  private readonly parseRows = memoizeOne(
    (content: string, delimiter: string) => parseDelimited(content, delimiter)
  )

  public constructor(props: IFileViewerProps) {
    super(props)
    this.state = {
      loading: false,
      contents: null,
      media: null,
      browserViewable: false,
      tokens: {},
      error: null,
      showBlame: false,
      blame: null,
      blameError: false,
      findVisible: false,
      findQuery: '',
      activeMatchIndex: 0,
    }
  }

  private onActiveLineRef = (element: HTMLTableRowElement | null) => {
    this.activeLineElement = element
  }

  /**
   * Toggle the blame gutter. Turning it on lazily loads blame for the open
   * file; turning it off clears the loaded blame.
   */
  private toggleBlame = () => {
    const { filePath } = this.props
    if (this.state.showBlame) {
      this.setState({ showBlame: false, blame: null, blameError: false })
      return
    }
    this.setState({ showBlame: true, blameError: false })
    if (filePath !== null) {
      this.loadBlame(filePath)
    }
  }

  private async loadBlame(filePath: string) {
    const token = ++this.blameToken
    try {
      const blame = await getBlame(this.props.repository, filePath)
      if (token === this.blameToken && this.props.filePath === filePath) {
        this.setState({ blame, blameError: false })
      }
    } catch (error) {
      log.warn(`[FileViewer] failed to load blame for ${filePath}`, error)
      if (token === this.blameToken && this.props.filePath === filePath) {
        this.setState({ blame: null, blameError: true })
      }
    }
  }

  /** Matches for the current find query against the open file's lines. */
  private get findMatches() {
    const { contents, findQuery } = this.state
    if (contents === null || !findQuery) {
      return []
    }
    return this.computeMatches(contents.content, findQuery)
  }

  private onFindKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.setState({ findVisible: false })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      this.stepMatch(event.shiftKey ? -1 : 1)
    }
  }

  private onFindQueryChanged = (findQuery: string) => {
    this.setState({ findQuery, activeMatchIndex: 0 })
  }

  private stepMatch = (delta: number) => {
    const count = this.findMatches.length
    if (count === 0) {
      return
    }
    this.setState(prev => ({
      // Clamp first: a reload can leave the stored index past the new end.
      activeMatchIndex:
        (Math.min(prev.activeMatchIndex, count - 1) + delta + count) % count,
    }))
  }

  private onFindNext = () => this.stepMatch(1)
  private onFindPrevious = () => this.stepMatch(-1)

  public componentDidMount() {
    if (this.props.filePath !== null) {
      this.load(this.props.filePath)
    }
  }

  public componentWillUnmount() {
    // Invalidate in-flight loads so their continuations don't setState on a
    // viewer that is gone (tab or section changed mid-read).
    this.loadToken++
    this.blameToken++
  }

  public componentDidUpdate(
    prevProps: IFileViewerProps,
    prevState: IFileViewerState
  ) {
    const { filePath, reloadToken, openFindToken } = this.props
    if (prevProps.filePath !== filePath && filePath !== null) {
      // A different file has its own matches; start from the first.
      this.setState({ activeMatchIndex: 0 })
      this.load(filePath)
    } else if (prevProps.reloadToken !== reloadToken && filePath !== null) {
      this.reloadIfChanged(filePath)
    }

    if (
      openFindToken !== undefined &&
      openFindToken !== prevProps.openFindToken
    ) {
      this.setState({ findVisible: true })
    }

    // Next / Previous / typing a query move the active match; without this the
    // counter changes but the match is usually off-screen on a long file.
    if (
      this.state.findVisible &&
      (prevState.activeMatchIndex !== this.state.activeMatchIndex ||
        prevState.findQuery !== this.state.findQuery)
    ) {
      this.activeLineElement?.scrollIntoView?.({ block: 'center' })
    }
  }

  /** Reload the open file only if its on-disk modification time has changed. */
  private async reloadIfChanged(filePath: string) {
    const mtimeMs = await statMtimeMs(this.props.repository, filePath)
    // Same path may have been swapped out while we stat'd.
    if (this.props.filePath !== filePath) {
      return
    }
    if (mtimeMs !== this.loadedMtimeMs) {
      await this.load(filePath, true)
    }
  }

  /**
   * @param refresh true when re-reading the file already on screen (it changed
   * on disk). The current contents stay visible rather than being swapped for
   * "Loading…", which would discard the scroll position and the find bar.
   */
  private async load(filePath: string, refresh: boolean = false) {
    const { repository } = this.props
    const token = ++this.loadToken
    if (refresh) {
      this.setState({ error: null })
    } else {
      this.setState({
        loading: true,
        error: null,
        blame: null,
        blameError: false,
      })
    }
    // Reload blame for the new file when the gutter is showing.
    if (this.state.showBlame) {
      this.loadBlame(filePath)
    }

    try {
      // HTML/PDF files aren't read inline; they're opened in the browser on
      // demand, so short-circuit before touching the file.
      if (isBrowserViewable(filePath)) {
        const mtimeMs = await statMtimeMs(repository, filePath)
        if (token !== this.loadToken) {
          return
        }
        this.loadedMtimeMs = mtimeMs
        this.setState({
          loading: false,
          contents: null,
          media: null,
          browserViewable: true,
          tokens: {},
          error: null,
        })
        return
      }

      // Image/video files are rendered inline as data URLs rather than read
      // as text and reported as binary. The mtime stat runs alongside the read
      // so the read is still issued synchronously (preserving load ordering).
      if (getMediaDescriptor(filePath) !== null) {
        const [media, mtimeMs] = await Promise.all([
          readMediaForViewer(repository, filePath),
          statMtimeMs(repository, filePath),
        ])
        if (token !== this.loadToken) {
          return
        }
        this.loadedMtimeMs = mtimeMs
        this.setState({
          loading: false,
          contents: null,
          media,
          browserViewable: false,
          tokens: {},
          error: null,
        })
        return
      }

      const [contents, mtimeMs] = await Promise.all([
        readFileForViewer(repository, filePath),
        statMtimeMs(repository, filePath),
      ])
      if (token !== this.loadToken) {
        return
      }
      this.loadedMtimeMs = mtimeMs

      let tokens: ITokens = {}
      if (
        !contents.isBinary &&
        !contents.tooLarge &&
        contents.content !== '' &&
        // Markdown and CSV/TSV are rendered in formatted views, not the
        // syntax-highlighted code table, so skip the highlight pass.
        !isFormattedView(filePath)
      ) {
        const lines = contents.content.split('\n')
        tokens = await highlight(
          lines,
          Path.basename(filePath),
          Path.extname(filePath),
          TabSize,
          lines.map((_, i) => i)
        )
        if (token !== this.loadToken) {
          return
        }
      }

      this.setState({
        loading: false,
        contents,
        media: null,
        browserViewable: false,
        tokens,
        error: null,
      })
    } catch (e) {
      if (token !== this.loadToken) {
        return
      }
      this.loadedMtimeMs = null
      const error = e instanceof Error ? e : new Error(String(e))
      this.setState({
        loading: false,
        contents: null,
        media: null,
        browserViewable: false,
        tokens: {},
        error,
      })
    }
  }

  private renderNotice(message: string): React.JSX.Element {
    return <div className="file-viewer notice">{message}</div>
  }

  private renderOpenError(filePath: string, error: Error): React.JSX.Element {
    return (
      <div className="file-viewer notice" role="alert">
        <p>Could not open this file.</p>
        {error.message && (
          <p className="file-viewer-error-detail">{error.message}</p>
        )}
        <Button onClick={this.onRetry}>Retry</Button>
      </div>
    )
  }

  private onRetry = () => {
    const { filePath } = this.props
    if (filePath !== null) {
      this.load(filePath)
    }
  }

  public render() {
    const { filePath } = this.props
    const { loading, contents, media, browserViewable, tokens, error } =
      this.state

    if (filePath === null) {
      return this.renderNotice('Select a file to view its contents.')
    }
    if (loading) {
      return this.renderNotice('Loading…')
    }
    if (error !== null) {
      return this.renderOpenError(filePath, error)
    }
    if (browserViewable) {
      return this.renderBrowserViewable(filePath)
    }
    if (media !== null) {
      return this.renderMedia(filePath, media)
    }
    if (contents === null) {
      return this.renderNotice('Select a file to view its contents.')
    }
    if (contents.isBinary) {
      return this.renderNotice('Binary file not shown.')
    }
    if (contents.tooLarge) {
      return this.renderNotice('File is too large to display.')
    }
    if (contents.content === '') {
      return this.renderNotice('This file is empty.')
    }

    if (MarkdownExtensions.has(Path.extname(filePath).toLowerCase())) {
      return this.renderMarkdown(filePath, contents.content)
    }

    const delimited = getDelimitedKind(filePath)
    if (delimited !== null) {
      return this.renderDelimited(contents.content, delimited.delimiter)
    }

    const lines = this.splitLines(contents.content)
    const { showBlame, blame, findVisible } = this.state
    const matches = this.findMatches
    // The stored index can outlive the match list it pointed into (the file
    // was reloaded with fewer matches), so clamp rather than index past the end.
    const activeMatch =
      matches[Math.min(this.state.activeMatchIndex, matches.length - 1)]
    return (
      <div className="file-viewer">
        <div className="file-viewer-toolbar">
          <Button onClick={this.toggleBlame}>
            {showBlame ? 'Hide blame' : 'Blame'}
          </Button>
          <Button onClick={this.toggleFind}>
            {findVisible ? 'Hide find' : 'Find'}
          </Button>
          {this.renderBlameStatus()}
        </div>
        {findVisible && this.renderFindBar(matches.length)}
        {/* cm-s-default scopes the CodeMirror syntax theme so the cm-* token
            classes emitted by syntaxHighlightLine pick up their colours. */}
        <table className="file-viewer-code cm-s-default">
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={i}
                ref={
                  activeMatch !== undefined && activeMatch.line === i
                    ? this.onActiveLineRef
                    : undefined
                }
                className={
                  activeMatch !== undefined && activeMatch.line === i
                    ? 'file-viewer-line is-find-active'
                    : 'file-viewer-line'
                }
              >
                {showBlame ? this.renderBlameCell(blame, i) : null}
                <td className="line-number">{i + 1}</td>
                <td className="line-content">
                  {syntaxHighlightLine(line, [tokens[i] ?? {}])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  /** Say what the blame gutter is doing instead of leaving it blank. */
  private renderBlameStatus(): React.JSX.Element | null {
    const { showBlame, blame, blameError } = this.state
    if (!showBlame) {
      return null
    }
    if (blameError) {
      return (
        <span className="file-viewer-blame-status" role="status">
          Blame unavailable for this file (is it tracked by Git?).
        </span>
      )
    }
    if (blame === null) {
      return (
        <span className="file-viewer-blame-status" role="status">
          Loading blame…
        </span>
      )
    }
    return null
  }

  private toggleFind = () => {
    this.setState(prev => ({ findVisible: !prev.findVisible }))
  }

  /** Render the find-in-file bar: query input, match count, and navigation. */
  private renderFindBar(matchCount: number): React.JSX.Element {
    const current =
      matchCount === 0
        ? 0
        : Math.min(this.state.activeMatchIndex, matchCount - 1) + 1
    return (
      <div className="file-viewer-find">
        <TextBox
          autoFocus={true}
          placeholder="Find in file…"
          ariaLabel="Find in file"
          value={this.state.findQuery}
          onValueChanged={this.onFindQueryChanged}
          onKeyDown={this.onFindKeyDown}
        />
        <span className="file-viewer-find-count">
          {current} of {matchCount}
        </span>
        <Button onClick={this.onFindPrevious} disabled={matchCount === 0}>
          Previous
        </Button>
        <Button onClick={this.onFindNext} disabled={matchCount === 0}>
          Next
        </Button>
      </div>
    )
  }

  /**
   * Render the blame gutter cell for a code line. When the line repeats the
   * commit of the line above, the attribution is suppressed so contiguous
   * blocks read as a single annotation.
   */
  private renderBlameCell(
    blame: Blame | null,
    index: number
  ): React.JSX.Element {
    const entry = blame?.[index]
    if (entry === undefined) {
      return <td className="file-viewer-blame" />
    }
    const previous = blame?.[index - 1]
    const repeats = previous !== undefined && previous.sha === entry.sha
    if (repeats) {
      return <td className="file-viewer-blame is-repeat" />
    }
    return (
      <td className="file-viewer-blame">
        <span className="blame-author">{entry.author}</span>
        <span className="blame-sha">{entry.sha.substring(0, 8)}</span>
      </td>
    )
  }

  private renderMedia(
    filePath: string,
    media: MediaViewerContents
  ): React.JSX.Element {
    if (media.tooLarge) {
      return this.renderNotice('File is too large to display.')
    }

    const name = Path.basename(filePath)
    return (
      <div className="file-viewer file-viewer-media">
        {media.kind === 'image' ? (
          <img className="file-viewer-image" src={media.dataUrl} alt={name} />
        ) : (
          // A working-tree video file has no caption track to offer.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            className="file-viewer-video"
            src={media.dataUrl}
            controls={true}
          />
        )}
      </div>
    )
  }

  private onOpenInBrowser = () => {
    if (this.props.filePath !== null) {
      openInBrowser(this.props.repository, this.props.filePath)
    }
  }

  private renderBrowserViewable(filePath: string): React.JSX.Element {
    const name = Path.basename(filePath)
    const isPdf = Path.extname(filePath).toLowerCase() === '.pdf'
    const kind = isPdf ? 'PDF' : 'HTML'
    return (
      <div className="file-viewer file-viewer-browser">
        <div className="file-viewer-browser-card">
          <p>
            {name} is best viewed as a rendered {kind} document.
          </p>
          <Button type="submit" onClick={this.onOpenInBrowser}>
            Open in browser
          </Button>
        </div>
      </div>
    )
  }

  private renderDelimited(
    content: string,
    delimiter: string
  ): React.JSX.Element {
    const rows = this.parseRows(content, delimiter)
    if (rows.length === 0) {
      return this.renderNotice('This file is empty.')
    }

    const [header, ...body] = rows
    return (
      <div className="file-viewer file-viewer-table">
        <table className="delimited-table">
          <thead>
            <tr>
              <th className="delimited-row-number" />
              {header.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                <td className="delimited-row-number">{r + 1}</td>
                {row.map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  private renderMarkdown(
    filePath: string,
    markdown: string
  ): React.JSX.Element {
    return (
      <div className="file-viewer file-viewer-markdown">
        <SandboxedMarkdown
          markdown={markdown}
          emoji={this.props.emoji}
          underlineLinks={true}
          ariaLabel={`Rendered Markdown for ${Path.basename(filePath)}`}
        />
      </div>
    )
  }
}
