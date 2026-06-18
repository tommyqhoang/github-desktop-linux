# Repository Guidelines

## Project Structure & Module Organization

This repository is the Linux fork of GitHub Desktop, a TypeScript/Electron app.
Application code lives in `app/src`: UI components are under `app/src/ui`, shared
logic under `app/src/lib`, models under `app/src/models`, and Electron main
process code under `app/src/main-process`. Styles are in `app/styles`, static
assets in `app/static`, and documentation in `docs/`. Build, release, and
maintenance scripts live in `script/`. Tests are in `app/test`, with unit tests
in `app/test/unit`, helpers in `app/test/helpers`, mocks in `app/test/__mocks__`,
and Git fixture repositories in `app/test/fixtures`.

## Build, Test, and Development Commands

Use Yarn 1.x and Node 20.x, as described in `docs/contributing/setup.md`.

- `yarn` installs root and app dependencies.
- `yarn build:dev` compiles a development build.
- `yarn start` launches the development app with background recompilation.
- `yarn compile:dev` runs the development webpack compilation only.
- `yarn test` runs unit tests and script tests.
- `yarn test:unit -- <pattern>` runs matching Jest unit tests.
- `yarn test:script` runs tests for repository scripts.
- `yarn lint` checks Prettier formatting and ESLint rules.
- `yarn lint:fix` applies Prettier and ESLint autofixes.

## Coding Style & Naming Conventions

Write TypeScript using the repository ESLint and Prettier configuration. Use
camelCase for methods and variables, PascalCase for classes and React
components, and JSDoc `/** ... */` comments for public or non-obvious APIs. In
application code, prefer asynchronous Node APIs; synchronous variants should be
rare and named with a `Sync` suffix. Script code may favor synchronous APIs for
readability.

## Testing Guidelines

Jest is the primary test framework. Add unit tests beside related areas under
`app/test/unit`, mirroring `app/src` when practical. New test files should use
the pattern `[app-module]-test.ts`. Keep unit tests focused on one module or
function, and use `app/test/fixtures` for repository state needed by Git tests.
Run `yarn test:unit` before submitting application changes; run `yarn test` when
touching shared behavior or scripts.

## Notable subsystems

### Pull Request Review (`app/src/lib/api/pull-request-reviews.ts`, `app/src/lib/stores/pull-request-review-store.ts`, `app/src/ui/pull-request-review/`)

In-app PR review dialog. Loads threads via REST, lets the user draft
line comments, set a verdict, and submit a review in a single shot.

- API: `fetchPullRequestThreads`, `postLineComment`, `submitReview`. The
  `IHttpClient` interface is fully injectable so the wrapper is testable
  without `fetch`. Production uses `makeAccountHttpClient(account)`.
  `fetchPullRequestThreads` walks every comment page (100 per page, 50-page
  safety cap) so large PRs aren't truncated.
- Store: `PullRequestReviewStore` holds at most one active session.
  Drafts are kept locally; on submit success they're cleared, on
  failure they survive so the user can retry. `open()` captures its
  session object and bails after the await if the dialog was closed or a
  different PR was opened mid-fetch.
- UI: opened via `PopupType.PullRequestReviewSession` (carries
  `repository` + `prNumber`). The diff-rendered inline comment overlay
  is Phase 2 work.
- 55 unit tests, 100% line coverage on the API + store + model.

### Repository Health Dashboard (`app/src/lib/repo-health/`, `app/src/lib/stores/repo-health-store.ts`, `app/src/ui/repo-health/`)

Cross-repo at-a-glance status view: uncommitted files, ahead/behind,
PR count, CI status, attention score per repo.

- `aggregate-status.ts`: pure scoring formula (capped at 100). 100% coverage.
- `collect-health.ts`: per-repo collector composing injectable probes.
  Probe failures degrade gracefully — one bad signal doesn't poison
  the snapshot. `collectMany(repos, opts, concurrency=4)` runs collectors
  in a bounded pool, preserving input order.
- `RepoHealthStore`: in-memory snapshot, 60s dedup window, in-flight
  coalescing.
