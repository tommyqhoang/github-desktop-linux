import { TerminalPanel } from '../../../src/ui/terminal/terminal-panel'
import { ITerminalState } from '../../../src/lib/stores/terminal-store'
import { _palettes } from '../../../src/lib/terminal/terminal-theme'
import { ITerminalSessionSnapshot } from '../../../src/lib/terminal/pty-types'

const snap = (
  over: Partial<ITerminalSessionSnapshot> = {}
): ITerminalSessionSnapshot => ({
  id: 'a',
  repositoryId: 1,
  cwd: '/tmp',
  shell: '/usr/bin/zsh',
  cols: 80,
  rows: 24,
  createdAt: 0,
  status: 'running',
  exitCode: null,
  liveCwd: null,
  hasActivity: false,
  lastExitCode: null,
  title: null,
  ...over,
})

function stateWith(
  sessions: ITerminalSessionSnapshot[],
  over: Partial<ITerminalState> = {}
): ITerminalState {
  return {
    visible: true,
    height: 240,
    activeSessionId: sessions[0]?.id ?? null,
    sessions: new Map(sessions.map(s => [s.id, s])),
    tabsByRepoId: new Map([[1, sessions.map(s => s.id)]]),
    activeByRepoId: new Map(),
    selectedRepoId: 1,
    ...over,
  }
}

function makePanel(state: ITerminalState) {
  const handlers = {
    onResize: jest.fn(),
    onCloseClick: jest.fn(),
    onNewTab: jest.fn(),
    onSelectTab: jest.fn(),
    onCloseTab: jest.fn(),
    onReorderTab: jest.fn(),
    onRenameTab: jest.fn(),
    onRestartTerminal: jest.fn(),
    onFocusTabByIndex: jest.fn(),
    onAdjustFontSize: jest.fn(),
  }
  const panel = new TerminalPanel({
    state,
    repositoryId: 1,
    theme: _palettes.DARK_THEME,
    fontSize: 13,
    scrollback: 5000,
    portFor: () => null,
    ...handlers,
  })
  ;(panel as any).setState = (update: any, cb?: () => void) => {
    const next =
      typeof update === 'function' ? update((panel as any).state) : update
    ;(panel as any).state = { ...(panel as any).state, ...next }
    cb?.()
  }
  return { panel, ...handlers }
}

const key = (k: string, over: any = {}) => ({
  key: k,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: jest.fn(),
  ...over,
})

function tabs(panel: TerminalPanel): any[] {
  const tree: any = panel.render()
  const strip = tree.props.children[1].props.children[0]
  return strip.props.children[0]
}

