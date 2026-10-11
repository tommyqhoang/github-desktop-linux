import * as React from 'react'
import { Disposable } from 'event-kit'
import { ILinuxUpdateState } from '../../lib/linux-update'
import { LinuxUpdateControls } from '../lib/linux-update-controls'
import { linuxUpdateStore } from '../lib/linux-update-store'
import { Banner } from './banner'

interface ILinuxUpdateBannerState {
  readonly update: ILinuxUpdateState
  readonly dismissed: boolean
}

/** Surfaces actionable Linux updates without restarting the app automatically. */
export class LinuxUpdateBanner extends React.Component<
  {},
  ILinuxUpdateBannerState
> {
  public state: ILinuxUpdateBannerState = {
    update: linuxUpdateStore.state,
    dismissed: false,
  }
  private subscription: Disposable | null = null

  public componentDidMount() {
    this.subscription = linuxUpdateStore.onDidChange(update => {
      this.setState(previous => ({
        update,
        // Progress updates should not undo a user's dismissal.
        dismissed:
          previous.dismissed &&
          previous.update.status === update.status &&
          previous.update.version === update.version,
      }))
    })
    this.setState({ update: linuxUpdateStore.state })
    linuxUpdateStore.initialize()
  }

  public componentWillUnmount() {
    this.subscription?.dispose()
  }

  private onDismissed = () => this.setState({ dismissed: true })

  public render() {
    const { update, dismissed } = this.state
    if (
      dismissed ||
      update.status === 'idle' ||
      update.status === 'checking' ||
      update.status === 'up-to-date' ||
      update.status === 'unsupported'
    ) {
      return null
    }

    return (
      <Banner id="linux-update" onDismissed={this.onDismissed}>
        <LinuxUpdateControls compact={true} />
      </Banner>
    )
  }
}
