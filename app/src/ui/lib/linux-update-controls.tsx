import * as React from 'react'
import { Disposable } from 'event-kit'
import { ILinuxUpdateState } from '../../lib/linux-update'
import { assertNever } from '../../lib/fatal-error'
import { Button } from './button'
import { LinkButton } from './link-button'
import { Row } from './row'
import { LinuxReleasesUri } from './releases'
import { linuxUpdateStore } from './linux-update-store'

interface ILinuxUpdateControlsProps {
  /** Use inline content in the single-row application banner. */
  readonly compact?: boolean
}

interface ILinuxUpdateControlsState {
  readonly update: ILinuxUpdateState
}

/** Shared Linux updater status and explicit user-initiated actions. */
export class LinuxUpdateControls extends React.Component<
  ILinuxUpdateControlsProps,
  ILinuxUpdateControlsState
> {
  public state: ILinuxUpdateControlsState = { update: linuxUpdateStore.state }
  private subscription: Disposable | null = null

  public componentDidMount() {
    this.subscription = linuxUpdateStore.onDidChange(update =>
      this.setState({ update })
    )
    this.setState({ update: linuxUpdateStore.state })
    linuxUpdateStore.initialize()
  }

  public componentWillUnmount() {
    this.subscription?.dispose()
  }

  private onCheckForUpdates = () => linuxUpdateStore.checkForUpdates(false)
  private onDownloadUpdate = () => linuxUpdateStore.downloadUpdate()
  private onInstallUpdate = () => linuxUpdateStore.installUpdate()

  private renderStatus() {
    const { status, version, progress, error } = this.state.update
    const versionText = version === null ? 'An update' : `Version ${version}`

    switch (status) {
      case 'idle':
        return 'Check for updates to GitHub Desktop for Linux.'
      case 'checking':
        return 'Checking for updates…'
      case 'available':
        return `${versionText} is available to download.`
      case 'downloading':
        return progress === null
          ? 'Downloading update…'
          : `Downloading update… ${Math.round(progress)}%`
      case 'ready':
        return `${versionText} is downloaded and ready to install.`
      case 'installing':
        return 'Installing update… Approve the administrator prompt to continue.'
      case 'up-to-date':
        return 'You have the latest version.'
      case 'error':
        return error ?? 'The update could not be completed. Please try again.'
      case 'unsupported':
        return error ?? 'In-app updates are not supported on this installation.'
      default:
        return assertNever(status, `Unknown Linux update status ${status}`)
    }
  }

  private renderAction() {
    const { status } = this.state.update
    if (status === 'ready' || status === 'installing') {
      return (
        <Button
          type="button"
          size={this.props.compact ? 'small' : 'normal'}
          disabled={status === 'installing'}
          onClick={this.onInstallUpdate}
        >
          Restart to Update
        </Button>
      )
    }

    if (status === 'available' || status === 'downloading') {
      return (
        <Button
          type="button"
          size={this.props.compact ? 'small' : 'normal'}
          disabled={status === 'downloading'}
          onClick={this.onDownloadUpdate}
        >
          Download Update
        </Button>
      )
    }

    return (
      <Button
        type="button"
        size={this.props.compact ? 'small' : 'normal'}
        disabled={status === 'checking' || status === 'unsupported'}
        onClick={this.onCheckForUpdates}
      >
        Check for Updates
      </Button>
    )
  }

  public render() {
    const { status, progress, releaseURL } = this.state.update
    if (this.props.compact) {
      return (
        <span className="linux-update-controls">
          <span role="status" aria-live="polite">
            {this.renderStatus()}
          </span>{' '}
          {this.renderAction()}
          {(status === 'error' || status === 'unsupported') && (
            <>
              {' '}
              <LinkButton uri={releaseURL ?? LinuxReleasesUri}>
                View Releases
              </LinkButton>
            </>
          )}
        </span>
      )
    }

    return (
      <div className="linux-update-controls">
        <p className="update-status" role="status" aria-live="polite">
          {this.renderStatus()}
        </p>
        {status === 'downloading' && (
          <progress
            aria-label="Update download progress"
            max={100}
            value={progress ?? undefined}
          />
        )}
        {status === 'ready' && (
          <p>
            Updating requires administrator approval and will restart GitHub
            Desktop only when you choose Restart to Update.
          </p>
        )}
        <Row>{this.renderAction()}</Row>
        {(status === 'unsupported' || status === 'error') && (
          <p>
            <LinkButton uri={releaseURL ?? LinuxReleasesUri}>
              View Releases
            </LinkButton>{' '}
            to download and install an update manually.
          </p>
        )}
      </div>
    )
  }
}
