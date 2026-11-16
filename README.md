# IslandX

IslandX is a small, always-on-top Windows overlay inspired by the Dynamic Island. On the desktop, hover over the pill to open it. While another app is focused, IslandX becomes a small circle. Right-click the circle to open the panel and unlock hover mode. Move the pointer away to return to the pill, or right-click the pill or panel to lock circle mode again. Hold the left button on the circle to drag it along the top edge. The tray menu and **Ctrl + Shift + Space** also open IslandX.

[Download the latest Windows x64 installer](https://github.com/Gaurav-tsx/IslandX/releases/latest)

## Features

- Listen to and control the active Windows media session, including album art and playback position when the player supplies them.
- Keep CPU, memory, receive rate, and the clock visible in the system stats strip.
- Start a screenshot, snip, or screen recording using Windows capture shortcuts.
- Add local files to the shelf by dropping them or choosing them in a dialog. Shelf entries are references to the originals.
- Open saved sites and chat apps in an isolated WebView2 window with its own persistent profile.
- Opt into Windows-user-encrypted text clipboard history with search, pinning, and copy.
- Set volume, mute the default microphone, keep notes, and use a focus timer.
- Set the display, surface, hover delay, Windows startup, and automatic update preference.

**Settings** includes High, Balanced, and Low glass quality, a card blur slider, and a gloss slider. Expanded panels and the stats bar use translucent glass and blur inside the cards. The Low preset and Black surface use an opaque background. IslandX respects the Windows transparency setting and disables card blur while collapsed.

The overlay works over normal windows and borderless/windowed fullscreen apps. Exclusive fullscreen is outside the scope of a regular topmost window. Snipping Tool recording requires a supported Windows 11 release. GPU and temperature telemetry, phone transfer, and native notification history are unavailable in this preview. The Notifications panel links to Windows settings.

## Development

Use Windows 10 or 11 with Node.js 24, Rust stable with the MSVC toolchain, [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), and the WebView2 Runtime. The NSIS installer is per-user and uses the installed WebView2 Runtime or downloads its bootstrapper.

```powershell
npm ci
npm run tauri -- dev
npm run version:check
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run tauri -- build
```

React loads a panel only when it opens and releases its state when it closes. Statistics sample once per second while visible. Windows sends media and clipboard events when their source changes. IslandX sends no telemetry.

## Releases and updates

1. Update the version in `package.json` and `src-tauri/Cargo.toml`. Refresh both lockfiles with `npm install --package-lock-only` and `cargo check --manifest-path src-tauri/Cargo.toml`.
2. Add a `## vMAJOR.MINOR.PATCH` section to `CHANGELOG.md`. Run `npm run version:check -- vMAJOR.MINOR.PATCH`.
3. Commit the release changes, create the matching annotated Git tag, and push it. The [release workflow](.github/workflows/release.yml) builds an NSIS installer, verifies that its updater signature carries the tagged version, and publishes it with a SHA-256 checksum and `latest.json`.

The workflow reads `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from GitHub Actions secrets. The matching public key is tracked in `src-tauri/updater.pub`. Back up the key securely because installed copies use the same public key to authenticate future releases. These updater signatures are separate from Windows Authenticode.

The release feed defaults to the repository’s public GitHub Releases URL. Set the `ISLANDX_UPDATE_ENDPOINT` repository variable to use a different HTTPS endpoint in future builds. Releases keep their installers in GitHub so users can recover manually. If a release needs to roll back through the automatic updater, publish the last working source under a new higher version.

The app checks at launch and every 12 hours when enabled. Settings also offers a manual check and displays release notes and download progress. The verified installer stays ready on disk. Choose **Update and restart** or **Install on next launch**. IslandX verifies the version-bound signature again before running the staged installer.

To build a signed release locally, set the signing environment variables in the build session then run:

```powershell
npm run release:config
npm run tauri -- build --config .islandx-release.json
node scripts/release-assets.mjs
```

## Uninstall and data

Open **Settings → About IslandX → Uninstall IslandX** or use **Installed apps** in Windows. The in-app confirmation lets you remove either all app data or only the clipboard and shelf histories. Removing shelf history leaves the original files on disk.

IslandX stores its clipboard and shelf histories under `%APPDATA%\com.islandx.overlay`. WebView2 preferences and browser data live under `%LOCALAPPDATA%\com.islandx.overlay`. The clipboard is disabled by default and excludes entries that Windows marks ineligible for history.
