/** @jest-environment node */ // eslint-disable-line jsdoc/check-tag-names
import {
  registerLinuxUpdaterIPC,
  LinuxUpdater,
} from '../../src/main-process/linux-updater'
import { handle } from '../../src/main-process/ipc-main'

describe('Linux updater IPC', () => {
  const frame = {}
  const event = { senderFrame: frame, sender: { mainFrame: frame } }
  let handlers: Map<string, (...args: any[]) => any>
  let updater: {
    getState: jest.Mock
    check: jest.Mock
    download: jest.Mock
    install: jest.Mock
  }

  beforeEach(() => {
    handlers = new Map()
    updater = {
      getState: jest.fn(),
      check: jest.fn(),
      download: jest.fn(),
      install: jest.fn(),
    }
    const register = ((channel: string, listener: (...args: any[]) => any) =>
      handlers.set(channel, listener)) as typeof handle
    registerLinuxUpdaterIPC(updater as unknown as LinuxUpdater, register)
  })

  it('registers only the four fixed updater commands', async () => {
    expect([...handlers.keys()]).toEqual([
      'linux-update-state',
      'linux-update-check',
      'linux-update-download',
      'linux-update-install',
    ])
    await handlers.get('linux-update-check')!(event, true)
    expect(updater.check).toHaveBeenCalledWith(true)
    await handlers.get('linux-update-install')!(event)
    expect(updater.install).toHaveBeenCalledWith()
  })

  it.each([
    'linux-update-state',
    'linux-update-check',
    'linux-update-download',
    'linux-update-install',
  ])('rejects subframes and unexpected arguments for %s', async channel => {
    const handler = handlers.get(channel)!
    await expect(
      handler(
        { ...event, senderFrame: {} },
        ...(channel === 'linux-update-check' ? [false] : [])
      )
    ).rejects.toThrow()
    await expect(
      handler(event, 'https://evil.example/file.deb')
    ).rejects.toThrow()
    await expect(handler(event, true, '/tmp/evil.deb')).rejects.toThrow()
    expect(updater.getState).not.toHaveBeenCalled()
    expect(updater.check).not.toHaveBeenCalled()
    expect(updater.download).not.toHaveBeenCalled()
    expect(updater.install).not.toHaveBeenCalled()
  })
})
