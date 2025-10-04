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

contextBridge.exposeInMainWorld("websiteDisplay", {
  onLoaded: (cb) => {
    const handler = (_evt, dataUrl) => cb(dataUrl);
    ipcRenderer.on("website:loaded", handler);
    return () => ipcRenderer.removeListener("website:loaded", handler);
  },
  onClosed: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("website:closed", handler);
    return () => ipcRenderer.removeListener("website:closed", handler);
  }
});

contextBridge.exposeInMainWorld("mirror", {
  start: (rect, fps = 15) => ipcRenderer.invoke("mirror:start", { rect, fps }),
  stop:  () => ipcRenderer.invoke("mirror:stop"),
  onFrame: (cb) => {
    const handler = (_evt, dataUrl) => cb(dataUrl);
    ipcRenderer.on("mirror:frame", handler);
    return () => ipcRenderer.removeListener("mirror:frame", handler);
  }
});

/* ---------- User-editable tags.json (in userData/config/tags.json) ---------- */
contextBridge.exposeInMainWorld("config", {
  get:        () => ipcRenderer.invoke("config:get"),
  set:        (obj) => ipcRenderer.invoke("config:set", obj),
  openFolder: () => ipcRenderer.invoke("config:open-folder"),
  path:       () => ipcRenderer.invoke("config:path")
});