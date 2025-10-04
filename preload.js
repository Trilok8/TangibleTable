import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tuio", {
  onOsc: (cb) => ipcRenderer.on("tuio:osc", (_evt, msg) => cb(msg))
});

contextBridge.exposeInMainWorld("appState", {
  onInit: (cb) => ipcRenderer.on("app:init", (_e, payload) => cb(payload))
});

contextBridge.exposeInMainWorld("actions", {
  openSiteView: (url) => ipcRenderer.invoke("open-site-view", url),
  closeSiteView: () => ipcRenderer.invoke("close-site-view")
});

// ---- Mirror API ----
contextBridge.exposeInMainWorld("mirror", {
  start: (rect, fps = 15) => ipcRenderer.invoke("mirror:start", { rect, fps }),
  stop:  () => ipcRenderer.invoke("mirror:stop"),
  onFrame: (cb) => {
    const handler = (_evt, dataUrl) => cb(dataUrl);
    ipcRenderer.on("mirror:frame", handler);
    return () => ipcRenderer.removeListener("mirror:frame", handler);
  }
});