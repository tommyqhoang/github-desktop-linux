import * as React from 'react'
import * as Path from 'path'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IFileTabsProps {
  /** Open file paths, in tab order. */
  readonly openFilePaths: ReadonlyArray<string>
  /** The currently focused tab, or null when none is open. */
  readonly activeFilePath: string | null
  readonly onSelectTab: (path: string) => void
  readonly onCloseTab: (path: string) => void
  readonly onCloseAll: () => void
}

/**
 * The tab strip shown above the Files viewer. Renders one tab per open file
 * with a per-tab close button, plus a "close all" action when more than one
 * tab is open.
 */
export class FileTabs extends React.Component<IFileTabsProps> {
  public render() {
    const { openFilePaths, activeFilePath } = this.props

    if (openFilePaths.length === 0) {
      return null
    }

    return (
      <div className="file-tabs" role="tablist">
        <div className="file-tabs-strip">
          {openFilePaths.map(path =>
            this.renderTab(path, path === activeFilePath)
          )}
        </div>
        {openFilePaths.length > 1 && (
          <button
            type="button"
            className="file-tabs-close-all"
            onClick={this.props.onCloseAll}
          >
            Close all
          </button>
        )}
      </div>
    )
  }

  private renderTab(path: string, isActive: boolean): JSX.Element {
    const name = Path.basename(path)
    const className = 'file-tab' + (isActive ? ' active' : '')
    return (
      <div key={path} className={className} role="presentation">
        <button
          type="button"
          className="file-tab-select"
          role="tab"
          aria-selected={isActive}
          // Screen readers get the full repo-relative path; sighted users get
          // the base name and can hover for the rest via overflow.
          aria-label={path}
          onClick={this.onSelect(path)}
          onMouseDown={this.onMiddleClick(path)}
        >
          <span className="file-tab-name">{name}</span>
        </button>
        <button
          type="button"
          className="file-tab-close"
          aria-label={`Close ${name}`}
          onClick={this.onClose(path)}
        >
          <Octicon symbol={octicons.x} />
        </button>
      </div>
    )
  }

  private onSelect = (path: string) => () => this.props.onSelectTab(path)

  private onClose = (path: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    this.props.onCloseTab(path)
  }

  /** Middle-click closes a tab, matching common editor behaviour. */
  private onMiddleClick = (path: string) => (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      this.props.onCloseTab(path)
    }
  }
}
