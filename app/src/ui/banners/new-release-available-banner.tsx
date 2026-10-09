import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Banner } from './banner'
import { LinkButton } from '../lib/link-button'
import { setStringArray } from '../../lib/local-storage'

/** Remembers the last release tag the user dismissed so we don't nag. */
export const DismissedReleaseTagKey = 'dismissed-fork-release-tag'

interface INewReleaseAvailableBannerProps {
  readonly tag: string
  readonly url: string
  readonly onDismissed: () => void
}

export class NewReleaseAvailableBanner extends React.Component<INewReleaseAvailableBannerProps> {
  private onDismissed = () => {
    setStringArray(DismissedReleaseTagKey, [this.props.tag])
    this.props.onDismissed()
  }

  public render() {
    return (
      <Banner
        id="new-release-available-banner"
        dismissable={true}
        onDismissed={this.onDismissed}
      >
        <Octicon className="download-icon" symbol={octicons.download} />
        <div className="banner-message">
          <span>A newer GitHub Desktop build is available. </span>
          <LinkButton uri={this.props.url}>Download it</LinkButton>
        </div>
      </Banner>
    )
  }
}
