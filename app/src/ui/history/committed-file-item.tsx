import * as React from 'react'

import { CommittedFileChange } from '../../models/status'
import { mapStatus } from '../../lib/status'
import { PathLabel } from '../lib/path-label'
import { Octicon, iconForStatus } from '../octicons'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface ICommittedFileItemProps {
  readonly availableWidth: number
  readonly file: CommittedFileChange
  readonly focused: boolean
  readonly depth?: number
  readonly displayPath?: string
}

export class CommittedFileItem extends React.Component<ICommittedFileItemProps> {
  public render() {
    const { file, focused } = this.props
    const depth = this.props.depth ?? 0
    const { status } = file
    const fileStatus = mapStatus(status)

    const listItemPadding = 10 * 2
    const statusWidth = 16
    const filePathPadding = 5
    const treeIndent = depth > 0 ? depth * 12 + 36 : 0
    const availablePathWidth =
      this.props.availableWidth -
      listItemPadding -
      filePathPadding -
      statusWidth -
      treeIndent

    return (
      <div
        className="file"
        style={
          treeIndent > 0
            ? { paddingLeft: `calc(var(--spacing) + ${treeIndent}px)` }
            : undefined
        }
      >
        <PathLabel
          path={this.props.displayPath ?? file.path}
          status={file.status}
          availableWidth={availablePathWidth}
          ariaHidden={true}
        />
        <TooltippedContent
          ancestorFocused={focused}
          openOnFocus={true}
          tooltip={fileStatus}
          direction={TooltipDirection.NORTH}
        >
          <Octicon
            symbol={iconForStatus(status)}
            className={'status status-' + fileStatus.toLowerCase()}
          />
        </TooltippedContent>
      </div>
    )
  }
}
