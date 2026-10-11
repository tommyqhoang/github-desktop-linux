# Linux application updates

The Debian/Ubuntu x64 release checks the latest published release of
[tommyqhoang/github-desktop-linux](https://github.com/tommyqhoang/github-desktop-linux/releases/latest).
Automatic updates are enabled by default.

## Using updates

- The application checks at startup and periodically while running.
- With automatic updates enabled, a newer release downloads in the background.
- The update banner and **Help → About GitHub Desktop** show update status.
- Choose **Restart to Update** when ready. The system asks for administrator
  authorization to install the Debian package. The app restarts only after a
  successful installation; cancelling authorization leaves the app running.
- To opt out, turn off **Automatic updates** in **Preferences → Advanced**.
  This stops subsequent background checks and downloads. A download already in
  progress may finish, but installation and restart still require your action.
- With automatic updates off, use **Check for Updates**, then **Download Update**
  to update manually. You can also install packages from the release page.

## Scope and safety

In-app installation supports the installed Debian/Ubuntu x64 package. Other
package formats, architectures, unpacked builds, and local development builds
must use their normal installation method. macOS retains its existing
release-page notification behavior.

The updater selects the latest non-draft, non-prerelease GitHub release, compares
its fork build version, and only downloads the matching Linux package from this
repository. Downloads are verified against the release's `.sha256` asset before
being offered for installation and checked again before installing. This checks
integrity; it does not provide independent publisher signing beyond trust in the
GitHub repository and HTTPS.

Network, checksum, authorization, and installation failures are shown as errors,
not as successful updates. There is no unattended privileged installation or
forced restart.

## Releasing an updater-capable build

Use the existing **Build and Release (Linux + macOS)** workflow. Linux releases
must continue to include both assets, with the same version as the release tag:

- `GitHubDesktop-linux-amd64-<version>.deb`
- `GitHubDesktop-linux-amd64-<version>.deb.sha256`

Mark the release as the latest release. Older installations that only have the
release-page notifier need one manual installation of an updater-capable build;
subsequent updates can be downloaded and installed in-app.
