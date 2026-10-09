import { TerminalStore } from '../../../src/lib/stores/terminal-store'
import { TerminalEmptyState } from '../../../src/ui/terminal/terminal-empty-state'

describe('TerminalStore spawn guard', () => {
  it('refuses a second spawn for the same repo while one is in flight', () => {
    const store = new TerminalStore()
    expect(store.beginSpawn(1)).toBe(true)
    expect(store.beginSpawn(1)).toBe(false)
    expect(store.getState().spawningRepoIds?.has(1)).toBe(true)
    // Other repos are independent.
    expect(store.beginSpawn(2)).toBe(true)
  })

  it('allows a new spawn after endSpawn', () => {
    const store = new TerminalStore()
    store.beginSpawn(1)
    store.endSpawn(1)
    expect(store.getState().spawningRepoIds?.has(1)).toBe(false)
    expect(store.beginSpawn(1)).toBe(true)
  })

  it('endSpawn without a matching begin is a no-op', () => {
    const store = new TerminalStore()
    const listener = jest.fn()
    store.onDidUpdate(listener)
    store.endSpawn(9)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('TerminalEmptyState pending', () => {
  it('shows "Starting shell…" with no CTA while pending', () => {
    const tree: any = (TerminalEmptyState as any)({
      onNewTab: jest.fn(),
      pending: true,
    })
    expect(tree.props.role).toBe('status')
    expect(JSON.stringify(tree)).toContain('Starting shell')
    expect(JSON.stringify(tree)).not.toContain('Open shell here')
  })
})
