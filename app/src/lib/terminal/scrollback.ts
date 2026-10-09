/**
 * Persistence of terminal scrollback to `localStorage`, keyed per session.
 *
 * The key format is single-sourced here so the writer (`XtermView`, which
 * serializes the xterm buffer) and the reaper (`AppStore`, which deletes the
 * key when a session is permanently dropped) can never drift apart. Without
 * the reaper, every terminal ever opened would leave a key behind — session
 * ids are unique per spawn — and `localStorage` would grow unbounded until it
 * hit the quota and broke writes for unrelated app state.
 */

const SCROLLBACK_PREFIX = 'terminal-scrollback-v1:'

/** The `localStorage` key under which a session's scrollback is stored. */
export function terminalScrollbackKey(sessionId: string): string {
  return `${SCROLLBACK_PREFIX}${sessionId}`
}

/** Read a session's persisted scrollback, or null if absent/unavailable. */
export function loadTerminalScrollback(sessionId: string): string | null {
  try {
    return localStorage.getItem(terminalScrollbackKey(sessionId))
  } catch {
    // localStorage may be unavailable in some contexts — non-fatal.
    return null
  }
}

/**
 * Most characters of scrollback kept per session. A serialized 1000-row buffer
 * from a wide terminal, escape codes included, can run to hundreds of KB, and
 * `localStorage` is a ~5MB quota shared with all other app state, so a handful
 * of tabs could otherwise exhaust it.
 */
export const MAX_SCROLLBACK_CHARS = 128_000

/** Reset attributes, so a trimmed start can't inherit colours from cut rows. */
const SGR_RESET = '\x1b[0m'

/**
 * Keep the most recent `maxChars` of `content`, starting on a row boundary so
 * an escape sequence is never cut in half. Content already within the limit is
 * returned unchanged.
 */
export function clampScrollback(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content
  }
  const tail = content.slice(content.length - maxChars)
  const newline = tail.indexOf('\n')
  // No row boundary to cut at: keep the raw tail rather than nothing.
  const trimmed = newline === -1 ? tail : tail.slice(newline + 1)
  return `${SGR_RESET}${trimmed}`
}

/**
 * Persist a session's scrollback. An empty payload removes the key rather
 * than storing a useless empty entry. Oversized payloads keep only their most
 * recent rows, and a write rejected for quota is retried once with a much
 * smaller tail.
 */
export function saveTerminalScrollback(
  sessionId: string,
  content: string
): void {
  const key = terminalScrollbackKey(sessionId)
  try {
    if (content.length === 0) {
      localStorage.removeItem(key)
      return
    }
    try {
      localStorage.setItem(key, clampScrollback(content, MAX_SCROLLBACK_CHARS))
    } catch {
      // Over quota (this session's previous copy counts against it too).
      localStorage.setItem(
        key,
        clampScrollback(content, Math.floor(MAX_SCROLLBACK_CHARS / 4))
      )
    }
  } catch {
    // best-effort; localStorage may be unavailable or still over quota.
  }
}

/** Delete a session's persisted scrollback (called when a session is dropped). */
export function clearTerminalScrollback(sessionId: string): void {
  try {
    localStorage.removeItem(terminalScrollbackKey(sessionId))
  } catch {
    // non-fatal
  }
}
