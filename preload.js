import { contextBridge, ipcRenderer } from "electron";

// TUIO bridge
contextBridge.exposeInMainWorld("tuio", {
  onOsc: (cb) => ipcRenderer.on("tuio:osc", (_evt, msg) => cb(msg))
});

// App/display state
contextBridge.exposeInMainWorld("appState", {
  onInit: (cb) => ipcRenderer.on("app:init", (_e, payload) => cb(payload)),
  onPrimaryChanged: (cb) => ipcRenderer.on("app:set-primary", (_e, payload) => cb(payload))
});

// UI controls
contextBridge.exposeInMainWorld("actions", {
  openSiteEmbed: (url) => ipcRenderer.invoke("open-site-embed", url),
  swapPrimary: () => ipcRenderer.invoke("swap-primary")
});

// Pipe console.* to main as well
["log", "info", "warn", "error", "debug"].forEach((level) => {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    try { ipcRenderer.send("renderer-log", { level, args }); } catch {}
    original(...args);
  };
});

// Primary window will receive UI commands
contextBridge.exposeInMainWorld("uiCommands", {
  onOpenSite: (cb) => ipcRenderer.on("ui:open-site", (_e, data) => cb(data))
});