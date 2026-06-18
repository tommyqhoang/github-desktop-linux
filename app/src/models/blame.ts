/** A single line of `git blame` output, attributed to a commit. */
export interface IBlameLine {
  /** The full SHA of the commit the line is attributed to. */
  readonly sha: string
  /** The author name recorded on that commit. */
  readonly author: string
  /** The author email (angle brackets stripped). */
  readonly authorMail: string
  /** Author time as a Unix epoch (seconds). */
  readonly authorTime: number
  /** The first line of the commit's log message. */
  readonly summary: string
  /**
   * The SHA the line existed at before this commit, when Git reports a
   * `previous` field. `null` when the line originates in this commit.
   */
  readonly previousSha: string | null
  /** The 1-based line number in the final (blamed) file. */
  readonly lineNumber: number
  /** The textual content of the line (without the trailing newline). */
  readonly content: string
}

/** The blame for a file: one entry per line, in file order. */
export type Blame = ReadonlyArray<IBlameLine>
