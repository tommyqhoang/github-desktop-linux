/** A single entry in the command palette. */
export interface ICommandPaletteItem {
  /** Stable identifier, also used as the React key. */
  readonly id: string
  /** The text shown to the user and matched against the query. */
  readonly title: string
  /** Optional secondary text (e.g. a keyboard shortcut hint). */
  readonly subtitle?: string
  /** Invoked when the user activates the command. */
  readonly action: () => void
}