- UI: `RepoHealthDashboard` (sort + filter + refresh) + `RepoHealthRow`,
  wrapped in `RepoHealthDashboardDialog`, opened via
  `PopupType.RepoHealthDashboard`. Signal cells drill down:
  `resolveDrillDownSection` (`app/src/lib/repo-health/drill-down.ts`) maps a
  signal to a `RepositorySectionTab` (changes→Changes, ahead/behind→History,
  ci→Actions); `App.onDrillDown` selects the repo and switches section.
- Probes (`makeRepoHealthProbes` in `app-store.ts`) are all wired to
  real data sources: `getStatus`, `getAheadBehind` (`HEAD...@{u}`
  symmetric range), the GitHub combined-ref-status API for CI,
  `PullRequestCoordinator` for the open-PR count, and `git log` /
  `git for-each-ref` for last-activity and stale-branch counts. Probe
  failures degrade per-signal via `safe()` — they never poison a snapshot.
- 45 unit tests, 100% on store/scoring/row, 89% on the dashboard component.

### Integrated Terminal (`app/src/lib/terminal/`, `app/src/main-process/terminal/`, `app/src/ui/terminal/`)

A repo-scoped terminal panel anchored to the bottom of the window. `Ctrl+`` `
toggles. Architecture (see `docs/proposals/01-integrated-terminal.md` for the
full design):

- **Main process** (`app/src/main-process/terminal/`): `TerminalManager` owns
  every active `PtySession`. Each session wraps a `node-pty` process and a
  per-session Electron `MessageChannelMain` for high-throughput byte traffic
  (avoids head-of-line blocking on the regular IPC bus). The main-process
  IPC handler is registered in `main.ts` via `registerTerminalIpc()`.
- **Renderer** (`app/src/ui/terminal/`): `TerminalPanel` is the slide-up
  shell; `XtermView` mounts xterm.js into a div and binds it to the
  per-session `MessagePort`. xterm.js owns its own DOM; React state never
  re-renders on terminal data. Dropping OS files onto the panel inserts
  their shell-quoted paths at the active prompt instead of adding them as
  repositories — `TerminalPanel` binds native `dragover`/`drop` listeners
  to its root (not React props) so the handler runs at the panel during
  the bubble phase and `stopPropagation` beats the app-level drop handler
  (React 16 delegates synthetic events at `document`, too late to win).
- **Renderer state** (`app/src/lib/stores/terminal-store.ts`): visibility,
  height (persisted to localStorage), per-session snapshots, repo↔session
  bindings. `MessagePort`s themselves are NOT in the store (not
  serializable) — the `AppStore` keeps them in a private `Map`. Sessions
  persist per-repo across repo switches: `tabsByRepoId` / `activeByRepoId`
  keep each repo's tabs, and `selectedRepoId` gates `registerSession` so
  an async auto-spawn that lands after the user navigated away cannot
  steal `activeSessionId` onto the background session.
- **Dispatcher**: `toggleTerminal`, `spawnTerminal`, `killTerminal`,
  `resizeTerminal`, `getTerminalPort`, `setTerminalHeight`.

Tests: 264 unit tests across 18 files in `app/test/unit/terminal/`. Mock PTY
+ MockPort helpers in `app/test/helpers/mock-pty.ts` so tests run without
node-pty's native binding.

### Stash Manager (`app/src/lib/git/stash.ts`, `app/src/lib/stores/stash-store.ts`, `app/src/ui/stashes/`)

End-user stash management. Three layers:
1. **Git wrappers** (`stash.ts`): `getAllStashes` (Desktop + CLI), `applyStash` (apply without dropping), `createStashWithMessage` (custom message + optional `--include-untracked`). The pre-existing `getStashes` / `popStashEntry` / `dropDesktopStashEntry` filter to Desktop-marked entries; the new `getAll*` does not.
2. **`StashStore`**: per-`repositoryId` cache of `IRepoStashState` (`{entries, loading, error, loadedAt}`). Concurrent loads coalesce. Surfaced via `IAppState.stashesByRepoId`.
3. **UI**: `StashList` + `StashListItem` render the sidebar; `StashCreateDialog` is a popup (`PopupType.StashCreate`). The Stashes tab lives next to Changes/History inside `RepositoryView` (`RepositorySectionTab.Stashes`).

