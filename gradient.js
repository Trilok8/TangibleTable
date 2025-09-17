const titleEl = document.getElementById("titlebar");
const canvas = document.getElementById("grad");
const ctx = canvas.getContext("2d");

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

if (window.appState?.onInit) {
  window.appState.onInit(({ titleText }) => { if (titleEl && titleText) titleEl.textContent = titleText; });
}

let t0 = performance.now();
function draw() {
  const t = (performance.now() - t0) / 1000;
  const w = canvas.clientWidth, h = canvas.clientHeight;

  const hue1 = (t * 20) % 360;
  const hue2 = (hue1 + 120 + 40 * Math.sin(t * .7)) % 360;
  const hue3 = (hue1 + 240 + 60 * Math.cos(t * .9)) % 360;

  const angle = (t * 0.2) % 1;
  const x1 = w * 0.5 + Math.cos(angle * Math.PI * 2) * w * 0.5;
  const y1 = h * 0.5 + Math.sin(angle * Math.PI * 2) * h * 0.5;
  const x2 = w - x1, y2 = h - y1;

  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0.0, `hsl(${hue1}, 75%, 50%)`);
  g.addColorStop(0.5, `hsl(${hue2}, 75%, 45%)`);
  g.addColorStop(1.0, `hsl(${hue3}, 75%, 40%)`);

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  requestAnimationFrame(draw);
}
draw();