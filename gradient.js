const titleEl = document.getElementById("titlebar");
const canvas  = document.getElementById("grad");
const ctx     = canvas.getContext("2d");

// Keep buffer = CSS size (no DPR scaling)
function resize() {
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
window.addEventListener("resize", resize);
resize();

if (window.appState?.onInit) {
  window.appState.onInit(({ titleText }) => { if (titleEl && titleText) titleEl.textContent = titleText; });
}

/* ---------- Mirror pipeline (no fetch, no CSP connect-src needed) ---------- */
let currentBitmap = null;
let pendingUrl = null;
let decoding = false;

// Convert data:image/...;base64,XXXX to a Blob without network
function dataURLToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png';
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function decodeNext() {
  if (!pendingUrl) return;
  decoding = true;
  const url = pendingUrl;
  pendingUrl = null;

  try {
    const blob = dataURLToBlob(url);
    const bmp  = await createImageBitmap(blob);
    if (currentBitmap) currentBitmap.close();
    currentBitmap = bmp;
  } catch {
    // ignore one-off decode issues
  } finally {
    decoding = false;
    if (pendingUrl) decodeNext();
  }
}

// Receive frames from main
if (window.mirror?.onFrame) {
  window.mirror.onFrame((dataUrl) => {
    pendingUrl = dataUrl;
    if (!decoding) decodeNext();
  });
}

// Draw loop
function drawFrame() {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (currentBitmap) {
    const iw = currentBitmap.width, ih = currentBitmap.height;
    const scale = Math.min(w / iw, h / ih);
    const dw = Math.floor(iw * scale), dh = Math.floor(ih * scale);
    const dx = Math.floor((w - dw) / 2), dy = Math.floor((h - dh) / 2);
    try { ctx.drawImage(currentBitmap, dx, dy, dw, dh); } catch {}
  } else {
    // subtle placeholder until first frame arrives
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#555"; ctx.font = "14px system-ui";
    ctx.fillText("Waiting for mirror frames…", 16, 28);
  }

  requestAnimationFrame(drawFrame);
}
drawFrame();

// Ask main to start sending frames (full view, 15 fps)
window.mirror?.start(null, 15);