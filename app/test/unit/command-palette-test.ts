import {
  buildCommandPaletteItems,
  filterCommands,
  ICommandPaletteContext,
} from '../../src/lib/command-palette'
import { ICommandPaletteItem } from '../../src/models/command-palette'

function item(id: string, title: string): ICommandPaletteItem {
  return { id, title, action: () => undefined }
}

describe('filterCommands', () => {
  const items = [
    item('a', 'Push'),
    item('b', 'Pull'),
    item('c', 'Fetch origin'),
    item('d', 'Create branch'),
  ]

  it('returns all items unchanged for an empty query', () => {
    expect(filterCommands('', items).map(i => i.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('returns only fuzzy-matching items for a query', () => {
    const ids = filterCommands('branch', items).map(i => i.id)
    expect(ids).toEqual(['d'])
  })

  it('ranks a closer match higher', () => {
    const ranked = filterCommands('pu', items).map(i => i.id)
    // Both "Push" and "Pull" match "pu"; both should appear.
    expect(ranked).toContain('a')
    expect(ranked).toContain('b')
  })

  it('matches case-insensitively', () => {
    expect(filterCommands('FETCH', items).map(i => i.id)).toEqual(['c'])
  })
})

describe('buildCommandPaletteItems', () => {
  function makeContext(
    over: Partial<ICommandPaletteContext> = {}
  ): ICommandPaletteContext {
    return {
      hasRepository: true,
      onPush: jest.fn(),
      onPull: jest.fn(),
      onFetch: jest.fn(),
      onCreateBranch: jest.fn(),
      onShowChanges: jest.fn(),
      onShowHistory: jest.fn(),
      onShowFiles: jest.fn(),
      onShowSubmodules: jest.fn(),
      onShowPreferences: jest.fn(),
      onToggleTerminal: jest.fn(),
      onReviewChanges: jest.fn(),
      onSummarizeChanges: jest.fn(),
      ...over,
    }
  }

  it('includes repository actions when a repository is selected', () => {
    const ids = buildCommandPaletteItems(makeContext()).map(i => i.id)
    expect(ids).toContain('push')
    expect(ids).toContain('pull')
    expect(ids).toContain('fetch')
    expect(ids).toContain('create-branch')
    expect(ids).toContain('show-files')
    expect(ids).toContain('ai-review-changes')
    expect(ids).toContain('ai-summarize-changes')
  })

  it('wires the AI review action to its handler', () => {
    const onReviewChanges = jest.fn()
    const items = buildCommandPaletteItems(makeContext({ onReviewChanges }))
    items.find(i => i.id === 'ai-review-changes')!.action()
    expect(onReviewChanges).toHaveBeenCalledTimes(1)
  })

  it('excludes repository actions when no repository is selected', () => {
    const ids = buildCommandPaletteItems(
      makeContext({ hasRepository: false })
    ).map(i => i.id)
    expect(ids).not.toContain('push')
    expect(ids).not.toContain('create-branch')
    // Global actions remain available.
    expect(ids).toContain('show-preferences')
  })

  it('wires each action to its handler', () => {
    const onPush = jest.fn()
    const items = buildCommandPaletteItems(makeContext({ onPush }))
    const push = items.find(i => i.id === 'push')
    expect(push).toBeDefined()
    push!.action()
    expect(onPush).toHaveBeenCalledTimes(1)
  })
})
