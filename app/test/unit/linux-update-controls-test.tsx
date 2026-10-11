import * as React from 'react'
import { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { LinuxUpdateControls } from '../../src/ui/lib/linux-update-controls'
import { LinuxUpdateBanner } from '../../src/ui/banners/linux-update-banner'
import { About } from '../../src/ui/about/about'
import { Advanced } from '../../src/ui/preferences/advanced'
import { LinuxReleasesUri } from '../../src/ui/lib/releases'
import * as aiSettings from '../../src/lib/ai/commit-message-settings'

jest.mock(
  '../../src/ui/lib/linux-update-store',
  () => ({
    linuxUpdateStore: {
      state: {},
      automaticUpdatesEnabled: true,
      onDidChange: jest.fn(),
      initialize: jest.fn(),
      checkForUpdates: jest.fn(),
      downloadUpdate: jest.fn(),
      installUpdate: jest.fn(),
      setAutomaticUpdatesEnabled: jest.fn(),
    },
  }),
  { virtual: true }
)

// Dialog positioning/focus and native IPC are outside this UI contract.
jest.mock('../../src/ui/dialog', () => ({
  Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogError: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DefaultDialogFooter: () => null,
}))

const { linuxUpdateStore: store } = jest.requireMock(
  '../../src/ui/lib/linux-update-store'
)

const initialState = {
  status: 'idle',
  version: null as string | null,
  error: null as string | null,
  progress: null as number | null,
  releaseURL: null as string | null,
}

const advancedProps = {
  useWindowsOpenSSH: false,
  optOutOfUsageTracking: false,
  useExternalCredentialHelper: false,
  repositoryIndicatorsEnabled: true,
  onUseWindowsOpenSSHChanged: jest.fn(),
  onOptOutofReportingChanged: jest.fn(),
  onUseExternalCredentialHelperChanged: jest.fn(),
  onRepositoryIndicatorsEnabledChanged: jest.fn(),
}

let container: HTMLDivElement
let root: Root
let listeners: Set<(state: typeof initialState) => void>
let dispose: jest.Mock
const originalLinux = __LINUX__
const originalReleaseChannel = __RELEASE_CHANNEL__

async function render(element: React.ReactElement) {
  await act(async () => root.render(element))
}

function button(name: string) {
  const found = Array.from(container.querySelectorAll('button')).find(
    element => element.textContent === name
  )
  expect(found).toBeDefined()
  return found!
}

function automaticUpdatesCheckbox() {
  const label = Array.from(container.querySelectorAll('label')).find(
    element => element.textContent === 'Automatic updates'
  )
  expect(label).toBeDefined()
  return document.getElementById(label!.htmlFor) as HTMLInputElement
}

async function emitState(state: Partial<typeof initialState>) {
  await act(async () => {
    store.state = { ...store.state, ...state }
    listeners.forEach(listener => listener(store.state))
  })
}

beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    __LINUX__: true,
    __RELEASE_CHANNEL__: 'development',
  })
  jest.clearAllMocks()
  listeners = new Set()
  dispose = jest.fn()
  store.state = { ...initialState }
  store.automaticUpdatesEnabled = true
  store.onDidChange.mockImplementation(
    (listener: (state: typeof initialState) => void) => {
      listeners.add(listener)
      return {
        dispose: () => {
          dispose()
          listeners.delete(listener)
        },
      }
    }
  )
  store.initialize.mockResolvedValue(undefined)
  store.checkForUpdates.mockResolvedValue(undefined)
  store.downloadUpdate.mockResolvedValue(undefined)
  store.installUpdate.mockResolvedValue(undefined)
  store.setAutomaticUpdatesEnabled.mockImplementation((enabled: boolean) => {
    store.automaticUpdatesEnabled = enabled
  })
  jest.spyOn(aiSettings, 'getAICommitMessageSettings').mockResolvedValue({
    enabled: false,
    provider: 'openrouter',
    cliModel: '',
    apiKey: '',
    model: aiSettings.DefaultOpenRouterModel,
    baseUrl: aiSettings.DefaultOpenRouterBaseUrl,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  jest.restoreAllMocks()
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: false,
    __LINUX__: originalLinux,
    __RELEASE_CHANNEL__: originalReleaseChannel,
  })
})