`IStashEntry` has been extended with `message: string` and `stashedAt: number`. Test fixtures that construct `IStashEntry` literals must include both.

### Worktrees (`app/src/lib/git/worktree.ts`, `app/src/lib/stores/worktree-store.ts`, `app/src/ui/worktrees/`)

A Worktrees tab listing the repository's linked worktrees and managing
their lifecycle (add / remove / prune).

- **Git layer** (`worktree.ts`): `parseWorktreeListPorcelain` parses
  `git worktree list --porcelain` into `LinkedWorkTree` — `path`, `head`,
  `branch` (short name, `null` when detached/bare), `isDetached`,
  `isBare`, `lockedReason`, `prunableReason`. `listWorkTrees` runs the
  command; `getWorktreeStatusCount` runs `git status` inside a worktree.
  `addWorktree` (new or existing branch, optional `--force`),
  `removeWorktree` (optional `--force`), and `pruneWorktrees` wrap the
  corresponding `git worktree` subcommands and throw `GitError` on refusal.
- **`WorktreeStore`**: per-`repositoryId` cache of `IRepoWorktreeState`
  (`{entries, loading, error, loadedAt}`). The main worktree is filtered
  out — only linked worktrees are listed, each enriched with a
  `changesCount`. Concurrent loads coalesce. Surfaced via
  `IAppState.worktreesByRepoId`.
- **UI**: `WorktreeList` + `WorktreeListItem` render the branch/ref,
  uncommitted-change count, Locked/Prunable badges, a per-row Remove
  action, and a toolbar with Add/Prune. The same `WorktreeList` component
  backs both the sidebar and the detail pane inside `RepositoryView`
  (`RepositorySectionTab.Worktrees`). `WorktreeCreateDialog` and
  `WorktreeRemoveDialog` are popups (`PopupType.WorktreeCreate` /
  `PopupType.WorktreeRemove`).
- **Dispatcher**: `loadWorktrees`, `createWorktree`, `removeWorktree`,
  `pruneWorktrees`.

### Interactive Rebase (`app/src/lib/git/interactive-rebase.ts`, `app/src/ui/interactive-rebase/`)

A planning dialog that lets the user reorder, squash, fixup, and drop a range
of recent commits, then drives a single `git rebase -i` through the shared
multi-commit-operation machinery.

- **Git layer** (`interactive-rebase.ts`): `interactiveRebase(repo, entries,
  lastRetainedCommitRef, progressCallback?, allCommits?)`. Entries arrive
  **newest-first** (UI/history order) and are reversed to oldest-first before
  being written to a temp todo file, which `rebaseInteractive` injects via
  `sequence.editor=cat`. The todo line editor is `:` (no-op), so squash keeps
  git's default combined message and fixup discards the squashed message. The
  temp file is always removed in a `finally`. Empty entries → `RebaseResult.Error`.
- **Base selection**: the dialog window is the most recent N commits (currently
  20). `lastRetainedCommitRef` is the **parent** of the oldest windowed commit
  (`${oldest.sha}^`), or `null` (→ `--root`) when that commit is the repo root.
  Computed in `App.showInteractiveRebaseDialog` — getting this wrong silently
  freezes the oldest commit, so it's covered by tests.
- **Model**: `MultiCommitOperationKind.InteractiveRebase`, plus the exported
  `RebaseTodoAction` (`pick`/`squash`/`fixup`/`drop`) and `IInteractiveRebaseEntry`
  (`{commit, action}`) in `models/multi-commit-operation.ts`. The kind is wired
  through `isIdMultiCommitOperation`, the choose-branch switch, the dispatcher
  success-banner switch, the app-store undo switch, and all four `StatsStore`
  operation switches (mirroring `Reorder`).
- **UI**: `InteractiveRebaseDialog` (`PopupType.InteractiveRebase`) lists commits
  newest-first with HTML5 drag-to-reorder and a per-row action `<select>`.
  Because the list is newest-first, squash/fixup melds a commit into the row
  **below** it (the older commit). Start Rebase is disabled when every commit
  is dropped, or when the oldest non-dropped commit is squash/fixup (git rejects
  squashing the first todo line). Styles in `app/styles/ui/_interactive-rebase.scss`.
