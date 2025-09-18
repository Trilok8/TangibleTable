import { app, BrowserWindow, BrowserView, ipcMain, screen } from "electron";
import OSC from "osc";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const TUIO_PORT = parseInt(process.env.TUIO_PORT || "3333", 10);

const windowsByDisplayId = new Map();
const windowsByIndex     = new Map();
const viewByWinId        = new Map();

// --- Mirror state ---
let mirrorTimer = null;
let mirrorFPS   = 15;
let mirrorRect  = null;

function createWindowOnDisplay(display, index) {
  const preloadPath = join(__dirname, "preload.js");
  const { bounds, id: displayId } = display;

  const win = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    fullscreen: true, autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  // index 0 = gradient screen, others = tags app
  const fileToLoad = index === 0 ? "gradient.html" : "index.html";
  const url = pathToFileURL(join(__dirname, fileToLoad)).href + `?displayId=${displayId}&idx=${index}`;
  win.loadURL(url);

  if (index === 0) {
    win.webContents.once("did-finish-load", () => {
      if (!win.webContents.isDevToolsOpened()) {
        win.webContents.openDevTools({ mode: "right" });
      }
    });
  }

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

  // ESC closes BrowserView
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.key?.toLowerCase() === "escape") {
      closeSiteView(win);
    }
  });

  windowsByDisplayId.set(displayId, win);
  windowsByIndex.set(index, win);
  win.on("closed", () => {
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
  closeSiteView(win); // ensure only one

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

  // IMPORTANT: subscribe to 'did-finish-load' BEFORE navigation to avoid missing it
  view.webContents.once("did-finish-load", () => {
    mirrorRect = null;       // full view
    startMirrorLoop();       // only start after the page is fully ready
  });

  // Navigate
  view.webContents.loadURL(url).catch(() => {
    closeSiteView(win);
  });
}

function closeSiteView(win) {
  stopMirrorLoop();
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

// Mirror control from gradient renderer (optional overrides)
ipcMain.handle("mirror:start", async (_e, { rect, fps }) => {
  mirrorRect = rect || null;
  mirrorFPS  = fps || 15;
  await startMirrorLoop();
  return true;
});
ipcMain.handle("mirror:stop", async () => { stopMirrorLoop(); return true; });

/* -------------------- Mirror loop -------------------- */
function getGradientWindow() { return windowsByIndex.get(0); } // first display is gradient
function getSourceView() {
  // Single active BrowserView stored in viewByWinId
  const candidates = [...viewByWinId.values()];
  return candidates.length ? candidates[0].view : null;
}
async function startMirrorLoop() {
  stopMirrorLoop();
  const dstWin = getGradientWindow();
  const srcView = getSourceView();
  if (!dstWin || dstWin.isDestroyed() || !srcView) return;

  const fps = Math.min(Math.max(mirrorFPS || 15, 1), 30);
  const interval = Math.floor(1000 / fps);

  mirrorTimer = setInterval(async () => {
    try {
      const img = await srcView.webContents.capturePage(mirrorRect || null);
      if (!dstWin.isDestroyed()) dstWin.webContents.send("mirror:frame", img.toDataURL());
    } catch {
      // ignore transient capture errors (during nav/minimize)
    }
  }, interval);
}
function stopMirrorLoop() {
  if (mirrorTimer) { clearInterval(mirrorTimer); mirrorTimer = null; }
}