import { XtermView } from '../../../src/ui/terminal/xterm-view'
import { _palettes } from '../../../src/lib/terminal/terminal-theme'

function makeFakeTerminal(extras: any = {}): any {
  return {
    cols: 80,
    rows: 24,
    options: {},
    open: () => undefined,
    write: () => undefined,
    paste: () => undefined,
    focus: () => undefined,
    hasSelection: () => false,
    getSelection: () => '',
    clearSelection: () => undefined,
    onData: () => ({ dispose: () => undefined }),
    onResize: () => ({ dispose: () => undefined }),
    attachCustomKeyEventHandler: () => undefined,
    loadAddon: () => undefined,
    dispose: () => undefined,
    ...extras,
  }
}

const baseProps = () => ({
  port: null,
  theme: _palettes.DARK_THEME,
  sessionId: 'sess-1',
  fontSize: 13,
  scrollback: 5000,
})

function mountView(opts: { fit?: jest.Mock; term?: any } = {}): XtermView {
  const fit = opts.fit ?? jest.fn()
  const view = new XtermView({
    ...baseProps(),
    terminalFactory: () => opts.term ?? makeFakeTerminal(),
    fitAddonFactory: () => ({ fit, dispose: () => undefined }),
  })
  ;(view as any).container = {
    current: {
      getBoundingClientRect: () => ({ width: 100, height: 100 }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  }
  // Not mounted by React, so rendering hooks would only warn.
  view.forceUpdate = jest.fn()
  view.setState = jest.fn()
  view.componentDidMount()
  // The jsdom ResizeObserver mock omits disconnect().
  if ((view as any).resizeObserver) {
    ;(view as any).resizeObserver.disconnect = () => undefined
  }
  return view
}

describe('XtermView performance behavior', () => {
  describe('shouldComponentUpdate', () => {
    const view = new XtermView(baseProps())
    const state = { isAtBottom: true }
    const sCU = (next: any, nextState = state) =>
      view.shouldComponentUpdate(next, nextState)

    it('skips re-render when only callback identities change', () => {
      const props = baseProps()
      const view2 = new XtermView({
        ...props,
        onFilePathClick: () => undefined,
        onPasteConfirmRequired: () => undefined,
      })
      expect(
        view2.shouldComponentUpdate(
          {
            ...props,
            onFilePathClick: () => undefined,
            onPasteConfirmRequired: () => undefined,
          },
          state
        )
      ).toBe(false)
    })

    it('skips re-render when nothing changed', () => {
      expect(sCU({ ...baseProps(), theme: view.props.theme })).toBe(false)
    })

    it.each([
      ['port', { port: { postMessage: () => undefined } }],
      ['theme', { theme: { ..._palettes.DARK_THEME } }],
      ['fontSize', { fontSize: 16 }],
      ['scrollback', { scrollback: 10000 }],
      ['sessionId', { sessionId: 'sess-2' }],
      ['rendererPreference', { rendererPreference: 'dom' }],
    ])('re-renders when %s changes', (_name, patch) => {
      const next = { ...baseProps(), theme: view.props.theme, ...patch }
      expect(sCU(next)).toBe(true)
    })

    it('re-renders when the scroll-to-bottom state flips', () => {
      const next = { ...baseProps(), theme: view.props.theme }
      expect(sCU(next, { isAtBottom: false })).toBe(true)
    })
  })

  describe('resize fit coalescing', () => {
    let pending: Array<() => void>
    const realRaf = (global as any).requestAnimationFrame
    const realCancel = (global as any).cancelAnimationFrame
    let cancel: jest.Mock

    beforeEach(() => {
      pending = []
      cancel = jest.fn()
      ;(global as any).requestAnimationFrame = jest.fn((cb: () => void) => {
        pending.push(cb)
        return pending.length
      })
      ;(global as any).cancelAnimationFrame = cancel
    })

    afterEach(() => {
      ;(global as any).requestAnimationFrame = realRaf
      ;(global as any).cancelAnimationFrame = realCancel
    })

    it('runs fit once per frame no matter how many resizes arrive', () => {
      const fit = jest.fn()
      const view = mountView({ fit })
      // Mounting observes the container, which schedules an initial fit.
      pending.splice(0).forEach(cb => cb())
      fit.mockClear()

      const schedule = (view as any).scheduleFit
      schedule()
      schedule()
      schedule()

      expect(pending).toHaveLength(1)
      expect(fit).not.toHaveBeenCalled()

      pending[0]()
      expect(fit).toHaveBeenCalledTimes(1)

      // The next frame can schedule again.
      schedule()
      expect(pending).toHaveLength(2)

      view.componentWillUnmount()
    })

    it('cancels a pending fit on unmount', () => {
      const view = mountView()
      pending.splice(0).forEach(cb => cb())
      ;(view as any).scheduleFit()

      view.componentWillUnmount()

      expect(cancel).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear buffer', () => {
    const keydown = (key: string, mods: Partial<KeyboardEvent> = {}) =>
      ({
        type: 'keydown',
        key,
        ctrlKey: true,
        shiftKey: true,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        ...mods,
      }) as unknown as KeyboardEvent

    it('clears the terminal and drops stale command blocks', () => {
      const clear = jest.fn()
      const view = mountView({ term: makeFakeTerminal({ clear }) })
      ;(view as any).commandBlocks = [{ exitCode: 0 }]

      view.clearBuffer()

      expect(clear).toHaveBeenCalledTimes(1)
      expect((view as any).commandBlocks).toEqual([])
      expect(view.forceUpdate).toHaveBeenCalled()
      view.componentWillUnmount()
    })

    it('does not throw when the terminal has no clear()', () => {
      const view = mountView()
      expect(() => view.clearBuffer()).not.toThrow()
      view.componentWillUnmount()
    })

    it('binds Ctrl+Shift+K and consumes the event', () => {
      const clear = jest.fn()
      const view = mountView({ term: makeFakeTerminal({ clear }) })
      const e = keydown('K')

      const passedToXterm = (view as any).handleKeyEvent(e)

      expect(passedToXterm).toBe(false)
      expect(clear).toHaveBeenCalledTimes(1)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(e.stopPropagation).toHaveBeenCalled()
      view.componentWillUnmount()
    })

    it('leaves plain Ctrl+K and Ctrl+L to the shell', () => {
      const clear = jest.fn()
      const view = mountView({ term: makeFakeTerminal({ clear }) })

      expect(
        (view as any).handleKeyEvent(keydown('k', { shiftKey: false }))
      ).toBe(true)
      expect(
        (view as any).handleKeyEvent(keydown('l', { shiftKey: false }))
      ).toBe(true)
      expect(clear).not.toHaveBeenCalled()
      view.componentWillUnmount()
    })
  })
})
