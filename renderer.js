const canvas   = document.getElementById("stage");
const ctx      = canvas.getContext("2d");
const titleEl  = document.getElementById("titlebar");
const countsEl = document.getElementById("counts");
const lastoscEl= document.getElementById("lastosc");

// Overlay elements
const overlay   = document.getElementById("site-overlay");
const siteFrame = document.getElementById("site-frame");
const siteTitle = document.getElementById("site-title");
const siteClose = document.getElementById("site-close");

// Right-hand list container
const linkList  = document.getElementById("link-list");

// Your links (as provided)
const LINKS = [
  "https://siwar.ksaa.gov.sa/public-dict-information/Riyadh",
  "https://siwar.ksaa.gov.sa/public-dict-information/6a6b2873-4ad1-4a9f-89c7-1f07ccbb476d",
  "https://siwar.ksaa.gov.sa/public-dict-information/73ce2496-7b2a-4bb0-a8c0-84ea5b1bd677",
  "https://siwar.ksaa.gov.sa/public-dict-information/0f0ad290-0fa5-4983-bb56-7144c641cc8c",
  "https://siwar.ksaa.gov.sa/public-dict-information/4cd164a7-7160-4de8-af5c-34382f5da657",
  "https://siwar.ksaa.gov.sa/public-dict-information/2813060b-8eda-4c7b-8b10-1fc3255305cb",
  "https://siwar.ksaa.gov.sa/public-dict-information/2885a7fb-c347-4390-92c9-808c9b9b17c2",
  "https://siwar.ksaa.gov.sa/public-dict-information/4fc63968-9cd8-47d9-a32e-aadc6c6a265b",
  "https://siwar.ksaa.gov.sa/public-dict-information/54a32a50-2b7e-49c2-9aa4-897f58fae786",
  "https://siwar.ksaa.gov.sa/public-dict-information/77843d16-9315-4f87-b891-80a9399fdf54",
  "https://siwar.ksaa.gov.sa/public-dict-information/7806f9cf-4bdb-4c10-b9e5-2705d8945603",
  "https://siwar.ksaa.gov.sa/public-dict-information/84c98c01-6b96-469c-918f-e8d59fffe8ce",
  "https://siwar.ksaa.gov.sa/public-dict-information/928f4f87-b98c-4b2d-b31d-0b45c6747644",
  "https://siwar.ksaa.gov.sa/public-dict-information/94d205e3-6e93-4b6b-a245-1d5304b3ed7d",
  "https://siwar.ksaa.gov.sa/public-dict-information/97ac5360-d65f-425f-974f-9118f09d13a6",
  "https://siwar.ksaa.gov.sa/public-dict-information/a92ca8f8-fe2b-4ab2-8ef5-5bd374c1f082",
  "https://siwar.ksaa.gov.sa/public-dict-information/ae041c6d-79e6-42c3-b54b-ffbf28c88b9a",
  "https://siwar.ksaa.gov.sa/public-dict-information/b09d4471-8198-4a82-b9f9-5fa97b140e2b",
  "https://siwar.ksaa.gov.sa/public-dict-information/b4759d02-40ef-4df5-a818-4081a11c338c",
  "https://siwar.ksaa.gov.sa/public-dict-information/b60a0505-57cb-436a-8a07-75b062de8013",
  "https://siwar.ksaa.gov.sa/public-dict-information/c59be8de-20c3-482b-ab57-ce923dfb4cee",
  "https://siwar.ksaa.gov.sa/public-dict-information/d9af896a-6afb-4859-b35a-0a3b1618dc83",
  "https://siwar.ksaa.gov.sa/public-dict-information/e662ca1b-ed42-4fdb-bbd3-26bbb15df897",
  "https://siwar.ksaa.gov.sa/public-dict-information/e740316b-bc1e-4b62-81a4-c26d787bdeb6",
  "https://siwar.ksaa.gov.sa/public-dict-information/12cbfc6f-b58d-4116-852e-0744ba950b5c",
  "https://siwar.ksaa.gov.sa/public-dict-information/2202f51d-7d70-4472-9fc0-f178fb425463",
  "https://siwar.ksaa.gov.sa/public-dict-information/418913c1-8e46-450d-ab28-7694b51a6047",
  "https://siwar.ksaa.gov.sa/public-dict-information/4e36115e-07b0-4a92-9e04-7ce3fe6a2e96",
  "https://siwar.ksaa.gov.sa/public-dict-information/71c16f98-93e1-4cf1-a401-293b4e0ffe07",
  "https://siwar.ksaa.gov.sa/public-dict-information/89af196b-70be-4a4b-b193-4b761e0b0fdd",
  "https://siwar.ksaa.gov.sa/public-dict-information/9be14020-1138-4651-8d3f-713ee1d0c750",
  "https://siwar.ksaa.gov.sa/public-dict-information/a95a483e-e6b5-4f66-ba12-45b5b54d8f9e",
  "https://siwar.ksaa.gov.sa/public-dict-information/d0328aad-1959-4a9f-9cc8-f23216399c3a",
  "https://siwar.ksaa.gov.sa/public-dict-information/f990c2a0-f601-466f-8153-2cd35e4710a3"
];

