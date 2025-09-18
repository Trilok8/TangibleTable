import { app, BrowserWindow, ipcMain, screen } from "electron";
import OSC from "osc";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const TUIO_PORT = parseInt(process.env.TUIO_PORT || "3333", 10);

const windowsByDisplayId = new Map();
const windowsByIndex = new Map();

function createWindowOnDisplay(display, index) {
  const preloadPath = join(__dirname, "preload.js"); // ESM preload
  const { bounds, id: displayId } = display;

  const win = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    fullscreen: true, autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // required for ESM preload
    }
  });

  // First screen → gradient; others → tags app
  const fileToLoad = index === 0 ? "gradient.html" : "index.html";
  const url = pathToFileURL(join(__dirname, fileToLoad)).href + `?displayId=${displayId}&idx=${index}`;
  win.loadURL(url);

  // DevTools only on the gradient screen for convenience
  if (index === 0) win.webContents.once("did-finish-load", () => {
    if (!win.webContents.isDevToolsOpened()) win.webContents.openDevTools({ mode: "right" });
  });

  windowsByDisplayId.set(displayId, win);
  windowsByIndex.set(index, win);
  win.on("closed", () => {
    windowsByDisplayId.delete(displayId);
    windowsByIndex.delete(index);
  });

  return win;
}

function ensureWindowsForAllDisplays() {
  const displays = screen.getAllDisplays();
  const seen = new Set(windowsByDisplayId.keys());

  for (let i = 0; i < displays.length; i++) {
    const d = displays[i];
    if (!windowsByDisplayId.has(d.id)) createWindowOnDisplay(d, i);
    seen.delete(d.id);
  }
  for (const stale of seen) {
    const w = windowsByDisplayId.get(stale);
    if (w && !w.isDestroyed()) w.close();
    windowsByDisplayId.delete(stale);
    for (const [idx, ww] of windowsByIndex) if (ww === w) windowsByIndex.delete(idx);
  }
}

app.whenReady().then(() => {
  ensureWindowsForAllDisplays();
  if (windowsByDisplayId.size === 0) createWindowOnDisplay(screen.getPrimaryDisplay(), 0);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) ensureWindowsForAllDisplays();
  });
  screen.on("display-added", ensureWindowsForAllDisplays);
  screen.on("display-removed", ensureWindowsForAllDisplays);
  screen.on("display-metrics-changed", ensureWindowsForAllDisplays);

  startTuioReceiver();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// Open a 1280×720 child window centered on the sender’s display (tags screen)
ipcMain.handle("open-site-window", async (evt, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  const sender = BrowserWindow.fromWebContents(evt.sender);
  if (!sender || sender.isDestroyed()) return false;

  // Find the display where the sender lives
  const { x, y, width, height } = screen.getDisplayMatching(sender.getBounds()).bounds;
  const W = 1280, H = 720;
  const win = new BrowserWindow({
    x: Math.max(x, x + Math.floor((width  - W) / 2)),
    y: Math.max(y, y + Math.floor((height - H) / 2)),
    width: W,
    height: H,
    autoHideMenuBar: true,
    resizable: true,
    fullscreenable: false,
    parent: sender, // keep on same workspace
    modal: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await win.loadURL(url);
  return true;
});

// ---- Single-port TUIO receiver (forward raw OSC to all renderers)
function startTuioReceiver() {
  const udpPort = new OSC.UDPPort({
    localAddress: "0.0.0.0",
    localPort: TUIO_PORT,
    metadata: true
  });

  udpPort.on("message", (oscMsg) => {
    for (const w of windowsByDisplayId.values()) {
      if (w && !w.isDestroyed()) w.webContents.send("tuio:osc", oscMsg);
    }
  });

  udpPort.on("error", (err) => console.error("[TUIO] error:", err));
  udpPort.open();
}