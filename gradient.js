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
    console.log('🔄 Gradient window: Decoding new frame...');
    const blob = dataURLToBlob(url);
    const bmp  = await createImageBitmap(blob);
    if (currentBitmap) currentBitmap.close();
    currentBitmap = bmp;
    console.log('✅ Gradient window: Frame decoded successfully');
  } catch (error) {
    console.log('❌ Gradient window: Frame decode error:', error.message);
  } finally {
    decoding = false;
    if (pendingUrl) decodeNext();
  }
}

// Receive website screenshots from main process
if (window.websiteDisplay?.onLoaded) {
  console.log('✅ Gradient window: Setting up website display listener');
  window.websiteDisplay.onLoaded((dataUrl) => {
    console.log('📡 Gradient window: Received website screenshot');
    pendingUrl = dataUrl;
    if (!decoding) decodeNext();
    
    // Video continues playing in background - no interference
  });
} else {
  console.log('⚠️ Gradient window: websiteDisplay.onLoaded not available');
}

// Clear canvas when website is closed
if (window.websiteDisplay?.onClosed) {
  console.log('✅ Gradient window: Setting up website close listener');
  window.websiteDisplay.onClosed(() => {
    console.log('📡 Gradient window: Website closed, clearing canvas');
    clearCanvas();
  });
} else {
  console.log('⚠️ Gradient window: websiteDisplay.onClosed not available');
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

// Function to clear canvas completely
function clearCanvas() {
  console.log('🧹 Starting to clear canvas...');
  if (currentBitmap) {
    console.log('🧹 Closing current bitmap');
    currentBitmap.close();
    currentBitmap = null;
  } else {
    console.log('🧹 No current bitmap to close');
  }
  pendingUrl = null;
  console.log('🧹 Canvas cleared - background video continues playing');
  
  // Video should always be playing - no need to check here
}

// Video management is now handled independently in initializeBackgroundVideo()

// No need to start mirror loop - we use event-driven system now
console.log('🎬 Gradient window: Ready for event-driven website display');

// Initialize background video - completely independent of canvas
function initializeBackgroundVideo() {
  const bgVideo = document.getElementById('bg-video');
  if (!bgVideo) {
    console.log('⚠️ Background video element not found');
    return;
  }

  console.log('🎬 Initializing independent background video...');

  // Set video properties to ensure it plays continuously
  bgVideo.muted = true;
  bgVideo.loop = true;
  bgVideo.autoplay = true;
  bgVideo.playsInline = true;

  // Simple and robust video management - just keep it playing
  const keepVideoPlaying = () => {
    if (bgVideo.paused) {
      console.log('🔄 Video was paused, restarting...');
      bgVideo.play().catch(e => console.log('❌ Video restart failed:', e));
    }
  };

  // Check every 2 seconds and restart if needed
  setInterval(keepVideoPlaying, 2000);

  // Handle video events
  bgVideo.addEventListener('pause', () => {
    console.log('⏸️ Video paused, restarting...');
    setTimeout(() => bgVideo.play().catch(e => console.log('❌ Restart failed:', e)), 100);
  });

  bgVideo.addEventListener('ended', () => {
    console.log('🔚 Video ended, looping...');
    bgVideo.currentTime = 0;
    bgVideo.play().catch(e => console.log('❌ Loop failed:', e));
  });

  // Start the video
  console.log('🚀 Starting background video...');
  bgVideo.play().catch(e => {
    console.log('❌ Initial play failed, retrying...', e);
    setTimeout(() => bgVideo.play().catch(e2 => console.log('❌ Retry failed:', e2)), 1000);
  });
}

// Initialize background video immediately - it will run independently
initializeBackgroundVideo();

// Video is now completely independent of canvas operations
console.log('✅ Background video initialized independently');