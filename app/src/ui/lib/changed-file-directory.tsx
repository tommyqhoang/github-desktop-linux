import * as React from 'react'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IChangedFileDirectoryProps {
  readonly name: string
  readonly depth: number
  readonly expanded: boolean
}

/** A folder row shared by the working-tree and commit file lists. */
export class ChangedFileDirectory extends React.PureComponent<IChangedFileDirectoryProps> {
  public render() {
    const { name, depth, expanded } = this.props
    return (
      <div
        className="changed-file-directory-row"
        style={{ paddingLeft: `calc(var(--spacing) + ${depth * 12}px)` }}
      >
        <Octicon
          className="changed-file-directory-chevron"
          symbol={expanded ? octicons.chevronDown : octicons.chevronRight}
        />
        <Octicon
          className="changed-file-directory-icon"
          symbol={
            expanded
              ? octicons.fileDirectoryOpenFill
              : octicons.fileDirectory
          }
        />
        <span className="changed-file-directory-name">{name}</span>
      </div>
    )
  }
}
