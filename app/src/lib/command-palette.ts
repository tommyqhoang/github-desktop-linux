import { match } from './fuzzy-find'
import { ICommandPaletteItem } from '../models/command-palette'

/**
 * Fuzzy-filter and rank command palette items against a query. An empty query
 * returns every item in its original order; otherwise items are matched on
 * their title and sorted best-first.
 */
export function filterCommands(
  query: string,
  items: ReadonlyArray<ICommandPaletteItem>
): ReadonlyArray<ICommandPaletteItem> {
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return items
  }
  return match(trimmed, items, item => [item.title]).map(m => m.item)
}

/**
 * The handlers and flags the command palette needs to build its action list.
 * Kept as an explicit interface (rather than the full dispatcher) so the list
 * can be built and tested without the app store.
 */
export interface ICommandPaletteContext {
  /** Whether a repository is currently selected. Gates repo-scoped actions. */
  readonly hasRepository: boolean
  readonly onPush: () => void
  readonly onPull: () => void
  readonly onFetch: () => void
  readonly onCreateBranch: () => void
  readonly onShowChanges: () => void
  readonly onShowHistory: () => void
  readonly onShowFiles: () => void
  readonly onShowSubmodules: () => void
  readonly onShowPreferences: () => void
  readonly onToggleTerminal: () => void
  readonly onReviewChanges: () => void
  readonly onSummarizeChanges: () => void
}

/**
 * Build the full set of command palette items for the current context.
 * Repository-scoped actions are omitted when no repository is selected.
 */
export function buildCommandPaletteItems(
  context: ICommandPaletteContext
): ReadonlyArray<ICommandPaletteItem> {
  const items = new Array<ICommandPaletteItem>()

  if (context.hasRepository) {
    items.push(
      { id: 'push', title: 'Push', action: context.onPush },
      { id: 'pull', title: 'Pull', action: context.onPull },
      { id: 'fetch', title: 'Fetch origin', action: context.onFetch },
      {
        id: 'create-branch',
        title: 'Create branch…',
        action: context.onCreateBranch,
      },
      {
        id: 'show-changes',
        title: 'Show Changes',
        action: context.onShowChanges,
      },
      {
        id: 'show-history',
        title: 'Show History',
        action: context.onShowHistory,
      },
      { id: 'show-files', title: 'Show Files', action: context.onShowFiles },
      {
        id: 'show-submodules',
        title: 'Show Submodules',
        action: context.onShowSubmodules,
      },
      {
        id: 'toggle-terminal',
        title: 'Toggle Terminal',
        subtitle: 'Ctrl+`',
        action: context.onToggleTerminal,
      },
      {
        id: 'ai-review-changes',
        title: 'AI: Review my changes',
        action: context.onReviewChanges,
      },
      {
        id: 'ai-summarize-changes',
        title: 'AI: Summarize my changes',
        action: context.onSummarizeChanges,
      }
    )
  }

  items.push({
    id: 'show-preferences',
    title: 'Open Preferences…',
    action: context.onShowPreferences,
  })

  return items
}
