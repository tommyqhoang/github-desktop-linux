/** Linux updater state shared between the main process and renderer. */
export interface ILinuxUpdateState {
  readonly status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'installing'
    | 'up-to-date'
    | 'error'
    | 'unsupported'
  readonly version: string | null
  readonly error: string | null
  /** Download completion percentage (0–100), or null when not downloading. */
  readonly progress: number | null
  readonly releaseURL: string | null
}
