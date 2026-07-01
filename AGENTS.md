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
- Scroll sync uses injected JavaScript and delta scrolling.
- External navigation blocking uses exact hostname matching.
- The three sync toggles (`scrollSync`, `pathSync`, `lockExternal`) are persisted to `userData/settings.json` via `src/settings.js` and restored on the next launch. Persisted values are the base at startup; CLI flags (`--scroll-sync` etc.) only force an option on for that session, and a UI toggle persists just the changed key. `settings.js` reads with a key allowlist + boolean validation and writes atomically (temp file + rename).

Known limits:

- `example.com` and `www.example.com` are treated as different hostnames.
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
