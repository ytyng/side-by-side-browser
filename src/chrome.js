const api = window.sideBySide;

let state = null;

const elements = {
  tabs: document.getElementById('tabs'),
  newTab: document.getElementById('newTab'),
  scrollSync: document.getElementById('scrollSync'),
  pathSync: document.getElementById('pathSync'),
  lockExternal: document.getElementById('lockExternal'),
  leftUrl: document.getElementById('leftUrl'),
  rightUrl: document.getElementById('rightUrl'),
  leftToolbar: document.getElementById('leftToolbar'),
  rightToolbar: document.getElementById('rightToolbar'),
  toasts: document.getElementById('toasts')
};

api.onState((nextState) => {
  state = nextState;
  render();
});

api.onToast((message) => {
  showToast(message);
});

api.getState().then((nextState) => {
  state = nextState;
  render();
});

elements.newTab.addEventListener('click', () => {
  api.newTab();
});

for (const [key, element] of [
  ['scrollSync', elements.scrollSync],
  ['pathSync', elements.pathSync],
  ['lockExternal', elements.lockExternal]
]) {
  element.addEventListener('change', () => {
    api.setOption(key, element.checked);
  });
}

for (const toolbar of [elements.leftToolbar, elements.rightToolbar]) {
  toolbar.addEventListener('submit', (event) => {
    event.preventDefault();
    const pane = toolbar.dataset.pane;
    const input = pane === 'left' ? elements.leftUrl : elements.rightUrl;
    api.navigate(pane, input.value);
  });

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    api.go(toolbar.dataset.pane, button.dataset.action);
  });
}

function render() {
  if (!state) return;
  renderOptions();
  renderTabs();
  renderToolbar('left');
  renderToolbar('right');
}

function renderOptions() {
  elements.scrollSync.checked = state.options.scrollSync;
  elements.pathSync.checked = state.options.pathSync;
  elements.lockExternal.checked = state.options.lockExternal;
}

function renderTabs() {
  elements.tabs.replaceChildren();
  for (const tab of state.tabs) {
    const tabButton = document.createElement('button');
    tabButton.className = tab.id === state.activeTabId ? 'tab active' : 'tab';
    tabButton.type = 'button';
    tabButton.dataset.annotate = `tab-${tab.id}`;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || shortUrl(tab.urls.left);
    tabButton.append(title);

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.type = 'button';
    close.title = 'Close tab';
    close.setAttribute('aria-label', 'Close tab');
    const closeIcon = document.createElement('i');
    closeIcon.className = 'bi bi-x-lg';
    closeIcon.setAttribute('aria-hidden', 'true');
    close.append(closeIcon);
    close.dataset.annotate = `button-close-${tab.id}`;
    close.disabled = state.tabs.length <= 1;
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      api.closeTab(tab.id);
    });
    tabButton.append(close);

    tabButton.addEventListener('click', () => {
      api.selectTab(tab.id);
    });
    elements.tabs.append(tabButton);
  }
}

function renderToolbar(pane) {
  const tab = activeTab();
  if (!tab) return;
  const input = pane === 'left' ? elements.leftUrl : elements.rightUrl;
  if (document.activeElement !== input) input.value = tab.urls[pane] || '';
  const toolbar = pane === 'left' ? elements.leftToolbar : elements.rightToolbar;
  const back = toolbar.querySelector('[data-action="back"]');
  const forward = toolbar.querySelector('[data-action="forward"]');
  // data-action toggles reload<->stop while loading, so match both to stay findable.
  const reload = toolbar.querySelector('[data-action="reload"], [data-action="stop"]');
  back.disabled = !tab.canGoBack[pane];
  forward.disabled = !tab.canGoForward[pane];
  const loading = tab.loading[pane];
  const reloadIcon = reload.querySelector('i');
  if (reloadIcon) {
    reloadIcon.className = loading ? 'bi bi-x-lg' : 'bi bi-arrow-clockwise';
  }
  reload.dataset.action = loading ? 'stop' : 'reload';
  reload.title = loading ? 'Stop' : 'Reload';
  reload.setAttribute('aria-label', loading ? 'Stop' : 'Reload');
}

function activeTab() {
  return state?.tabs.find((tab) => tab.id === state.activeTabId) || null;
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  elements.toasts.append(toast);
  setTimeout(() => {
    toast.remove();
  }, 4200);
}
