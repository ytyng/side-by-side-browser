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
- Cut a release: `pnpm release [patch|minor|major]`

Do not add `package-lock.json` or use npm for dependency changes.

## Styling (Tailwind)

The app chrome is styled with Tailwind CSS v4.

- Source (edit this): `src/styles/tailwind.css` (theme tokens + component classes).
- Generated (do not edit, do not commit): `src/styles/app.css`, produced by `pnpm run tw:build`.
- `start`, `dev`, and the `app:*`/`pack`/`dist` scripts run `tw:build` first, so `src/styles/app.css` is regenerated before the app loads or is packaged. Use `pnpm run tw:watch` while iterating on styles.
- Icons use the vendored Bootstrap Icons font in `src/vendor/bootstrap-icons/` (`<i class="bi bi-*">`), loaded locally to satisfy the `default-src 'self'` CSP; do not switch to a CDN.

## App Icon (`resources/`)

`resources/` is the electron-builder **buildResources** directory. It is renamed from
electron-builder's default `build/` via `directories.buildResources` in `package.json`, so that
setting must stay in sync with the directory name — dropping it silently sends electron-builder
looking in `build/` again.

- `resources/icon.png` (1024×1024) is the only source of truth for the app icon. electron-builder
  converts it to `Contents/Resources/icon.icns` at package time (`mac.icon` points at it); there is
  no committed `.icns`.
- The icon is a two-pane split (Bootstrap Icons `layout-split`, white on `#9a4a0f`) with a 10%
  transparent margin around the rounded square, per the macOS app-icon convention.
- `src/main.js` also feeds the same PNG to `app.dock.setIcon()` **in dev only** (`!app.isPackaged`);
  a packaged build takes its icon from the bundle's `.icns`, so the dev path is what keeps
  `pnpm start` from showing the generic Electron icon. If the PNG moves, update both the
  `mac.icon` path and that `path.join` call.

### Packaging under the Claude Code Bash sandbox

`pnpm app:dir` fails in the agent sandbox for reasons unrelated to the build config. Both are
environmental; do not "fix" them by changing `package.json`:

- electron-builder downloads a PNG→ICNS toolset and caches it in
  `~/Library/Caches/electron-builder`, which the sandbox rejects with `EPERM: mkdir`. Pre-extract
  the bundle and point `ELECTRON_BUILDER_ICONS_TOOLSET_DIR` at it instead.
- Do **not** work around that by redirecting `ELECTRON_BUILDER_CACHE`: it relocates the *electron*
  cache too, forcing a fresh ~100MB electron download that the sandbox aborts mid-stream
  (`ReadError: The server aborted pending request`). Leave the electron cache warm and override
  only the icons toolset.

```bash
curl -sSL -o "$TMPDIR/icons-bundle.tar.gz" \
  'https://github.com/electron-userland/electron-builder-binaries/releases/download/icons@1.1.0/icons-bundle.tar.gz'
mkdir -p "$TMPDIR/icons-toolset" && tar -xzf "$TMPDIR/icons-bundle.tar.gz" -C "$TMPDIR/icons-toolset"
ELECTRON_BUILDER_ICONS_TOOLSET_DIR="$TMPDIR/icons-toolset/icons-bundle" pnpm app:dir
```

## Build Outputs

Generated output lives in `dist/` and must not be committed.

`build.mac.target` is `dmg` + `zip`, both `universal` (Intel and Apple Silicon in one
binary), and `build.win.target` is `nsis` on `x64`. `app:dir`/`pack` add `--arm64` so the
unpacked local build stays a single-arch build; a universal `--dir` build downloads and
merges two Electron distributions for no local benefit.

Expected outputs:

- `dist/mac-arm64/Side by Side Browser.app` (from `pnpm app:dir`)
- `dist/Side by Side Browser-*-universal.dmg`
- `dist/Side by Side Browser-*-universal-mac.zip`
- `dist/Side by Side Browser Setup *.exe` (Windows, CI only)

`node_modules/` and `dist/` are intentionally ignored.

## Release (`.github/workflows/release.yml` + `scripts/release.sh`)