// Build the button list
(function buildList() {
  linkList.innerHTML = "";
  LINKS.forEach((url, idx) => {
    const btn = document.createElement("button");
    btn.className = "link-btn";
    // show short label (last path segment) but keep full URL as title
    try {
      const u = new URL(url);
      const segs = u.pathname.split("/").filter(Boolean);
      const label = segs[segs.length - 1] || u.host;
      btn.textContent = `${idx + 1}. ${label}`;
    } catch { btn.textContent = `${idx + 1}. ${url}`; }
    btn.title = url;
    btn.addEventListener("click", () => showOverlay(url));
    linkList.appendChild(btn);
  });
})();

// Overlay behavior (fixed 1280×720)
function showOverlay(url){
  siteTitle.textContent = url;
  overlay.style.display = "block";
  overlay.style.width = "1280px";
  overlay.style.height = "720px";

  // Attempt to load; if blocked, show a minimal fallback
  let loaded = false;
  const watchdog = setTimeout(() => {
    if (!loaded) {
      siteFrame.removeAttribute("src");
      siteFrame.srcdoc = `
        <div class="blocked">
          <div>
            <div style="margin-bottom:8px;">This site refused to load in an iframe.</div>
            <div><a href="${url}" target="_blank" rel="noreferrer noopener">Open in external browser</a></div>
          </div>
        </div>`;
    }
  }, 1500);

  const onLoad = () => { loaded = true; siteFrame.removeEventListener("load", onLoad); clearTimeout(watchdog); };
  siteFrame.addEventListener("load", onLoad, { once:true });

  siteFrame.srcdoc = "";  // clear any previous fallback
  siteFrame.src = url;
}
function closeOverlay(){
  overlay.style.display = "none";
  siteFrame.removeAttribute("src");
  siteFrame.srcdoc = "";
  siteTitle.textContent = "Embedded Site";
}
siteClose?.addEventListener("click", closeOverlay);

