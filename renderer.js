// renderer.js
const titleEl = document.getElementById("titlebar");
const countsEl = document.getElementById("counts");
const lastoscEl = document.getElementById("lastosc");
const websiteIframe = document.getElementById("website-iframe");

// ---------------- Config / State ----------------
let tagsConfig = {};
let currentActiveTag = null;

let hudAnimation = null;
let hudAnimationInterval = null;
let currentFrame = 169;
const animationSpeed = 20;
let currentTagPosition = null;

// Keep HUD centered under buttons
const CENTER_HUD = true;

// ---------------- HUD PNG Sequence ----------------
function initializeHUDAnimation() {
  hudAnimation = document.getElementById("hud-animation");
  if (!hudAnimation) { console.error("❌ HUD animation element not found"); return; }
}

function startHUDAnimation(tagX, tagY) {
  if (!hudAnimation || hudAnimationInterval) return;

  currentTagPosition = (typeof tagX === "number" && typeof tagY === "number")
    ? { x: tagX, y: tagY } : null;

  // EDIT: no absolute positioning; it's in .hud-slot below buttons
  hudAnimation.style.display = "block";
  hudAnimation.classList.add("visible");

  hudAnimationInterval = setInterval(() => {
    const frameNumber = currentFrame.toString().padStart(5, "0");
    hudAnimation.src = `assets/tangible/HUD Png/HUD_${frameNumber}.png`;
    currentFrame = (currentFrame >= 299) ? 169 : currentFrame + 1;
  }, animationSpeed);
}

function stopHUDAnimation() {
  if (!hudAnimation || !hudAnimationInterval) return;
  clearInterval(hudAnimationInterval);
  hudAnimationInterval = null;
  hudAnimation.classList.remove("visible");
  setTimeout(() => { hudAnimation.style.display = "none"; }, 300);
}

// ---------------- Load tags.json ----------------
async function loadTagsConfig() {
  try {
    if (window.config?.get) {
      tagsConfig = await window.config.get();
    } else {
      const res = await fetch("./tags.json");
      tagsConfig = await res.json();
    }
  } catch (e) {
    console.error("❌ load tags:", e);
    tagsConfig = {};
  }
}

// ---------------- Dynamic Buttons ----------------
function createDynamicButtons(tagId) {
  const buttonsRoot = document.getElementById("buttons");
  if (!buttonsRoot) return;

  buttonsRoot.innerHTML = "";

  const tagConfig = tagsConfig[tagId];
  if (!tagConfig || !Array.isArray(tagConfig.buttons)) return;

  tagConfig.buttons.forEach((buttonConfig, index) => {
    const btn = document.createElement("button");
    btn.className = "website-btn";
    if (index === 0) btn.classList.add("active");
    btn.textContent = buttonConfig.text || `Link ${index + 1}`;
    btn.dataset.url = buttonConfig.url || "";

    btn.addEventListener("click", () => {
      buttonsRoot.querySelectorAll(".website-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const url = btn.dataset.url;
      if (url) {
        if (currentTagPosition) showWebsiteOverlay(url, currentTagPosition.x, currentTagPosition.y);
        else showWebsiteOverlay(url);
      }
    });

    buttonsRoot.appendChild(btn);
  });
}

// ---------------- TUIO tracking ----------------
const cursors = new Map();
const objects = new Map();

window.appState?.onInit?.(({ titleText }) => {
  const t = titleText || "Display";
  const el = document.getElementById("titlebar");
  if (el) el.textContent = t;
});

function updateHUD() {
  if (!countsEl) return;
  countsEl.textContent = `obj:${objects.size} cur:${cursors.size}`;
}

// ---------------- BrowserView Overlay ----------------
async function showWebsiteOverlay(url, tagX = null, tagY = null) {
  if (tagX !== null && tagY !== null) startHUDAnimation(tagX, tagY);
  else startHUDAnimation();

  const pre = document.getElementById("browserViewLoader");
  if (pre) pre.style.display = "flex";

  try {
    const ok = await window.actions?.openSiteView?.(url);
    if (!ok) console.error("openSiteView=false");
  } catch (e) {
    console.error("openSiteView error:", e);
  } finally {
    setTimeout(() => { if (pre) pre.style.display = "none"; }, 2000);
  }
}

async function hideWebsiteOverlay() {
  stopHUDAnimation();
  const pre = document.getElementById("browserViewLoader");
  if (pre) pre.style.display = "none";
  try { await window.actions?.closeSiteView?.(); } catch { }
}

// ---------------- App Init ----------------
async function initializeApp() {
  await loadTagsConfig();
  initializeHUDAnimation();
}

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
  initializeBackgroundVideo();
});

