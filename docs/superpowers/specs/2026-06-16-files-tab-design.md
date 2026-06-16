# Files Tab — Read-Only Code Browser + Tab Declutter

**Date:** 2026-06-16
**Status:** Approved design, ready for planning

## Summary

Add a **Files** tab to the repository view that shows the repository's
folder structure in the left sidebar. Clicking a file renders its current
working-tree contents, syntax-highlighted and read-only, in the right
content pane. At the same time, declutter the sidebar tab strip by moving
the rarely-used **Stashes** and **Worktrees** tabs behind a `⋯` overflow
menu.

Nothing is removed or made unreachable: Stashes and Worktrees keep all
existing behavior; they simply move out of the always-visible strip.

## Goals

- Browse the repository's files without leaving GitHub Desktop.
- View any text file's working-tree contents with syntax highlighting,
  read-only.
- Reduce the primary tab strip from five tabs to four by relocating
  Stashes and Worktrees behind an overflow control.
- Reuse existing infrastructure (the diff highlighter pipeline, the
  per-`repositoryId` store conventions, the shared `TabBar`).

## Non-Goals

- **No editing.** The viewer is strictly read-only. No save, no dirty
  state, no in-app editor. (Considered and explicitly rejected to keep
  scope contained and avoid conflicts with git/external edits.)
- No "open in external editor" button in this iteration (can be added
  later; out of scope now).
- No per-tab show/hide Preferences toggle (considered; rejected in favor
  of the simpler fixed overflow menu).
- No file search / fuzzy finder in this iteration.

## Decisions (from brainstorming)

1. **Viewer scope:** Read-only, syntax-highlighted view of working-tree
   contents. Reuses the existing diff highlighter.
2. **Tab strategy:** Primary strip = `Changes · History · Files ·
   Actions`. Stashes & Worktrees move behind a `⋯` overflow popover.
3. **File source:** Working tree, gitignore-aware. Show everything on
   disk except git-ignored paths and `.git`. Untracked (new, non-ignored)
   files appear. Folders load lazily on expand.

## Architecture

Five layers, matching existing subsystem conventions (cf. Worktrees,
Stash Manager, Workflow Runs):

### 1. Models (`app/src/models/file-tree.ts`)

```ts
export interface FileTreeEntry {
  /** Base name, e.g. "index.ts" */
  readonly name: string
  /** Path relative to the repository root, POSIX-style, e.g. "app/src/index.ts" */
  readonly path: string
  readonly kind: 'file' | 'directory'
}
```

A read result type for the viewer:

```ts
export interface FileViewerContents {
  readonly content: string
  readonly isBinary: boolean
  readonly tooLarge: boolean
}
```

### 2. FS / Git layer (`app/src/lib/file-tree/`)

- `list-directory.ts` — `readWorkingDirectory(repository, relativePath):
  Promise<ReadonlyArray<FileTreeEntry>>`.
  - `fs.readdir(repo.path/relativePath, { withFileTypes: true })`.
  - Always hide `.git`.
  - Filter ignored entries by piping candidate relative paths through
    `git check-ignore --stdin` (one batched git call per expanded
    folder). Entries reported by `check-ignore` are dropped.
  - Sort: directories first, then files; each group alphabetical,
    case-insensitive.
  - **Lazy:** only the requested directory is read — never recursive.
- `read-file.ts` — `readFileForViewer(repository, relativePath):
  Promise<FileViewerContents>`.
  - `fs.readFile` with a byte cap mirroring the diff size limit
    (`tooLarge: true` when exceeded, content truncated/empty).
  - Binary detection (NUL-byte scan over a prefix); `isBinary: true`
    short-circuits highlighting.

Both functions use async Node APIs and throw on hard errors; callers
degrade gracefully per the store/viewer contracts below.

### 3. Store (`app/src/lib/stores/file-tree-store.ts`)

Per-`repositoryId` cache, surfaced via `IAppState.fileTreeByRepoId`,
mirroring `WorktreeStore`.

```ts
interface IRepoFileTreeState {
  readonly expandedPaths: ReadonlySet<string>
  readonly childrenByPath: ReadonlyMap<string, ReadonlyArray<FileTreeEntry>>
  readonly loadingPaths: ReadonlySet<string>
  readonly selectedFilePath: string | null
  readonly error: Error | null
}
```

- `expand(repo, path)` / `collapse(repo, path)` — toggle a folder. Expand
  triggers a lazy `readWorkingDirectory` if the children aren't cached.
- `selectFile(repo, path)` — sets `selectedFilePath`.
- `refresh(repo)` — clears caches and reloads the root.
- Concurrent per-path loads **coalesce** (an in-flight set keyed by
  `${repositoryId}:${path}`).
- A `selectedRepoId` guard drops loads that resolve after the user
  switched repositories (same pattern as the terminal store), so a late
  `readdir` can't write into the wrong repo's state.

**File *content* is deliberately NOT stored here.** The viewer fetches
and highlights on selection (cf. `WorkflowRunDetail` fetching its own
jobs). This keeps large blobs and token maps out of global app state and
avoids re-render storms on every keystroke elsewhere.

### 4. UI (`app/src/ui/file-tree/`)

- `FileTree` — scrollable container. Renders the root entries and, for
  each expanded folder, its cached children indented by depth. Owns
  keyboard navigation (up/down to move, left/right to collapse/expand,
  enter to select) and selection highlight. Pulls structure from the
  store via props threaded through `RepositoryView`.
