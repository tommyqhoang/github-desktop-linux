import * as React from 'react'
import * as Path from 'path'
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

  public constructor(props: IFileViewerProps) {
    super(props)
    this.state = {
      loading: false,
      contents: null,
      media: null,
      browserViewable: false,
      tokens: {},
      error: null,
    }
  }

  public componentDidMount() {
    if (this.props.filePath !== null) {
      this.load(this.props.filePath)
    }
  }

  public componentDidUpdate(prevProps: IFileViewerProps) {
    const { filePath, reloadToken } = this.props
    if (prevProps.filePath !== filePath && filePath !== null) {
      this.load(filePath)
    } else if (prevProps.reloadToken !== reloadToken && filePath !== null) {
      this.reloadIfChanged(filePath)
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
      await this.load(filePath)
    }
  }

  private async load(filePath: string) {
    const { repository } = this.props
    const token = ++this.loadToken
    this.setState({ loading: true, error: null })

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

  private renderNotice(message: string): JSX.Element {
    return <div className="file-viewer notice">{message}</div>
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
      return this.renderNotice('Could not open this file.')
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

    const lines = contents.content.split('\n')
    return (
      <div className="file-viewer">
        {/* cm-s-default scopes the CodeMirror syntax theme so the cm-* token
            classes emitted by syntaxHighlightLine pick up their colours. */}
        <table className="file-viewer-code cm-s-default">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="file-viewer-line">
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

  private renderMedia(
    filePath: string,
    media: MediaViewerContents
  ): JSX.Element {
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

  private renderBrowserViewable(filePath: string): JSX.Element {
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

  private renderDelimited(content: string, delimiter: string): JSX.Element {
    const rows = parseDelimited(content, delimiter)
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

  private renderMarkdown(filePath: string, markdown: string): JSX.Element {
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