- **Flow**: menu `interactive-rebase` → `App.showInteractiveRebaseDialog` →
  `Dispatcher.showInteractiveRebaseDialog` → dialog → `Dispatcher.startInteractiveRebase`
  (initializes the multi-commit operation, shows its progress popup) →
  `AppStore._startInteractiveRebase` (reverses + drops-excluded `allCommits` for
  progress alignment, runs `interactiveRebase` under `performFailableOperation`)
  → `processMultiCommitOperationRebaseResult`.
- Tests: end-to-end fixture-repo coverage in
  `app/test/unit/git/interactive-rebase-test.ts` (pick/drop/reorder/squash,
  `--root`, empty-list error).

### GitHub Actions Workflow Runs (`app/src/lib/stores/workflow-runs-store.ts`, `app/src/ui/workflow-runs/`)

An Actions tab listing recent workflow runs with status icons, run numbers,
branches, and durations. Supports filtering by status and a dispatch dialog
for manually triggering workflows.

- **`WorkflowRunsStore`**: per-`repositoryId` cache of `IRepoWorkflowRunsState`
  (`{runs, loading, error, loadedAt, selectedWorkflowName}`). Concurrent loads
  coalesce. Surfaced via `IAppState.workflowRunsByRepoId`.
- **UI**: `WorkflowRunList` + `WorkflowRunListItem` render the sidebar with a
  status-filter toolbar (`WorkflowRunToolbar`) and a "Run workflow" button.
  Selecting a run highlights the row and opens `WorkflowRunDetail` in the
  content pane: a status header, run metadata, the triggering commit
  summary, run actions (re-run failed jobs / cancel / open on GitHub /
  download logs), and the run's jobs with their steps. `WorkflowRunDetail`
  fetches jobs straight from the API (`fetchWorkflowRunJobs`) on selection
  rather than via a store. `WorkflowRunDispatchDialog` is a popup
  (`PopupType.WorkflowRunDispatch`) with a workflow dropdown and branch
  input. The Actions tab lives inside `RepositoryView`
  (`RepositorySectionTab.Actions`); `RepositoryView` holds the selected
  run id in local state (`selectedWorkflowRunId`). Status icon / class /
  label mapping is shared across the list, detail pane, and job list via
  `workflow-run-status.ts`.
- **Dispatcher**: `loadWorkflowRuns`, `dispatchWorkflowRun`,
  `reRunWorkflowRun`, `cancelWorkflowRun`.

### Working-directory change summary (`app/src/lib/git/working-directory-stats.ts`, `app/src/models/working-directory-stats.ts`, `app/src/ui/changes/change-summary-badge.tsx`)

The Changes tab shows aggregate diff stats alongside the file count.

- `getWorkingDirectoryStats` sums `{files, additions, deletions}` across
  every pending change — tracked modifications/deletions *and* untracked
  new files. Since `git diff HEAD` ignores untracked files, it stages all
  changes with `--intent-to-add` into a throwaway index (`GIT_INDEX_FILE`,
  so the real index is untouched and no blobs are written) and diffs that
  against HEAD with `--numstat -z`. Binary files count as 0/0; `.gitignore`
  exclusions are skipped. Returns `null` for a repo with no commits or a
  clean working directory.
- `ChangeSummaryBadge` renders the added/removed line counts; the stats are
  threaded through repository status updates as `IWorkingDirectoryStats`.

### Files browser (`app/src/lib/file-tree/`, `app/src/lib/stores/file-tree-store.ts`, `app/src/ui/file-tree/`)

A read-only Files tab: a working-tree file tree alongside a multi-tab,
format-aware viewer. Lives inside `RepositoryView`
(`RepositorySectionTab.Files`).

- **Lib layer** (`app/src/lib/file-tree/`): `list-directory.ts`
  (`readWorkingDirectory` — lazy per-directory listing, honours `.gitignore`),
  `read-file.ts` (`readFileForViewer` + `readMediaForViewer` → `data:` URL,
  `statMtimeMs`; size-capped), `media.ts` (`getMediaDescriptor` classifies
  image/video by extension), `parse-delimited.ts` (`getDelimitedKind` +
  RFC-4180 `parseDelimited` for CSV/TSV), `open-in-browser.ts`
  (`isBrowserViewable` + `openInBrowser` via `shell.openExternal` for
  HTML/PDF), `file-operations.ts` (pure path helpers + `renameEntry` /
  `deleteEntry` — `deleteEntry` uses `shell.moveItemToTrash`, `renameEntry`
  refuses to overwrite an existing target).