- `FileTreeItem` — one row: a chevron toggle for directories, a
  file-type octicon + name for files, indentation proportional to depth.
  Folder rows toggle expand; file rows select.
- `FileViewer` — the right pane. On `selectedFilePath` change:
  1. `readFileForViewer`.
  2. If `isBinary` → "Binary file not shown". If `tooLarge` → size
     notice. If empty → empty-state. If read error (e.g. deleted between
     list and open) → graceful error message.
  3. Otherwise tokenize via the existing `highlight()` worker
     (`app/src/lib/highlighter`) keyed by file extension, and render a
     read-only, line-numbered, syntax-colored view.
  - Guards against stale async results when the selection changes
    mid-fetch.

Wiring in `app/src/ui/repository.tsx`:
- `renderFilesSidebar()` → `FileTree` (new branch in
  `renderSidebarContents`).
- `renderContentForFiles()` → `FileViewer` (new branch in
  `renderContent`).

### 5. Tab strip + overflow (`app/src/ui/repository.tsx`)

- The shared `TabBar` component is **not modified**; it keeps rendering
  an index-based list. The primary strip renders four children:
  `Changes`, `History`, `Files`, `Actions`.
- A sibling `⋯` overflow button is rendered next to the `TabBar`. It
  opens a small popover (existing popover/menu primitives) listing
  **Stashes** and **Worktrees**. Selecting one calls
  `changeRepositorySection` and the relevant `loadStashes` /
  `loadWorktrees`.
- Selection state:
  - When the active section is one of the four primary tabs, `TabBar`'s
    `selectedIndex` points at it and `⋯` is inactive.
  - When the active section is Stashes or Worktrees, `selectedIndex` is
    `-1` (no primary tab highlighted) and `⋯` carries the active style.
- `changeTab` (Ctrl+Tab) keeps cycling through **all** sections
  (Changes → History → Files → Actions → Stashes → Worktrees) so the
  keyboard path reaches the overflowed sections unchanged.
- `onTabClicked` maps the four primary `TabBar` indices to their
  sections; the overflow popover handles Stashes/Worktrees directly.

### Styling (`app/styles/ui/_file-tree.scss`)

- Tree row hover and selected states; depth indentation with subtle
  indent guides.
- Viewer: monospace, line-number gutter, reusing the diff
  syntax-highlight CSS variables so colors and dark/light themes stay
  consistent with the diff view.

## Data Flow

```
user clicks folder chevron
  → FileTreeItem onToggle
  → dispatcher.expandFileTreeFolder(repo, path)   (mirrors loadWorktrees)
  → FileTreeStore.expand → readWorkingDirectory (lazy, gitignore-aware)
  → store updates childrenByPath/expandedPaths → IAppState.fileTreeByRepoId
  → RepositoryView re-renders FileTree

user clicks file row
  → FileTreeItem onSelect
  → dispatcher.selectFileTreeFile(repo, path)
  → store sets selectedFilePath
  → FileViewer (right pane) reads selectedFilePath, fetches + highlights
```

## Dispatcher additions

- `expandFileTreeFolder(repo, path)` / `collapseFileTreeFolder(repo, path)`
- `selectFileTreeFile(repo, path)`
- `refreshFileTree(repo)`

These delegate to `FileTreeStore` from the `AppStore`, mirroring the
`loadWorktrees` / `loadStashes` wiring. `changeRepositorySection` is
reused for tab switching; a `Files` case loads the root directory on
first entry.

## Error Handling

- One unreadable folder or file degrades only that node — it never
  poisons the rest of the tree (per-call try/catch, error surfaced on the
  affected row or in the viewer).
- Binary / too-large / empty / deleted-between-list-and-open all have
  explicit viewer states.
- Repo switch mid-load: guarded by `selectedRepoId`; stale results
  dropped.
- Symlinks: listed by name; following is left to `readFile` (errors
  handled gracefully if the target is missing).

## Testing

Unit tests (Jest), beside existing areas under `app/test/unit`:

- `list-directory`: fixture repo — gitignore filtering, `.git` hidden,
  directories-first sort, lazy (non-recursive) behavior.
- `read-file`: binary detection, byte-cap `tooLarge`, missing file error.
- `FileTreeStore`: expand/collapse, per-path coalescing, repo-switch
  guard, selection.
- Components: `FileTree`, `FileTreeItem`, `FileViewer` (binary / large /
  empty / error / highlighted states).
- Overflow: Stashes & Worktrees reachable via the `⋯` popover; active
  state correct when an overflowed section is selected.

## Affected / New Files

New:
- `app/src/models/file-tree.ts`
- `app/src/lib/file-tree/list-directory.ts`
- `app/src/lib/file-tree/read-file.ts`
- `app/src/lib/stores/file-tree-store.ts`
- `app/src/ui/file-tree/file-tree.tsx`
- `app/src/ui/file-tree/file-tree-item.tsx`
- `app/src/ui/file-tree/file-viewer.tsx`
- `app/styles/ui/_file-tree.scss`
- Test files mirroring the above under `app/test/unit/file-tree/`.

Modified:
- `app/src/lib/app-state.ts` (enum + `IAppState.fileTreeByRepoId`)
- `app/src/ui/repository.tsx` (tabs, overflow, render branches)
- `app/src/lib/dispatcher/dispatcher.ts` (new methods)
- `app/src/lib/stores/app-store.ts` (store wiring, root load on Files entry)
- `app/styles/ui/_app.scss` or index (import new stylesheet)
```
