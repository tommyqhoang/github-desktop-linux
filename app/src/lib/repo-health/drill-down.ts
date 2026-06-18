import { RepositorySectionTab } from '../app-state'

/** Identifiers for the clickable signals on a repo-health card. */
export type RepoHealthSignal =
  | 'changes'
  | 'ahead'
  | 'behind'
  | 'prs'
  | 'ci'
  | 'stale'
  | 'last'

/**
 * Map a repo-health signal to the repository section a user most likely wants
 * to inspect when they click it. Returns `null` for signals that have no
 * dedicated section (the row still selects the repository, just without
 * switching tabs).
 */
export function resolveDrillDownSection(
  signal: RepoHealthSignal
): RepositorySectionTab | null {
  switch (signal) {
    case 'changes':
      return RepositorySectionTab.Changes
    case 'ahead':
    case 'behind':
      return RepositorySectionTab.History
    case 'ci':
      return RepositorySectionTab.Actions
    case 'prs':
    case 'stale':
    case 'last':
      return null
  }
}
