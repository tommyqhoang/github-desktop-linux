import { clipboard as sharedClipboard } from '../lib/clipboard'
import { macTerminalKeySequence } from '../../lib/terminal/mac-key-bindings'
import * as React from 'react'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'
import {
  filePathRegex,
  parseFilePathMatch,
} from '../../lib/terminal/link-matchers'
import { OscParser } from '../../lib/terminal/osc-parser'
import {
  loadTerminalScrollback,
  saveTerminalScrollback,
} from '../../lib/terminal/scrollback'
import {
  CommandBlockTracker,
  ICommandBlock,
  extractBlockText,
} from '../../lib/terminal/command-blocks'

/**
 * Thin React wrapper that mounts an xterm.js Terminal into a div ref and
 * keeps it bound to a `MessagePort`-shaped object for byte traffic.
 *
 * Important: this component never re-renders on terminal data. The xterm
 * instance owns its DOM. React state changes only flow through here on
 * theme / size / port-binding events.
 *
 * The view also handles:
 *   - FitAddon: continuously sizes xterm to its container so the prompt
 *     fills the panel width and `clear` doesn't leave dead space.
 *   - Resize forwarding: when the container changes size, the new
 *     cols/rows are posted to the PTY over the message port.
 *   - Clipboard: Ctrl+Shift+C / Ctrl+Insert copies the selection,
 *     Ctrl+Shift+V / Shift+Insert pastes from the system clipboard.
 *     Right-click also copies/pastes.
 */

/** Subset of `MessagePort` used by the view. Tests can pass a fake. */
export interface IXtermViewPort {
  onmessage?: ((event: { data: any }) => void) | null
  postMessage(message: any, transferables?: any[]): void
  start?(): void
  addEventListener?(event: 'message', cb: (event: { data: any }) => void): void
}

/** Renderer backend selection for the xterm.js view. */
export type RendererPreference = 'webgl' | 'canvas' | 'dom'

export interface IXtermViewProps {
  /** Active session port; null = render placeholder. */
  readonly port: IXtermViewPort | null
  readonly theme: ITerminalThemeColors
  /** Optional override of the xterm constructor for tests. */
  readonly terminalFactory?: () => IRuntimeTerminal
  /**
   * Optional override of the FitAddon factory for tests. Default loads
   * the real `@xterm/addon-fit`.
   */
  readonly fitAddonFactory?: () => IRuntimeFitAddon
  /**
   * Optional override of the clipboard adapter for tests. Default uses
   * Electron's native `clipboard` module.
   */
  readonly clipboard?: IClipboard
  /**
   * Renderer preference. Default `'webgl'` with auto-fallback to canvas
   * on WebGL context loss or load failure. `'canvas'` skips WebGL and
   * loads the canvas addon directly. `'dom'` loads neither, leaving
   * xterm's built-in DOM renderer in place.
   */
  readonly rendererPreference?: RendererPreference
  /** Test injection: produce a WebGL addon. */
  readonly webglAddonFactory?: () => any
  /** Test injection: produce a Canvas addon. */
  readonly canvasAddonFactory?: () => any
  /** Test injection: produce a Unicode11 addon. */
  readonly unicode11AddonFactory?: () => any
  /** Test injection: produce a Ligatures addon. */
  readonly ligaturesAddonFactory?: () => any
  /** Test injection: produce a WebLinks addon. */
  readonly webLinksAddonFactory?: () => any
  /** Test injection: produce a Search addon. */
  readonly searchAddonFactory?: () => any
  /** Test injection: produce a Serialize addon. */
  readonly serializeAddonFactory?: () => any
  /**
   * Session identifier used to persist and restore scrollback across restarts.
   * When set, the buffer is serialized to localStorage on unmount and restored
   * on mount. Keyed as `terminal-scrollback-v1:<sessionId>`.
   */
  readonly sessionId?: string
  /**
   * Cell font size in CSS px. Applied to xterm options on mount and
   * re-applied (with a re-fit) when the prop changes. Defaults to 13.
   */
  readonly fontSize?: number
  /**
   * Maximum scrollback line count retained by xterm. Applied on mount
   * and on prop change. Defaults to 5000.
   */
  readonly scrollback?: number
  /**
   * Click handler for clickable diagnostic-style file paths printed by
   * the shell (e.g. `src/foo.ts:42:7`). Invoked with the parsed path,
   * line, and column. When unset the matcher is not registered.
   */
  readonly onFilePathClick?: (
    path: string,
    line: number,
    column: number | null
  ) => void
  /**
   * Called instead of a direct paste when the pasted text meets the
   * multi-line / long-line threshold. The caller is expected to show a
   * confirmation dialog and, if confirmed, call `this.terminal.paste(text)`
   * or send the text via the session port.
   */
  readonly onPasteConfirmRequired?: (text: string) => void
}

