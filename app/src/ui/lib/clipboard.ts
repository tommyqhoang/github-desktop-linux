import { invokeProxy } from '../main-process-proxy'

const writeText = invokeProxy('clipboard-write-text', 1)
const readText = invokeProxy('clipboard-read-text', 0)

/**
 * System clipboard access for the renderer.
 *
 * Electron 40+ removed the `clipboard` module from the renderer process
 * (`require('electron').clipboard` is `undefined` there), so these
 * calls are served by the main process over IPC. Failures are logged rather
 * than thrown: a failed copy must never break the UI action that triggered it.
 */
export const clipboard = {
  async writeText(text: string): Promise<void> {
    try {
      await writeText(text)
    } catch (e) {
      log.error('Failed to write to the clipboard', e as Error)
    }
  },
  async readText(): Promise<string> {
    try {
      return await readText()
    } catch (e) {
      log.error('Failed to read the clipboard', e as Error)
      return ''
    }
  },
}
