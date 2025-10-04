// main.js (ESM)
import { app, BrowserWindow, BrowserView, ipcMain, screen, shell } from "electron";
import OSC from "osc";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { constants as FS } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TUIO_PORT = parseInt(process.env.TUIO_PORT || "3333", 10);

const windowsByDisplayId = new Map();
const windowsByIndex = new Map();
const viewByWinId = new Map();

// --- Mirror state ---
let mirrorTimer = null;
let mirrorFPS = 15;
let mirrorRect = null;

const CAPTURE_FPS = parseInt(process.env.CAPTURE_FPS || "15", 10);
const captureTimers = new Map();

function stopCapture(win) {
  const t = captureTimers.get(win.id);
  if (t) { clearInterval(t); captureTimers.delete(win.id); }
}

function startCapture(win) {
  stopCapture(win);
  const rec = viewByWinId.get(win.id);
  if (!rec) return;
  const interval = Math.max(1, Math.floor(1000 / CAPTURE_FPS));
  const gradientWin = windowsByIndex.get(0);
  if (!gradientWin || gradientWin.isDestroyed()) return;

  const timer = setInterval(async () => {
    try {
      const img = await rec.view.webContents.capturePage();
      gradientWin.webContents.send("website:loaded", img.toDataURL());
    } catch (e) { /* transient capture errors ok */ }
  }, interval);

  captureTimers.set(win.id, timer);
}

/* -------------------- user-editable tags.json -------------------- */
const CONFIG_NAME = "tags.json";
const defaultConfigInResources = join(process.resourcesPath, "config", "default-tags.json");
const userConfigDir = join(app.getPath("userData"), "config");
const userConfigPath = join(userConfigDir, CONFIG_NAME);

async function ensureUserConfig() {
  try {
    await access(userConfigPath, FS.F_OK);
  } catch {
    await mkdir(userConfigDir, { recursive: true });
    const src = app.isPackaged ? defaultConfigInResources : join(__dirname, "tags.json");
    const buf = await readFile(src, "utf-8");
    await writeFile(userConfigPath, buf, "utf-8");
  }
}

// IPC for renderer
ipcMain.handle("config:get", async () => JSON.parse(await readFile(userConfigPath, "utf-8")));
ipcMain.handle("config:set", async (_e, obj) => {
  await writeFile(userConfigPath, JSON.stringify(obj, null, 2), "utf-8");
  return true;
});
ipcMain.handle("config:open-folder", async () => { shell.showItemInFolder(userConfigPath); });
ipcMain.handle("config:path", async () => userConfigPath);

/* -------------------- windows -------------------- */
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

  win.maximize();

  // index 0 = gradient screen, others = tags app
  const fileToLoad = index === 0 ? "gradient.html" : "index.html";
  win.loadFile(join(__dirname, fileToLoad), {
    query: { displayId: String(displayId), idx: String(index) }
  });

  const recenter = () => {
    const rec = viewByWinId.get(win.id);
    if (!rec) return;
    const { width, height } = win.getContentBounds();
    const browserViewWidth = Math.floor(width * 0.8);
    const browserViewHeight = Math.floor(height * 0.8);
    const x = 0;
    const y = Math.floor((height - browserViewHeight) / 2);
    rec.view.setBounds({ x, y, width: browserViewWidth, height: browserViewHeight });
  };
  win.on("resize", recenter);
  win.on("move", recenter);
  win.on("enter-full-screen", recenter);
  win.on("leave-full-screen", recenter);

  // ESC closes BrowserView
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.key?.toLowerCase() === "escape") closeSiteView(win);
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

// Fix white/black window on some GPUs
app.disableHardwareAcceleration();

// Optional "safe mode": windowed, centered, always on top
const SAFE = process.argv.includes('--safe');

app.whenReady().then(async () => {
  await ensureUserConfig(); // ← ensure writable tags.json exists
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

/* -------------------- TUIO receiver -------------------- */
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
function openSiteView(win, url) {
  console.log(`🔄 Opening site view: ${url}`);
  closeSiteView(win, { silent: true }); // ← don't emit website:closed while replacing

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });
  win.setBrowserView(view);

  const { width, height } = win.getContentBounds();
  const bw = Math.floor(width * 0.8);
  const bh = Math.floor(height * 0.8);
  const x  = 0;
  const y  = Math.floor((height - bh) / 2);

  view.setAutoResize({ width: false, height: false, horizontal: false, vertical: false });
  viewByWinId.set(win.id, { view, w: bw, h: bh });
  view.setBounds({ x, y, width: bw, height: bh });
  view.setAutoResize({ width: false, height: false });

  view.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      view.webContents.insertCSS(`
        body, html { margin:0!important; padding:0!important; height:100%!important; width:100%!important; overflow:auto!important; background:#fff!important; }
        body::-webkit-scrollbar, html::-webkit-scrollbar { width:0!important; height:0!important; background:transparent!important; }
        * { box-sizing:border-box!important; scrollbar-width:none!important; -ms-overflow-style:none!important; }
        *::-webkit-scrollbar { width:0!important; height:0!important; background:transparent!important; }
      `);
      // start continuous capture
      startCapture(win);
    }, 300);
  });

  view.webContents.loadURL(url).catch(() => closeSiteView(win));
}

function closeSiteView(win, opts = {}) {
  const { silent = false } = opts;

  // stop continuous capture (if any)
  stopCapture?.(win);

  // ALWAYS tell gradient to clear, even if no BrowserView is attached
  if (!silent) clearGradientWindow();

  const rec = viewByWinId.get(win.id);
  if (!rec) return;

  try {
    win.removeBrowserView(rec.view);
    rec.view.webContents.destroy();
  } catch {}
  viewByWinId.delete(win.id);
}

/* -------------------- IPC from renderer -------------------- */
ipcMain.handle("open-site-view", async (evt, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  const sender = BrowserWindow.fromWebContents(evt.sender);
  if (!sender || sender.isDestroyed()) return false;
  openSiteView(sender, url);
  return true;
});
ipcMain.handle("close-site-view", async (evt) => {
  const sender = BrowserWindow.fromWebContents(evt.sender);
  if (!sender || sender.isDestroyed()) return false;
  closeSiteView(sender);
  return true;
});

// legacy
ipcMain.handle("mirror:start", async () => true);
ipcMain.handle("mirror:stop", async () => true);

/* -------------------- capture -> gradient -------------------- */
function getGradientWindow() { return windowsByIndex.get(0); }

async function captureAndSendToGradient(srcView) {
  const gradientWin = getGradientWindow();
  if (!gradientWin || gradientWin.isDestroyed()) return;
  try {
    const img = await srcView.webContents.capturePage();
    gradientWin.webContents.send("website:loaded", img.toDataURL());
  } catch (e) {
    console.error("❌ capture/send:", e.message);
  }
}
function clearGradientWindow() {
  const gradientWin = getGradientWindow();
  if (gradientWin && !gradientWin.isDestroyed()) gradientWin.webContents.send("website:closed");
}
