import * as React from 'react'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IChangedFileDirectoryProps {
  readonly name: string
  readonly path: string
  readonly depth: number
  readonly expanded: boolean
  readonly onToggleFolder: (path: string) => void
}

/** A folder row shared by the working-tree and commit file lists. */
export class ChangedFileDirectory extends React.PureComponent<IChangedFileDirectoryProps> {
  private onChevronClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    this.props.onToggleFolder(this.props.path)
  }

  public render() {
    const { name, path, depth, expanded } = this.props
    return (
      <div
        className="changed-file-directory-row"
        style={{ paddingLeft: `calc(var(--spacing) + ${depth * 12}px)` }}
      >
        <button
          type="button"
          className="changed-file-directory-chevron-toggle"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${path}`}
          aria-expanded={expanded}
          tabIndex={-1}
          onClick={this.onChevronClick}
        >
          <Octicon
            className="changed-file-directory-chevron"
            symbol={expanded ? octicons.chevronDown : octicons.chevronRight}
          />
        </button>
        <Octicon
          className="changed-file-directory-icon"
          symbol={
            expanded ? octicons.fileDirectoryOpenFill : octicons.fileDirectory
          }
        />
        <span className="changed-file-directory-name">{name}</span>
      </div>
    )
  }
}
