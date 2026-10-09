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
  /** Polite live-region text announcing keyboard reorders. */
  readonly announcement: string
}

let nextInstanceId = 0

/**
 * The tab strip shown above the Files viewer. Renders one tab per open file
 * with a per-tab close button, plus a "close all" action when more than one
 * tab is open. Tabs can be reordered by dragging, overflow horizontally when
 * they exceed the strip width, and the active tab is kept scrolled into view.
 */
export class FileTabs extends React.Component<IFileTabsProps, IFileTabsState> {
  private readonly stripRef = React.createRef<HTMLDivElement>()
  private activeTabRef: HTMLDivElement | null = null
  private readonly idPrefix = `file-tabs-${nextInstanceId++}`

  public constructor(props: IFileTabsProps) {
    super(props)
    this.state = { draggingPath: null, dragOverPath: null, announcement: '' }
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
      <div className="file-tabs">
        <div
          className="file-tabs-strip"
          role="tablist"
          aria-label="Open files"
          ref={this.stripRef}
          onWheel={this.onWheel}
        >
          {openFilePaths.map((path, index) =>
            this.renderTab(
              path,
              path === activeFilePath,
              index,
              // Roving tabindex: exactly one tab is a Tab stop.
              activeFilePath !== null && openFilePaths.includes(activeFilePath)
                ? path === activeFilePath
                : index === 0
            )
          )}
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {this.state.announcement}
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

  private renderTab(
    path: string,
    isActive: boolean,
    index: number,
    isTabStop: boolean
  ): React.JSX.Element {
    const name = Path.basename(path)
    const descriptionId = `${this.idPrefix}-path-${index}`
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
          tabIndex={isTabStop ? 0 : -1}
          // The visible base name is the accessible name; the full
          // repo-relative path is exposed as the description.
          aria-describedby={descriptionId}
          onClick={this.onSelect(path)}
          onMouseDown={this.onMiddleClick(path)}
          onKeyDown={this.onTabKeyDown(path)}
        >
          <span className="file-tab-name">{name}</span>
          <span id={descriptionId} className="sr-only">
            {path}
          </span>
        </button>
        <button
          type="button"
          className="file-tab-close"
          // Not a Tab stop (roving tabindex); keyboard users press Delete on
          // the tab instead.
          tabIndex={-1}
          aria-label={`Close ${name}`}
          onClick={this.onClose(path)}
        >
          <Octicon symbol={octicons.x} />
        </button>
      </div>
    )
  }

  private focusTabAt(index: number) {
    const tabs =
      this.stripRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs?.[index]?.focus()
  }

  /**
   * WAI-ARIA tabs: Left/Right/Home/End move and activate, Delete closes,
   * Ctrl+Shift+Left/Right reorder the focused tab.
   */
  private onTabKeyDown = (path: string) => (e: React.KeyboardEvent) => {
    const paths = this.props.openFilePaths
    const ix = paths.indexOf(path)
    if (ix === -1) {
      return
    }
    const isLeft = e.key === 'ArrowLeft'
    const isRight = e.key === 'ArrowRight'

    if ((isLeft || isRight) && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      const to = ix + (isLeft ? -1 : 1)
      if (to < 0 || to >= paths.length) {
        return
      }
      this.props.onReorderTab(path, paths[to])
      this.setState({
        announcement: `Moved ${Path.basename(path)} to position ${to + 1} of ${
          paths.length
        }`,
      })
      return
    }
    if (e.key === 'Delete' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault()
      this.props.onCloseTab(path)
      return
    }
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
      return
    }
    let next: number | null = null
    if (isLeft) {
      next = (ix - 1 + paths.length) % paths.length
    } else if (isRight) {
      next = (ix + 1) % paths.length
    } else if (e.key === 'Home') {
      next = 0
    } else if (e.key === 'End') {
      next = paths.length - 1
    }
    if (next === null) {
      return
    }
    e.preventDefault()
    this.props.onSelectTab(paths[next])
    this.focusTabAt(next)
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