describe('Linux update controls', () => {
  it('synchronizes on mount and checks explicitly, not in the background', async () => {
    await render(<LinuxUpdateControls />)
    expect(store.initialize).toHaveBeenCalledTimes(1)
    expect(store.checkForUpdates).not.toHaveBeenCalled()
    await act(async () => button('Check for Updates').click())
    expect(store.checkForUpdates).toHaveBeenCalledWith(false)
    expect(store.downloadUpdate).not.toHaveBeenCalled()
    expect(store.installUpdate).not.toHaveBeenCalled()
  })

  it.each([
    ['idle', 'Check for updates'],
    ['checking', 'Checking for updates'],
    ['available', 'available'],
    ['downloading', 'Downloading'],
    ['ready', 'ready'],
    ['installing', 'Installing'],
    ['up-to-date', 'latest version'],
  ])('announces the %s state', async (status, text) => {
    store.state = { ...initialState, status, version: '4.0.0' }
    await render(<LinuxUpdateControls />)
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      text
    )
  })

  it('downloads only after the available update button is clicked', async () => {
    store.state = { ...initialState, status: 'available', version: '4.0.0' }
    await render(<LinuxUpdateControls />)
    expect(container.textContent).toContain('4.0.0')
    expect(store.downloadUpdate).not.toHaveBeenCalled()
    await act(async () => button('Download Update').click())
    expect(store.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(store.installUpdate).not.toHaveBeenCalled()
  })

  it('requires explicit restart consent and explains administrator approval', async () => {
    store.state = { ...initialState, status: 'ready', version: '4.0.0' }
    await render(<LinuxUpdateControls />)
    expect(container.textContent).toMatch(/administrator/i)
    expect(store.installUpdate).not.toHaveBeenCalled()
    await act(async () => button('Restart to Update').click())
    expect(store.installUpdate).toHaveBeenCalledTimes(1)
  })

  it.each(['checking', 'downloading', 'installing'])(
    'disables actions while %s',
    async status => {
      store.state = { ...initialState, status }
      await render(<LinuxUpdateControls />)
      const buttons = Array.from(container.querySelectorAll('button'))
      expect(buttons.length).toBeGreaterThan(0)
      expect(
        buttons.every(
          element => element.getAttribute('aria-disabled') === 'true'
        )
      ).toBe(true)
      await act(async () => buttons.forEach(element => element.click()))
      expect(store.checkForUpdates).not.toHaveBeenCalled()
      expect(store.downloadUpdate).not.toHaveBeenCalled()
      expect(store.installUpdate).not.toHaveBeenCalled()
    }
  )

  it('shows download progress as updates arrive', async () => {
    await render(<LinuxUpdateControls />)
    await emitState({ status: 'downloading', progress: 42 })
    const progress = container.querySelector('progress')
    expect(progress?.value).toBe(42)
    expect(progress?.max).toBe(100)
    expect(progress?.getAttribute('aria-label')).toBe(
      'Update download progress'
    )
    expect(container.textContent).toContain('42%')
  })

  it('does not invent a percentage for downloads with unknown length', async () => {
    store.state = { ...initialState, status: 'downloading' }
    await render(<LinuxUpdateControls />)
    expect(container.querySelector('progress')?.hasAttribute('value')).toBe(
      false
    )
    expect(container.textContent).not.toContain('%')
  })

  it.each(['unsupported', 'error'])(
    'shows the backend explanation and a manual release link for %s',
    async status => {
      store.state = {
        ...initialState,
        status,
        error:
          'The update could not be installed: administrator approval was denied.',
        releaseURL:
          'https://github.com/tommyqhoang/github-desktop-linux/releases/tag/v4.0.0',
      }
      await render(<LinuxUpdateControls />)
      expect(container.textContent).toContain(store.state.error)
      expect(container.querySelector('a')?.href).toBe(store.state.releaseURL)
      expect(container.textContent).not.toContain('latest version')
      expect(container.textContent).not.toContain('Restart to Update')
    }
  )

  it('falls back to the Linux releases page and allows retry after an error', async () => {
    store.state = { ...initialState, status: 'error' }
    await render(<LinuxUpdateControls />)
    expect(container.textContent).toMatch(/could not|failed|unable/i)
    expect(container.querySelector('a')?.href).toBe(LinuxReleasesUri)
    await act(async () => button('Check for Updates').click())
    expect(store.checkForUpdates).toHaveBeenCalledWith(false)
  })

  it('does not offer an install or download on unsupported installations', async () => {
    store.state = { ...initialState, status: 'unsupported' }
    await render(<LinuxUpdateControls />)
    expect(container.textContent).toMatch(/not supported|unsupported/i)
    expect(container.querySelector('a')?.href).toBe(LinuxReleasesUri)
    expect(container.textContent).not.toContain('Download Update')
    expect(container.textContent).not.toContain('Restart to Update')
  })

  it('disposes the store subscription when unmounted', async () => {
    await render(<LinuxUpdateControls />)
    await render(<div />)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})

describe('Linux updater entry points', () => {
  it('offers an explicit restart from the ready banner', async () => {
    store.state = { ...initialState, status: 'ready', version: '4.0.0' }
    await render(<LinuxUpdateBanner />)
    expect(container.querySelector('.banner')).not.toBeNull()
    // The shared Banner has a fixed single-row height; block copy hides actions.
    expect(container.querySelector('.banner p')).toBeNull()
    expect(store.installUpdate).not.toHaveBeenCalled()
    await act(async () => button('Restart to Update').click())
    expect(store.installUpdate).toHaveBeenCalledTimes(1)
  })

  it.each(['idle', 'checking', 'up-to-date', 'unsupported'])(
    'hides the banner for %s',
    async status => {
      store.state = { ...initialState, status }
      await render(<LinuxUpdateBanner />)
      expect(container.querySelector('.banner')).toBeNull()
      expect(store.initialize).toHaveBeenCalled()
    }
  )

  it.each(['available', 'downloading', 'installing', 'error'])(
    'shows the banner for %s',
    async status => {
      store.state = { ...initialState, status }
      await render(<LinuxUpdateBanner />)
      expect(container.querySelector('.banner')).not.toBeNull()
    }
  )

  it('keeps a banner dismissed during progress but resurfaces the next status or version', async () => {
    store.state = { ...initialState, status: 'downloading', version: '4.0.0' }
    await render(<LinuxUpdateBanner />)
    const dismiss = () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Dismiss this message"]'
        )!
        .click()
    }
    await act(async () => dismiss())
    await emitState({ progress: 50 })
    expect(container.querySelector('.banner')).toBeNull()
    await emitState({ status: 'ready' })
    expect(button('Restart to Update')).toBeDefined()
    await act(async () => dismiss())
    await emitState({ status: 'ready', version: '4.0.1' })
    expect(button('Restart to Update')).toBeDefined()
  })

  it('disposes banner and control subscriptions on unmount', async () => {
    store.state = { ...initialState, status: 'ready' }
    await render(<LinuxUpdateBanner />)
    await render(<div />)
    expect(listeners.size).toBe(0)
  })

  it('shows the real updater in About even on the development release channel', async () => {
    await render(
      <About
        applicationName="GitHub Desktop"
        applicationVersion="3.5.0"
        applicationArchitecture="x64"
        onDismissed={jest.fn()}
        onCheckForNonStaggeredUpdates={jest.fn()}
        onShowAcknowledgements={jest.fn()}
        onShowTermsAndConditions={jest.fn()}
      />
    )
    expect(button('Check for Updates').getAttribute('aria-disabled')).not.toBe(
      'true'
    )
    expect(store.initialize).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain(
      'Please visit the GitHub Desktop for Linux release page'
    )
  })

  it('defaults Automatic updates to the enabled store preference', async () => {
    await render(<Advanced {...advancedProps} />)
    expect(automaticUpdatesCheckbox().checked).toBe(true)
    expect(store.initialize).toHaveBeenCalled()
    expect(store.setAutomaticUpdatesEnabled).not.toHaveBeenCalled()
  })

  it('reads a persisted opt-out without overwriting it on mount', async () => {
    store.automaticUpdatesEnabled = false
    await render(<Advanced {...advancedProps} />)
    expect(automaticUpdatesCheckbox().checked).toBe(false)
    expect(store.setAutomaticUpdatesEnabled).not.toHaveBeenCalled()
  })

  it('persists opt-out and opt-in immediately without restarting', async () => {
    await render(<Advanced {...advancedProps} />)
    await act(async () => automaticUpdatesCheckbox().click())
    expect(store.setAutomaticUpdatesEnabled).toHaveBeenLastCalledWith(false)
    expect(automaticUpdatesCheckbox().checked).toBe(false)
    await act(async () => automaticUpdatesCheckbox().click())
    expect(store.setAutomaticUpdatesEnabled).toHaveBeenLastCalledWith(true)
    expect(automaticUpdatesCheckbox().checked).toBe(true)
    expect(store.installUpdate).not.toHaveBeenCalled()
  })

  it('explains automatic downloads, restart consent, and opt-out limitations', async () => {
    await render(<Advanced {...advancedProps} />)
    const descriptionId =
      automaticUpdatesCheckbox().getAttribute('aria-describedby')!
    const description = document.getElementById(descriptionId)?.textContent
    expect(description).toMatch(/automatically.*download/i)
    expect(description).toMatch(/never restart.*consent/i)
    expect(description).toMatch(/future automatic checks and downloads/i)
    expect(description).toMatch(/in.progress download may complete/i)
  })

  it('keeps manual checks available when automatic updates are disabled', async () => {
    store.automaticUpdatesEnabled = false
    await render(<Advanced {...advancedProps} />)
    await act(async () => button('Check for Updates').click())
    expect(store.checkForUpdates).toHaveBeenCalledWith(false)
    expect(store.setAutomaticUpdatesEnabled).not.toHaveBeenCalled()
  })

  it('does not show Linux update settings on other platforms', async () => {
    Object.assign(globalThis, { __LINUX__: false })
    await render(<Advanced {...advancedProps} />)
    expect(container.textContent).not.toContain('Automatic updates')
    expect(store.initialize).not.toHaveBeenCalled()
    expect(store.onDidChange).not.toHaveBeenCalled()
  })
})
