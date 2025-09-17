import { app, BrowserWindow, ipcMain, screen } from "electron";
import OSC from "osc";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import fs from "node:fs";

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Dev check (npm start sets NODE_ENV=development via cross-env)
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Keep one window per display
/** @type {Map<number, BrowserWindow>} */
const windowsByDisplayId = new Map();

// Track which display is the "primary" for our app logic (first screen)
let primaryDisplayId = null;

// Helper: get the current primary BrowserWindow (if any)
function getPrimaryWindow() {
  const w = windowsByDisplayId.get(primaryDisplayId);
  return w && !w.isDestroyed() ? w : null;
}

// Helper: toggle DevTools on the primary window (docked right)
function toggleDevToolsOnPrimary() {
  if (!isDev) return;
  const w = getPrimaryWindow();
  if (!w) return;
  if (w.webContents.isDevToolsOpened()) {
    w.webContents.closeDevTools();
  } else {
    w.webContents.openDevTools({ mode: "right" });
  }
}

// Attach keyboard listeners to a window so Ctrl/⌘+D toggles DevTools on primary
function attachDevtoolsToggleShortcut(win) {
  if (!isDev || !win) return;
  win.webContents.on("before-input-event", (_e, input) => {
    const key = input.key?.toLowerCase();
    const isCtrlOrCmd = input.control || input.meta;

    // Ctrl/⌘ + D -> toggle DevTools on the PRIMARY window
    const isCtrlD = isCtrlOrCmd && !input.shift && !input.alt && key === "d";
    if (isCtrlD) {
      toggleDevToolsOnPrimary();
    }

    // Keep existing handy toggles too (optional)
    const isF12 = key === "f12";
    const isCtrlShiftI = isCtrlOrCmd && input.shift && key === "i";
    if (isF12 || isCtrlShiftI) {
      toggleDevToolsOnPrimary();
    }
  });
}

// Create a window on a specific display
function createWindowOnDisplay(display) {
  const preloadPath = join(__dirname, "preload.js"); // ESM preload
  if (!fs.existsSync(preloadPath)) {
    console.error("[ERROR] Missing preload:", preloadPath);
  } else if (isDev) {
    console.log("[OK] Using preload:", preloadPath);
  }

  const { bounds, id: displayId } = display;

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,  // ESM preload.js
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,        // ⚠ required for ESM preload
      // backgroundThrottling: false, // optional
    },
  });

  // Pass displayId via query for convenience (also send over IPC after load)
  const indexUrl = pathToFileURL(join(__dirname, "index.html")).href + `?displayId=${displayId}`;
  win.loadURL(indexUrl);

  win.webContents.on("did-finish-load", () => {
    // Announce initial role
    const isPrimary = displayId === primaryDisplayId;
    win.webContents.send("app:init", { displayId, primaryDisplayId, isPrimary });

    // Only the primary window should show DevTools by default
    if (isDev && isPrimary && !win.webContents.isDevToolsOpened()) {
      win.webContents.openDevTools({ mode: "right" });
    }
  });

  attachDevtoolsToggleShortcut(win);

  windowsByDisplayId.set(displayId, win);
  win.on("closed", () => windowsByDisplayId.delete(displayId));
  return win;
}

function ensureWindowsForAllDisplays() {
  const displays = screen.getAllDisplays();
  if (primaryDisplayId == null && displays.length > 0) {
    primaryDisplayId = screen.getPrimaryDisplay().id; // default
  }

  const existingIds = new Set(windowsByDisplayId.keys());

  // Create windows for any displays without a window
  for (const d of displays) {
    if (!windowsByDisplayId.has(d.id)) {
      createWindowOnDisplay(d);
    }
    existingIds.delete(d.id);
  }

  // Close windows whose displays are gone
  for (const staleId of existingIds) {
    const w = windowsByDisplayId.get(staleId);
    if (w && !w.isDestroyed()) w.close();
    windowsByDisplayId.delete(staleId);
  }

  // Re-broadcast current primary state
  broadcastPrimaryState();
}

