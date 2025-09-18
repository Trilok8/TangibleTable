import { app, BrowserWindow, BrowserView, ipcMain, screen } from "electron";
import OSC from "osc";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Your tracker sends TUIO to this port
const TUIO_PORT = parseInt(process.env.TUIO_PORT || "3333", 10);

// Track windows (one per display)
const windowsByDisplayId = new Map();
const windowsByIndex     = new Map();

// Track an attached BrowserView per window (to open/close/resize)
const viewByWinId = new Map(); // win.id -> { view: BrowserView, w: number, h: number }

function createWindowOnDisplay(display, index) {
  const preloadPath = join(__dirname, "preload.js"); // ESM preload (sandbox:false)
  const { bounds, id: displayId } = display;

  const win = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    fullscreen: true, autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,              // ESM preload requires sandbox:false
    }
  });

  // First screen -> gradient; others -> tags app
  const fileToLoad = index === 0 ? "gradient.html" : "index.html";
  const url = pathToFileURL(join(__dirname, fileToLoad)).href + `?displayId=${displayId}&idx=${index}`;
  win.loadURL(url);

  // Open devtools only on the gradient window (optional)
  if (index === 0) {
    win.webContents.once("did-finish-load", () => {
      if (!win.webContents.isDevToolsOpened()) {
        win.webContents.openDevTools({ mode: "right" });
      }
    });
  }

  // Recenter BrowserView if present on move/resize/fullscreen changes
  const recenter = () => {
    const rec = viewByWinId.get(win.id);
    if (!rec) return;
    const { width, height } = win.getContentBounds();
    const W = rec.w ?? 1280, H = rec.h ?? 720;
    const x = Math.max(0, Math.floor((width  - W) / 2));
    const y = Math.max(0, Math.floor((height - H) / 2));
    rec.view.setBounds({ x, y, width: W, height: H });
  };
  win.on("resize", recenter);
  win.on("move", recenter);
  win.on("enter-full-screen", recenter);
  win.on("leave-full-screen", recenter);

  // ESC closes BrowserView if any
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.key?.toLowerCase() === "escape") {
      closeSiteView(win);
    }
  });

  windowsByDisplayId.set(displayId, win);
  windowsByIndex.set(index, win);
  win.on("closed", () => {
    // Clean up any view
    closeSiteView(win);
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

/* -------------------- TUIO receiver (single port) -------------------- */
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

/* -------------------- BrowserView helpers -------------------- */
function openSiteView(win, url, W = 1280, H = 720) {
  closeSiteView(win); // ensure only one view

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setBrowserView(view);
  viewByWinId.set(win.id, { view, w: W, h: H });

  // Center inside content bounds
  const { width, height } = win.getContentBounds();
  const x = Math.max(0, Math.floor((width  - W) / 2));
  const y = Math.max(0, Math.floor((height - H) / 2));
  view.setBounds({ x, y, width: W, height: H });
  view.setAutoResize({ width: false, height: false });

  // Load URL
  view.webContents.loadURL(url).catch(() => {
    // In case of navigation error, close it silently
    closeSiteView(win);
  });
}

function closeSiteView(win) {
  const rec = viewByWinId.get(win.id);
  if (!rec) return;
  try {
    win.removeBrowserView(rec.view);
    rec.view.webContents.destroy();
  } catch { /* ignore */ }
  viewByWinId.delete(win.id);
}

/* -------------------- IPC from renderer -------------------- */
ipcMain.handle("open-site-view", async (evt, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  const sender = BrowserWindow.fromWebContents(evt.sender);
  if (!sender || sender.isDestroyed()) return false;
  openSiteView(sender, url, 1280, 720);
  return true;
});

ipcMain.handle("close-site-view", async (evt) => {
  const sender = BrowserWindow.fromWebContents(evt.sender);
  if (!sender || sender.isDestroyed()) return false;
  closeSiteView(sender);
  return true;
});