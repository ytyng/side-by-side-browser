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

// Current scroll position of each axis as a 0..1 ratio of its scrollable range,
// or null when the axis has no scrollable range (max <= 0) so the peer leaves
// its own position on that axis untouched.
function scrollRatios() {
  const el = scrollingEl();
  const maxX = el.scrollWidth - el.clientWidth;
  const maxY = el.scrollHeight - el.clientHeight;
  return {
    percentX: maxX > 0 ? clamp01(window.scrollX / maxX) : null,
    percentY: maxY > 0 ? clamp01(window.scrollY / maxY) : null,
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
      const { percentX, percentY } = scrollRatios();
      ipcRenderer.send('pane-scroll', { tabId, pane, percentX, percentY });
    });
  },
  { passive: true }
);

window.addEventListener('DOMContentLoaded', () => {
  lastX = window.scrollX;
  lastY = window.scrollY;
});

ipcRenderer.on('sync-scroll-to', (_event, { percentX, percentY }) => {
  suppressUntil = Date.now() + 150;
  const el = scrollingEl();
  const maxX = el.scrollWidth - el.clientWidth;
  const maxY = el.scrollHeight - el.clientHeight;
  // A null ratio means the sender's axis is not scrollable, so keep our own
  // position on that axis instead of forcing it to the top/left edge.
  const x = percentX != null && maxX > 0 ? clamp01(Number(percentX)) * maxX : window.scrollX;
  const y = percentY != null && maxY > 0 ? clamp01(Number(percentY)) * maxY : window.scrollY;
  // behavior: 'instant' bypasses the page's CSS `scroll-behavior: smooth`, so the
  // sync completes within the suppression window and cannot animate into a feedback loop.
  window.scrollTo({ left: x, top: y, behavior: 'instant' });
  window.requestAnimationFrame(() => {
    lastX = window.scrollX;
    lastY = window.scrollY;
  });
});
