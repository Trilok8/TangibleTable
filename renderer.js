const canvas   = document.getElementById("stage");
const ctx      = canvas.getContext("2d");
const countsEl = document.getElementById("counts");

// --- State
const curAlive = new Set();      // for TUIO alive tracking
const objAlive = new Set();
const cursors  = new Map();      // key -> { sid, x, y, dx?, dy?, m? }  (normalized 0..1)
const objects  = new Map();      // objects by session id -> { sid, id, x, y, angle, ... }

// Helpers
const now = () => new Date().toISOString();
const toDeg = (rad) => ((rad * 180) / Math.PI + 360) % 360;
const fmtPx = (n) => Math.round(n);

// Resize
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  console.log(`[${now()}] Screen size: ${canvas.clientWidth} x ${canvas.clientHeight}`);
}
window.addEventListener("resize", resize);
resize();

// --- Utility: normalized (0..1) -> pixels on canvas
function normToPixels(nx, ny) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  return { px: nx * w, py: (1 - ny) * h }; // TUIO origin bottom-left -> canvas top-left
}

// --- Native pointer/touch handlers (tied to canvas)
// These create keys 'p<pointerId>' so they don't conflict with numeric TUIO session ids.
canvas.style.touchAction = "none"; // prevent browser gestures that interfere
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top)  / rect.height;
  const key = `p${e.pointerId}`;
  cursors.set(key, { sid: key, x: nx, y: ny });
  const { px, py } = normToPixels(nx, ny);
  console.log(`[${now()}] NATIVE down  id=${key}  px=${fmtPx(px)},${fmtPx(py)}  norm=${nx.toFixed(3)},${ny.toFixed(3)}`);
});
canvas.addEventListener("pointermove", (e) => {
  const key = `p${e.pointerId}`;
  if (!cursors.has(key)) return;
  const rect = canvas.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top)  / rect.height;
  cursors.set(key, { sid: key, x: nx, y: ny });
  const { px, py } = normToPixels(nx, ny);
  console.log(`[${now()}] NATIVE move  id=${key}  px=${fmtPx(px)},${fmtPx(py)}  norm=${nx.toFixed(3)},${ny.toFixed(3)}`);
});
const endPointer = (e, type = "up") => {
  const key = `p${e.pointerId}`;
  const entry = cursors.get(key);
  if (entry) {
    const { px, py } = normToPixels(entry.x, entry.y);
    console.log(`[${now()}] NATIVE ${type}   id=${key}  px=${fmtPx(px)},${fmtPx(py)}  norm=${entry.x.toFixed(3)},${entry.y.toFixed(3)}`);
  } else {
    // fallback coords from event
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    const { px, py } = normToPixels(nx, ny);
    console.log(`[${now()}] NATIVE ${type}   id=${key}  px=${fmtPx(px)},${fmtPx(py)}  norm=${nx.toFixed(3)},${ny.toFixed(3)}`);
  }
  cursors.delete(key);
};
canvas.addEventListener("pointerup", (e) => endPointer(e, "up"));
canvas.addEventListener("pointercancel", (e) => endPointer(e, "cancel"));
canvas.addEventListener("pointerout", (e) => endPointer(e, "out"));
canvas.addEventListener("pointerleave", (e) => endPointer(e, "leave"));

// --- Draw loop (keeps visual feedback)
function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Draw objects (fiducials)
  objects.forEach((o) => {
    const px = o.x * w;
    const py = (1 - o.y) * h;
    const r = Math.min(w, h) * 0.05;
    ctx.save();
    ctx.translate(px, py);

    // Circle
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

    // ID label (upright at top)
    ctx.font = "14px system-ui";
    ctx.fillStyle = "#e5e9f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`ID:${o.id}`, 0, -r - 6);

    // rotation and pos
    const rotDeg = toDeg(o.angle).toFixed(1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#d8dee9";
    ctx.fillText(`rot: ${rotDeg}°`, r + 8, 0);

    ctx.textAlign = "right";
    ctx.fillText(`pos: ${Math.round(px)}, ${Math.round(py)}`, -r - 8, 0);

    ctx.restore();
  });

  // Draw cursors
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

// --- TUIO handling (logs touch events and manages alive/set lifecycle)
// Keep a local lastAlive to detect ups
let lastTuioAlive = new Set();

function handleOsc(msg) {
  const path = msg.address;
  const args = (msg.args || []).map(a => a.value);

  if (path === "/tuio/2Dcur") {
    const cmd = args[0];
    if (cmd === "alive") {
      // args: ["alive", s1, s2, ...]
      const aliveSet = new Set(args.slice(1));
      // any previously alive that are now gone => UP events
      for (const prev of lastTuioAlive) {
        if (!aliveSet.has(prev)) {
          // emit TUIO UP for prev
          const entry = cursors.get(prev);
          if (entry) {
            const { px, py } = normToPixels(entry.x, entry.y);
            console.log(`[${now()}] TUIO up   id=${prev}  px=${fmtPx(px)},${fmtPx(py)}  norm=${entry.x.toFixed(3)},${entry.y.toFixed(3)}`);
            cursors.delete(prev);
          } else {
            console.log(`[${now()}] TUIO up   id=${prev}  (no last pos)`);
          }
        }
      }
      lastTuioAlive = aliveSet;
    } else if (cmd === "set") {
      // set: ["set", s, x, y, X, Y, m]
      const [_, s, x, y/*, X, Y, m*/] = args;
      // Determine if this is a new touch (not seen in lastAlive) => treat as down, else move
      const isNew = !lastTuioAlive.has(s);
      // store/update normalized position
      cursors.set(s, { sid: s, x, y });
      const { px, py } = normToPixels(x, y);
      if (isNew) {
        console.log(`[${now()}] TUIO down id=${s}  px=${fmtPx(px)},${fmtPx(py)}  norm=${x.toFixed(3)},${y.toFixed(3)}`);
      } else {
        console.log(`[${now()}] TUIO move id=${s}  px=${fmtPx(px)},${fmtPx(py)}  norm=${x.toFixed(3)},${y.toFixed(3)}`);
      }
    }
    return;
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
      // Log object updates (optional)
      const { px, py } = normToPixels(x, y);
      console.log(`[${now()}] TUIO obj  id=${id} sess=${s}  px=${fmtPx(px)},${fmtPx(py)}  angle=${toDeg(a).toFixed(1)}°`);
    }
    return;
  }

  // other OSC messages we ignore
  //console.debug("OSC msg:", msg);
}

// Safe bridge hook for TUIO OSC from preload
if (window.tuio && typeof window.tuio.onOsc === "function") {
  window.tuio.onOsc(handleOsc);
  console.info(`[${now()}] TUIO bridge ready`);
} else {
  console.warn(`[${now()}] preload bridge not available (window.tuio undefined). Native pointer events still work.`);
}