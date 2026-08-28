// URL handling shared by the main process and its tests.
//
// Split out of main.js so it can be exercised without booting Electron:
// main.js requires `electron` at module scope and parses process.argv on load,
// which makes it unusable from a plain `node --test` process.

const DEFAULT_LEFT_URL = 'https://example.com';
const DEFAULT_RIGHT_URL = 'https://example.org';

// Turns whatever the user typed in the address bar into a URL to load.
// Anything that is not recognizable as a host falls back to a web search.
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

// The part of a URL that path sync copies between panes.
function pathParts(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

// Applies a path (as produced by pathParts) onto another origin.
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

// Shortens a URL for display in a toast.
function trimUrl(url) {
  const text = String(url || '');
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

module.exports = {
  DEFAULT_LEFT_URL,
  DEFAULT_RIGHT_URL,
  normalizeInputUrl,
  isHttpUrl,
  hostnameOf,
  pathParts,
  withPathParts,
  trimUrl
};
