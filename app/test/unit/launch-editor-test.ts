import * as FSE from 'fs-extra'
import * as Os from 'os'
import * as Path from 'path'
import { launchCustomExternalEditor } from '../../src/lib/editors/launch'

describe('launchCustomExternalEditor', () => {
  it('does not crash when the editor cannot be executed', async () => {
    const dir = await FSE.mkdtemp(Path.join(Os.tmpdir(), 'launch-editor-'))
    const editor = Path.join(dir, 'not-executable')
    await FSE.writeFile(editor, '#!/bin/sh\n', { mode: 0o644 })

    const uncaught = jest.fn()
    process.on('uncaughtException', uncaught)
    try {
      await launchCustomExternalEditor(dir, {
        path: editor,
        arguments: '%TARGET_PATH%',
      })
      // The spawn failure arrives asynchronously via the 'error' event.
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(uncaught).not.toHaveBeenCalled()
    } finally {
      process.off('uncaughtException', uncaught)
      await FSE.remove(dir)
    }
  })
})
