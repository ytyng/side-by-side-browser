const { ipcRenderer } = require('electron');

const tabIdArg = process.argv.find((arg) => arg.startsWith('--sbs-tab-id='));
const paneArg = process.argv.find((arg) => arg.startsWith('--sbs-pane='));
const tabId = tabIdArg ? tabIdArg.slice('--sbs-tab-id='.length) : '';
const pane = paneArg ? paneArg.slice('--sbs-pane='.length) : '';

let lastX = 0;
let lastY = 0;
let suppressUntil = 0;
let scheduled = false;

window.addEventListener(
  'scroll',
  () => {
    if (Date.now() < suppressUntil) {
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
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      ipcRenderer.send('pane-scroll', { tabId, pane, dx, dy });
    });
  },
  { passive: true }
);

window.addEventListener('DOMContentLoaded', () => {
  lastX = window.scrollX;
  lastY = window.scrollY;
});

ipcRenderer.on('sync-scroll-by', (_event, { dx, dy }) => {
  suppressUntil = Date.now() + 150;
  window.scrollBy(Number(dx) || 0, Number(dy) || 0);
  window.requestAnimationFrame(() => {
    lastX = window.scrollX;
    lastY = window.scrollY;
  });
});
