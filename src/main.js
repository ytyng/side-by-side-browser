const { app, BaseWindow, WebContentsView, View, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');
const pkg = require('../package.json');
const { loadOptions, saveOptions } = require('./settings');

const CONTROL_HEIGHT = 128;
const MIN_PANE_WIDTH = 320;
const DIVIDER_WIDTH = 1;
const DEFAULT_LEFT_URL = 'https://example.com';
const DEFAULT_RIGHT_URL = 'https://example.org';
const BLANK_URL = 'about:blank';

const PANE_NAMES = ['left', 'right'];
const MAX_CLOSED_TABS = 25;

let mainWindow;
let chromeView;
let dividerView;
let activeTabId = null;
let nextTabId = 1;
let layout = { width: 1440, height: 950 };
let syncState = {
  scrollSync: false,
  pathSync: false,
  lockExternal: false
};
let isApplyingPathSync = false;
const tabs = new Map();
// Stack of { leftUrl, rightUrl } for closed tabs, most-recent last (Cmd+Shift+T).
const closedTabs = [];

const cli = parseCli(process.argv.slice(app.isPackaged ? 1 : 2));

if (cli.help) {
  console.log(helpText());
  process.exit(0);
}

if (cli.version) {
  console.log(pkg.version);
  process.exit(0);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

function createWindow() {
  // Persisted options are the base; CLI flags can only force an option on for
  // this session and are not written back to disk unless the user toggles later.
  const persisted = loadOptions();
  syncState = {
    scrollSync: persisted.scrollSync || cli.scrollSync,
    pathSync: persisted.pathSync || cli.pathSync,
    lockExternal: persisted.lockExternal || cli.lockExternal
  };

  mainWindow = new BaseWindow({
    width: cli.width,
    height: cli.height,
    minWidth: 900,
    minHeight: 560,
    title: 'Side by Side Browser',
    backgroundColor: '#1c1d20'
  });

  if (cli.startMaximized) mainWindow.maximize();

  chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'chrome-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.contentView.addChildView(chromeView);
  chromeView.webContents.on('before-input-event', handleShortcutInput);
  chromeView.webContents.loadFile(path.join(__dirname, 'chrome.html'));

  // 1px divider that fills the gap reserved between the two page panes in
  // relayout(). raiseDivider() also keeps it on top as a safety net in case the
  // panes ever overlap it.
  dividerView = new View();
  dividerView.setBackgroundColor('#777777');
  mainWindow.contentView.addChildView(dividerView);

  mainWindow.on('resize', relayout);
  mainWindow.on('closed', () => {
    mainWindow = null;
    tabs.clear();
  });

  const leftUrl = cli.left || cli.positionals[0] || DEFAULT_LEFT_URL;
  const rightUrl = cli.right || cli.positionals[1] || DEFAULT_RIGHT_URL;
  createTab({ leftUrl, rightUrl, makeActive: true });

  registerIpc();

  if (cli.openDevtools) {
    chromeView.webContents.openDevTools({ mode: 'detach' });
  }

  relayout();
  sendState();
}

function registerIpc() {
  ipcMain.handle('get-state', () => getSerializableState());
  ipcMain.handle('new-tab', () => {
    openNewTab();
    return getSerializableState();
  });
  ipcMain.handle('select-tab', (_event, tabId) => {
    if (tabs.has(tabId)) {
      activeTabId = tabId;
      relayout();
      sendState();
    }
    return getSerializableState();
  });
  ipcMain.handle('close-tab', (_event, tabId) => {
    closeTab(tabId);
    return getSerializableState();
  });
  ipcMain.handle('set-option', (_event, { key, value }) => {
    if (Object.prototype.hasOwnProperty.call(syncState, key)) {
      syncState[key] = Boolean(value);
      // Persist only the toggled key by merging onto the on-disk value, so a
      // CLI-forced option on another key never leaks into the saved settings.
      const persisted = loadOptions();
      persisted[key] = syncState[key];
      saveOptions(persisted);
      sendState();
    }
    return getSerializableState();
  });
  ipcMain.handle('navigate', (_event, { pane, url }) => {
    const tab = getActiveTab();
    if (!tab || !PANE_NAMES.includes(pane)) return getSerializableState();
    loadPane(tab, pane, normalizeInputUrl(url));
    return getSerializableState();
  });
  ipcMain.handle('go', (_event, { pane, action }) => {
    const tab = getActiveTab();
    const view = tab?.views[pane];
    if (!view) return getSerializableState();
    if (action === 'back' && view.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack();
    }
    if (action === 'forward' && view.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward();
    }
    if (action === 'reload') view.webContents.reload();
    if (action === 'stop') view.webContents.stop();
    return getSerializableState();
  });
  ipcMain.handle('open-external', (_event, url) => {
    if (isHttpUrl(url)) shell.openExternal(url);
  });
  ipcMain.on('pane-scroll', (_event, payload) => {
    handlePaneScroll(payload);
  });
}

function openNewTab() {
  if (!mainWindow) return;
  // New tabs open blank in both panes; the user then types each target URL.
  createTab({ leftUrl: BLANK_URL, rightUrl: BLANK_URL, makeActive: true });
}

function reopenClosedTab() {
  if (!mainWindow) return;
  const restored = closedTabs.pop();
  if (!restored) {
    toast('No recently closed tab to reopen');
    return;
  }
  createTab({ leftUrl: restored.leftUrl, rightUrl: restored.rightUrl, makeActive: true });
}

function cycleTab(direction) {
  const ids = Array.from(tabs.keys());
  if (ids.length <= 1) return;
  const currentIndex = ids.indexOf(activeTabId);
  const nextIndex = (currentIndex + direction + ids.length) % ids.length;
  activeTabId = ids[nextIndex];
  relayout();
  sendState();
}

// Fallback for the menu accelerators: on macOS, menu accelerators can fail to
// fire while keyboard focus is inside a page WebContentsView (the usual case
// here), so mirror the shortcuts via before-input-event on every webContents.
// before-input-event fires *before* the menu accelerator, so calling
// event.preventDefault() here also suppresses the menu shortcut for the same
// keypress — meaning the action never runs twice.
function handleShortcutInput(event, input) {
  if (input.type !== 'keyDown' || input.alt) return;
  // Match the menu's CmdOrCtrl: Cmd on macOS, Ctrl elsewhere.
  const primary = process.platform === 'darwin' ? input.meta : input.control;

  // Ctrl+Tab / Ctrl+Shift+Tab: cycle to the next / previous tab.
  if (input.control && !input.meta && input.code === 'Tab') {
    cycleTab(input.shift ? -1 : 1);
    event.preventDefault();
    return;
  }

  // Cmd+T / Cmd+Shift+T: new tab / reopen the most-recently-closed tab.
  if (primary && input.code === 'KeyT') {
    if (input.shift) reopenClosedTab();
    else openNewTab();
    event.preventDefault();
  }
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => openNewTab() },
        { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => reopenClosedTab() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Tab',
      submenu: [
        { label: 'Next Tab', accelerator: 'Control+Tab', click: () => cycleTab(1) },
        { label: 'Previous Tab', accelerator: 'Control+Shift+Tab', click: () => cycleTab(-1) }
      ]
    },
    { role: 'windowMenu' }
  ];
  return Menu.buildFromTemplate(template);
}

