import { contextBridge, ipcRenderer } from "electron";

// ---- Bridges exposed to the renderer (window.*) ----

// TUIO messages from main → renderer
contextBridge.exposeInMainWorld("tuio", {
  onOsc: (cb) => ipcRenderer.on("tuio:osc", (_evt, msg) => cb(msg))
});

// App/init metadata (display title etc.)
contextBridge.exposeInMainWorld("appState", {
  onInit: (cb) => ipcRenderer.on("app:init", (_e, payload) => cb(payload))
});

// Actions the renderer can invoke in the main process
// (these manipulate a BrowserView that main attaches to the window)
contextBridge.exposeInMainWorld("actions", {
  openSiteView: (url) => ipcRenderer.invoke("open-site-view", url),
  closeSiteView: () => ipcRenderer.invoke("close-site-view")
});