/** Runtime contract for the xterm instance the view manipulates. */
export interface IRuntimeTerminal {
  options?: Record<string, any>
  cols: number
  rows: number
  buffer?: any
  open(container: HTMLElement): void
  write(data: string | Uint8Array, callback?: () => void): void
  paste(data: string): void
  focus(): void
  hasSelection(): boolean
  getSelection(): string
  clearSelection(): void
  scrollToBottom?(): void
  clear?(): void
  onData(cb: (data: string) => void): { dispose(): void }
  onResize(cb: (size: { cols: number; rows: number }) => void): {
    dispose(): void
  }
  onScroll?(cb: (newYDisp: number) => void): { dispose(): void }
  onWriteParsed?(cb: () => void): { dispose(): void }
  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void
  loadAddon(addon: any): void
  setOption?(key: string, value: any): void
  dispose(): void
}

export interface IRuntimeFitAddon {
  fit(): void
  dispose?(): void
}

/**
 * Clipboard adapter. Electron 40+ no longer exposes `clipboard` to the
 * renderer at all, so access is async and goes through the main process.
 * Treating the result as a synchronous string silently turned every paste
 * into a no-op.
 */
export interface IClipboard {
  readText(): Promise<string>
  writeText(text: string): Promise<void>
}

const defaultClipboard: IClipboard = sharedClipboard

interface IXtermViewState {
  /** False when the viewport is scrolled above the bottom of the buffer. */
  readonly isAtBottom: boolean
}

export class XtermView extends React.Component<
  IXtermViewProps,
  IXtermViewState
