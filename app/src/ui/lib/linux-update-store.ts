import { Disposable, Emitter } from 'event-kit'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { getBoolean, setBoolean } from '../../lib/local-storage'
import { ILinuxUpdateState } from '../../lib/linux-update'

const automaticUpdatesKey = 'linux-automatic-updates-enabled'

/** Renderer view of the main-process Linux updater. Installation is explicit. */
export class LinuxUpdateStore {
  private readonly emitter = new Emitter()
  private initialized: Promise<void> | null = null
  private revision = 0
  private currentState: ILinuxUpdateState = {
    status: 'idle',
    version: null,
    error: null,
    progress: null,
    releaseURL: null,
  }

  public get state(): ILinuxUpdateState {
    return this.currentState
  }

  public get automaticUpdatesEnabled(): boolean {
    return getBoolean(automaticUpdatesKey, true)
  }

  public setAutomaticUpdatesEnabled(enabled: boolean): void {
    setBoolean(automaticUpdatesKey, enabled)
    this.emitter.emit('did-change', this.state)
  }

  public onDidChange(fn: (state: ILinuxUpdateState) => void): Disposable {
    return this.emitter.on('did-change', fn)
  }

  private update(state: ILinuxUpdateState): void {
    this.revision++
    this.currentState = state
    this.emitter.emit('did-change', state)
  }

  public initialize(): Promise<void> {
    if (this.initialized === null) {
      ipcRenderer.on('linux-update-state-changed', (_event, state) =>
        this.update(state)
      )
      this.initialized = this.request(() =>
        ipcRenderer.invoke('linux-update-state')
      )
    }
    return this.initialized
  }

  private async request(operation: () => Promise<ILinuxUpdateState>) {
    const revision = this.revision
    try {
      const state = await operation()
      // A push received while awaiting IPC is newer than the request snapshot.
      if (this.revision === revision) {
        this.update(state)
      }
    } catch (error) {
      this.update({
        ...this.state,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  public async checkForUpdates(inBackground: boolean): Promise<void> {
    if (inBackground && !this.automaticUpdatesEnabled) {
      return
    }
    await this.request(() =>
      ipcRenderer.invoke('linux-update-check', this.automaticUpdatesEnabled)
    )
  }

  /** Checks immediately and at the normal application update interval. */
  public startAutomaticChecks(interval: number): Disposable {
    this.checkForUpdates(true)
    const timer = window.setInterval(() => this.checkForUpdates(true), interval)
    return new Disposable(() => window.clearInterval(timer))
  }

  public async downloadUpdate(): Promise<void> {
    await this.request(() => ipcRenderer.invoke('linux-update-download'))
  }

  public async installUpdate(): Promise<void> {
    await this.request(() => ipcRenderer.invoke('linux-update-install'))
  }
}

export const linuxUpdateStore = new LinuxUpdateStore()