`pnpm release [patch|minor|major]` bumps `package.json`, pushes to `main`, triggers the
`workflow_dispatch`-only `Release` workflow, and watches it. The workflow builds macOS and
Windows in parallel, then a `publish` job creates the `v<version>` GitHub Release.

Design decisions that are easy to undo by accident:

- **Artifacts, not per-leg publishing.** Each matrix leg uploads to `actions/upload-artifact`
  and only the `publish` job touches GitHub Releases. Letting both legs publish to the same
  tag races, and a release containing only the faster platform is worse than no release.
  This also keeps Apple credentials away from any third-party action.
- **`mac.identity: null` stays in `package.json`.** That is what keeps local builds unsigned
  (no keychain stalls). CI overrides it per-run with `-c.mac.identity="$IDENTITY"`, which
  electron-builder deep-merges over the file config — `mac.icon` and `mac.category` survive.
  Setting the identity to `"-"` (the Tauri ad-hoc trick) would **not** work here: a `"-"`
  qualifier always resolves to ad-hoc signing, even when a real certificate is present.
- **The identity prefix is stripped in the workflow.** electron-builder picks the certificate
  *type* itself and throws if the name still starts with `Developer ID Application: `. The
  qualifier is matched as a substring of `security find-identity` output, so the remaining
  `Cyberneura K.K. (TEAMID)` selects the right certificate.