function broadcastPrimaryState() {
  for (const [id, w] of windowsByDisplayId.entries()) {
    if (w && !w.isDestroyed()) {
      w.webContents.send("app:set-primary", {
        primaryDisplayId,
        isPrimary: id === primaryDisplayId
      });
    }
  }
  // Keep DevTools state aligned with the current primary selection
  if (isDev) {
    for (const [id, w] of windowsByDisplayId.entries()) {
      if (!w || w.isDestroyed()) continue;
      const shouldOpen = id === primaryDisplayId;
      const open = w.webContents.isDevToolsOpened();
      if (shouldOpen && !open) w.webContents.openDevTools({ mode: "right" });
      if (!shouldOpen && open) w.webContents.closeDevTools();
    }
  }
}

function focusAnyWindow() {
  for (const w of windowsByDisplayId.values()) {
    if (w && !w.isDestroyed()) {
      w.focus();
      break;
    }
  }
}

// Optional: single-instance guard
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusAnyWindow();
  });
}

app.whenReady().then(() => {
  // Initialize windows for all displays
  ensureWindowsForAllDisplays();

  if (windowsByDisplayId.size === 0) {
    const w = createWindowOnDisplay(screen.getPrimaryDisplay());
    primaryDisplayId = screen.getPrimaryDisplay().id;
    w.webContents.on("did-finish-load", () => broadcastPrimaryState());
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureWindowsForAllDisplays();
    }
  });

  // React to display topology changes
  screen.on("display-added", () => {
    if (isDev) console.log("[display] added");
    ensureWindowsForAllDisplays();
  });
  screen.on("display-removed", () => {
    if (isDev) console.log("[display] removed");
    ensureWindowsForAllDisplays();
    // If primary was removed, reset to OS primary
    if (!windowsByDisplayId.has(primaryDisplayId)) {
      primaryDisplayId = screen.getPrimaryDisplay().id;
      broadcastPrimaryState();
    }
  });
  screen.on("display-metrics-changed", () => {
    if (isDev) console.log("[display] metrics changed");
    ensureWindowsForAllDisplays();
  });

  startTuioReceiver();
});

// IPC: request to embed a site in the PRIMARY window (not a new window)
ipcMain.handle("open-site-embed", async (_evt, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    console.warn("open-site-embed rejected, invalid URL:", url);
    return false;
  }
  const primaryWin = getPrimaryWindow();
  if (primaryWin) {
    primaryWin.webContents.send("ui:open-site", { url });
    primaryWin.focus();
    return true;
  }
  return false;
});

// IPC: swap which display is primary (cycle through displays)
ipcMain.handle("swap-primary", async () => {
  const displays = screen.getAllDisplays().map(d => d.id).sort();
  if (displays.length <= 1) return { primaryDisplayId };
  const idx = displays.indexOf(primaryDisplayId);
  const nextId = displays[(idx + 1) % displays.length];
  primaryDisplayId = nextId;
  broadcastPrimaryState();
  const primaryWin = getPrimaryWindow();
  if (primaryWin) primaryWin.focus();
  return { primaryDisplayId };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ------------------------------
// TUIO Receiver (OSC over UDP)
// ------------------------------
function startTuioReceiver() {
  const udpPort = new OSC.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 3333,     // default TUIO port
    metadata: true
  });

  udpPort.on("ready", () => {
    if (isDev) console.log("TUIO UDP listening on 0.0.0.0:3333");
  });

  udpPort.on("message", (oscMsg) => {
    // Broadcast to all windows so every monitor view updates
    for (const w of windowsByDisplayId.values()) {
      if (w && !w.isDestroyed()) {
        w.webContents.send("tuio:osc", oscMsg);
      }
    }
  });

  udpPort.on("error", (err) => {
    console.error("OSC Error:", err);
  });

  udpPort.open();
}

// ------------------------------
// Renderer → Main log piping
// ------------------------------
ipcMain.on("renderer-log", (_evt, { level, args }) => {
  const prefix = `[Renderer:${level}]`;
  if (console[level]) console[level](prefix, ...args);
  else console.log(prefix, ...args);
});

// ------------------------------
// Global error guards (optional)
// ------------------------------
process.on("uncaughtException", (e) => console.error("Uncaught:", e));
process.on("unhandledRejection", (e) => console.error("Unhandled:", e));