/**
 * macOS text-navigation shortcuts for the integrated terminal.
 *
 * Terminal.app / iTerm translate these chords into the readline control
 * sequences shells understand; xterm.js does not, so without this
 * Option+Arrow, Cmd+Arrow and Cmd+Backspace do nothing useful at a prompt.
 */
export interface IMacKeyEventLike {
  readonly key: string
  readonly altKey: boolean
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
}

/**
 * The bytes to send to the shell for a Mac navigation chord, or null when the
 * event isn't one (and should be handled normally).
 */
export function macTerminalKeySequence(e: IMacKeyEventLike): string | null {
  if (e.ctrlKey || e.shiftKey) {
    return null
  }
  if (e.altKey && !e.metaKey) {
    switch (e.key) {
      case 'ArrowLeft':
        return '\x1bb' // backward-word
      case 'ArrowRight':
        return '\x1bf' // forward-word
      case 'Backspace':
        return '\x1b\x7f' // backward-kill-word
    }
    return null
  }
  if (e.metaKey && !e.altKey) {
    switch (e.key) {
      case 'ArrowLeft':
        return '\x01' // beginning-of-line
      case 'ArrowRight':
        return '\x05' // end-of-line
      case 'Backspace':
        return '\x15' // unix-line-discard
    }
  }
  return null
}