- **`FileTreeStore`**: per-`repositoryId` `IRepoFileTreeState`
  (`childrenByPath`, `expandedPaths`, `loadingPaths`, `openFilePaths`,
  `activeFilePath`, `renamingPath`, `refreshToken`). Tabs are an ordered
  `openFilePaths` array + `activeFilePath`. Methods: `openFile`/`activateFile`/
  `revealFile` (expands ancestors then focuses), `moveFile` (drag-reorder),
  `closeFile`/`closeFilesToLeft`/`closeFilesToRight`/`closeOtherFiles`/
  `closeAllFiles`/`closeFilesUnder`, `beginRename`/`cancelRename`/
  `reconcileRename` (rewrites open tabs incl. directory descendants by prefix),
  `refreshTree` (reloads root + expanded dirs, bumps `refreshToken`),
  `hasState`. Surfaced via `IAppState.fileTreeByRepoId`.
- **UI** (`app/src/ui/file-tree/`): `FileTree` + `FileTreeItem` render the
  sidebar (lazy expand, inline rename, right-click context menu, scrolls the
  selected row into view via `innerRef`). `FileTabs` is the tab strip —
  drag-to-reorder (HTML5 DnD), horizontal overflow scrolling, per-tab close +
  middle-click close + a right-click close menu (Close / Others / Left / Right /
  All). `FileViewer` switches on file kind: code table (`cm-s-default` reuses
  the diff syntax theme), `SandboxedMarkdown` (needs the `emoji` map), delimited
  table, `<img>`/`<video>` media, browser-open card, or a stale-reload guard
  keyed on `reloadToken` + mtime.
