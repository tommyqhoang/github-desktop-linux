import { XtermView } from '../../../src/ui/terminal/xterm-view'
import { _palettes } from '../../../src/lib/terminal/terminal-theme'

function setup(clipText: string, selection = '', onPasteConfirmRequired?: any) {
  const paste = jest.fn()
  let handler: (e: KeyboardEvent) => boolean = () => true
  const term: any = {
    cols: 80,
    rows: 24,
    options: {},
    open: () => undefined,
    write: () => undefined,
    paste,
    focus: () => undefined,
    hasSelection: () => selection.length > 0,
    getSelection: () => selection,
    clearSelection: () => undefined,
    onData: () => ({ dispose: () => undefined }),
    onResize: () => ({ dispose: () => undefined }),
    attachCustomKeyEventHandler: (h: any) => (handler = h),
    loadAddon: () => undefined,
    dispose: () => undefined,
  }
  // Electron 40+ clipboard is Promise-based.
  const clipboard = {
    readText: jest.fn(async () => clipText),
    writeText: jest.fn(async (_: string) => undefined),
  }
  const view = new XtermView({
    port: null,
    theme: _palettes.DARK_THEME,
    sessionId: 's',
    fontSize: 13,
    scrollback: 5000,
    terminalFactory: () => term,
    fitAddonFactory: () => ({ fit: () => undefined, dispose: () => undefined }),
    clipboard,
    onPasteConfirmRequired,
  })
  ;(view as any).container = {
    current: {
      getBoundingClientRect: () => ({ width: 100, height: 100 }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  }
  view.forceUpdate = jest.fn()
  view.setState = jest.fn()
  view.componentDidMount()
  if ((view as any).resizeObserver) {
    ;(view as any).resizeObserver.disconnect = () => undefined
  }
  return { handler: (e: any) => handler(key(e)), paste, clipboard }
}

const key = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    type: 'keydown',
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    ...init,
  }) as KeyboardEvent

const flush = () => new Promise(r => setTimeout(r, 0))

describe('XtermView clipboard (async Electron clipboard)', () => {
  it.each([
    ['Ctrl+Shift+V', { ctrlKey: true, shiftKey: true, key: 'V' }],
    ['Shift+Insert', { shiftKey: true, key: 'Insert' }],
  ])('%s pastes the awaited clipboard text', async (_n, ev) => {
    const { handler, paste } = setup('hello')
    expect(handler(ev)).toBe(false)
    await flush()
    expect(paste).toHaveBeenCalledWith('hello')
  })

  it.each([
    ['Ctrl+Shift+C', { ctrlKey: true, shiftKey: true, key: 'C' }],
    ['Ctrl+Insert', { ctrlKey: true, key: 'Insert' }],
  ])('%s copies the selection', (_n, ev) => {
    const { handler, clipboard } = setup('', 'picked')
    expect(handler(ev)).toBe(false)
    expect(clipboard.writeText).toHaveBeenCalledWith('picked')
  })

  it('multi-line paste goes through the confirm guard', async () => {
    const confirm = jest.fn()
    const { handler, paste } = setup('a\nb\nc', '', confirm)
    handler({ ctrlKey: true, shiftKey: true, key: 'v' })
    await flush()
    expect(confirm).toHaveBeenCalledWith('a\nb\nc')
    expect(paste).not.toHaveBeenCalled()
  })

  it('leaves plain keys alone', () => {
    const { handler } = setup('x')
    expect(handler({ key: 'a' })).toBe(true)
    expect(handler({ ctrlKey: true, key: 'c' })).toBe(true)
  })
})