function createTab({ leftUrl, rightUrl, makeActive }) {
  const id = `tab-${nextTabId++}`;
  const tab = {
    id,
    title: 'New comparison',
    views: {
      left: createPaneView(id, 'left'),
      right: createPaneView(id, 'right')
    },
    urls: {
      left: normalizeInputUrl(leftUrl),
      right: normalizeInputUrl(rightUrl)
    },
    hostnames: {
      left: null,
      right: null
    },
    loading: {
      left: false,
      right: false
    },
    canGoBack: {
      left: false,
      right: false
    },
    canGoForward: {
      left: false,
      right: false
    }
  };

  tabs.set(id, tab);
  mainWindow.contentView.addChildView(tab.views.left);
  mainWindow.contentView.addChildView(tab.views.right);
  raiseDivider();

  loadPane(tab, 'left', tab.urls.left);
  loadPane(tab, 'right', tab.urls.right);

  if (makeActive) activeTabId = id;
  relayout();
  sendState();
  return tab;
}

function createPaneView(tabId, pane) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'remote-preload.js'),
      additionalArguments: [`--sbs-tab-id=${tabId}`, `--sbs-pane=${pane}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: sessionPartition()
    }
  });

  view.webContents.on('before-input-event', handleShortcutInput);

  if (cli.userAgent) view.webContents.setUserAgent(cli.userAgent);

  view.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    toast(`Permission blocked: ${permission}`);
    callback(false);
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (cli.allowPopups) return { action: 'allow' };
    toast(`Popup blocked: ${trimUrl(url)}`);
    return { action: 'deny' };
  });

  view.webContents.on('will-navigate', (event, url) => {
    if (!shouldAllowNavigation(tabId, pane, url)) {
      event.preventDefault();
    }
  });
  view.webContents.on('will-redirect', (event, url) => {
    if (!shouldAllowNavigation(tabId, pane, url)) {
      event.preventDefault();
    }
  });

  view.webContents.on('did-start-loading', () => updateLoading(tabId, pane, true));
  view.webContents.on('did-stop-loading', () => updateLoading(tabId, pane, false));
  view.webContents.on('did-navigate', (_event, url) => handleNavigated(tabId, pane, url));
  view.webContents.on('did-navigate-in-page', (_event, url) => handleNavigated(tabId, pane, url));
  view.webContents.on('page-title-updated', (_event, title) => {
    const tab = tabs.get(tabId);
    if (!tab) return;
    if (pane === 'left' && title) tab.title = title;
    sendState();
  });

  if (cli.openDevtools) view.webContents.openDevTools({ mode: 'detach' });

  return view;
}

function loadPane(tab, pane, url) {
  const nextUrl = normalizeInputUrl(url);
  tab.urls[pane] = nextUrl;
  tab.views[pane].webContents.loadURL(nextUrl).catch((error) => {
    toast(`Load failed: ${error.message}`);
  });
  sendState();
}

function shouldAllowNavigation(tabId, pane, url) {
  if (!syncState.lockExternal || !isHttpUrl(url)) return true;
  const tab = tabs.get(tabId);
  if (!tab) return true;

  const nextHostname = hostnameOf(url);
  const currentHostname = tab.hostnames[pane] || hostnameOf(tab.urls[pane]);
  if (!currentHostname || !nextHostname || currentHostname === nextHostname) return true;

  toast(`External navigation blocked: ${currentHostname} -> ${nextHostname}`);
  return false;
}

function handleNavigated(tabId, pane, url) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  const previousUrl = tab.urls[pane];
  tab.urls[pane] = url;
  if (isHttpUrl(url)) tab.hostnames[pane] = hostnameOf(url);

  updateHistoryState(tab, pane);
  sendState();

  if (!syncState.pathSync || isApplyingPathSync) return;
  const otherPane = pane === 'left' ? 'right' : 'left';
  const sourceParts = pathParts(url);
  const previousParts = pathParts(previousUrl);
  if (!sourceParts || !previousParts || sourceParts === previousParts) return;

  const otherUrl = tab.urls[otherPane];
  const syncedUrl = withPathParts(otherUrl, sourceParts);
  if (!syncedUrl || syncedUrl === otherUrl) return;

  isApplyingPathSync = true;
  loadPane(tab, otherPane, syncedUrl);
  setTimeout(() => {
    isApplyingPathSync = false;
  }, 500);
}

function handlePaneScroll(payload) {
  if (!syncState.scrollSync || !payload || payload.tabId !== activeTabId) return;
  const tab = getActiveTab();
  if (!tab || !PANE_NAMES.includes(payload.pane)) return;
  const targetPane = payload.pane === 'left' ? 'right' : 'left';
  const target = tab.views[targetPane];
  const dx = Number(payload.dx) || 0;
  const dy = Number(payload.dy) || 0;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  target.webContents.send('sync-scroll-by', { dx, dy });
}

function updateLoading(tabId, pane, loading) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  tab.loading[pane] = loading;
  updateHistoryState(tab, pane);
  sendState();
}

function updateHistoryState(tab, pane) {
  const wc = tab.views[pane].webContents;
  tab.canGoBack[pane] = wc.navigationHistory.canGoBack();
  tab.canGoForward[pane] = wc.navigationHistory.canGoForward();
}

function closeTab(tabId) {
  if (tabs.size <= 1) return;
  const tab = tabs.get(tabId);
  if (!tab) return;
  closedTabs.push({ leftUrl: tab.urls.left, rightUrl: tab.urls.right });
  if (closedTabs.length > MAX_CLOSED_TABS) closedTabs.shift();
  for (const pane of PANE_NAMES) {
    tab.views[pane].setBounds({ x: 0, y: 0, width: 0, height: 0 });
    tab.views[pane].webContents.close();
  }
  tabs.delete(tabId);
  if (activeTabId === tabId) activeTabId = Array.from(tabs.keys())[0] || null;
  relayout();
  sendState();
}

function relayout() {
  if (!mainWindow || !chromeView) return;
  const bounds = mainWindow.getBounds();
  layout = { width: bounds.width, height: bounds.height };

  chromeView.setBounds({ x: 0, y: 0, width: bounds.width, height: CONTROL_HEIGHT });

  const availableHeight = Math.max(1, bounds.height - CONTROL_HEIGHT);
  const half = Math.max(MIN_PANE_WIDTH, Math.floor(bounds.width / 2));
  const leftWidth = Math.min(half, bounds.width - MIN_PANE_WIDTH);
  // Reserve a 1px column at x=leftWidth for the divider and shift the right pane
  // over. Native WebContentsView layers can composite above a plain View, so the
  // divider must sit in a real gap between the panes rather than overlap them.
  const rightX = leftWidth + DIVIDER_WIDTH;
  const rightWidth = Math.max(1, bounds.width - rightX);

  let hasActivePanes = false;
  for (const [tabId, tab] of tabs) {
    if (tabId === activeTabId) {
      tab.views.left.setBounds({ x: 0, y: CONTROL_HEIGHT, width: leftWidth, height: availableHeight });
      tab.views.right.setBounds({ x: rightX, y: CONTROL_HEIGHT, width: rightWidth, height: availableHeight });
      hasActivePanes = true;
    } else {
      tab.views.left.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      tab.views.right.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  if (dividerView) {
    dividerView.setVisible(hasActivePanes);
    dividerView.setBounds({ x: leftWidth, y: CONTROL_HEIGHT, width: DIVIDER_WIDTH, height: availableHeight });
  }
}

// Keep the divider above the page web contents, which are re-added on top when
// tabs are created.
function raiseDivider() {
  if (!mainWindow || !dividerView) return;
  mainWindow.contentView.removeChildView(dividerView);
  mainWindow.contentView.addChildView(dividerView);
}

function sendState() {
  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('state', getSerializableState());
  }
}

function toast(message) {
  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('toast', message);
  }
}

function getSerializableState() {
  return {
    activeTabId,
    options: { ...syncState },
    layout,
    tabs: Array.from(tabs.values()).map((tab) => ({
      id: tab.id,
      title: tab.title,
      urls: { ...tab.urls },
      loading: { ...tab.loading },
      canGoBack: { ...tab.canGoBack },
      canGoForward: { ...tab.canGoForward }
    }))
  };
}

function getActiveTab() {
  return activeTabId ? tabs.get(activeTabId) : null;
}

function normalizeInputUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_LEFT_URL;
  // `host:port` (e.g. localhost:3000) looks scheme-like but is not; prepend https.
  const looksLikeHostPort = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(raw);
  if (!looksLikeHostPort && /^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  // host:port always gets https (incl. single-label hosts like app:3000 that
  // contain no dot); other bare hosts need a dot or localhost to qualify.
  if (looksLikeHostPort || raw.includes('.') || raw.includes('localhost')) return `https://${raw}`;
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hostnameOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function pathParts(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function withPathParts(baseValue, nextPathParts) {
  try {
    const url = new URL(baseValue);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const parsedPath = new URL(nextPathParts, `${url.protocol}//${url.host}`);
    url.pathname = parsedPath.pathname;
    url.search = parsedPath.search;
    url.hash = parsedPath.hash;
    return url.toString();
  } catch {
    return null;
  }
}

function trimUrl(url) {
  const text = String(url || '');
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function sessionPartition() {
  if (cli.persistSession) return `persist:${cli.partition}`;
  return cli.partition;
}

function parseCli(argv) {
  const result = {
    help: false,
    version: false,
    left: null,
    right: null,
    positionals: [],
    scrollSync: false,
    pathSync: false,
    lockExternal: false,
    width: 1440,
    height: 950,
    startMaximized: false,
    userAgent: null,
    partition: 'side-by-side-browser',
    persistSession: true,
    allowPopups: false,
    openDevtools: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--version' || arg === '-v') result.version = true;
    else if (arg === '--left') result.left = argv[++index];
    else if (arg.startsWith('--left=')) result.left = arg.slice('--left='.length);
    else if (arg === '--right') result.right = argv[++index];
    else if (arg.startsWith('--right=')) result.right = arg.slice('--right='.length);
    else if (arg === '--scroll-sync') result.scrollSync = true;
    else if (arg === '--path-sync') result.pathSync = true;
    else if (arg === '--lock-external') result.lockExternal = true;
    else if (arg === '--width') result.width = clampInt(argv[++index], 900, 4000, result.width);
    else if (arg.startsWith('--width=')) result.width = clampInt(arg.slice('--width='.length), 900, 4000, result.width);
    else if (arg === '--height') result.height = clampInt(argv[++index], 560, 3000, result.height);
    else if (arg.startsWith('--height=')) result.height = clampInt(arg.slice('--height='.length), 560, 3000, result.height);
    else if (arg === '--start-maximized') result.startMaximized = true;
    else if (arg === '--user-agent') result.userAgent = argv[++index];
    else if (arg.startsWith('--user-agent=')) result.userAgent = arg.slice('--user-agent='.length);
    else if (arg === '--partition') result.partition = argv[++index] || result.partition;
    else if (arg.startsWith('--partition=')) result.partition = arg.slice('--partition='.length) || result.partition;
    else if (arg === '--no-persist-session') result.persistSession = false;
    else if (arg === '--allow-popups') result.allowPopups = true;
    else if (arg === '--open-devtools') result.openDevtools = true;
    else if (arg.startsWith('-')) console.warn(`Unknown option: ${arg}`);
    else result.positionals.push(arg);
  }

  result.left = result.left ? normalizeInputUrl(result.left) : null;
  result.right = result.right ? normalizeInputUrl(result.right) : null;
  return result;
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function helpText() {
  return `Side by Side Browser ${pkg.version}

Usage:
  side-by-side-browser [options] [leftUrl] [rightUrl]

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
  --version                Show version.`;
}
