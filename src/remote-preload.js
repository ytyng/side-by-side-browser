const { ipcRenderer } = require('electron');

const tabIdArg = process.argv.find((arg) => arg.startsWith('--sbs-tab-id='));
const paneArg = process.argv.find((arg) => arg.startsWith('--sbs-pane='));
const tabId = tabIdArg ? tabIdArg.slice('--sbs-tab-id='.length) : '';
const pane = paneArg ? paneArg.slice('--sbs-pane='.length) : '';

// Last broadcast scroll position in pixels. Used to skip sub-pixel noise and to
// avoid echoing back a scroll that a synced scrollTo just caused. A pixel-based
// threshold keeps follow granularity uniform regardless of page height.
let lastX = 0;
let lastY = 0;
let suppressUntil = 0;
let scheduled = false;

// When on, a plain left click on a link opens the target in a new tab (path-
// synced) instead of navigating this pane. Shift+click always does so regardless.
// The main process is the source of truth; we fetch it on load and on change.
let openLinksNewTab = false;
ipcRenderer.invoke('get-open-links-new-tab').then((value) => {
  openLinksNewTab = Boolean(value);
});
ipcRenderer.on('set-open-links-new-tab', (_event, value) => {
  openLinksNewTab = Boolean(value);
});

// Intercept link clicks in the capture phase so the decision is made before the
// page's own handlers run. isTrusted guards against a page synthesizing clicks
// to spawn tabs on its own. Only ordinary http(s) anchors are hijacked; hash
// links, downloads, and JS-scheme links fall through to normal handling.
document.addEventListener(
  'click',
  (event) => {
    if (!event.isTrusted || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href], area[href]');
    if (!anchor) return;
    if (anchor.protocol !== 'http:' && anchor.protocol !== 'https:') return;
    if (anchor.hasAttribute('download')) return;
    if (!event.shiftKey && !openLinksNewTab) return;
    event.preventDefault();
    event.stopPropagation();
    ipcRenderer.send('open-link', { tabId, pane, url: anchor.href });
  },
  true
);

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// The element that actually scrolls the viewport. In quirks mode this is <body>
// rather than <html>, so document.documentElement would report a zero range.
function scrollingEl() {
  return document.scrollingElement || document.documentElement;
}

// Current scroll position of each axis as both a 0..1 ratio of its scrollable
// range and an absolute pixel offset, or null when the axis has no scrollable
// range (max <= 0) so the peer leaves its own position on that axis untouched.
// The main process forwards both and the receiver picks px or percent by mode.
function scrollPositions() {
  const el = scrollingEl();
  const maxX = el.scrollWidth - el.clientWidth;
  const maxY = el.scrollHeight - el.clientHeight;
  return {
    percentX: maxX > 0 ? clamp01(window.scrollX / maxX) : null,
    percentY: maxY > 0 ? clamp01(window.scrollY / maxY) : null,
    pixelX: maxX > 0 ? window.scrollX : null,
    pixelY: maxY > 0 ? window.scrollY : null,
  };
}

window.addEventListener(
  'scroll',
  () => {
    if (Date.now() < suppressUntil) {
      // This scroll was caused by a synced scrollTo; record it but do not echo back.
      lastX = window.scrollX;
      lastY = window.scrollY;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      const x = window.scrollX;
      const y = window.scrollY;
      if (Math.abs(x - lastX) < 1 && Math.abs(y - lastY) < 1) return;
      lastX = x;
      lastY = y;
      const { percentX, percentY, pixelX, pixelY } = scrollPositions();
      ipcRenderer.send('pane-scroll', { tabId, pane, percentX, percentY, pixelX, pixelY });
    });
  },
  { passive: true }
);

window.addEventListener('DOMContentLoaded', () => {
  lastX = window.scrollX;
  lastY = window.scrollY;
});

ipcRenderer.on('sync-scroll-to', (_event, { mode, percentX, percentY, pixelX, pixelY }) => {
  suppressUntil = Date.now() + 150;
  const el = scrollingEl();
  const maxX = el.scrollWidth - el.clientWidth;
  const maxY = el.scrollHeight - el.clientHeight;
  // A null value means the sender's axis is not scrollable, so keep our own
  // position on that axis instead of forcing it to the top/left edge.
  let x;
  let y;
  if (mode === 'percent') {
    // Percent: map the sender's 0..1 ratio onto our own scrollable range.
    x = percentX != null && maxX > 0 ? clamp01(Number(percentX)) * maxX : window.scrollX;
    y = percentY != null && maxY > 0 ? clamp01(Number(percentY)) * maxY : window.scrollY;
  } else {
    // Pixel (default): apply the sender's absolute offset 1:1. window.scrollTo
    // clamps to our own range, so a shorter page just pins to its bottom.
    x = pixelX != null ? Number(pixelX) : window.scrollX;
    y = pixelY != null ? Number(pixelY) : window.scrollY;
  }
  // behavior: 'instant' bypasses the page's CSS `scroll-behavior: smooth`, so the
  // sync completes within the suppression window and cannot animate into a feedback loop.
  window.scrollTo({ left: x, top: y, behavior: 'instant' });
  window.requestAnimationFrame(() => {
    lastX = window.scrollX;
    lastY = window.scrollY;
  });
});
