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

// Titlebar removed - no longer needed

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
    // transparent background to show video through
    ctx.clearRect(0, 0, w, h);
    // Optional: subtle text overlay
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)"; 
    ctx.font = "14px system-ui";
    // ctx.fillText("Waiting for mirror frames…", 16, 28);
  }

  requestAnimationFrame(drawFrame);
}
drawFrame();

// Ask main to start sending frames (full view, 15 fps)
window.mirror?.start(null, 15);

// Initialize background video to prevent pausing
function initializeBackgroundVideo() {
  const bgVideo = document.getElementById('bg-video');
  if (!bgVideo) return;

  // Set video properties to ensure it plays
  bgVideo.muted = true;
  bgVideo.loop = true;
  bgVideo.autoplay = true;

  // Ensure video plays and doesn't get paused
  const ensureVideoPlaying = () => {
    if (bgVideo.paused) {
      console.log('Gradient video was paused, restarting...');
      bgVideo.play().catch(e => console.log('Gradient video play failed:', e));
    }
  };

  // Check every 2 seconds if video is paused and restart if needed
  setInterval(ensureVideoPlaying, 2000);

  // Restart video on various events that might cause pausing
  bgVideo.addEventListener('pause', () => {
    console.log('Gradient video pause event detected, restarting...');
    setTimeout(() => bgVideo.play().catch(e => console.log('Gradient video restart failed:', e)), 100);
  });

  bgVideo.addEventListener('ended', () => {
    console.log('Gradient video ended, restarting loop...');
    bgVideo.currentTime = 0;
    bgVideo.play().catch(e => console.log('Gradient video loop failed:', e));
  });

  // Force video to start playing immediately
  console.log('Starting gradient background video...');
  bgVideo.play().catch(e => {
    console.log('Initial gradient video play failed, retrying...', e);
    setTimeout(() => {
      bgVideo.play().catch(e2 => console.log('Retry gradient video play failed:', e2));
    }, 1000);
  });
}

// Initialize background video immediately
initializeBackgroundVideo();