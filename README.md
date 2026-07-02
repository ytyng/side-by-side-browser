# Side by Side Browser

A two-pane Electron browser for comparing pages before and after a migration.

Electron is used instead of Tauri because this app needs two independent native browser contents, reliable navigation events, and injected scroll synchronization for arbitrary remote pages. A normal web iframe-based UI fails on many sites because `X-Frame-Options` and CSP block embedding.

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
  --scroll-sync            Enable scroll synchronization on launch (unit set in the UI: px or %).
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

## Toolbar controls

The header has three toggles plus a copy button:

- **Scroll sync** — keep both panes scrolled together. The dropdown next to it
  picks the unit: **px** (default) applies the other pane's absolute pixel offset,
  which is exact when both pages share a layout; **%** maps the scroll ratio onto
  each pane's own height, which is better when the two pages differ in height.
- **URL path sync** — copy the pathname, search, and hash from one pane to the
  other while keeping each pane's own origin.
- **Block external navigation** — block any navigation (or opened link) that
  changes hostname.
- **Copy button** (right end) — copy the active tab's left title, left URL,
  right title, and right URL to the clipboard (four lines). The icon shows a
  checkmark for a few seconds.

With **Open links in new tab** on, clicking a link opens it in a new,
path-synced tab instead of navigating in place. **Shift+click** always does this
regardless of the toggle.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd+T` | New tab (both panes open blank) |
| `Cmd+Shift+T` | Reopen the most recently closed tab |
| `Cmd+W` | Close the active tab (returns to the tab that opened it; no-op on the last tab) |
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

`pnpm app:dir` creates `dist/mac-arm64/Side by Side Browser.app`.
`pnpm app:dist` creates distributable artifacts in `dist/`.
`pnpm run pack` and `pnpm run dist` are aliases for those two commands.

macOS code signing is disabled for local builds. That avoids keychain/signing stalls, but distributed builds may show Gatekeeper warnings.

## Limits

- Domain locking uses exact hostname matching. `www.example.com` to `example.com` is blocked.
- Scroll sync works by injected JavaScript. It can fail on browser-internal pages, crashed pages, and some unusual document modes.
- Each tab owns two web contents. Many tabs will use a lot of memory.