describe('TerminalPanel keyboard accessibility', () => {
  let host: HTMLDivElement
  let outsideButton: HTMLButtonElement
  let outsideInput: HTMLInputElement
  let xtermTextarea: HTMLTextAreaElement

  beforeEach(() => {
    host = document.createElement('div')
    xtermTextarea = document.createElement('textarea')
    xtermTextarea.className = 'xterm-helper-textarea'
    host.appendChild(xtermTextarea)
    outsideButton = document.createElement('button')
    outsideInput = document.createElement('input')
    document.body.append(host, outsideButton, outsideInput)
  })

  afterEach(() => {
    host.remove()
    outsideButton.remove()
    outsideInput.remove()
    document.querySelectorAll('dialog').forEach(d => d.remove())
  })

  const exitedPanel = () => {
    const ctx = makePanel(stateWith([snap({ status: 'exited', exitCode: 2 })]))
    ;(ctx.panel as any).panelRef = { current: host }
    return ctx
  }

  describe('Enter-to-restart gating', () => {
    it('restarts when Enter is pressed inside the terminal', () => {
      const { panel, onRestartTerminal } = exitedPanel()
      const e = key('Enter', { target: xtermTextarea })
      ;(panel as any).handleGlobalKeyDown(e)
      expect(onRestartTerminal).toHaveBeenCalledWith('a')
      expect(e.preventDefault).toHaveBeenCalled()
    })

    it('does not swallow Enter on a control elsewhere in the app', () => {
      const { panel, onRestartTerminal } = exitedPanel()
      const e = key('Enter', { target: outsideButton })
      ;(panel as any).handleGlobalKeyDown(e)
      expect(onRestartTerminal).not.toHaveBeenCalled()
      expect(e.preventDefault).not.toHaveBeenCalled()
    })

    it('does not restart when the event target is unknown', () => {
      const { panel, onRestartTerminal } = exitedPanel()
      ;(panel as any).handleGlobalKeyDown(key('Enter'))
      expect(onRestartTerminal).not.toHaveBeenCalled()
    })

    it('leaves Enter on in-panel buttons alone', () => {
      const { panel, onRestartTerminal } = exitedPanel()
      const btn = document.createElement('button')
      host.appendChild(btn)
      ;(panel as any).handleGlobalKeyDown(key('Enter', { target: btn }))
      expect(onRestartTerminal).not.toHaveBeenCalled()
    })
  })

  describe('global shortcut gating', () => {
    it('ignores Ctrl+1 while a modal dialog is open', () => {
      const { panel, onFocusTabByIndex } = exitedPanel()
      const dialog = document.createElement('dialog')
      dialog.setAttribute('open', '')
      document.body.appendChild(dialog)
      ;(panel as any).handleGlobalKeyDown(
        key('1', { ctrlKey: true, target: document.body })
      )
      expect(onFocusTabByIndex).not.toHaveBeenCalled()
    })

    it('ignores font zoom while typing in a field outside the panel', () => {
      const { panel, onAdjustFontSize } = exitedPanel()
      ;(panel as any).handleGlobalKeyDown(
        key('=', { ctrlKey: true, target: outsideInput })
      )
      expect(onAdjustFontSize).not.toHaveBeenCalled()
    })

    it('still handles shortcuts from inside the terminal', () => {
      const { panel, onFocusTabByIndex } = exitedPanel()
      ;(panel as any).handleGlobalKeyDown(
        key('1', { ctrlKey: true, target: xtermTextarea })
      )
      expect(onFocusTabByIndex).toHaveBeenCalledWith(1, 0)
    })

    it('ignores shortcuts while the paste confirmation is open', () => {
      const { panel, onFocusTabByIndex } = exitedPanel()
      panel.setState({ pendingPaste: { text: 'a\nb', sessionId: 'a' } } as any)
      ;(panel as any).handleGlobalKeyDown(
        key('1', { ctrlKey: true, target: xtermTextarea })
      )
      expect(onFocusTabByIndex).not.toHaveBeenCalled()
    })
  })

  describe('tab semantics', () => {
    const two = () =>
      makePanel(stateWith([snap({ id: 'a' }), snap({ id: 'b' })]))

    it('links tabs and panels with ids and aria-controls', () => {
      const { panel } = two()
      panel.setState({ mountedSessionIds: new Set(['a']) } as any)
      const [tabA, tabB] = tabs(panel)
      expect(tabA.props.id).toBe('terminal-tab-a')
      expect(tabA.props['aria-controls']).toBe('terminal-tabpanel-a')
      // Unmounted panels aren't referenced (no dangling idref).
      expect(tabB.props['aria-controls']).toBeUndefined()
    })

    it('ArrowRight selects and wraps, Home/End jump', () => {
      const { panel, onSelectTab } = two()
      const [tabA, tabB] = tabs(panel)
      const e = key('ArrowRight')
      tabB.props.onKeyDown({ ...e, target: 1, currentTarget: 1 })
      expect(onSelectTab).toHaveBeenLastCalledWith('a')
      tabA.props.onKeyDown({ ...key('End'), target: 1, currentTarget: 1 })
      expect(onSelectTab).toHaveBeenLastCalledWith('b')
      tabB.props.onKeyDown({ ...key('Home'), target: 1, currentTarget: 1 })
      expect(onSelectTab).toHaveBeenLastCalledWith('a')
    })

    it('arrow navigation keeps focus on the tab (not the terminal)', () => {
      const { panel } = two()
      const [tabA] = tabs(panel)
      tabA.props.onKeyDown({
        ...key('ArrowRight'),
        target: 1,
        currentTarget: 1,
      })
      expect((panel as any).lastFocusedSessionId).toBe('b')
    })

    it('Ctrl+Shift+Right reorders and announces the new position', () => {
      const { panel, onReorderTab } = two()
      const [tabA] = tabs(panel)
      tabA.props.onKeyDown({
        ...key('ArrowRight', { ctrlKey: true, shiftKey: true }),
        target: 1,
        currentTarget: 1,
      })
      expect(onReorderTab).toHaveBeenCalledWith(1, 'a', 1)
      expect((panel.state as any).announcement).toBe(
        'Moved zsh to position 2 of 2'
      )
    })

    it('does not reorder past the ends', () => {
      const { panel, onReorderTab } = two()
      const [tabA] = tabs(panel)
      tabA.props.onKeyDown({
        ...key('ArrowLeft', { ctrlKey: true, shiftKey: true }),
        target: 1,
        currentTarget: 1,
      })
      expect(onReorderTab).not.toHaveBeenCalled()
    })

    it('F2 starts renaming', () => {
      const { panel } = two()
      const [tabA] = tabs(panel)
      tabA.props.onKeyDown({ ...key('F2'), target: 1, currentTarget: 1 })
      expect((panel.state as any).renamingSessionId).toBe('a')
    })

    it('keys typed in the rename input are not hijacked by the tab', () => {
      const { panel, onSelectTab } = two()
      const [tabA] = tabs(panel)
      const e = key(' ')
      tabA.props.onKeyDown({ ...e, target: 'input', currentTarget: 'tab' })
      expect(e.preventDefault).not.toHaveBeenCalled()
      expect(onSelectTab).not.toHaveBeenCalled()
    })

    it('conveys exit status as screen-reader text', () => {
      const { panel } = makePanel(
        stateWith([snap({ status: 'exited', exitCode: 3 })])
      )
      const [tab] = tabs(panel)
      const sr = tab.props.children.find(
        (c: any) => c && c.props && c.props.className === 'sr-only'
      )
      expect(sr.props.children).toContain('exited with code 3')
    })

    it('conveys failed last command and new output', () => {
      const { panel } = makePanel(
        stateWith(
          [
            snap({ id: 'a' }),
            snap({ id: 'b', lastExitCode: 1, hasActivity: true }),
          ],
          { activeSessionId: 'a' }
        )
      )
      const [, tabB] = tabs(panel)
      const sr = tabB.props.children.find(
        (c: any) => c && c.props && c.props.className === 'sr-only'
      )
      expect(sr.props.children).toContain('exit code 1')
      expect(sr.props.children).toContain('new output')
    })
  })

  describe('shell spawn state', () => {
    it('passes pending to the empty state while a spawn is in flight', () => {
      const { panel } = makePanel(
        stateWith([], { spawningRepoIds: new Set([1]) })
      )
      const tree: any = panel.render()
      const body = tree.props.children[3]
      expect(body.props.children[0].props.pending).toBe(true)
    })

    it('renders a polite live region for announcements', () => {
      const { panel } = makePanel(stateWith([snap()]))
      const tree: any = panel.render()
      const live = tree.props.children[4]
      expect(live.props.role).toBe('status')
      expect(live.props['aria-live']).toBe('polite')
    })
  })
})