// ---------- TUIO drawing (unchanged) ----------
const cursors  = new Map();   // id -> { sid, x, y }
const objects  = new Map();   // sid -> { sid, id, x, y, angle }

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function normToPixels(nx, ny) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  return { px: nx * w, py: (1 - ny) * h };
}

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Objects (tags)
  objects.forEach((o) => {
    const px = o.x * w, py = (1 - o.y) * h;
    const r = Math.min(w, h) * 0.05, pad = 8;

    ctx.save();
    ctx.translate(px, py);

    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = "#88c0d0"; ctx.stroke();

    ctx.save();
    ctx.rotate(-(o.angle || 0));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r, 0);
    ctx.lineWidth = 3; ctx.strokeStyle = "#81a1c1"; ctx.stroke();
    ctx.restore();

    ctx.font = "14px system-ui"; ctx.fillStyle = "#e5e9f0"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(`ID:${o.id ?? o.sid}`, 0, -r - 6);

    const toDeg = (rad) => ((rad * 180) / Math.PI + 360) % 360;
    const rotDeg = toDeg(o.angle || 0).toFixed(1);
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "#d8dee9";
    ctx.fillText(`rot: ${rotDeg}°`, r + pad, 0);

    ctx.textAlign = "right";
    ctx.fillText(`pos: ${Math.round(px)}, ${Math.round(py)}`, -r - pad, 0);

    ctx.restore();
  });

  // Cursors (dots)
  cursors.forEach((c) => {
    const { px, py } = normToPixels(c.x, c.y);
    ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#a3be8c"; ctx.fill();
  });

  countsEl.textContent = `obj:${objects.size} cur:${[...cursors.keys()].length}`;
  requestAnimationFrame(draw);
}
draw();

// TUIO parsing (supports /tuio/2D* and /tuio2/*)
function setLast(addr){ if (lastoscEl) lastoscEl.textContent = `last: ${addr}`; }

function handleTuio1(path, args) {
  if (path === "/tuio/2Dcur") {
    const cmd = args[0];
    if (cmd === "alive") {
      const alive = new Set(args.slice(1).map(String));
      for (const k of [...cursors.keys()]) if (!alive.has(k)) cursors.delete(k);
    } else if (cmd === "set") {
      const sid = String(args[1]); const x = args[2], y = args[3];
      cursors.set(sid, { sid, x, y });
    }
  } else if (path === "/tuio/2Dobj") {
    const cmd = args[0];
    if (cmd === "alive") {
      const alive = new Set(args.slice(1).map(String));
      for (const sid of [...objects.keys()]) if (!alive.has(sid)) objects.delete(sid);
    } else if (cmd === "set") {
      const s = String(args[1]); const id = args[2], x=args[3], y=args[4], a=args[5];
      objects.set(s, { sid:s, id, x, y, angle:a });
    }
  }
}

function handleTuio2(path, args) {
  if (path === "/tuio2/ptr") {
    if (typeof args[0] === "string") {
      const cmd = args[0];
      if (cmd === "alive") {
        const alive = new Set(args.slice(1).map(String));
        for (const k of [...cursors.keys()]) if (!alive.has(k)) cursors.delete(k);
      } else if (cmd === "set") {
        const sid = String(args[1]); const x=Number(args[2]); const y=Number(args[3]);
        if (!Number.isNaN(x) && !Number.isNaN(y)) cursors.set(sid, { sid, x, y });
      }
    }
    return;
  }
  if (path === "/tuio2/obj") {
    if (typeof args[0] === "string") {
      const cmd = args[0];
      if (cmd === "alive") {
        const alive = new Set(args.slice(1).map(String));
        for (const sid of [...objects.keys()]) if (!alive.has(sid)) objects.delete(sid);
      } else if (cmd === "set") {
        const s  = String(args[1]); const id = args[2];
        const x  = Number(args[3]); const y = Number(args[4]); const a = Number(args[5]) || 0;
        if (!Number.isNaN(x) && !Number.isNaN(y)) objects.set(s, { sid:s, id, x, y, angle:a });
      }
    }
    return;
  }
  if (path === "/tuio2/alv") {
    const alive = new Set(args.map(String));
    for (const k of [...cursors.keys()]) if (!alive.has(k)) cursors.delete(k);
  }
}

function handleOsc(msg) {
  const path = msg.address;
  const args = (msg.args || []).map(a => a.value);
  setLast(path);
  if (path.startsWith("/tuio2/")) handleTuio2(path, args);
  else if (path.startsWith("/tuio/")) handleTuio1(path, args);
}

// Hook bridge
if (window.tuio && typeof window.tuio.onOsc === "function") {
  window.tuio.onOsc(handleOsc);
}