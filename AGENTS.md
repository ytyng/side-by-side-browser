# Repository Instructions

This is a small Electron desktop app for comparing migration pages in two side-by-side native webviews.

## Package Manager

Use `pnpm`.

- Install: `pnpm install`
- Run: `pnpm start -- [leftUrl] [rightUrl]`
- Check: `pnpm check`
- Audit: `pnpm audit`
- Build unpacked local app: `pnpm app:dir`
- Build distributable artifacts: `pnpm app:dist`

Do not add `package-lock.json` or use npm for dependency changes.

## Styling (Tailwind)

The app chrome is styled with Tailwind CSS v4.

- Source (edit this): `src/styles/tailwind.css` (theme tokens + component classes).
- Generated (do not edit, do not commit): `src/styles/app.css`, produced by `pnpm run tw:build`.
- `start`, `dev`, and the `app:*`/`pack`/`dist` scripts run `tw:build` first, so `src/styles/app.css` is regenerated before the app loads or is packaged. Use `pnpm run tw:watch` while iterating on styles.
- Icons use the vendored Bootstrap Icons font in `src/vendor/bootstrap-icons/` (`<i class="bi bi-*">`), loaded locally to satisfy the `default-src 'self'` CSP; do not switch to a CDN.

## Build Outputs

Generated output lives in `dist/` and must not be committed.

Expected macOS outputs:

- `dist/mac-arm64/Side by Side Browser.app`
- `dist/Side by Side Browser-*-arm64.dmg`
- `dist/Side by Side Browser-*-arm64-mac.zip`

`node_modules/` and `dist/` are intentionally ignored.

## Electron Security Rules

This app loads arbitrary external websites, so keep the remote page webviews isolated.

- Keep `contextIsolation: true`.
- Keep `nodeIntegration: false`.
- Keep `sandbox: true`.
- Do not expose broad IPC APIs to remote pages.
- Keep permission requests denied by default unless a specific workflow requires one.
- Keep external-domain navigation blocking applied to both direct navigation and redirects.

Weakening these settings is not a harmless refactor. A migration comparison browser loads untrusted production/staging pages, so the browser renderer is the main attack surface.

## App Behavior

The app has one native webview pair per tab.

- URL path sync copies pathname, search, and hash from one pane to the other while preserving the other pane's origin.
- Address-bar input is normalized by `normalizeInputUrl` before loading: a real scheme (`http://`, `about:blank`, `file://`) is kept as-is; a `host:port` shape (`localhost:3000`, `app:3000` — matched *before* the scheme check because it would otherwise be misread as a scheme) and any bare host with a dot or `localhost` get `https://` prepended; everything else becomes a Google search. When editing the scheme/host-port predicates, keep `looksLikeHostPort` in **both** the scheme guard and the prepend condition, or single-label `host:port` inputs silently fall through to a search.
- Scroll sync uses injected JavaScript and delta scrolling. A `scrollSyncMode` dropdown next to the Scroll sync checkbox picks the unit: `px` (default, applies the peer's absolute pixel offset 1:1 — exact when both pages share a layout) or `percent` (maps the 0..1 scroll ratio onto the other pane's own scrollable range). The remote preload (`remote-preload.js`) always sends both pixel and percent positions; the main process forwards both plus the active `mode`, and the receiver picks one — so the preload stays stateless about the selected unit.
- The copy button at the right end of the header (`copyComparison`) copies the active tab's comparison to the clipboard as four lines — left title, left URL, right title, right URL — via the main `copy-comparison` IPC (`clipboard.writeText`, so no renderer clipboard permission is needed). The button icon flips to a checkmark for 3s; this is renderer-only state and safe because the button lives in static header markup that `render()` never rebuilds. Per-pane titles are tracked in `tab.titles` (`page-title-updated` for both panes); `tab.title` stays the left title for the tab label.
- External navigation blocking uses exact hostname matching.
- The `openLinksNewTab` toggle (and Shift+click, always, regardless of the toggle) opens a clicked link in a fresh **path-synced** tab: the clicked pane loads the target, the other pane loads the same path/search/hash on its own origin (a one-shot sync, independent of the `pathSync` toggle). Interception happens in `remote-preload.js` on the capture-phase `click` (only trusted, plain-left, no-modifier-except-Shift clicks on http(s) anchors), which `preventDefault`s and sends `open-link` to the main `handleOpenLink`. The preload caches the toggle (fetched via `get-open-links-new-tab` on load, pushed via `set-open-links-new-tab` on change by `broadcastOpenLinksNewTab`) so it can decide synchronously at click time. `isTrusted` keeps a page from synthesizing clicks to spawn tabs. A link-opened tab records its `openerTabId`; closing it (e.g. `Cmd+W`) returns focus to that opener if it is still open, instead of falling back to the leftmost tab.
- The four boolean sync toggles (`scrollSync`, `pathSync`, `lockExternal`, `openLinksNewTab`) plus the string `scrollSyncMode` (`px`/`percent`, default `px`) are persisted to `userData/settings.json` via `src/settings.js` and restored on the next launch. Persisted values are the base at startup; CLI flags (`--scroll-sync` etc.) only force an option on for that session, and a UI toggle persists just the changed key. `settings.js` reads with a key allowlist + per-type validation (booleans for the toggles, an enum allowlist for `scrollSyncMode`) and writes atomically (temp file + rename). The `set-option` IPC handler validates `scrollSyncMode` as a string enum *before* the boolean branch, which would otherwise coerce it with `Boolean()`.
- Tab keyboard shortcuts: `Cmd+T` new tab (both panes open `about:blank`), `Cmd+Shift+T` reopen the most recently closed tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle next / previous, `Cmd+W` close the active tab (never the window/app — it is a no-op on a single tab; Close Window is `Cmd+Shift+W`). They are wired **twice on purpose**: an application menu (accelerators, in `buildAppMenu()`) plus a `before-input-event` handler (`handleShortcutInput`) attached to every `webContents` (chrome + each pane). On macOS a menu accelerator can fail to fire while focus is inside a page `WebContentsView`, so the `before-input-event` fallback is required. `before-input-event` fires *before* the menu accelerator, so its `preventDefault()` also suppresses the menu shortcut — do not "simplify" by dropping one path, and keep both in sync when adding shortcuts.
- The closed-tab stack (`closedTabs`, bounded by `MAX_CLOSED_TABS`) stores each closed tab's left/right URLs for `Cmd+Shift+T`.

Known limits:

- `example.com` and `www.example.com` are treated as different hostnames.
- Open-links-in-new-tab only catches real `<a href>`/`<area href>` navigations. SPA links that navigate via a JS click handler (`history.pushState`, `location =`) are not intercepted — `preventDefault` stops the anchor's default but not the page's own script.
- Scroll sync can fail on browser-internal pages, crashed pages, or unusual document modes.
- Memory usage grows quickly because each tab owns two Chromium web contents.

## Git

Before committing:

```bash
pnpm check
pnpm audit
```

For build-related changes, also run:

```bash
pnpm app:dir
pnpm app:dist
```

Do not commit generated build artifacts.
