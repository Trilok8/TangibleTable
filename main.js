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
  
  // Force the window to maximize and ensure it takes full screen
  win.maximize();

  // index 0 = gradient screen, others = tags app
  const fileToLoad = index === 0 ? "gradient.html" : "index.html";
  const url = pathToFileURL(join(__dirname, fileToLoad)).href + `?displayId=${displayId}&idx=${index}`;
  win.loadURL(url);

  // Developer tools removed for gradient display

  const recenter = () => {
    const rec = viewByWinId.get(win.id);
    if (!rec) return;
    // Recalculate dimensions based on current window content bounds
    const { width, height } = win.getContentBounds();
    const browserViewWidth = Math.floor(width * 0.8); // 80% of screen width
    const browserViewHeight = Math.floor(height * 0.8); // 80% of screen height
    const x = 0; // Start at left edge
    const y = Math.floor((height - browserViewHeight) / 2); // Center vertically
    rec.view.setBounds({ x, y, width: browserViewWidth, height: browserViewHeight });
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
function openSiteView(win, url) {
  closeSiteView(win); // ensure only one

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
  
  // Get window bounds and content bounds
  const contentBounds = win.getContentBounds();
  
  // Use content bounds for BrowserView positioning - 80% width and height on the left
  const { width, height } = contentBounds;
  const browserViewWidth = Math.floor(width * 0.8); // 80% of screen width
  const browserViewHeight = Math.floor(height * 0.8); // 80% of screen height
  
  // Position on the left side
  const x = 0; // Start at left edge
  const y = Math.floor((height - browserViewHeight) / 2); // Center vertically
  
  // Try a different approach - make BrowserView fill entire screen first
  view.setAutoResize({ 
    width: false, 
    height: false, 
    horizontal: false, 
    vertical: false 
  });
  
  
  viewByWinId.set(win.id, { view, w: browserViewWidth, h: browserViewHeight });
  view.setBounds({ x, y, width: browserViewWidth, height: browserViewHeight });
  view.setAutoResize({ width: false, height: false });

  // IMPORTANT: subscribe to 'did-finish-load' BEFORE navigation to avoid missing it
  view.webContents.once("did-finish-load", () => {
    // Wait a bit for the page to fully render, then force dimensions
    setTimeout(() => {
      // Force the website to fill the full BrowserView height with scrolling
      view.webContents.insertCSS(`
        body, html {
          margin: 0 !important;
          padding: 0 !important;
          height: 100% !important;
          width: 100% !important;
          overflow: auto !important;
          background: white !important;
        }
        
        /* Hide scrollbars but keep scrolling functionality */
        body::-webkit-scrollbar, html::-webkit-scrollbar {
          width: 0px !important;
          height: 0px !important;
          background: transparent !important;
        }
        
        body::-webkit-scrollbar-track, html::-webkit-scrollbar-track {
          background: transparent !important;
        }
        
        body::-webkit-scrollbar-thumb, html::-webkit-scrollbar-thumb {
          background: transparent !important;
        }
        
        /* Hide scrollbars for all elements */
        * {
          box-sizing: border-box !important;
          scrollbar-width: none !important; /* Firefox */
          -ms-overflow-style: none !important; /* IE and Edge */
        }
        
        *::-webkit-scrollbar {
          width: 0px !important;
          height: 0px !important;
          background: transparent !important;
        }
        
        /* Force main content containers to allow scrolling */
        .container, .main-content, .content-wrapper, 
        .page-content, .site-content, .main-container,
        .wrapper, .page-wrapper, .site-wrapper {
          min-height: 100% !important;
          overflow: auto !important;
        }
        
        /* Remove any top/bottom margins that might create gaps */
        .header, .navbar, .top-bar {
          margin-top: 0 !important;
        }
        
        .footer, .bottom-bar {
          margin-bottom: 0 !important;
        }
      `);
      
      // Also try to force dimensions via JavaScript
      view.webContents.executeJavaScript(`
        document.body.style.height = '100vh';
        document.body.style.minHeight = '100vh';
        document.body.style.maxHeight = '100vh';
        document.documentElement.style.height = '100vh';
        document.documentElement.style.minHeight = '100vh';
        document.documentElement.style.maxHeight = '100vh';
      `);
    }, 500);
    
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
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return false;
  }
  const sender = BrowserWindow.fromWebContents(evt.sender);
  if (!sender || sender.isDestroyed()) {
    return false;
  }
  openSiteView(sender, url);
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
  if (mirrorTimer) { 
    clearInterval(mirrorTimer); 
    mirrorTimer = null; 
    
    // Refresh gradient window to show background video (only when actually stopping)
    const gradientWin = getGradientWindow();
    if (gradientWin && !gradientWin.isDestroyed()) {
      gradientWin.reload();
    }
  }
}