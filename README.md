# Side by Side Browser

https://github.com/user-attachments/assets/f495320d-163b-4c6a-8a0a-0d35a8bea555

A two-pane Electron browser for comparing pages before and after a migration.

Electron is used instead of Tauri because this app needs two independent native browser contents, reliable navigation events, and injected scroll synchronization for arbitrary remote pages. A normal web iframe-based UI fails on many sites because `X-Frame-Options` and CSP block embedding.

## Download

Prebuilt binaries are on the [Releases page](https://github.com/ytyng/side-by-side-browser/releases).

- **macOS**: `Side by Side Browser-<version>-universal.dmg` (Intel and Apple Silicon in one
  binary). It is signed with a Developer ID certificate and notarized by Apple, so it opens
  without a Gatekeeper warning.
- **Windows**: `Side by Side Browser Setup <version>.exe`. This installer is **not** code
  signed, so SmartScreen shows "Windows protected your PC" on first run. Choose
  **More info → Run anyway**. Windows builds are produced by CI but are not regularly tested.

## Install

```bash
pnpm install
```

## Run

```bash
pnpm start -- https://old.example.com https://new.example.com
```

The first positional URL opens on the left. The second opens on the right.

## CLI

```text
Usage:
  pnpm start -- [options] [leftUrl] [rightUrl]

Options:
  --left <url>             Left pane URL. Overrides the first positional URL.
  --right <url>            Right pane URL. Overrides the second positional URL.
  --scroll-sync            Enable scroll delta synchronization on launch.
  --path-sync              Enable URL path/search/hash synchronization on launch.
  --lock-external          Block navigations that change hostname.
  --width <px>             Initial window width. Default: 1440.
  --height <px>            Initial window height. Default: 950.
  --start-maximized        Start maximized.
  --user-agent <ua>        Override page webview user agent.
  --partition <name>       Electron session partition. Default: side-by-side-browser.
  --no-persist-session     Use an in-memory session.
  --allow-popups           Allow popup windows. Default: blocked.
  --open-devtools          Open devtools for the app chrome and page views.
  --help                   Show help.
  --version                Show version.
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd+T` | New tab (both panes open blank) |
| `Cmd+Shift+T` | Reopen the most recently closed tab |
| `Cmd+W` | Close the active tab (no-op on the last tab; the app stays open) |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |

The same actions are available from the application menu (File / Tab).

## Build

```bash
# Unpacked app directory for local testing:
pnpm app:dir

# Distributable binaries such as .dmg and .zip:
pnpm app:dist
```

The output is written under `dist/`.

`pnpm app:dir` creates `dist/mac-arm64/Side by Side Browser.app` (arm64 only, for speed).
`pnpm app:dist` creates the universal `.dmg` and `.zip` in `dist/`.
`pnpm run pack` and `pnpm run dist` are aliases for those two commands.

macOS code signing is disabled for local builds. That avoids keychain/signing stalls. Signed and notarized binaries come from CI only.

## Release

```bash
pnpm release          # 0.1.0 -> 0.1.1 (patch)
pnpm release minor    # 0.1.0 -> 0.2.0
pnpm release major    # 0.1.0 -> 1.0.0
```

`main` has to be clean and in sync with `origin/main`. The script bumps the version in
`package.json`, pushes the bump commit, triggers the `Release` workflow, and watches it
until it finishes. The workflow builds macOS and Windows in parallel and publishes a
GitHub Release tagged `v<version>` once both succeed.

Signing and notarization need these repository secrets (already registered):
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID`.

## Limits

- Domain locking uses exact hostname matching. `www.example.com` to `example.com` is blocked.
- Scroll sync works by injected JavaScript. It can fail on browser-internal pages, crashed pages, and some unusual document modes.
- Each tab owns two web contents. Many tabs will use a lot of memory.
