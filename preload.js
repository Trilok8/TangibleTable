import { contextBridge, ipcRenderer } from "electron";

// Minimal bridges (no log mirroring)
contextBridge.exposeInMainWorld("tuio", {
  onOsc: (cb) => ipcRenderer.on("tuio:osc", (_evt, msg) => cb(msg))
});
contextBridge.exposeInMainWorld("appState", {
  onInit: (cb) => ipcRenderer.on("app:init", (_e, payload) => cb(payload))
});
contextBridge.exposeInMainWorld("actions", {
  openSiteWindow: (url) => ipcRenderer.invoke("open-site-window", url)
});