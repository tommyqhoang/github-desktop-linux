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
  /** Right-clicking a tab opens a close-management context menu. */
  readonly onTabContextMenu: (path: string) => void
  /** Drag-to-reorder: move `fromPath` into the slot held by `toPath`. */
  readonly onReorderTab: (fromPath: string, toPath: string) => void
}

interface IFileTabsState {
  /** The tab currently being dragged, or null when no drag is in progress. */
  readonly draggingPath: string | null
  /** The tab the dragged tab is hovering over, for a drop-target indicator. */
  readonly dragOverPath: string | null
}

/**
 * The tab strip shown above the Files viewer. Renders one tab per open file
 * with a per-tab close button, plus a "close all" action when more than one
 * tab is open. Tabs can be reordered by dragging, overflow horizontally when
 * they exceed the strip width, and the active tab is kept scrolled into view.
 */
export class FileTabs extends React.Component<IFileTabsProps, IFileTabsState> {
  private readonly stripRef = React.createRef<HTMLDivElement>()
  private activeTabRef: HTMLDivElement | null = null

  public constructor(props: IFileTabsProps) {
    super(props)
    this.state = { draggingPath: null, dragOverPath: null }
  }

  public componentDidUpdate(prevProps: IFileTabsProps) {
    // Keep the active tab visible when it changes (e.g. opening a file whose
    // tab sits past the overflow edge).
    if (prevProps.activeFilePath !== this.props.activeFilePath) {
      this.activeTabRef?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  public render() {
    const { openFilePaths, activeFilePath } = this.props

    if (openFilePaths.length === 0) {
      return null
    }

    return (
      <div className="file-tabs" role="tablist">
        <div
          className="file-tabs-strip"
          ref={this.stripRef}
          onWheel={this.onWheel}
        >
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
    const className =
      'file-tab' +
      (isActive ? ' active' : '') +
      (this.state.draggingPath === path ? ' dragging' : '') +
      (this.state.dragOverPath === path ? ' drag-over' : '')
    return (
      <div
        key={path}
        className={className}
        role="presentation"
        ref={isActive ? this.onActiveTabRef : undefined}
        draggable={true}
        onDragStart={this.onDragStart(path)}
        onDragOver={this.onDragOver(path)}
        onDrop={this.onDrop(path)}
        onDragEnd={this.onDragEnd}
        onContextMenu={this.onContextMenu(path)}
      >
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

  private onActiveTabRef = (ref: HTMLDivElement | null) => {
    this.activeTabRef = ref
  }

  private onSelect = (path: string) => () => this.props.onSelectTab(path)

  private onContextMenu = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    this.props.onTabContextMenu(path)
  }

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

  private onDragStart = (path: string) => (e: React.DragEvent) => {
    // Mark the drag as a move so the cursor reflects the reorder intent.
    e.dataTransfer.effectAllowed = 'move'
    this.setState({ draggingPath: path })
  }

  private onDragOver = (path: string) => (e: React.DragEvent) => {
    if (this.state.draggingPath === null) {
      return
    }
    // Allow the drop and flag the hovered tab as the drop target.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (this.state.dragOverPath !== path) {
      this.setState({ dragOverPath: path })
    }
  }

  private onDrop = (path: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const { draggingPath } = this.state
    if (draggingPath !== null && draggingPath !== path) {
      this.props.onReorderTab(draggingPath, path)
    }
    this.setState({ draggingPath: null, dragOverPath: null })
  }

  private onDragEnd = () => {
    this.setState({ draggingPath: null, dragOverPath: null })
  }

  /** Translate vertical wheel scrolling into horizontal tab-strip scrolling. */
  private onWheel = (e: React.WheelEvent) => {
    const strip = this.stripRef.current
    if (strip === null || e.deltaY === 0) {
      return
    }
    // Only hijack the wheel when there's actually overflow to scroll.
    if (strip.scrollWidth > strip.clientWidth) {
      strip.scrollLeft += e.deltaY
    }
  }
}
