import * as React from 'react'
import { Repository } from '../models/repository'
import { Commit, CommitOneLine } from '../models/commit'
import { TipState } from '../models/tip'
import { UiView } from './ui-view'
import { Changes, ChangesSidebar } from './changes'
import { NoChanges } from './changes/no-changes'
import { MultipleSelection } from './changes/multiple-selection'
import { FilesChangedBadge } from './changes/files-changed-badge'
import { SelectedCommits, CompareSidebar } from './history'
import { Resizable } from './resizable'
import { TabBar } from './tab-bar'
import { Octicon } from './octicons'
import * as octicons from './octicons/octicons.generated'
import { showContextualMenu, IMenuItem } from '../lib/menu-item'
import { FileTree } from './file-tree/file-tree'
import { FileTabs } from './file-tree/file-tabs'
import { FileViewer } from './file-tree/file-viewer'
import { IRepoFileTreeState } from '../lib/stores/file-tree-store'
import { FileTreeEntry } from '../models/file-tree'
import {
  isBrowserViewable,
  openInBrowser,
} from '../lib/file-tree/open-in-browser'
import { revealInFileManager } from '../lib/app-shell'
import { showFolderContents } from './main-process-proxy'
import {
  CopyFilePathLabel,
  CopyRelativeFilePathLabel,
  DefaultEditorLabel,
  RevealInFileManagerLabel,
  TrashNameLabel,
} from './lib/context-menu'
import { clipboard } from 'electron'
import * as Path from 'path'
import {
  IRepositoryState,
  RepositorySectionTab,
  ChangesSelectionKind,
  IConstrainedValue,
} from '../lib/app-state'
import { Dispatcher } from './dispatcher'
import { IssuesStore, GitHubUserStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { Account } from '../models/account'
import { FocusContainer } from './lib/focus-container'
import { ImageDiffType } from '../models/diff'
import { IMenu } from '../models/app-menu'
import { StashDiffViewer } from './stashing'
import { StashedChangesLoadStates, IStashEntry } from '../models/stash-entry'
import { StashList } from './stashes/stash-list'
import { IWorktreeEntry } from '../models/worktree'
import { WorktreeList } from './worktrees/worktree-list'
import { IWorkflowRun } from '../models/workflow-run'
import { WorkflowRunList } from './workflow-runs/workflow-run-list'
import { WorkflowRunDetail } from './workflow-runs/workflow-run-detail'
import { PopupType } from '../models/popup'
import { TutorialPanel, TutorialWelcome, TutorialDone } from './tutorial'
import { TutorialStep, isValidTutorialStep } from '../models/tutorial-step'
import { openFile } from './lib/open-file'
import { AheadBehindStore } from '../lib/stores/ahead-behind-store'
import { dragAndDropManager } from '../lib/drag-and-drop-manager'
import { DragType } from '../models/drag-drop'
import { PullRequestSuggestedNextAction } from '../models/pull-request'
import { clamp } from '../lib/clamp'
import { Emoji } from '../lib/emoji'

interface IRepositoryViewProps {
  readonly repository: Repository
  readonly state: IRepositoryState
  readonly dispatcher: Dispatcher
  readonly emoji: Map<string, Emoji>
  readonly sidebarWidth: IConstrainedValue
  readonly commitSummaryWidth: IConstrainedValue
  readonly stashedFilesWidth: IConstrainedValue
  readonly issuesStore: IssuesStore
  readonly gitHubUserStore: GitHubUserStore
  readonly onViewCommitOnGitHub: (SHA: string, filePath?: string) => void
  readonly imageDiffType: ImageDiffType
  readonly hideWhitespaceInChangesDiff: boolean
  readonly hideWhitespaceInHistoryDiff: boolean
  readonly showSideBySideDiff: boolean
  readonly showDiffCheckMarks: boolean
  readonly askForConfirmationOnDiscardChanges: boolean
  readonly askForConfirmationOnDiscardStash: boolean
  readonly askForConfirmationOnCheckoutCommit: boolean
  readonly focusCommitMessage: boolean
  readonly commitSpellcheckEnabled: boolean
  readonly showCommitLengthWarning: boolean
  readonly accounts: ReadonlyArray<Account>
  readonly worktreeEntries: ReadonlyArray<IWorktreeEntry>
  readonly worktreesLoading: boolean

  /** Cached working-tree file structure for this repository (Files tab). */
  readonly fileTreeState: IRepoFileTreeState

  /** Cached workflow run entries for this repository (Actions tab). */
  readonly workflowRunEntries: ReadonlyArray<IWorkflowRun>
  readonly workflowRunsLoading: boolean

  /**
   * A value indicating whether or not the application is currently presenting
   * a modal dialog such as the preferences, or an error dialog
   */
  readonly isShowingModal: boolean

  /**
   * A value indicating whether or not the application is currently presenting
   * a foldout dialog such as the file menu, or the branches dropdown
   */
  readonly isShowingFoldout: boolean

  /**
   * Whether or not the user has a configured (explicitly,
   * or automatically) external editor. Used to
   * determine whether or not to render the action for
   * opening the repository in an external editor.
   */
  readonly isExternalEditorAvailable: boolean

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /** A cached entry representing an external editor found on the user's machine */
  readonly resolvedExternalEditor: string | null

  /**
   * Callback to open a selected file using the configured external editor
   *
   * @param fullPath The full path to the file on disk
   */
  readonly onOpenInExternalEditor: (fullPath: string) => void

  /**
   * The top-level application menu item.
   */
  readonly appMenu: IMenu | undefined

  readonly currentTutorialStep: TutorialStep

  readonly onExitTutorial: () => void
  readonly aheadBehindStore: AheadBehindStore
  readonly onCherryPick: (
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) => void

  /** The user's preference of pull request suggested next action to use **/
  readonly pullRequestSuggestedNextAction?: PullRequestSuggestedNextAction

  /** Cached stash entries for this repository (Stashes tab). */
  readonly stashEntries: ReadonlyArray<IStashEntry>
  readonly stashesLoading: boolean
}

interface IRepositoryViewState {
  readonly changesListScrollTop: number
  readonly compareListScrollTop: number
  readonly selectedStashSha: string | null
  readonly selectedWorkflowRunId: number | null
}

const enum Tab {
  Changes = 0,
  History = 1,
  Files = 2,
  Actions = 3,
}

export class RepositoryView extends React.Component<
  IRepositoryViewProps,
  IRepositoryViewState
> {
  private previousSection: RepositorySectionTab =
    this.props.state.selectedSection

  // Flag to force the app to use the scroll position in the state the next time
  // the Compare list is rendered.
  private forceCompareListScrollTop: boolean = false

  private readonly changesSidebarRef = React.createRef<ChangesSidebar>()
  private readonly compareSidebarRef = React.createRef<CompareSidebar>()

  private focusHistoryNeeded: boolean = false
  private focusChangesNeeded: boolean = false

  public constructor(props: IRepositoryViewProps) {
    super(props)

    this.state = {
      changesListScrollTop: 0,
      compareListScrollTop: 0,
      selectedStashSha: null,
      selectedWorkflowRunId: null,
    }
  }

  public setFocusHistoryNeeded(): void {
    this.focusHistoryNeeded = true
  }

  public setFocusChangesNeeded(): void {
    this.focusChangesNeeded = true
  }

  public scrollCompareListToTop(): void {
    this.forceCompareListScrollTop = true

    this.setState({
      compareListScrollTop: 0,
    })
  }

  private onChangesListScrolled = (scrollTop: number) => {
    this.setState({ changesListScrollTop: scrollTop })
  }

  private onCompareListScrolled = (scrollTop: number) => {
    this.setState({ compareListScrollTop: scrollTop })
  }

  private renderChangesBadge(): JSX.Element | null {
    const filesChangedCount =
      this.props.state.changesState.workingDirectory.files.length

    if (filesChangedCount <= 0) {
      return null
    }

    return <FilesChangedBadge filesChangedCount={filesChangedCount} />
  }

  private renderTabs(): JSX.Element {
    const section = this.props.state.selectedSection
    const selectedTab =
      section === RepositorySectionTab.Changes
        ? Tab.Changes
        : section === RepositorySectionTab.History
        ? Tab.History
        : section === RepositorySectionTab.Files
        ? Tab.Files
        : section === RepositorySectionTab.Actions
        ? Tab.Actions
        : -1 // Stashes / Worktrees live in the overflow menu.

    const overflowActive =
      section === RepositorySectionTab.Stashes ||
      section === RepositorySectionTab.Worktrees

    return (
      <div className="repository-tabs">
        <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
          <span className="with-indicator" id="changes-tab">
            <span>Changes</span>
            {this.renderChangesBadge()}
          </span>

          <div className="with-indicator" id="history-tab">
            <span>History</span>
          </div>

          <div className="with-indicator" id="files-tab">
            <span>Files</span>
          </div>

          <div className="with-indicator" id="actions-tab">
            <span>Actions</span>
          </div>
        </TabBar>
        <button
          type="button"
          className={
            'repository-tabs-overflow' + (overflowActive ? ' active' : '')
          }
          onClick={this.onOverflowClick}
          aria-haspopup="menu"
        >
          <span className="sr-only">More tabs</span>
          <Octicon symbol={octicons.kebabHorizontal} aria-hidden={true} />
        </button>
      </div>
    )
  }

  private onOverflowClick = () => {
    showContextualMenu([
      {
        label: 'Stashes',
        action: () => this.switchToSection(RepositorySectionTab.Stashes),
      },
      {
        label: 'Worktrees',
        action: () => this.switchToSection(RepositorySectionTab.Worktrees),
      },
    ])
  }

  private switchToSection(section: RepositorySectionTab) {
    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      section
    )
    if (section === RepositorySectionTab.Stashes) {
      this.props.dispatcher.loadStashes(this.props.repository)
    }
    if (section === RepositorySectionTab.Worktrees) {
      this.props.dispatcher.loadWorktrees(this.props.repository)
    }
  }

  private renderChangesSidebar(): JSX.Element {
    const tip = this.props.state.branchesState.tip

    let branchName: string | null = null

    if (tip.kind === TipState.Valid) {
      branchName = tip.branch.name
    } else if (tip.kind === TipState.Unborn) {
      branchName = tip.ref
    }

    const localCommitSHAs = this.props.state.localCommitSHAs
    const mostRecentLocalCommitSHA =
      localCommitSHAs.length > 0 ? localCommitSHAs[0] : null
    const mostRecentLocalCommit =
      (mostRecentLocalCommitSHA
        ? this.props.state.commitLookup.get(mostRecentLocalCommitSHA)
        : null) || null

    // -1 Because of right hand side border
    const availableWidth = clamp(this.props.sidebarWidth) - 1

    const scrollTop =
      this.previousSection === RepositorySectionTab.History
        ? this.state.changesListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.Changes

    return (
      <ChangesSidebar
        ref={this.changesSidebarRef}
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        changes={this.props.state.changesState}
        aheadBehind={this.props.state.aheadBehind}
        branch={branchName}
        commitAuthor={this.props.state.commitAuthor}
        emoji={this.props.emoji}
        mostRecentLocalCommit={mostRecentLocalCommit}
        issuesStore={this.props.issuesStore}
        availableWidth={availableWidth}
        gitHubUserStore={this.props.gitHubUserStore}
        isCommitting={this.props.state.isCommitting}
        commitToAmend={this.props.state.commitToAmend}
        isPushPullFetchInProgress={this.props.state.isPushPullFetchInProgress}
        focusCommitMessage={this.props.focusCommitMessage}
        askForConfirmationOnDiscardChanges={
          this.props.askForConfirmationOnDiscardChanges
        }
        accounts={this.props.accounts}
        isShowingModal={this.props.isShowingModal}
        isShowingFoldout={this.props.isShowingFoldout}
        externalEditorLabel={this.props.externalEditorLabel}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        onChangesListScrolled={this.onChangesListScrolled}
        changesListScrollTop={scrollTop}
        shouldNudgeToCommit={
          this.props.currentTutorialStep === TutorialStep.MakeCommit
        }
        commitSpellcheckEnabled={this.props.commitSpellcheckEnabled}
        showCommitLengthWarning={this.props.showCommitLengthWarning}
      />
    )
  }

  private renderCompareSidebar(): JSX.Element {
    const { repository, dispatcher, state, aheadBehindStore, emoji } =
      this.props
    const {
      remote,
      compareState,
      branchesState,
      commitSelection: { shas },
      commitLookup,
      localCommitSHAs,
      localTags,
      tagsToPush,
      multiCommitOperationState: mcos,
    } = state
    const { tip } = branchesState
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    const scrollTop =
      this.forceCompareListScrollTop ||
      this.previousSection === RepositorySectionTab.Changes
        ? this.state.compareListScrollTop
        : undefined
    this.previousSection = RepositorySectionTab.History
    this.forceCompareListScrollTop = false

    return (
      <CompareSidebar
        ref={this.compareSidebarRef}
        repository={repository}
        isLocalRepository={remote === null}
        compareState={compareState}
        selectedCommitShas={shas}
        shasToHighlight={compareState.shasToHighlight}
        currentBranch={currentBranch}
        emoji={emoji}
        commitLookup={commitLookup}
        localCommitSHAs={localCommitSHAs}
        localTags={localTags}
        dispatcher={dispatcher}
        onRevertCommit={this.onRevertCommit}
        onAmendCommit={this.onAmendCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        onCompareListScrolled={this.onCompareListScrolled}
        onCherryPick={this.props.onCherryPick}
        compareListScrollTop={scrollTop}
        tagsToPush={tagsToPush}
        aheadBehindStore={aheadBehindStore}
        isMultiCommitOperationInProgress={mcos !== null}
        askForConfirmationOnCheckoutCommit={
          this.props.askForConfirmationOnCheckoutCommit
        }
        accounts={this.props.accounts}
      />
    )
  }

  private renderSidebarContents(): JSX.Element {
    const selectedSection = this.props.state.selectedSection

    if (selectedSection === RepositorySectionTab.Changes) {
      return this.renderChangesSidebar()
    } else if (selectedSection === RepositorySectionTab.History) {
      return this.renderCompareSidebar()
    } else if (selectedSection === RepositorySectionTab.Stashes) {
      return this.renderStashesSidebar()
    } else if (selectedSection === RepositorySectionTab.Worktrees) {
      return this.renderWorktreesSidebar()
    } else if (selectedSection === RepositorySectionTab.Actions) {
      return this.renderActionsSidebar()
    } else if (selectedSection === RepositorySectionTab.Files) {
      return this.renderFilesSidebar()
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  private renderFilesSidebar(): JSX.Element {
    return (
      <FileTree
        state={this.props.fileTreeState}
        onToggleFolder={this.onToggleFileTreeFolder}
        onSelectFile={this.onSelectFileTreeFile}
        onContextMenu={this.onFileTreeContextMenu}
        onSubmitRename={this.onSubmitFileTreeRename}
        onCancelRename={this.onCancelFileTreeRename}
      />
    )
  }

  private onFileTreeContextMenu = (entry: FileTreeEntry) => {
    const { repository, dispatcher, externalEditorLabel } = this.props
    const fullPath = Path.join(repository.path, entry.path)
    const isDirectory = entry.kind === 'directory'

    const openInEditorLabel = externalEditorLabel
      ? `Open in ${externalEditorLabel}`
      : DefaultEditorLabel

    const items: IMenuItem[] = [
      {
        label: openInEditorLabel,
        action: () => this.props.onOpenInExternalEditor(fullPath),
      },
    ]

    if (!isDirectory && isBrowserViewable(entry.path)) {
      items.push({
        label: __DARWIN__ ? 'Open in Browser' : 'Open in browser',
        action: () => openInBrowser(repository, entry.path),
      })
    }

    items.push(
      {
        label: isDirectory
          ? __DARWIN__
            ? 'Open Folder'
            : 'Open folder'
          : RevealInFileManagerLabel,
        action: () =>
          isDirectory
            ? showFolderContents(fullPath)
            : revealInFileManager(repository, entry.path),
      },
      { type: 'separator' },
      {
        label: CopyFilePathLabel,
        action: () => clipboard.writeText(fullPath),
      },
      {
        label: CopyRelativeFilePathLabel,
        action: () => clipboard.writeText(Path.normalize(entry.path)),
      },
      { type: 'separator' },
      {
        label: 'Rename…',
        action: () => dispatcher.beginFileTreeRename(repository, entry.path),
      },
      {
        label: `Move to ${TrashNameLabel}`,
        action: () => dispatcher.deleteFileTreeEntry(repository, entry.path),
      }
    )

    showContextualMenu(items)
  }

  private onSubmitFileTreeRename = (entry: FileTreeEntry, newName: string) => {
    const { dispatcher, repository } = this.props
    if (newName.trim() === '' || newName === entry.name) {
      dispatcher.cancelFileTreeRename(repository)
      return
    }
    dispatcher.renameFileTreeEntry(repository, entry.path, newName)
  }

  private onCancelFileTreeRename = () => {
    this.props.dispatcher.cancelFileTreeRename(this.props.repository)
  }

  private onToggleFileTreeFolder = (path: string) => {
    const { dispatcher, repository, fileTreeState } = this.props
    if (fileTreeState.expandedPaths.has(path)) {
      dispatcher.collapseFileTreeFolder(repository, path)
    } else {
      dispatcher.expandFileTreeFolder(repository, path)
    }
  }

  private onSelectFileTreeFile = (path: string) => {
    this.props.dispatcher.openFileTreeFile(this.props.repository, path)
  }

  /** Selecting an existing tab focuses it and reveals its file in the tree. */
  private onActivateFileTreeTab = (path: string) => {
    this.props.dispatcher.revealFileTreeFile(this.props.repository, path)
  }

  private onReorderFileTreeTab = (fromPath: string, toPath: string) => {
    this.props.dispatcher.moveFileTreeTab(
      this.props.repository,
      fromPath,
      toPath
    )
  }

  private onCloseFileTreeTab = (path: string) => {
    this.props.dispatcher.closeFileTreeTab(this.props.repository, path)
  }

  private onCloseAllFileTreeTabs = () => {
    this.props.dispatcher.closeAllFileTreeTabs(this.props.repository)
  }

  private onFileTreeTabContextMenu = (path: string) => {
    const { dispatcher, repository } = this.props
    const { openFilePaths } = this.props.fileTreeState
    const index = openFilePaths.indexOf(path)
    if (index === -1) {
      return
    }

    const hasLeft = index > 0
    const hasRight = index < openFilePaths.length - 1
    const hasOthers = openFilePaths.length > 1

    const items: IMenuItem[] = [
      {
        label: 'Close',
        action: () => dispatcher.closeFileTreeTab(repository, path),
      },
      {
        label: 'Close Others',
        enabled: hasOthers,
        action: () => dispatcher.closeOtherFileTreeTabs(repository, path),
      },
      {
        label: 'Close to the Left',
        enabled: hasLeft,
        action: () => dispatcher.closeFileTreeTabsToLeft(repository, path),
      },
      {
        label: 'Close to the Right',
        enabled: hasRight,
        action: () => dispatcher.closeFileTreeTabsToRight(repository, path),
      },
      { type: 'separator' },
      {
        label: 'Close All',
        action: () => dispatcher.closeAllFileTreeTabs(repository),
      },
    ]

    showContextualMenu(items)
  }

  private renderActionsSidebar(): JSX.Element {
    const { state } = this.props
    const { tip } = state.branchesState
    const currentBranch = tip.kind === TipState.Valid ? tip.branch.name : ''

    return (
      <WorkflowRunList
        entries={this.props.workflowRunEntries}
        loading={this.props.workflowRunsLoading}
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        accounts={this.props.accounts}
        branch={currentBranch}
        onSelectRun={this.onSelectWorkflowRun}
        selectedRunId={this.state.selectedWorkflowRunId}
      />
    )
  }

  private onSelectWorkflowRun = (entry: IWorkflowRun) => {
    this.setState({ selectedWorkflowRunId: entry.id })
  }

  private renderStashesSidebar(): JSX.Element {
    return (
      <StashList
        entries={this.props.stashEntries}
        loading={this.props.stashesLoading}
        selectedSha={this.state.selectedStashSha}
        onSelect={this.onSelectStash}
        onCreateClick={this.onCreateStashClick}
      />
    )
  }

  private renderWorktreesSidebar(): JSX.Element {
    return this.renderWorktreeList()
  }

  /**
   * Shared `WorktreeList` render used by both the sidebar and the detail
   * pane so the two never drift apart. WorktreeList owns the toolbar,
   * loading, and empty states.
   */
  private renderWorktreeList(): JSX.Element {
    return (
      <WorktreeList
        entries={this.props.worktreeEntries}
        loading={this.props.worktreesLoading}
        onCreateWorktree={this.onCreateWorktree}
        onPruneWorktrees={this.onPruneWorktrees}
        onRemoveWorktree={this.onRemoveWorktree}
      />
    )
  }

  private onCreateWorktree = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.WorktreeCreate,
      repository: this.props.repository,
    })
  }

  private onPruneWorktrees = () => {
    this.props.dispatcher.pruneWorktrees(this.props.repository)
  }

  private onRemoveWorktree = (entry: IWorktreeEntry) => {
    this.props.dispatcher.showPopup({
      type: PopupType.WorktreeRemove,
      repository: this.props.repository,
      worktreePath: entry.path,
      branch: entry.branch,
    })
  }

  private onSelectStash = (entry: IStashEntry) => {
    this.setState({ selectedStashSha: entry.stashSha })
  }

  private onCreateStashClick = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.StashCreate,
      repository: this.props.repository,
    })
  }

  private handleSidebarWidthReset = () => {
    this.props.dispatcher.resetSidebarWidth()
  }

  private handleSidebarResize = (width: number) => {
    this.props.dispatcher.setSidebarWidth(width)
  }

  private renderSidebar(): JSX.Element {
    return (
      <FocusContainer onFocusWithinChanged={this.onSidebarFocusWithinChanged}>
        <Resizable
          id="repository-sidebar"
          width={this.props.sidebarWidth.value}
          maximumWidth={this.props.sidebarWidth.max}
          minimumWidth={this.props.sidebarWidth.min}
          onReset={this.handleSidebarWidthReset}
          onResize={this.handleSidebarResize}
        >
          {this.renderTabs()}
          {this.renderSidebarContents()}
        </Resizable>
      </FocusContainer>
    )
  }

  private onSidebarFocusWithinChanged = (sidebarHasFocusWithin: boolean) => {
    if (
      sidebarHasFocusWithin === false &&
      this.props.state.selectedSection === RepositorySectionTab.History
    ) {
      this.props.dispatcher.updateCompareForm(this.props.repository, {
        showBranchList: false,
      })
    }
  }

  private renderStashedChangesContent(): JSX.Element | null {
    const { changesState } = this.props.state
    const { selection, stashEntry } = changesState

    if (selection.kind !== ChangesSelectionKind.Stash || stashEntry === null) {
      return null
    }

    if (stashEntry.files.kind === StashedChangesLoadStates.Loaded) {
      return (
        <StashDiffViewer
          stashEntry={stashEntry}
          selectedStashedFile={selection.selectedStashedFile}
          stashedFileDiff={selection.selectedStashedFileDiff}
          imageDiffType={this.props.imageDiffType}
          fileListWidth={this.props.stashedFilesWidth}
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          askForConfirmationOnDiscardStash={
            this.props.askForConfirmationOnDiscardStash
          }
          showSideBySideDiff={this.props.showSideBySideDiff}
          onOpenBinaryFile={this.onOpenBinaryFile}
          onOpenSubmodule={this.onOpenSubmodule}
          onChangeImageDiffType={this.onChangeImageDiffType}
          onHideWhitespaceInDiffChanged={this.onHideWhitespaceInDiffChanged}
          onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        />
      )
    }

    return null
  }

  private onHideWhitespaceInDiffChanged = (hideWhitespaceInDiff: boolean) => {
    return this.props.dispatcher.onHideWhitespaceInChangesDiffChanged(
      hideWhitespaceInDiff,
      this.props.repository
    )
  }

  private renderContentForHistory(): JSX.Element {
    const { commitSelection, commitLookup, localCommitSHAs } = this.props.state
    const { changesetData, file, diff, shas, shasInDiff, isContiguous } =
      commitSelection

    const selectedCommits = []
    for (const sha of shas) {
      const commit = commitLookup.get(sha)
      if (commit !== undefined) {
        selectedCommits.push(commit)
      }
    }

    const showDragOverlay = dragAndDropManager.isDragOfTypeInProgress(
      DragType.Commit
    )

    return (
      <SelectedCommits
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        selectedCommits={selectedCommits}
        shasInDiff={shasInDiff}
        isContiguous={isContiguous}
        localCommitSHAs={localCommitSHAs}
        changesetData={changesetData}
        selectedFile={file}
        currentDiff={diff}
        emoji={this.props.emoji}
        commitSummaryWidth={this.props.commitSummaryWidth}
        selectedDiffType={this.props.imageDiffType}
        externalEditorLabel={this.props.externalEditorLabel}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        hideWhitespaceInDiff={this.props.hideWhitespaceInHistoryDiff}
        showSideBySideDiff={this.props.showSideBySideDiff}
        onOpenBinaryFile={this.onOpenBinaryFile}
        onOpenSubmodule={this.onOpenSubmodule}
        onChangeImageDiffType={this.onChangeImageDiffType}
        onDiffOptionsOpened={this.onDiffOptionsOpened}
        showDragOverlay={showDragOverlay}
        accounts={this.props.accounts}
      />
    )
  }

  private onDiffOptionsOpened = () => {
    this.props.dispatcher.incrementMetric('diffOptionsViewedCount')
  }

  private onTutorialCompletionAnnounced = () => {
    this.props.dispatcher.markTutorialCompletionAsAnnounced(
      this.props.repository
    )
  }

  private renderTutorialPane(): JSX.Element {
    if (
      [TutorialStep.AllDone, TutorialStep.Announced].includes(
        this.props.currentTutorialStep
      )
    ) {
      return (
        <TutorialDone
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          tutorialCompletionAnnounced={
            this.props.currentTutorialStep === TutorialStep.Announced
          }
          onTutorialCompletionAnnounced={this.onTutorialCompletionAnnounced}
        />
      )
    } else {
      return <TutorialWelcome />
    }
  }

  private renderContentForChanges(): JSX.Element | null {
    const { changesState } = this.props.state
    const { workingDirectory, selection } = changesState

    if (selection.kind === ChangesSelectionKind.Stash) {
      return this.renderStashedChangesContent()
    }

    const { selectedFileIDs, diff } = selection

    if (selectedFileIDs.length > 1) {
      return <MultipleSelection count={selectedFileIDs.length} />
    }

    if (workingDirectory.files.length === 0) {
      if (this.props.currentTutorialStep !== TutorialStep.NotApplicable) {
        return this.renderTutorialPane()
      } else {
        return (
          <NoChanges
            key={this.props.repository.id}
            appMenu={this.props.appMenu}
            repository={this.props.repository}
            repositoryState={this.props.state}
            isExternalEditorAvailable={this.props.isExternalEditorAvailable}
            dispatcher={this.props.dispatcher}
            pullRequestSuggestedNextAction={
              this.props.pullRequestSuggestedNextAction
            }
          />
        )
      }
    } else {
      if (selectedFileIDs.length === 0) {
        return null
      }

      const selectedFile = workingDirectory.findFileWithID(selectedFileIDs[0])

      if (selectedFile === null) {
        return null
      }

      return (
        <Changes
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          file={selectedFile}
          diff={diff}
          isCommitting={this.props.state.isCommitting}
          imageDiffType={this.props.imageDiffType}
          hideWhitespaceInDiff={this.props.hideWhitespaceInChangesDiff}
          showSideBySideDiff={this.props.showSideBySideDiff}
          showDiffCheckMarks={this.props.showDiffCheckMarks}
          onOpenBinaryFile={this.onOpenBinaryFile}
          onOpenSubmodule={this.onOpenSubmodule}
          onChangeImageDiffType={this.onChangeImageDiffType}
          askForConfirmationOnDiscardChanges={
            this.props.askForConfirmationOnDiscardChanges
          }
          onDiffOptionsOpened={this.onDiffOptionsOpened}
        />
      )
    }
  }

  private onOpenBinaryFile = (fullPath: string) => {
    openFile(fullPath, this.props.dispatcher)
  }

  private onOpenSubmodule = (fullPath: string) => {
    this.props.dispatcher.incrementMetric('openSubmoduleFromDiffCount')
    this.props.dispatcher.openOrAddRepository(fullPath)
  }

  private onChangeImageDiffType = (imageDiffType: ImageDiffType) => {
    this.props.dispatcher.changeImageDiffType(imageDiffType)
  }

  private renderContent(): JSX.Element | null {
    const selectedSection = this.props.state.selectedSection
    if (selectedSection === RepositorySectionTab.Changes) {
      return this.renderContentForChanges()
    } else if (selectedSection === RepositorySectionTab.History) {
      return this.renderContentForHistory()
    } else if (selectedSection === RepositorySectionTab.Stashes) {
      return this.renderContentForStashes()
    } else if (selectedSection === RepositorySectionTab.Worktrees) {
      return this.renderContentForWorktrees()
    } else if (selectedSection === RepositorySectionTab.Actions) {
      return this.renderContentForActions()
    } else if (selectedSection === RepositorySectionTab.Files) {
      return this.renderContentForFiles()
    } else {
      return assertNever(selectedSection, 'Unknown repository section')
    }
  }

  private renderContentForFiles(): JSX.Element {
    const { openFilePaths, activeFilePath } = this.props.fileTreeState
    return (
      <div className="files-content">
        <FileTabs
          openFilePaths={openFilePaths}
          activeFilePath={activeFilePath}
          onSelectTab={this.onActivateFileTreeTab}
          onCloseTab={this.onCloseFileTreeTab}
          onCloseAll={this.onCloseAllFileTreeTabs}
          onTabContextMenu={this.onFileTreeTabContextMenu}
          onReorderTab={this.onReorderFileTreeTab}
        />
        <FileViewer
          repository={this.props.repository}
          filePath={activeFilePath}
          emoji={this.props.emoji}
          reloadToken={this.props.fileTreeState.refreshToken}
        />
      </div>
    )
  }

  private renderContentForActions(): JSX.Element {
    const runId = this.state.selectedWorkflowRunId
    const run =
      runId === null
        ? null
        : this.props.workflowRunEntries.find(r => r.id === runId) ?? null

    if (run === null) {
      return (
        <div className="workflow-run-empty-pane">
          {this.props.workflowRunEntries.length === 0
            ? 'No workflow runs to view.'
            : 'Select a workflow run to view its jobs and details.'}
        </div>
      )
    }

    return (
      <WorkflowRunDetail
        run={run}
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        accounts={this.props.accounts}
      />
    )
  }

  /** Resolve the currently selected stash entry, or null when none. */
  private getSelectedStashEntry(): IStashEntry | null {
    const sha = this.state.selectedStashSha
    if (sha === null) {
      return null
    }
    return this.props.stashEntries.find(e => e.stashSha === sha) ?? null
  }

  private renderContentForStashes(): JSX.Element {
    const entry = this.getSelectedStashEntry()
    if (entry === null) {
      return (
        <div className="stash-empty-pane">
          {this.props.stashEntries.length === 0
            ? 'No stashes to view.'
            : 'Select a stash to view its details.'}
        </div>
      )
    }
    return (
      <div className="stash-detail-pane">
        <h3>{entry.message}</h3>
        <div className="stash-detail-pane__meta">
          <span>Branch: {entry.branchName || '(unknown)'}</span>
          <span>SHA: {entry.stashSha.slice(0, 8)}</span>
        </div>
        <div className="stash-detail-pane__actions">
          <button onClick={this.applySelectedStash}>Apply (keep)</button>
          <button onClick={this.popSelectedStash}>
            Pop (apply &amp; drop)
          </button>
          <button onClick={this.dropSelectedStash}>Drop&hellip;</button>
        </div>
      </div>
    )
  }

  private renderContentForWorktrees(): JSX.Element {
    // Reuse the same WorktreeList component the sidebar renders so the
    // detail pane and sidebar never drift apart. WorktreeList owns the
    // loading and empty states.
    return (
      <div className="worktree-detail-pane">
        <h3>Linked Worktrees</h3>
        {this.renderWorktreeList()}
      </div>
    )
  }

  private applySelectedStash = () => {
    const entry = this.getSelectedStashEntry()
    if (entry === null) {
      return
    }
    this.props.dispatcher.applyStash(this.props.repository, entry.stashSha)
  }

  private popSelectedStash = () => {
    const entry = this.getSelectedStashEntry()
    if (entry === null) {
      return
    }
    this.props.dispatcher.popStash(this.props.repository, entry)
    this.setState({ selectedStashSha: null })
  }

  private dropSelectedStash = () => {
    const entry = this.getSelectedStashEntry()
    if (entry === null) {
      return
    }
    this.props.dispatcher.dropStash(this.props.repository, entry)
    this.setState({ selectedStashSha: null })
  }

  public render() {
    return (
      <UiView id="repository">
        {this.renderSidebar()}
        {this.renderContent()}
        {this.maybeRenderTutorialPanel()}
      </UiView>
    )
  }

  private onRevertCommit = (commit: Commit) => {
    this.props.dispatcher.revertCommit(this.props.repository, commit)
  }

  private onAmendCommit = (commit: Commit, isLocalCommit: boolean) => {
    this.props.dispatcher.startAmendingRepository(
      this.props.repository,
      commit,
      isLocalCommit
    )
  }

  public componentDidMount() {
    window.addEventListener('keydown', this.onGlobalKeyDown)
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onGlobalKeyDown)
  }

  public componentDidUpdate(): void {
    if (this.focusChangesNeeded) {
      this.focusChangesNeeded = false
      this.changesSidebarRef.current?.focus()
    }

    if (this.focusHistoryNeeded) {
      this.focusHistoryNeeded = false
      this.compareSidebarRef.current?.focusHistory()
    }
  }

  private onGlobalKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (this.props.isShowingModal || this.props.isShowingFoldout) {
      return
    }

    // File-tab shortcuts apply only while the Files section is active, so they
    // don't clash with the same keys elsewhere in the app.
    if (
      this.props.state.selectedSection === RepositorySectionTab.Files &&
      this.handleFilesKeyDown(event)
    ) {
      return
    }

    // Toggle tab selection on Ctrl+Tab. Note that we don't care
    // about the shift key here, we can get away with that as long
    // as there's only two tabs.
    if (event.ctrlKey && event.key === 'Tab') {
      this.changeTab()
      event.preventDefault()
    }
  }

  /**
   * Keyboard shortcuts for the Files viewer's tabs: Ctrl/Cmd+W closes the
   * active tab, Ctrl+PageDown/PageUp cycle through tabs (Ctrl+Tab is reserved
   * for switching repository sections). Returns true when the event was
   * handled.
   */
  private handleFilesKeyDown(event: KeyboardEvent): boolean {
    const { repository, dispatcher } = this.props
    const { openFilePaths, activeFilePath } = this.props.fileTreeState

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
      if (activeFilePath !== null) {
        dispatcher.closeFileTreeTab(repository, activeFilePath)
        event.preventDefault()
      }
      return true
    }

    if (
      event.ctrlKey &&
      (event.key === 'PageDown' || event.key === 'PageUp') &&
      openFilePaths.length > 1
    ) {
      const index =
        activeFilePath === null ? -1 : openFilePaths.indexOf(activeFilePath)
      const delta = event.key === 'PageDown' ? 1 : -1
      const count = openFilePaths.length
      const next = openFilePaths[(index + delta + count) % count]
      dispatcher.revealFileTreeFile(repository, next)
      event.preventDefault()
      return true
    }

    return false
  }

  private changeTab() {
    const order = [
      RepositorySectionTab.Changes,
      RepositorySectionTab.History,
      RepositorySectionTab.Files,
      RepositorySectionTab.Actions,
      RepositorySectionTab.Stashes,
      RepositorySectionTab.Worktrees,
    ]
    const current = this.props.state.selectedSection
    const idx = order.indexOf(current)
    const next = order[(idx + 1) % order.length]
    this.props.dispatcher.changeRepositorySection(this.props.repository, next)
    if (next === RepositorySectionTab.Files) {
      this.props.dispatcher.refreshFileTree(this.props.repository)
    }
    if (next === RepositorySectionTab.Stashes) {
      this.props.dispatcher.loadStashes(this.props.repository)
    }
    if (next === RepositorySectionTab.Worktrees) {
      this.props.dispatcher.loadWorktrees(this.props.repository)
    }
    if (next === RepositorySectionTab.Actions) {
      this.props.dispatcher.loadWorkflowRuns(this.props.repository)
    }
  }

  private onTabClicked = (tab: Tab) => {
    const section =
      tab === Tab.History
        ? RepositorySectionTab.History
        : tab === Tab.Files
        ? RepositorySectionTab.Files
        : tab === Tab.Actions
        ? RepositorySectionTab.Actions
        : RepositorySectionTab.Changes

    this.props.dispatcher.changeRepositorySection(
      this.props.repository,
      section
    )
    if (section === RepositorySectionTab.Files) {
      this.props.dispatcher.refreshFileTree(this.props.repository)
    }
    if (section === RepositorySectionTab.Actions) {
      this.props.dispatcher.loadWorkflowRuns(this.props.repository)
    }
    if (section === RepositorySectionTab.History) {
      this.props.dispatcher.updateCompareForm(this.props.repository, {
        showBranchList: false,
      })
    }
  }

  private maybeRenderTutorialPanel(): JSX.Element | null {
    if (isValidTutorialStep(this.props.currentTutorialStep)) {
      return (
        <TutorialPanel
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          resolvedExternalEditor={this.props.resolvedExternalEditor}
          currentTutorialStep={this.props.currentTutorialStep}
          onExitTutorial={this.props.onExitTutorial}
        />
      )
    }
    return null
  }
}
