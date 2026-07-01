const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sideBySide', {
  getState: () => ipcRenderer.invoke('get-state'),
  newTab: (payload) => ipcRenderer.invoke('new-tab', payload),
  selectTab: (tabId) => ipcRenderer.invoke('select-tab', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('close-tab', tabId),
  setOption: (key, value) => ipcRenderer.invoke('set-option', { key, value }),
  navigate: (pane, url) => ipcRenderer.invoke('navigate', { pane, url }),
  go: (pane, action) => ipcRenderer.invoke('go', { pane, action }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onState: (callback) => {
    ipcRenderer.on('state', (_event, state) => callback(state));
  },
  onToast: (callback) => {
    ipcRenderer.on('toast', (_event, message) => callback(message));
  }
});
