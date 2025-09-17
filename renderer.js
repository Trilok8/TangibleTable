const canvas   = document.getElementById("stage");
const ctx      = canvas.getContext("2d");
const countsEl = document.getElementById("counts");

// Toolbar buttons
const btn1 = document.getElementById("btn-site-1");
const btn2 = document.getElementById("btn-site-2");
const btnSwap = document.getElementById("btn-swap");

// Overlay elements (only used when this window is primary)
const overlay = document.getElementById("site-overlay");
const siteFrame = document.getElementById("site-frame");
const siteTitle = document.getElementById("site-title");
const siteClose = document.getElementById("site-close");

// Badge shows whether this window is primary or secondary
const badge = document.getElementById("badge");

// Configure your two site URLs here
const SITE_URL_1 = "https://example.com/";
const SITE_URL_2 = "https://openai.com/";

// Local state
let isPrimaryWindow = false;
let myDisplayId = null;
let currentPrimaryId = null;

function setBadge() {
  badge.textContent = isPrimaryWindow ? "Primary" : "Secondary";
  badge.style.background = isPrimaryWindow ? "#1f3d29" : "#263145";
}

// Button actions: always send to main; main will target primary window only
btn1?.addEventListener("click", async () => {
  try { await window.actions?.openSiteEmbed?.(SITE_URL_1); } catch (e) { console.error(e); }
});
btn2?.addEventListener("click", async () => {
  try { await window.actions?.openSiteEmbed?.(SITE_URL_2); } catch (e) { console.error(e); }
});
btnSwap?.addEventListener("click", async () => {
  try { await window.actions?.swapPrimary?.(); } catch (e) { console.error(e); }
});

// Overlay handlers (only relevant if this is primary)
siteClose?.addEventListener("click", () => {
  overlay.style.display = "none";
  siteFrame.src = "about:blank";
});

// Receive initialization and primary changes from main
window.appState?.onInit?.(({ displayId, primaryDisplayId, isPrimary }) => {
  myDisplayId = displayId;
  currentPrimaryId = primaryDisplayId;
  isPrimaryWindow = !!isPrimary;
  setBadge();
});
window.appState?.onPrimaryChanged?.(({ primaryDisplayId, isPrimary }) => {
  currentPrimaryId = primaryDisplayId;
  isPrimaryWindow = !!isPrimary;
  setBadge();
  // If we lost primary status, hide any open overlay
  if (!isPrimaryWindow && overlay) {
    overlay.style.display = "none";
    if (siteFrame) siteFrame.src = "about:blank";
  }
});

// When main commands to open a site, only primary window will show it
window.uiCommands?.onOpenSite?.(({ url }) => {
  if (!isPrimaryWindow) return; // ignore if we're not primary
  try {
    siteTitle.textContent = url;
    siteFrame.src = url;
    overlay.style.display = "block";
  } catch (e) {
    console.error("Failed to embed site:", e);
  }
});

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  console.log(`Screen size: ${canvas.clientWidth} x ${canvas.clientHeight}`);
}
window.addEventListener("resize", resize);
resize();

// --- TUIO state
const curAlive = new Set();
const objAlive = new Set();
const cursors = new Map(); // sID -> {sid,x,y,dx,dy,m}
const objects = new Map(); // sID -> {sid,id,x,y,angle,rx,ry,ra,m}

// Helpers
const toDeg = (rad) => {
  let d = (rad * 180) / Math.PI;
  d = ((d % 360) + 360) % 360; // normalize to [0,360)
  return d;
};
const fmt = (n) => Math.round(n); // pixels, rounded to integer

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // ----- Draw objects (fiducials)
  objects.forEach((o) => {
    const px = o.x * w;       // pixel X
    const py = (1 - o.y) * h; // pixel Y (flip Y axis)
    const r = Math.min(w, h) * 0.05;
    const pad = 8;

    ctx.save();
    ctx.translate(px, py);

    // Base circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#88c0d0";
    ctx.stroke();

    // Direction tick
    ctx.save();
    ctx.rotate(-o.angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r, 0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#81a1c1";
    ctx.stroke();
    ctx.restore();

    // ID label — top
    ctx.font = "14px system-ui";
    ctx.fillStyle = "#e5e9f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`ID:${o.id}`, 0, -r - 6);

    // Rotation — right
    const rotDeg = toDeg(o.angle).toFixed(1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8dee9";
    ctx.fillText(`rot: ${rotDeg}°`, r + pad, 0);

    // Position — left (in pixels)
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8dee9";
    ctx.fillText(`pos: ${fmt(px)}, ${fmt(py)}`, -r - pad, 0);

    ctx.restore();
  });

  // ----- Draw cursors (touch points)
  cursors.forEach((c) => {
    const px = c.x * w;
    const py = (1 - c.y) * h;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#a3be8c";
    ctx.fill();
  });

  countsEl.textContent = `obj:${objects.size} cur:${cursors.size}`;
  requestAnimationFrame(draw);
}
draw();

// ----- Handle incoming TUIO/OSC
function handleOsc(msg) {
  const path = msg.address;
  const args = (msg.args || []).map(a => a.value);

  if (path === "/tuio/2Dcur") {
    const cmd = args[0];
    if (cmd === "alive") {
      curAlive.clear();
      for (let i = 1; i < args.length; i++) curAlive.add(args[i]);
      for (const sid of [...cursors.keys()]) if (!curAlive.has(sid)) cursors.delete(sid);
    } else if (cmd === "set") {
      // s x y X Y m
      const [_, s, x, y, X, Y, m] = args;
      cursors.set(s, { sid: s, x, y, dx: X, dy: Y, m });
    }
  }

  if (path === "/tuio/2Dobj") {
    const cmd = args[0];
    if (cmd === "alive") {
      objAlive.clear();
      for (let i = 1; i < args.length; i++) objAlive.add(args[i]);
      for (const sid of [...objects.keys()]) if (!objAlive.has(sid)) objects.delete(sid);
    } else if (cmd === "set") {
      // s id x y a X Y A m
      const [_, s, id, x, y, a, X, Y, A, m] = args;
      objects.set(s, { sid: s, id, x, y, angle: a, rx: X, ry: Y, ra: A, m });
    }
  }

  console.debug("TUIO:", path, args);
}

// Safe bridge hook
if (window.tuio && typeof window.tuio.onOsc === "function") {
  window.tuio.onOsc(handleOsc);
  console.info("TUIO bridge ready");
} else {
  console.warn("preload bridge not available (window.tuio undefined)");
}