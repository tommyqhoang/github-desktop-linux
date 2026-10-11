import { LinuxUpdateStore } from '../../src/ui/lib/linux-update-store'
import * as ipcRenderer from '../../src/lib/ipc-renderer'

jest.mock('../../src/lib/ipc-renderer', () => ({
  invoke: jest.fn(),
  on: jest.fn(),
}))

const idle = {
  status: 'idle',
  version: null,
  progress: null,
  error: null,
  releaseURL: null,
}

const invoke = ipcRenderer.invoke as jest.Mock

describe('LinuxUpdateStore', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
    invoke.mockResolvedValue(idle)
  })

  it('defaults automatic updates to on and downloads on background checks', async () => {
    const store = new LinuxUpdateStore()
    expect(store.automaticUpdatesEnabled).toBe(true)
    await store.checkForUpdates(true)
    expect(invoke).toHaveBeenCalledWith('linux-update-check', true)
  })

  it('persists opt-out and makes no background request when disabled', async () => {
    const store = new LinuxUpdateStore()
    store.setAutomaticUpdatesEnabled(false)
    const reloaded = new LinuxUpdateStore()
    expect(reloaded.automaticUpdatesEnabled).toBe(false)
    await reloaded.checkForUpdates(true)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('checks at startup and periodically, respecting changes to opt-out', async () => {
    jest.useFakeTimers()
    const store = new LinuxUpdateStore()
    const timer = store.startAutomaticChecks(1000)
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledWith('linux-update-check', true)
    invoke.mockClear()
    store.setAutomaticUpdatesEnabled(false)
    jest.advanceTimersByTime(1000)
    expect(invoke).not.toHaveBeenCalled()
    store.setAutomaticUpdatesEnabled(true)
    jest.advanceTimersByTime(1000)
    expect(invoke).toHaveBeenCalledWith('linux-update-check', true)
    timer.dispose()
    invoke.mockClear()
    jest.advanceTimersByTime(1000)
    expect(invoke).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('allows checking manually without downloading when opted out', async () => {
    const store = new LinuxUpdateStore()
    store.setAutomaticUpdatesEnabled(false)
    await store.checkForUpdates(false)
    expect(invoke).toHaveBeenCalledWith('linux-update-check', false)
  })

  it('downloads only when requested and never implicitly installs', async () => {
    const store = new LinuxUpdateStore()
    await store.downloadUpdate()
    expect(invoke).toHaveBeenCalledWith('linux-update-download')
    expect(invoke).not.toHaveBeenCalledWith('linux-update-install')
    await store.installUpdate()
    expect(invoke).toHaveBeenCalledWith('linux-update-install')
  })

  it('publishes transport errors instead of reporting up-to-date', async () => {
    invoke.mockRejectedValue(new Error('Connection lost'))
    const store = new LinuxUpdateStore()
    const changed = jest.fn()
    store.onDidChange(changed)
    await store.checkForUpdates(false)
    expect(store.state.status).toBe('error')
    expect(store.state.error).toBe('Connection lost')
    expect(changed).toHaveBeenCalledWith(store.state)
  })

  it('subscribes once and synchronizes the backend state', async () => {
    const ready = { ...idle, status: 'ready', version: '3.4.9-build.49' }
    invoke.mockResolvedValue(ready)
    const store = new LinuxUpdateStore()
    await store.initialize()
    await store.initialize()
    expect(ipcRenderer.on).toHaveBeenCalledTimes(1)
    expect(store.state).toEqual(ready)
  })

  it('does not overwrite a pushed state with an older initialization response', async () => {
    let resolve: (state: typeof idle) => void = () => {}
    invoke.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r
        })
    )
    const store = new LinuxUpdateStore()
    const initializing = store.initialize()
    const listener = (ipcRenderer.on as jest.Mock).mock.calls[0][1]
    listener({}, { ...idle, status: 'ready' })
    resolve(idle)
    await initializing
    expect(store.state.status).toBe('ready')
  })
})
