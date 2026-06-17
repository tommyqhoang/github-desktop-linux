import * as React from 'react'
import * as Path from 'path'
import { Repository } from '../../models/repository'
import { FileViewerContents } from '../../models/file-tree'
import { readFileForViewer } from '../../lib/file-tree/read-file'
import { highlight } from '../../lib/highlighter/worker'
import { ITokens } from '../../lib/highlighter/types'
import { syntaxHighlightLine } from '../diff/diff-helpers'

interface IFileViewerProps {
  readonly repository: Repository
  readonly filePath: string | null
}

interface IFileViewerState {
  readonly loading: boolean
  readonly contents: FileViewerContents | null
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

  public constructor(props: IFileViewerProps) {
    super(props)
    this.state = { loading: false, contents: null, tokens: {}, error: null }
  }

  public componentDidMount() {
    if (this.props.filePath !== null) {
      this.load(this.props.filePath)
    }
  }

  public componentDidUpdate(prevProps: IFileViewerProps) {
    if (
      prevProps.filePath !== this.props.filePath &&
      this.props.filePath !== null
    ) {
      this.load(this.props.filePath)
    }
  }

  private async load(filePath: string) {
    const token = ++this.loadToken
    this.setState({ loading: true, error: null })

    try {
      const contents = await readFileForViewer(this.props.repository, filePath)
      if (token !== this.loadToken) {
        return
      }

      let tokens: ITokens = {}
      if (!contents.isBinary && !contents.tooLarge && contents.content !== '') {
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

      this.setState({ loading: false, contents, tokens, error: null })
    } catch (e) {
      if (token !== this.loadToken) {
        return
      }
      const error = e instanceof Error ? e : new Error(String(e))
      this.setState({ loading: false, contents: null, tokens: {}, error })
    }
  }

  private renderNotice(message: string): JSX.Element {
    return <div className="file-viewer notice">{message}</div>
  }

  public render() {
    const { filePath } = this.props
    const { loading, contents, tokens, error } = this.state

    if (filePath === null) {
      return this.renderNotice('Select a file to view its contents.')
    }
    if (loading) {
      return this.renderNotice('Loading…')
    }
    if (error !== null) {
      return this.renderNotice('Could not open this file.')
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

    const lines = contents.content.split('\n')
    return (
      <div className="file-viewer">
        <table className="file-viewer-code">
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
}
