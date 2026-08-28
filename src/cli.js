// Command line parsing for the main process.
//
// Split out of main.js so it can be exercised without booting Electron
// (main.js requires `electron` at module scope).

const pkg = require('../package.json');
const { normalizeInputUrl } = require('./url-utils');

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
  --version                Show version.`;
}

module.exports = { parseCli, clampInt, helpText };