- **Notarization is not a config flag.** electron-builder notarizes whenever `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set *and* signing succeeded; a
  `mac.notarize: true` entry would be redundant, and only `false` disables it. Without those
  env vars it logs `skipped macOS notarization` and continues, which is why local builds do
  not need any guard. **The repository secret is `APPLE_PASSWORD` but the env var must be
  `APPLE_APP_SPECIFIC_PASSWORD`** — they are deliberately named differently.
- **`forceCodeSigning=true` on the CI macOS build.** Without it a missing or wrong
  certificate produces a silently unsigned dmg instead of a failed run.
- **`CSC_LINK`/`CSC_KEY_PASSWORD` only on the macOS step.** electron-builder imports the
  `.p12` into a throwaway keychain itself, so there is no hand-written `security import`
  step, and the Windows leg never sees Apple credentials.
- **`contents: read` at the workflow level, `contents: write` only on `publish`.** The
  build job decrypts the certificate and runs a third-party action; it has no reason to
  hold a writable token.
- **`pnpm/action-setup` is pinned to a commit SHA**, since it runs in the same job that
  decrypts the `.p12`. Do not pass `version:` to it — the pnpm version comes from
  `packageManager` in `package.json`, and specifying both makes the action throw.
- **The Windows build step sets `shell: bash`.** The default `pwsh` does not stop on a
  failing native command mid-step, so a broken `tw:build` could ship an installer without
  the generated `app.css`. bash on windows-latest runs with `-eo pipefail`.
- **`concurrency.cancel-in-progress: false`.** Releases serialize (a second run queues)
  rather than cancel. Flipping it to `true` would let a new release abort one that is
  mid-publish, leaving a bumped version with no GitHub Release.
- **The script is `release`, not `publish`.** `pnpm publish` is a built-in pnpm command and
  cannot be overridden by a `scripts` entry.
- **The version must move every run.** `gh release create` fails if `v<version>` already has
  a release, which is the whole reason the bump is automated.

Required repository secrets (registered 2026-07-24): `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID`.

Known limits:

- `pnpm release` pushes straight to `main`. Enabling branch protection that requires PRs
  breaks it; that would need a tag-driven workflow instead.
- Windows builds are produced but have never been run or tested. The installer is unsigned,
  so SmartScreen warns on first launch.

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
- The `openLinksNewTab` toggle (and Shift+click, always, regardless of the toggle) opens a clicked link in a fresh **path-synced** tab: the clicked pane loads the target, the other pane loads the same path/search/hash on its own origin (a one-shot sync, independent of the `pathSync` toggle). Interception happens in `remote-preload.js` on the capture-phase `click` (only trusted, plain-left, no-modifier-except-Shift clicks on http(s) anchors), which `preventDefault`s and sends `open-link` to the main `handleOpenLink`. The preload caches the toggle (fetched via `get-open-links-new-tab` on load, pushed via `set-open-links-new-tab` on change by `broadcastOpenLinksNewTab`) so it can decide synchronously at click time. `isTrusted` keeps a page from synthesizing clicks to spawn tabs. `handleOpenLink` also re-applies the external-navigation lock (the new tab loads via `loadURL`, which never fires `will-navigate`, so `shouldAllowNavigation` would otherwise be skipped and an external link would bypass `lockExternal` through this path). A link-opened tab records its `openerTabId`; closing it (e.g. `Cmd+W`) returns focus to that opener if it is still open, instead of falling back to the leftmost tab.
- The four boolean sync toggles (`scrollSync`, `pathSync`, `lockExternal`, `openLinksNewTab`) plus the string `scrollSyncMode` (`px`/`percent`, default `px`) are persisted to `userData/settings.json` via `src/settings.js` and restored on the next launch. Persisted values are the base at startup; CLI flags (`--scroll-sync` etc.) only force an option on for that session, and a UI toggle persists just the changed key. `settings.js` reads with a key allowlist + per-type validation (booleans for the toggles, an enum allowlist for `scrollSyncMode`) and writes atomically (temp file + rename). The `set-option` IPC handler validates `scrollSyncMode` as a string enum *before* the boolean branch, which would otherwise coerce it with `Boolean()`.
- Tab keyboard shortcuts: `Cmd+T` new tab (both panes open `about:blank`), `Cmd+Shift+T` reopen the most recently closed tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle next / previous, `Cmd+W` close the active tab (never the window/app — it is a no-op on a single tab; Close Window is `Cmd+Shift+W`). They are wired **twice on purpose**: an application menu (accelerators, in `buildAppMenu()`) plus a `before-input-event` handler (`handleShortcutInput`) attached to every `webContents` (chrome + each pane). On macOS a menu accelerator can fail to fire while focus is inside a page `WebContentsView`, so the `before-input-event` fallback is required. `before-input-event` fires *before* the menu accelerator, so its `preventDefault()` also suppresses the menu shortcut — do not "simplify" by dropping one path, and keep both in sync when adding shortcuts.
- The closed-tab stack (`closedTabs`, bounded by `MAX_CLOSED_TABS`) stores each closed tab's left/right URLs for `Cmd+Shift+T`.
- The tab bar is **multi-row**: `#tabs` uses `flex-wrap`, so tabs spill onto additional rows instead of being clipped when they overflow one row. Because the native page webviews are positioned *below* the chrome band by the main process, the chrome height must be dynamic. `#app` is content-driven (base CSS gives it no fixed height — do not re-add `height: 100%`/`overflow` to `#app`, or `offsetHeight` would clamp to the band and the wrapped rows would be hidden), and `chrome.js` observes it with a `ResizeObserver`, reporting `#app.offsetHeight` via the `set-chrome-height` IPC only when it changes (deduped against `lastReportedChromeHeight`). The main process runs `normalizeChromeHeight` (Number + finite check + clamp to `[CONTROL_HEIGHT, MAX_CONTROL_HEIGHT]`) into `chromeHeight`, then `relayout()` sizes the chrome band and shifts the panes/divider. `relayout()` re-clamps: `control = min(chromeHeight, max(CONTROL_HEIGHT, windowHeight - MIN_PANE_HEIGHT))`, so the panes always keep `MIN_PANE_HEIGHT`. This does **not** loop: `relayout()` only changes the band's *height*, never `#app`'s width, so the wrapped row count (and thus `offsetHeight`) is unchanged and the dedup stops the resend. `chromeHeight` is reset to `CONTROL_HEIGHT` at the top of `createWindow()` so a stale value from a previous window (macOS keeps the app alive after all windows close) never mis-places the panes.

Known limits:

- `example.com` and `www.example.com` are treated as different hostnames.
- On a very short window with many tabs, the chrome band is clamped to keep `MIN_PANE_HEIGHT`, so `body { overflow: hidden }` can clip the last tab row or the toolbar. This is an intentional trade-off (panes are protected over showing every tab row); it needs a large tab count on a small window to trigger.
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
