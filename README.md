# Side by Side Browser

A two-pane Electron browser for comparing pages before and after a migration.

Electron is used instead of Tauri because this app needs two independent native browser contents, reliable navigation events, and injected scroll synchronization for arbitrary remote pages. A normal web iframe-based UI fails on many sites because `X-Frame-Options` and CSP block embedding.

## Install

```bash
npm install
```

## Run

```bash
npm start -- https://old.example.com https://new.example.com
```

The first positional URL opens on the left. The second opens on the right.

## CLI

```text
Usage:
  npm start -- [options] [leftUrl] [rightUrl]

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
  --home-left <url>        Home button URL for the left pane.
  --home-right <url>       Home button URL for the right pane.
  --allow-popups           Allow popup windows. Default: blocked.
  --open-devtools          Open devtools for the app chrome and page views.
  --help                   Show help.
  --version                Show version.
```

## Limits

- Domain locking uses exact hostname matching. `www.example.com` to `example.com` is blocked.
- Scroll sync works by injected JavaScript. It can fail on browser-internal pages, crashed pages, and some unusual document modes.
- Each tab owns two web contents. Many tabs will use a lot of memory.
