---
name: side-by-side-browser
description: "Open two web pages next to each other in Side by Side Browser (macOS) so the user can compare them, with synchronized scrolling and URL paths. Use when the user wants to compare a page before and after a migration, a staging site against production, or an old and a new version of a site, and a visual side-by-side view would help. Japanese triggers: 並べて見せて, 新旧を比較, 左右で比較."
---

# Side by Side Browser

A two-pane Electron browser. Each pane is a real browser view, so pages that
refuse to be framed (`X-Frame-Options`, CSP) still load. Install with
`brew install --cask ytyng/tap/side-by-side-browser`.

## Launch

```sh
open -a "Side by Side Browser" --args https://old.example.com https://new.example.com --scroll-sync --path-sync
```

The first URL opens on the left, the second on the right. `open` returns at
once, so the agent is not blocked. To run it in the foreground (for example to
read `--help` or `--version`), call the binary directly:

```sh
"/Applications/Side by Side Browser.app/Contents/MacOS/Side by Side Browser" --help
```

Options worth passing from a script:

| Flag | Effect |
|---|---|
| `--scroll-sync` | Scroll both panes together (px by default; the user can switch to % in the toolbar for pages of different height) |
| `--path-sync` | Navigating one pane applies the same path, query and hash to the other, keeping each pane's own origin |
| `--lock-external` | Block navigation that changes hostname, so a comparison stays on the two sites |
| `--left <url>` / `--right <url>` | Same as the positionals |
| `--width <px>` / `--height <px>` / `--start-maximized` | Window size (default 1440x950) |
| `--user-agent <ua>` | Override the page user agent |
| `--partition <name>` / `--no-persist-session` | Separate or throwaway cookie store; the default partition persists logins between runs |

For a migration check the usual call is both URLs plus `--scroll-sync
--path-sync --lock-external`. Tell the user the window is open and which side
is which; the app has no other output.

## Limits

- Hostname lock is exact: `www.example.com` and `example.com` count as different.
- Scroll sync is injected JavaScript and can fail on browser-internal or crashed
  pages.
- Each tab holds two browser contents; many tabs use a lot of memory.