> {
  private static readonly RESIZE_THROTTLE_MS = 32

  private container = React.createRef<HTMLDivElement>()
  private term: IRuntimeTerminal | null = null
  private fitAddon: IRuntimeFitAddon | null = null
  private webglAddon: any | null = null
  private canvasAddon: any | null = null
  private unicode11Addon: any | null = null
  private ligaturesAddon: any | null = null
  private webLinksAddon: any | null = null
  private searchAddon: any | null = null
  private serializeAddon: any | null = null
  private fileLinkMatcherId: number | null = null
  private dataDispose: { dispose(): void } | null = null
  private resizeDispose: { dispose(): void } | null = null
  private resizeObserver: ResizeObserver | null = null
  /** rAF handle for a coalesced fit, cancelled on unmount. */
  private fitRaf: number | null = null
  private boundPort: IXtermViewPort | null = null
  private incomingHandler: ((event: { data: any }) => void) | null = null
  private boundUsedAddEventListener = false
  private clipboard: IClipboard
  private pendingResize: { cols: number; rows: number } | null = null
  private resizeTimer: ReturnType<typeof setTimeout> | null = null
  private pasteHandler: ((e: ClipboardEvent) => void) | null = null
  /** Cached element to which `pasteHandler` was attached. Avoids a null-ref at detach time. */
  private pasteTarget: HTMLDivElement | null = null
  private scrollDispose: { dispose(): void } | null = null
  private writeParsedDispose: { dispose(): void } | null = null

  public state: IXtermViewState = { isAtBottom: true }

  /** OSC sequence parser — feeds command-block boundary events. */
  private oscParser = new OscParser()
  /** Tracks completed Warp-style command blocks from OSC 133 events. */
  private blockTracker = new CommandBlockTracker(
    () => (this.term as any)?.buffer?.active?.cursorY ?? 0
  )
  /** Snapshot of completed blocks used by renderGutter(). */
  private commandBlocks: ReadonlyArray<ICommandBlock> = []

  public constructor(props: IXtermViewProps) {
    super(props)
    this.clipboard = props.clipboard ?? defaultClipboard
    this.oscParser.onEvent(evt => {
      this.blockTracker.handle(evt)
      if (evt.type === 'command-end') {
        this.commandBlocks = this.blockTracker.getBlocks()
        this.forceUpdate()
      }
    })
  }

  public componentDidMount(): void {
    if (this.container.current === null) {
      return
    }
    this.term = this.createTerminal()
    this.fitAddon = this.createFitAddon()
    if (this.fitAddon !== null) {
      this.term.loadAddon(this.fitAddon)
    }
    this.installPassiveAddons()
    this.installFileLinkMatcher()
    this.term.attachCustomKeyEventHandler(this.handleKeyEvent)
    this.term.open(this.container.current)
    // The WebGL addon must be loaded after open(): before it, xterm defers
    // activation to an open-time event, so a machine without WebGL2 (VMs,
    // blocklisted GPUs, remote desktops) throws from open() outside our
    // try/catch and takes down the whole app instead of falling back to
    // the DOM renderer.
    this.installRenderer(this.props.rendererPreference ?? 'webgl')
    this.applyTheme(this.props.theme)
    this.dataDispose = this.term.onData(input => this.sendInput(input))
    this.resizeDispose = this.term.onResize(size => this.sendResize(size))
    this.scrollDispose =
      this.term.onScroll?.(() => this.updateScrollPosition()) ?? null
    // When new output arrives while the user is scrolled up, xterm doesn't
    // fire onScroll (the viewport stays put); recompute against the new
    // baseY so the button appears.
    this.writeParsedDispose =
      this.term.onWriteParsed?.(() => this.updateScrollPosition()) ?? null
    // Initial fit + resize forwarding.
    this.restoreScrollback()
    this.fitNow()
    // Observe container size changes so xterm tracks the panel as the
    // user drags the resize gutter, the window resizes, or the parent
    // layout shifts.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.scheduleFit)
      this.resizeObserver.observe(this.container.current)
    }
    this.bindPort(this.props.port)
    this.attachPasteInterceptor()
  }

  public componentDidUpdate(prevProps: IXtermViewProps): void {
    if (prevProps.port !== this.props.port) {
      this.bindPort(this.props.port)
      // Re-fit when a new port binds — the container may have changed
      // between display:none and display:block, and xterm's geometry
      // numbers go stale while hidden.
      this.fitNow()
    }
    if (prevProps.theme !== this.props.theme && this.term) {
      this.applyTheme(this.props.theme)
    }
    if (this.term) {
      if (
        prevProps.fontSize !== this.props.fontSize &&
        this.props.fontSize !== undefined
      ) {
        if (this.term.options) {
          this.term.options.fontSize = this.props.fontSize
        } else if (this.term.setOption) {
          this.term.setOption('fontSize', this.props.fontSize)
        }
        // Re-fit so cell math updates after the font size change.
        this.fitNow()
      }
      if (
        prevProps.scrollback !== this.props.scrollback &&
        this.props.scrollback !== undefined
      ) {
        if (this.term.options) {
          this.term.options.scrollback = this.props.scrollback
        } else if (this.term.setOption) {
          this.term.setOption('scrollback', this.props.scrollback)
        }
      }
    }
  }

  /**
   * This component must NOT re-render on terminal data — xterm.js owns its
   * own DOM and byte traffic flows through the bound MessagePort, never
   * through React state. The parent `TerminalPanel` re-renders on every
   * `markActivity` tick (~4×/sec during background output) and passes fresh
   * inline-arrow callbacks each render; those closures only matter at event
   * time (React updates `this.props` even when render is skipped, so
   * handlers always see the latest), so we compare only the props that
   * change the terminal surface. Gutter refreshes go through `forceUpdate`,
   * which bypasses this hook, and scroll-position changes flip `isAtBottom`.
   */
  public shouldComponentUpdate(
    nextProps: IXtermViewProps,
    nextState: IXtermViewState
  ): boolean {
    return (
      this.props.port !== nextProps.port ||
      this.props.theme !== nextProps.theme ||
      this.props.fontSize !== nextProps.fontSize ||
      this.props.scrollback !== nextProps.scrollback ||
      this.props.sessionId !== nextProps.sessionId ||
      this.props.rendererPreference !== nextProps.rendererPreference ||
      this.state.isAtBottom !== nextState.isAtBottom
    )
  }

  public componentWillUnmount(): void {
    this.dataDispose?.dispose()
    this.dataDispose = null
    this.resizeDispose?.dispose()
    this.resizeDispose = null
    this.scrollDispose?.dispose()
    this.scrollDispose = null
    this.writeParsedDispose?.dispose()
    this.writeParsedDispose = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.fitRaf !== null) {
      cancelAnimationFrame(this.fitRaf)
      this.fitRaf = null
    }
    this.unbindPort()
    this.fitAddon?.dispose?.()
    this.fitAddon = null
    this.webglAddon?.dispose?.()
    this.canvasAddon?.dispose?.()
    this.webglAddon = null
    this.canvasAddon = null
    this.unicode11Addon?.dispose?.()
    this.ligaturesAddon?.dispose?.()
    this.webLinksAddon?.dispose?.()
    this.searchAddon?.dispose?.()
    this.unicode11Addon = null
    this.ligaturesAddon = null
    this.webLinksAddon = null
    this.searchAddon = null
    this.deregisterFileLinkMatcher()
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = null
    }
    this.pendingResize = null
    this.detachPasteInterceptor()
    this.saveScrollback()
    this.serializeAddon?.dispose?.()
    this.serializeAddon = null
    this.term?.dispose()
    this.term = null
  }

  /**
   * Paste `text` directly into the terminal (bypasses the paste-guard).
   * Used by TerminalPanel after the user confirms a bracketed-paste dialog
   * when no session port is available.
   */
  public pasteText(text: string): void {
    this.term?.paste(text)
  }

  /**
   * Focus the terminal so keystrokes reach the PTY.
   *
   * xterm.js routes keyboard input through a hidden helper `<textarea>`;
   * until that textarea is focused, typing goes to the rest of the app
   * and the terminal looks unresponsive. `TerminalPanel` calls this when
   * the panel becomes visible or the active tab changes so the user can
   * type immediately without first clicking into the view. No-op before
   * mount.
   */
  public focus(): void {
    this.term?.focus()
  }

  /**
   * Find the next occurrence of `text` in the terminal buffer. Returns
   * `false` when the search addon failed to load or threw.
   */
  public findNext(text: string): boolean {
    if (this.searchAddon === null) {
      return false
    }
    try {
      return Boolean(this.searchAddon.findNext(text))
    } catch {
      return false
    }
  }

  /**
   * Find the previous occurrence of `text` in the terminal buffer. Returns
   * `false` when the search addon failed to load or threw.
   */
  public findPrevious(text: string): boolean {
    if (this.searchAddon === null) {
      return false
    }
    try {
      return Boolean(this.searchAddon.findPrevious(text))
    } catch {
      return false
    }
  }

  public render() {
    return (
      <div className="xterm-view-wrapper">
        {this.renderGutter()}
        <div
          ref={this.container}
          className="xterm-view"
          role="application"
          aria-label="Integrated terminal"
          onContextMenu={this.onContextMenu}
        />
        {this.renderScrollToBottom()}
      </div>
    )
  }

  private renderScrollToBottom(): React.JSX.Element | null {
    if (this.state.isAtBottom) {
      return null
    }
    return (
      <button
        type="button"
        className="xterm-scroll-to-bottom"
        aria-label="Scroll to bottom"
        onClick={this.scrollToBottom}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M8 11.5 2.5 6l1.06-1.06L8 9.38l4.44-4.44L13.5 6z"
          />
        </svg>
      </button>
    )
  }

  private scrollToBottom = (): void => {
    const term = this.term as any
    if (term === null) {
      return
    }
    try {
      term.scrollToBottom?.()
    } catch {
      // best-effort
    }
    this.updateScrollPosition()
    this.term?.focus()
  }

  private updateScrollPosition = (): void => {
    const term = this.term as any
    if (term === null) {
      return
    }
    const active = term.buffer?.active
    if (!active) {
      return
    }
    const viewportY: number = active.viewportY ?? 0
    const baseY: number = active.baseY ?? 0
    // A 1-line slop avoids flicker when the cursor sits exactly at baseY-1
    // (e.g. after an alt-screen swap from `less`/`vim`).
    const isAtBottom = viewportY >= baseY - 1
    if (isAtBottom !== this.state.isAtBottom) {
      this.setState({ isAtBottom })
    }
  }

  private renderGutter(): React.JSX.Element | null {
    if (this.commandBlocks.length === 0) {
      return null
    }
    return (
      <div className="xterm-gutter" aria-hidden="true">
        {this.commandBlocks.map((block, i) => (
          <button
            key={i}
            className={`xterm-block-marker ${
              block.exitCode === 0 ? 'success' : 'failure'
            }`}
            aria-label="Copy block output"
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => this.copyBlock(block)}
          />
        ))}
      </div>
    )
  }

  private copyBlock(block: ICommandBlock): void {
    if (!this.term) {
      return
    }
    const term = this.term as any
    const getLineText = (row: number): string => {
      try {
        return term.buffer?.active?.getLine(row)?.translateToString(true) ?? ''
      } catch {
        return ''
      }
    }
    const text = extractBlockText(getLineText, block)
    void this.clipboard.writeText(text)
  }

  // --- helpers ---

  private createTerminal(): IRuntimeTerminal {
    if (this.props.terminalFactory) {
      return this.props.terminalFactory()
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Terminal } = require('@xterm/xterm') as {
      Terminal: new (opts?: any) => IRuntimeTerminal
    }
    return new Terminal({
      fontSize: this.props.fontSize ?? 13,
      fontFamily: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      scrollback: this.props.scrollback ?? 5000,
      allowProposedApi: true,
      cursorBlink: true,
      // Keep selection visible after copy so the user can reselect.
      // (Manually cleared by Ctrl+Shift+C in the key handler if desired.)
    })
  }

  private createFitAddon(): IRuntimeFitAddon | null {
    if (this.props.fitAddonFactory) {
      return this.props.fitAddonFactory()
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FitAddon } = require('@xterm/addon-fit') as {
        FitAddon: new () => IRuntimeFitAddon
      }
      return new FitAddon()
    } catch {
      // FitAddon is a dep but its native binding fallback is best-effort.
      return null
    }
  }

  private installRenderer(pref: RendererPreference): void {
    if (!this.term) {
      return
    }
    if (pref === 'dom') {
      return
    }
    if (pref === 'canvas') {
      this.installCanvas()
      return
    }
    this.installWebgl()
  }

  private installWebgl(): void {
    try {
      const factory =
        this.props.webglAddonFactory ??
        (() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { WebglAddon } = require('@xterm/addon-webgl')
          return new WebglAddon()
        })
      const addon = factory()
      this.term!.loadAddon(addon)
      this.webglAddon = addon
      if (typeof addon.onContextLoss === 'function') {
        addon.onContextLoss(() => {
          try {
            addon.dispose?.()
          } catch {
            // ignore
          }
          this.webglAddon = null
          this.installCanvas()
        })
      }
    } catch (err) {
      log.warn(
        '[xterm] webgl init failed; falling back to the DOM renderer',
        err as Error
      )
      this.installCanvas()
    }
  }

  private installCanvas(): void {
    if (this.canvasAddon !== null) {
      return
    }
    // xterm 6 dropped its canvas renderer, so there is no built-in addon to
    // fall back to: when WebGL is unavailable the DOM renderer is used. A
    // factory can still be injected (tests, or a future renderer addon).
    const factory = this.props.canvasAddonFactory
    if (factory === undefined) {
      return
    }
    try {
      const addon = factory()
      this.term!.loadAddon(addon)
      this.canvasAddon = addon
    } catch (err) {
      log.warn('[xterm] canvas init failed; using DOM renderer', err as Error)
    }
  }

  private installPassiveAddons(): void {
    if (!this.term) {
      return
    }
    this.unicode11Addon = this.makePassiveAddon(
      'unicode11',
      this.props.unicode11AddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Unicode11Addon } = require('@xterm/addon-unicode11')
        return new Unicode11Addon()
      }
    )
    if (this.unicode11Addon !== null) {
      // Activate Unicode 11 width tables on the terminal so emoji and CJK
      // glyphs measure correctly.
      try {
        const t = this.term as any
        if (t.unicode) {
          t.unicode.activeVersion = '11'
        }
      } catch {
        // older xterm builds may not expose .unicode — non-fatal
      }
    }
    this.ligaturesAddon = this.makePassiveAddon(
      'ligatures',
      this.props.ligaturesAddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { LigaturesAddon } = require('@xterm/addon-ligatures')
        return new LigaturesAddon()
      }
    )
    this.webLinksAddon = this.makePassiveAddon(
      'web-links',
      this.props.webLinksAddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WebLinksAddon } = require('@xterm/addon-web-links')
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { shell } = require('electron')
        return new WebLinksAddon((_event: MouseEvent, url: string) => {
          shell.openExternal(url).catch(() => {})
        })
      }
    )
    this.searchAddon = this.makePassiveAddon(
      'search',
      this.props.searchAddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SearchAddon } = require('@xterm/addon-search')
        return new SearchAddon()
      }
    )
    this.serializeAddon = this.makePassiveAddon(
      'serialize',
      this.props.serializeAddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SerializeAddon } = require('@xterm/addon-serialize')
        return new SerializeAddon()
      }
    )
  }

  private makePassiveAddon(
    label: string,
    injected: (() => any) | undefined,
    defaultFactory: () => any
  ): any | null {
    if (!this.term) {
      return null
    }
    try {
      const factory = injected ?? defaultFactory
      const addon = factory()
      this.term.loadAddon(addon)
      return addon
    } catch (err) {
      log.warn(`[xterm] ${label} addon failed`, err as Error)
      return null
    }
  }

  /**
   * Register a custom link matcher for diagnostic-style file paths
   * (e.g. `src/foo.ts:42:7`). Routes matches to `onFilePathClick`.
   *
   * Uses xterm's older `registerLinkMatcher` API. Newer xterm versions
   * removed this in favor of `registerLinkProvider`; if the API isn't
   * available we silently no-op — file paths just won't be clickable
   * until the link-provider migration lands.
   */
  private installFileLinkMatcher(): void {
    if (this.term === null || this.props.onFilePathClick === undefined) {
      return
    }
    const handler = this.props.onFilePathClick
    try {
      const t = this.term as any
      if (typeof t.registerLinkMatcher !== 'function') {
        log.debug(
          '[xterm] registerLinkMatcher unavailable; file-path links disabled'
        )
        return
      }
      // Per-instance regex (no shared `g` state across calls).
      const regex = new RegExp(filePathRegex.source, 'g')
      this.fileLinkMatcherId = t.registerLinkMatcher(
        regex,
        (_event: MouseEvent, matched: string) => {
          const m = parseFilePathMatch(matched)
          if (m === null) {
            return
          }
          handler(m.path, m.line, m.column)
        }
      )
    } catch (err) {
      log.warn('[xterm] file-link matcher failed', err as Error)
    }
  }

  private deregisterFileLinkMatcher(): void {
    if (this.term === null || this.fileLinkMatcherId === null) {
      this.fileLinkMatcherId = null
      return
    }
    try {
      const t = this.term as any
      if (typeof t.deregisterLinkMatcher === 'function') {
        t.deregisterLinkMatcher(this.fileLinkMatcherId)
      }
    } catch {
      // best-effort
    }
    this.fileLinkMatcherId = null
  }

  private restoreScrollback(): void {
    const { sessionId } = this.props
    if (!sessionId || !this.term) {
      return
    }
    const saved = loadTerminalScrollback(sessionId)
    if (saved && saved.length > 0) {
      this.term.write(saved)
    }
  }

  private saveScrollback(): void {
    const { sessionId } = this.props
    if (!sessionId || !this.term || this.serializeAddon === null) {
      return
    }
    let content: string
    try {
      // Serialize at most the last 1000 rows so localStorage stays small.
      content = this.serializeAddon.serialize({ rows: 1000 })
    } catch {
      // Serialization can throw if the addon was disposed mid-teardown.
      return
    }
    saveTerminalScrollback(sessionId, content)
  }

  private applyTheme(theme: ITerminalThemeColors) {
    if (!this.term) {
      return
    }
    if (this.term.options) {
      this.term.options.theme = { ...theme }
    } else if (this.term.setOption) {
      this.term.setOption('theme', { ...theme })
    }
  }

  /**
   * rAF-coalesce container resizes so `fit()` runs at most once per frame.
   * `ResizeObserver` can fire many times per frame during a drag-resize;
   * without coalescing, `fitAddon.fit()` (DOM measurement + xterm geometry
   * recalculation) runs for every callback. The downstream PTY resize is
   * separately debounced (32ms) in `sendResize`.
   */
  private scheduleFit = (): void => {
    if (this.fitRaf !== null) {
      return
    }
    this.fitRaf = requestAnimationFrame(() => {
      this.fitRaf = null
      this.fitNow()
    })
  }

  private fitNow(): void {
    if (this.term === null || this.fitAddon === null) {
      return
    }
    if (this.container.current === null) {
      return
    }
    // The container might be display:none (inactive tab); fit() throws
    // or no-ops on a 0×0 container. Skip silently.
    const rect = this.container.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    try {
      this.fitAddon.fit()
    } catch {
      // FitAddon throws on extremely small containers; ignore.
    }
  }

  private bindPort(port: IXtermViewPort | null) {
    this.unbindPort()
    if (port === null) {
      return
    }
    this.boundPort = port
    this.incomingHandler = ({ data }) => {
      if (data === null || typeof data !== 'object') {
        return
      }
      if (data.type === 'data' && this.term) {
        if (data.bytes instanceof Uint8Array) {
          // Ack once xterm has parsed the bytes (not on receipt) so the
          // main process can pause the PTY when we fall behind.
          const length = data.bytes.byteLength
          this.term.write(data.bytes, () => this.ackBytes(length))
          this.oscParser.feed(data.bytes)
        } else {
          this.term.write(data.bytes)
        }
      }
    }
    if (typeof port.addEventListener === 'function') {
      port.addEventListener('message', this.incomingHandler)
      this.boundUsedAddEventListener = true
    } else {
      port.onmessage = this.incomingHandler
      this.boundUsedAddEventListener = false
    }
    port.start?.()
    // After binding, send the current size so the PTY lines up with what
    // xterm has rendered (avoids the "random text on launch" symptom that
    // happens when the shell prints at default 80x24 into a much wider
    // panel).
    if (this.term) {
      this.sendResize({ cols: this.term.cols, rows: this.term.rows })
    }
  }

  private unbindPort() {
    if (this.boundPort === null) {
      return
    }
    const port: any = this.boundPort
    if (this.boundUsedAddEventListener) {
      if (
        typeof port.removeEventListener === 'function' &&
        this.incomingHandler !== null
      ) {
        port.removeEventListener('message', this.incomingHandler)
      }
    } else {
      port.onmessage = null
    }
    this.boundPort = null
    this.incomingHandler = null
    this.boundUsedAddEventListener = false
  }

  private sendInput(input: string) {
    if (this.boundPort === null) {
      return
    }
    const buf = Buffer.from(input, 'utf8')
    const bytes = new Uint8Array(buf)
    this.boundPort.postMessage({ type: 'input', bytes })
  }

  private ackBytes(bytes: number): void {
    if (this.boundPort === null) {
      return
    }
    try {
      this.boundPort.postMessage({ type: 'ack', bytes })
    } catch {
      // port can close between the write and its callback — not actionable
    }
  }

  private sendResize(size: { cols: number; rows: number }) {
    if (this.boundPort === null) {
      return
    }
    this.pendingResize = {
      cols: Math.max(1, Math.floor(size.cols)),
      rows: Math.max(1, Math.floor(size.rows)),
    }
    if (this.resizeTimer === null) {
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null
        const out = this.pendingResize
        this.pendingResize = null
        if (out === null || this.boundPort === null) {
          return
        }
        try {
          this.boundPort.postMessage({
            type: 'resize',
            cols: out.cols,
            rows: out.rows,
          })
        } catch {
          // port can close between schedule and fire — not actionable
        }
      }, XtermView.RESIZE_THROTTLE_MS)
    }
  }

  /**
   * Returns true when `text` exceeds the bracketed-paste guard threshold:
   * any paste with more than one newline, or a single-newline paste whose
   * total character count exceeds 80.
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  private static needsPasteConfirm(text: string): boolean {
    if (!text.includes('\n')) {
      return false
    }
    const newlineCount = (text.match(/\n/g) ?? []).length
    return newlineCount > 1 || text.length > 80
  }

  private attachPasteInterceptor(): void {
    const el = this.container.current
    if (el === null || this.pasteHandler !== null) {
      return
    }
    this.pasteTarget = el
    this.pasteHandler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? ''
      if (text.length === 0) {
        return
      }
      if (
        XtermView.needsPasteConfirm(text) &&
        this.props.onPasteConfirmRequired
      ) {
        e.preventDefault()
        e.stopPropagation()
        this.props.onPasteConfirmRequired(text)
      }
      // Otherwise let the event fall through to xterm's own paste handling.
    }
    el.addEventListener('paste', this.pasteHandler)
  }

  private detachPasteInterceptor(): void {
    if (this.pasteHandler === null) {
      return
    }
    this.pasteTarget?.removeEventListener('paste', this.pasteHandler)
    this.pasteTarget = null
    this.pasteHandler = null
  }

  /**
   * Custom key handler.
   *
   * Returning `false` tells xterm not to process the key, but does NOT
   * stop the underlying browser event — Chromium would still open DevTools
   * on Ctrl+Shift+C and would still fire a native paste on Ctrl+Shift+V
   * into xterm's hidden textarea (doubling the paste). For our clipboard
   * shortcuts we therefore also call `preventDefault` + `stopPropagation`
   * so the OS shortcut is fully handled here and nowhere else.
   */
  private handleKeyEvent = (e: KeyboardEvent): boolean => {
    if (e.type !== 'keydown') {
      return true
    }
    if (__DARWIN__) {
      const seq = macTerminalKeySequence(e)
      if (seq !== null) {
        e.preventDefault()
        e.stopPropagation()
        this.sendInput(seq)
        return false
      }
    }
    const ctrl = e.ctrlKey || e.metaKey
    // Classic terminal clipboard keys: Ctrl+Insert copies, Shift+Insert pastes.
    if (e.key === 'Insert' && !e.altKey) {
      if (e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        this.copySelection()
        return false
      }
      if (e.shiftKey && !e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
        void this.pasteFromClipboard()
        return false
      }
      return true
    }
    if (!ctrl || !e.shiftKey) {
      return true
    }
    if (e.key === 'C' || e.key === 'c') {
      e.preventDefault()
      e.stopPropagation()
      // Don't clear the selection — let the user re-select if they
      // want to copy more lines.
      this.copySelection()
      return false
    }
    if (e.key === 'V' || e.key === 'v') {
      e.preventDefault()
      e.stopPropagation()
      void this.pasteFromClipboard()
      return false
    }
    if (e.key === 'K' || e.key === 'k') {
      e.preventDefault()
      e.stopPropagation()
      this.clearBuffer()
      return false
    }
    return true
  }

  /** Copy the current selection to the system clipboard. Returns true if copied. */
  private copySelection(): boolean {
    if (this.term && this.term.hasSelection()) {
      const sel = this.term.getSelection()
      if (sel.length > 0) {
        void this.clipboard.writeText(sel)
        return true
      }
    }
    return false
  }

  /** Paste the system clipboard, going through the multi-line paste guard. */
  private async pasteFromClipboard(): Promise<void> {
    const text = await this.clipboard.readText()
    if (text.length === 0 || !this.term) {
      return
    }
    if (
      XtermView.needsPasteConfirm(text) &&
      this.props.onPasteConfirmRequired
    ) {
      this.props.onPasteConfirmRequired(text)
    } else {
      this.term.paste(text)
      this.term.focus()
    }
  }

  /**
   * Drop the scrollback (keeping the current prompt line) and the gutter's
   * command-block markers, which index rows that no longer exist. Plain
   * Ctrl+L is left to the shell, which only clears the visible screen.
   */
  public clearBuffer(): void {
    this.term?.clear?.()
    this.blockTracker.reset()
    this.commandBlocks = []
    this.forceUpdate()
    this.updateScrollPosition()
  }

  /**
   * Right-click: if the user has selected text, copy it; otherwise, paste
   * from the clipboard. Mirrors the convention from PuTTY/Windows
   * Terminal/GNOME Terminal.
   */
  private onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!this.term) {
      return
    }
    if (this.copySelection()) {
      this.term.clearSelection()
      return
    }
    void this.pasteFromClipboard()
  }
}
