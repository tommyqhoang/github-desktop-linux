export class SubmoduleEntry {
  public constructor(
    public readonly sha: string,
    public readonly path: string,
    public readonly describe: string
  ) {}
}

/**
 * The working-directory state of a submodule as reported by the leading
 * character of `git submodule status`.
 */
export enum SubmoduleWorkDirState {
  /** No change: the checked-out commit matches the index (` `). */
  UpToDate = 'upToDate',
  /** Not initialized — no working tree checked out (`-`). */
  Uninitialized = 'uninitialized',
  /** Checked-out commit differs from the SHA recorded in the index (`+`). */
  OutOfDate = 'outOfDate',
  /** The submodule has merge conflicts (`U`). */
  Conflicted = 'conflicted',
}

/** A submodule entry enriched with its working-directory state. */
export interface ISubmoduleStatusEntry {
  /** The commit the submodule is currently at. */
  readonly sha: string
  /** Path of the submodule relative to the containing repository. */
  readonly path: string
  /** Output of `git describe` for the submodule, or '' when unavailable. */
  readonly describe: string
  /** Working-directory state derived from the status flag. */
  readonly state: SubmoduleWorkDirState
}