// ---------------- Background video ----------------
function initializeBackgroundVideo() {
  const v = document.getElementById("bg-video");
  if (!v) return;
  const ensure = () => { if (v.paused) v.play().catch(() => { }); };
  setInterval(ensure, 2000);
  v.addEventListener("pause", () => setTimeout(() => v.play().catch(() => { }), 100));
  v.addEventListener("ended", () => { v.currentTime = 0; v.play().catch(() => { }); });
  v.play().catch(() => { });
}

function setLast(addr) { if (lastoscEl) lastoscEl.textContent = `last: ${addr}`; }

// ---------------- Tag lifecycle ----------------
function logTagDetails(tag) {
  if (tagsConfig[tag.id]) {
    showMainInterface();
    createDynamicButtons(tag.id);
    currentActiveTag = tag.id;
    currentTagPosition = { x: tag.x, y: tag.y };
    const first = tagsConfig[tag.id].buttons?.[0]?.url;
    if (first) showWebsiteOverlay(first, tag.x, tag.y);
  }
}

function showMainInterface() {
  const mc = document.querySelector(".main-container");
  if (mc && !mc.classList.contains("show")) mc.classList.add("show");
  showLogo();
}

function hideMainInterface() {
  const mc = document.querySelector(".main-container");
  if (mc && mc.classList.contains("show")) mc.classList.remove("show");
  currentActiveTag = null; currentTagPosition = null; hideLogo();
}

function hasTag(tagId) { for (const t of objects.values()) if (t.id === tagId) return true; return false; }
function showLogo() { const l = document.getElementById("logo"); if (l && !l.classList.contains("visible")) l.classList.add("visible"); }
function hideLogo() { const l = document.getElementById("logo"); if (l && l.classList.contains("visible")) l.classList.remove("visible"); }

// ---------------- OSC / TUIO ----------------
function handleTuio1(path, args) {
  if (path === "/tuio/2Dcur") {
    const cmd = args[0];
    if (cmd === "set") {
      const sid = String(args[1]); const x = args[2], y = args[3];
      cursors.set(sid, { sid, x, y });
    } else if (cmd === "alive") {
      const alive = new Set(args.slice(1).map(String));
      for (const [sid] of cursors) if (!alive.has(sid)) cursors.delete(sid);
    }
  } else if (path === "/tuio/2Dobj") {
    const cmd = args[0];
    if (cmd === "set") {
      const s = String(args[1]); const id = args[2], x = args[3], y = args[4], a = args[5];
      const tag = { sid: s, id, x, y, angle: a };
      if (!objects.has(s)) logTagDetails(tag);
      objects.set(s, tag);
      updateHUD();
    } else if (cmd === "alive") {
      const alive = new Set(args.slice(1).map(String));
      for (const [sid] of objects) if (!alive.has(sid)) objects.delete(sid);

      if (objects.size === 0) { // hide mirror when all tags removed
        hideMainInterface();
        hideWebsiteOverlay();
      }
      updateHUD();
    }
  }
}

function handleTuio2(path, args) {
  if (path === "/tuio2/ptr") {
    if (typeof args[0] === "string") {
      const cmd = args[0];
      if (cmd === "set") {
        const sid = String(args[1]); const x = Number(args[2]); const y = Number(args[3]);
        if (!Number.isNaN(x) && !Number.isNaN(y)) cursors.set(sid, { sid, x, y });
      } else if (cmd === "alive") {
        const alive = new Set(args.slice(1).map(String));
        for (const [sid] of cursors) if (!alive.has(sid)) cursors.delete(sid);
      }
    }
    return;
  }
  if (path === "/tuio2/obj") {
    if (typeof args[0] === "string") {
      const cmd = args[0];
      if (cmd === "set") {
        const s = String(args[1]); const id = args[2];
        const x = Number(args[3]); const y = Number(args[4]); const a = Number(args[5]) || 0;
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          const tag = { sid: s, id, x, y, angle: a };
          if (!objects.has(s)) logTagDetails(tag);
          objects.set(s, tag);
          updateHUD();
        }
      } else if (cmd === "alive") {
        const alive = new Set(args.slice(1).map(String));
        for (const [sid] of objects) if (!alive.has(sid)) objects.delete(sid);

        if (objects.size === 0) {
          hideMainInterface();
          hideWebsiteOverlay();
        }
        updateHUD();
      }
    }
  }
}

function handleOsc(msg) {
  const path = msg.address;
  const args = (msg.args || []).map(a => a.value);
  setLast(path);
  if (path.startsWith("/tuio2/")) handleTuio2(path, args);
  else if (path.startsWith("/tuio/")) handleTuio1(path, args);
}
if (window.tuio?.onOsc) window.tuio.onOsc(handleOsc);