- **Dispatcher**: `openFileTreeFile`, `activateFileTreeTab`,
  `revealFileTreeFile`, `moveFileTreeTab`, `closeFileTreeTab` (+
  `…ToLeft`/`…ToRight`/`closeOther…`/`closeAll…`), `expandFileTreeFolder`,
  `collapseFileTreeFolder`, `beginFileTreeRename`, `cancelFileTreeRename`,
  `renameFileTreeEntry`, `deleteFileTreeEntry`, `refreshFileTree`. The tab
  is refreshed on activation and as part of `_refreshRepository` (so fetch/pull
  keep the tree + open viewers current even when Files isn't the active tab).
- **Keyboard** (in `RepositoryView.onGlobalKeyDown`, only while Files is
  active): Ctrl/Cmd+W closes the active tab; Ctrl+PageDown/PageUp cycle tabs
  (Ctrl+Tab is reserved for switching repository sections); Ctrl/Cmd+F bumps
  `RepositoryView`'s `openFindToken`, which `FileViewer` watches to open its
  find bar.
- **Blame + find** (in `FileViewer`): a **Blame** toggle lazily loads
  `getBlame` (`app/src/lib/git/blame.ts`, `parseBlamePorcelain`) and renders a
  per-line gutter with author + short SHA, collapsing contiguous runs of one
  commit. A **Find** bar (`app/src/lib/file-tree/find-in-file.ts`,
  `findMatches`) highlights the active match with count + next/prev. Both keep
  their own component state guarded by tokens like the content loader.
- Tests: 90 unit tests across 10 files in `app/test/unit/file-tree/`, plus
  `blame-test.ts` and `find-in-file-test.ts`.

### Submodules (`app/src/lib/git/submodule.ts`, `app/src/lib/stores/submodule-store.ts`, `app/src/ui/submodules/`)

A Submodules tab mirroring the Worktrees subsystem.

- **Git layer**: `parseSubmoduleStatus` parses `git submodule status` into
  `ISubmoduleStatusEntry` (`{sha, path, describe, state}`) where `state` is a
  `SubmoduleWorkDirState` derived from the leading flag (` `/`-`/`+`/`U` →
  upToDate/uninitialized/outOfDate/conflicted). `getSubmodules`,
  `updateSubmodules` (`--init --recursive`), `syncSubmodules`, `deinitSubmodule`.
  The pre-existing `listSubmodules`/`resetSubmodulePaths` are unchanged.
- **`SubmoduleStore`**: per-`repositoryId` cache, coalescing + clear-during-load
  guard, surfaced via `IAppState.submodulesByRepoId`.
- **UI**: `SubmoduleList` + `SubmoduleListItem` (status badge, per-row Update,
  Update-all / Sync toolbar), backing both sidebar and detail pane in
  `RepositorySectionTab.Submodules` (overflow menu).
- **Dispatcher**: `loadSubmodules`, `updateSubmodules`, `syncSubmodules`.

### Commit Graph (`app/src/lib/commit-graph.ts`, `app/src/ui/history/commit-graph.tsx`)

DAG lane rendering beside the History commit list.

- `buildCommitGraph(commits)` assigns branch lanes from parent SHAs
  (newest-first): waiting lanes merge into a commit's node, tips take the
  leftmost free lane, parents continue/open lanes, trailing lanes compact for
  reuse. Returns per-row `{sha, column, lanes, parentColumns, totalColumns}`.
  `computeGraphSegments(row, nextLanes)` derives the line segments to draw.
- `CommitGraph` renders an SVG cell; `commit-list.tsx` memoizes
  `buildCommitGraph` by `commitSHAs` and renders a lane column left of each row.

### Command Palette (`app/src/lib/command-palette.ts`, `app/src/ui/command-palette/`)

A fuzzy action launcher opened with Ctrl/Cmd+K (handled in `App.onWindowKeyDown`
→ `PopupType.CommandPalette`).

- `buildCommandPaletteItems(context)` builds the action list from an injected
  `ICommandPaletteContext` (repo-scoped actions gated on `hasRepository`);
  `filterCommands` ranks via `fuzzy-find`. `App.buildCommandPaletteItems` wires
  dispatcher actions, including the AI review/summarize actions.
- `CommandPalette` dialog: query input, arrow/Enter navigation, run-on-activate.

### AI-Native Workflow (`app/src/lib/ai/`, `app/src/ui/ai/`)

Four one-shot AI actions on a shared client, layered on the existing AI
commit-message provider (OpenRouter, configured in Preferences).

- **Shared core**: `client.ts` (`createAIClient` → `complete(messages, opts)`,
  injectable `fetcher`, `truncateForPrompt`); `ai-settings.ts` (`IAISettings`,
  `getAISettings`, `hasUsableAISettings`); `git-context.ts` (raw `git diff`/
  `show` text helpers); `actions.ts` (orchestrators `runPRDescription`,
  `runSummary`, `runReview`, `runConflictAssist`, each accepting an injected
  `IAIClient` for tests). `commit-message.ts` is intentionally NOT refactored
  onto the client — its tests pin the exact wire format.
- **Actions** (pure builder + parser each): `pr-description.ts`,
  `summarize-changes.ts`, `review-changes.ts`, `conflict-assist.ts`
  (`parseConflictHunks` handles diff3 base sections).
- **UI**: `AIResultDialog` (loading/error/result + Insert/Copy/Regenerate,
  render-prop body), `ai-result-render.tsx` (`renderAIResult` +
  `aiResultCopyText` per kind), `AIActionDialog` container (runs the orchestrator
  on mount, guarded against stale results and unmount). Driven by
  `PopupType.AIAction` carrying `{repository, action}` (the `AIAction` union is
  in `models/ai-action.ts`).
- **Entry points**: command palette ("AI: Review my changes" / "AI: Summarize
  my changes") and a "Generate description (AI)" button in the open-PR dialog.
  GitHub Desktop's "Create PR" opens the browser, so the PR description result
  is Copy-to-paste rather than an in-app field.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, often with scoped prefixes for
automation such as `build(deps): bump ...`. Keep commits focused and mention PR
or issue numbers when relevant. Open draft PRs for work in progress, include a
clear description, link related issues, and add screenshots or recordings for UI
changes. Expect review iteration; mark the PR ready only after tests and linting
that match the change have passed.
