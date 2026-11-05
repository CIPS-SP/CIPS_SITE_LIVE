/* quay-work.js — chapter 4 of the St Helier scene: the quay at work (26 Oct 2026, Simon: "the next and maybe last bit of the beat where the fuel trucks and provisions turn up").
   Built new, in the scene's own style: everything is drawn top-down on the plate and placed from real lat/lng. The layout is Simon's own, laid out on the quay board (quay-layout.js: the three parking
   bays, every arrival and leaving route, the hoses and the walks), made smooth and length-measured by quay-paths.js. Plain white road tankers (no livery for now), a white service van, crew in hi-vis,
   a provisions hamper and cases, red fuel hoses and a blue water hose with a moving flow while they run. All of it is a pure function of q (0..1 over this chapter), so scrolling back and forth is exact.
   Kinship's hull is an HTML element above the WebGL canvas, so nothing can be drawn over it: hoses end under the hull's edge and the crew walk on to it and disappear.
   The story, in seconds of 'story time' (the chapter is that long, spread over the scroll): tanker A arrives, two get out, one walks to the yacht and the other stays; hose A goes to the yacht and fuelling starts;
   tanker B arrives (reverses in, back to back with A), its driver joins hose B to tanker A (the daisy chain) while fuelling carries on; the van arrives, its driver takes the provisions to the yacht and returns,
   the van leaves; B's driver takes hose B away and B leaves; fuelling completes, hose A goes away, A leaves. Meanwhile the crew connect fresh water from the pontoon and walk the rubbish up to the bins by the same
   route the van driver took. A checklist card keeps the tally. */
import * as THREE from 'three';
import { LAYOUT as L } from './quay-layout.js';
import { mkPath, joinPaths, subPath, reversePath, nearestD, fromDense, toEN, toLL, bearingEN, angDiff, lerpAng } from './quay-paths.js';

const PXM = 64;   // texture pixels per metre
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v, lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const seg = (a, b, x) => clamp01((x - a) / (b - a));
const easeOut = u => 1 - Math.pow(1 - u, 1.8), easeIn = u => Math.pow(u, 1.8), easeIO = u => u * u * (3 - 2 * u);

// ---- artwork: each draws a plan view, front to the right, on its own canvas ----
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function canvasM(wM, hM, ppm = PXM) { const c = document.createElement('canvas'); c.width = Math.round(wM * ppm); c.height = Math.round(hM * ppm); const g = c.getContext('2d'); g.scale(ppm, ppm); return { c, g }; }

export const TANKER_LEN = 12.5, TANKER_W = 2.55;
function drawTanker() {
  const H = 3.0, { c, g } = canvasM(TANKER_LEN + 0.6, H), cy = H / 2, hw = TANKER_W / 2; g.translate(0.3, 0);
  // soft shadow on the ground
  g.save(); g.shadowColor = 'rgba(0,0,0,.42)'; g.shadowBlur = 0.55 * PXM; g.shadowOffsetY = 0.14 * PXM; g.fillStyle = '#000'; rrect(g, 1.5, cy - hw, TANKER_LEN - 1.8, TANKER_W, 0.5); g.fill(); g.restore();
  // (no rear cabinet: the tank simply ends at the back, Simon 27 Oct)
  let gr;
  // chassis between the cabinet and the cab
  g.fillStyle = '#2f353a'; g.fillRect(1.7, cy - 0.9, 8.6, 1.8);
  // the tank: a cylinder seen from above, light along the top, grey down both flanks
  gr = g.createLinearGradient(0, cy - hw, 0, cy + hw); [[0, '#b7bec4'], [.16, '#e6eaed'], [.42, '#ffffff'], [.62, '#f6f8f9'], [.86, '#d6dce0'], [1, '#a8b0b6']].forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; rrect(g, 1.55, cy - hw, 8.7, TANKER_W, 0.62); g.fill();
  gr = g.createLinearGradient(1.55, 0, 10.25, 0); gr.addColorStop(0, 'rgba(60,70,80,.28)'); gr.addColorStop(.05, 'rgba(60,70,80,0)'); gr.addColorStop(.95, 'rgba(60,70,80,0)'); gr.addColorStop(1, 'rgba(60,70,80,.28)'); g.fillStyle = gr; rrect(g, 1.55, cy - hw, 8.7, TANKER_W, 0.62); g.fill();
  // compartment seams
  for (let k = 1; k <= 3; k++) { const x = 1.55 + k * 2.175; g.fillStyle = 'rgba(70,82,92,.4)'; g.fillRect(x - 0.02, cy - hw + 0.08, 0.05, TANKER_W - 0.16); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + 0.03, cy - hw + 0.08, 0.025, TANKER_W - 0.16); }
  // the walkway along the top, with handrails, and a manway on each compartment
  g.fillStyle = '#aab2b8'; rrect(g, 1.85, cy - 0.3, 8.1, 0.6, 0.06); g.fill();
  g.strokeStyle = 'rgba(60,70,80,.35)'; g.lineWidth = 0.02; for (let x = 1.9; x < 9.95; x += 0.1) { g.beginPath(); g.moveTo(x, cy - 0.27); g.lineTo(x, cy + 0.27); g.stroke(); }
  g.strokeStyle = '#586168'; g.lineWidth = 0.04; for (const dy of [-0.34, 0.34]) { g.beginPath(); g.moveTo(1.85, cy + dy); g.lineTo(9.95, cy + dy); g.stroke(); }
  for (let k = 0; k < 4; k++) { const x = 1.55 + 1.09 + k * 2.175; g.fillStyle = '#7e878e'; g.beginPath(); g.arc(x, cy, 0.3, 0, 7); g.fill(); g.fillStyle = '#c9d0d5'; g.beginPath(); g.arc(x, cy, 0.2, 0, 7); g.fill(); g.strokeStyle = '#5b646b'; g.lineWidth = 0.03; g.beginPath(); g.arc(x, cy, 0.3, 0, 7); g.stroke(); g.fillStyle = '#6b747b'; g.beginPath(); g.arc(x, cy, 0.06, 0, 7); g.fill(); }
  // the cab
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 0.2 * PXM; g.fillStyle = '#000'; rrect(g, 10.3, cy - 1.18, 2.2, 2.36, 0.32); g.fill(); g.restore();
  gr = g.createLinearGradient(0, cy - 1.18, 0, cy + 1.18); gr.addColorStop(0, '#d9dee2'); gr.addColorStop(.35, '#ffffff'); gr.addColorStop(.7, '#f3f5f7'); gr.addColorStop(1, '#c6ccd1'); g.fillStyle = gr; rrect(g, 10.3, cy - 1.18, 2.2, 2.36, 0.32); g.fill();
  g.fillStyle = '#e2e6e9'; rrect(g, 10.55, cy - 0.5, 0.75, 1.0, 0.1); g.fill();                       // roof vent
  g.strokeStyle = 'rgba(80,90,100,.3)'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(11.5, cy - 1.05); g.lineTo(11.5, cy + 1.05); g.stroke();
  gr = g.createLinearGradient(11.8, 0, 12.5, 0); gr.addColorStop(0, '#2a3946'); gr.addColorStop(1, '#0a1218'); g.fillStyle = gr; rrect(g, 11.8, cy - 1.06, 0.68, 2.12, 0.14); g.fill(); g.fillStyle = 'rgba(190,215,235,.28)'; g.beginPath(); g.moveTo(11.95, cy - 0.9); g.lineTo(12.3, cy - 0.9); g.lineTo(12.05, cy - 0.2); g.closePath(); g.fill();   // windscreen: big, dark, with a glint, so the cab end is unmistakable
  g.fillStyle = '#1d262e'; for (const dy of [-1, 1]) rrect(g, 10.9, cy + dy * 1.13 - 0.07, 0.8, 0.14, 0.05), g.fill();   // side windows
  g.fillStyle = '#262c31'; for (const dy of [-1, 1]) rrect(g, 11.7, cy + dy * 1.3 - 0.17, 0.14, 0.34, 0.04), g.fill();   // mirrors
  g.fillStyle = '#d8dde1'; g.fillRect(12.45, cy - 0.9, 0.06, 1.8);                                      // front edge
  return c;
}

export const VAN_LEN = 5.4, VAN_W = 2.05;
function drawVan() {
  const H = 2.7, { c, g } = canvasM(VAN_LEN + 0.5, H), cy = H / 2, hw = VAN_W / 2; g.translate(0.25, 0);
  g.save(); g.shadowColor = 'rgba(0,0,0,.42)'; g.shadowBlur = 0.4 * PXM; g.shadowOffsetY = 0.12 * PXM; g.fillStyle = '#000'; rrect(g, 0, cy - hw, VAN_LEN, VAN_W, 0.3); g.fill(); g.restore();
  const gr = g.createLinearGradient(0, cy - hw, 0, cy + hw); [[0, '#c4cbd0'], [.3, '#f5f7f8'], [.7, '#ffffff'], [1, '#bcc3c8']].forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; rrect(g, 0, cy - hw, VAN_LEN, VAN_W, 0.3); g.fill();
  g.strokeStyle = 'rgba(90,100,110,.35)'; g.lineWidth = 0.03; for (const x of [1.1, 2.2, 3.3]) { g.beginPath(); g.moveTo(x, cy - hw + 0.1); g.lineTo(x, cy + hw - 0.1); g.stroke(); }
  g.fillStyle = '#dfe3e6'; rrect(g, 0.15, cy - 0.7, 0.12, 1.4, 0.04); g.fill();                         // rear doors
  const wg = g.createLinearGradient(4.1, 0, 4.9, 0); wg.addColorStop(0, '#2c3b48'); wg.addColorStop(1, '#10181f'); g.fillStyle = wg; rrect(g, 4.15, cy - 0.88, 0.62, 1.76, 0.14); g.fill();   // windscreen
  g.fillStyle = '#242a2f'; for (const dy of [-1, 1]) rrect(g, 4.0, cy + dy * 1.1 - 0.13, 0.12, 0.26, 0.04), g.fill();
  return c;
}

function drawPerson(hat, vest = '#f4ff1f', bands = true) {   // a person from above, facing right: shoulders, arms, a hat, with a dark outline so they read against grass and decking. About 0.9 m by 0.6 m (drawn larger than life); at twice the usual texture detail so it stays crisp
  const K = 128, { c, g } = canvasM(1.1, 0.9, K); g.translate(0.55, 0.45); const ink = '#141b21';
  g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 0.12 * K; g.shadowOffsetY = 0.05 * K; g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, 0, 0.27, 0.42, 0, 0, 7); g.fill(); g.restore();
  g.fillStyle = '#1e2832'; g.strokeStyle = ink; g.lineWidth = 0.035; for (const dy of [-1, 1]) { g.beginPath(); g.ellipse(0.06, dy * 0.34, 0.22, 0.1, dy * -0.2, 0, 7); g.fill(); g.stroke(); }   // arms
  g.fillStyle = vest; g.beginPath(); g.ellipse(0, 0, 0.25, 0.4, 0, 0, 7); g.fill(); g.lineWidth = 0.05; g.stroke();   // vest or shirt
  if (bands) { g.fillStyle = 'rgba(235,238,240,.95)'; g.fillRect(-0.13, -0.37, 0.07, 0.74); g.fillRect(0.06, -0.37, 0.07, 0.74); }   // reflective bands
  g.fillStyle = hat; g.beginPath(); g.arc(0.06, 0, 0.19, 0, 7); g.fill(); g.lineWidth = 0.045; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(0.01, -0.06, 0.07, 0, 7); g.fill();
  return c;
}

function drawCrate(col) {   // a produce crate from above, about 0.6 m by 0.4 m
  const { c, g } = canvasM(0.7, 0.5); g.translate(0.05, 0.05);
  g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 0.1 * PXM; g.fillStyle = '#000'; g.fillRect(0, 0, 0.6, 0.4); g.restore();
  g.fillStyle = '#b98a52'; g.fillRect(0, 0, 0.6, 0.4); g.strokeStyle = 'rgba(70,45,20,.7)'; g.lineWidth = 0.02; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 0.1); g.lineTo(0.6, i * 0.1); g.stroke(); }
  g.fillStyle = col; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(0.08 + (i % 5) * 0.11, 0.09 + Math.floor(i / 5) * 0.11, 0.045, 0, 7); g.fill(); }
  return c;
}

function drawHamper() {   // a wicker provisions hamper from above (placeholder art until the CIPS hamper photograph is cut out): woven lid, leather straps, a red ribbon, a cream tag
  const { c, g } = canvasM(1.0, 0.7); g.translate(0.07, 0.07); const W = 0.86, H = 0.56;
  g.save(); g.shadowColor = 'rgba(0,0,0,.42)'; g.shadowBlur = 0.12 * PXM; g.shadowOffsetY = 0.04 * PXM; g.fillStyle = '#000'; rrect(g, 0, 0, W, H, 0.07); g.fill(); g.restore();
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#d2a463'); gr.addColorStop(.5, '#c4934f'); gr.addColorStop(1, '#a87a40'); g.fillStyle = gr; rrect(g, 0, 0, W, H, 0.07); g.fill();
  g.strokeStyle = 'rgba(88,56,20,.55)'; g.lineWidth = 0.014; for (let x = 0.05; x < W; x += 0.055) { g.beginPath(); g.moveTo(x, 0.02); g.lineTo(x + 0.02, H - 0.02); g.stroke(); } for (let y = 0.05; y < H; y += 0.055) { g.beginPath(); g.moveTo(0.02, y); g.lineTo(W - 0.02, y + 0.012); g.stroke(); }
  g.fillStyle = '#6b4423'; for (const x of [0.2, W - 0.26]) g.fillRect(x, 0, 0.06, H);   // straps
  g.fillStyle = '#b5232a'; g.fillRect(W / 2 - 0.035, 0, 0.07, H); g.fillRect(0, H / 2 - 0.035, W, 0.07);   // ribbon
  g.beginPath(); g.arc(W / 2, H / 2, 0.08, 0, 7); g.fill(); g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(W / 2, H / 2, 0.05, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,240,200,.28)'; rrect(g, 0.04, 0.03, W - 0.08, 0.12, 0.05); g.fill();
  return c;
}

function drawBag() {   // a black refuse sack from above, about 0.6 m
  const { c, g } = canvasM(0.8, 0.8); g.translate(0.4, 0.4);
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 0.1 * PXM; g.shadowOffsetY = 0.04 * PXM; g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, 0, 0.3, 0.26, 0.4, 0, 7); g.fill(); g.restore();
  const gr = g.createRadialGradient(-0.07, -0.08, 0.03, 0, 0, 0.34); gr.addColorStop(0, '#5a6168'); gr.addColorStop(.6, '#23282d'); gr.addColorStop(1, '#101316'); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 0.3, 0.26, 0.4, 0, 7); g.fill();
  g.strokeStyle = 'rgba(160,170,180,.35)'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(-0.15, 0.03); g.quadraticCurveTo(0, -0.1, 0.16, 0.0); g.stroke();
  g.fillStyle = '#0c0e10'; g.beginPath(); g.arc(0.03, 0.01, 0.045, 0, 7); g.fill();
  return c;
}

function drawBins() {   // two wheeled bins by the quay, seen from above (lids, hinges, handles)
  const { c, g } = canvasM(1.9, 1.3); g.translate(0.15, 0.2);
  for (const [x, col, hi] of [[0, '#2f6f4f', '#3f8c66'], [0.85, '#3a4148', '#59616a']]) {
    g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 0.16 * PXM; g.shadowOffsetY = 0.06 * PXM; g.fillStyle = '#000'; rrect(g, x, 0, 0.74, 0.9, 0.07); g.fill(); g.restore();
    const gr = g.createLinearGradient(x, 0, x + 0.74, 0.9); gr.addColorStop(0, hi); gr.addColorStop(1, col); g.fillStyle = gr; rrect(g, x, 0, 0.74, 0.9, 0.07); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.025; rrect(g, x + 0.05, 0.05, 0.64, 0.8, 0.05); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + 0.1, 0.04, 0.54, 0.05); g.fillStyle = 'rgba(255,255,255,.22)'; rrect(g, x + 0.14, 0.62, 0.46, 0.1, 0.04); g.fill();
  }
  return c;
}

function drawPedestal() {   // a marina service pedestal from above: grey post, blue water cap, a coiled hose
  const { c, g } = canvasM(1.1, 1.1); g.translate(0.55, 0.55);
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 0.12 * PXM; g.shadowOffsetY = 0.05 * PXM; g.fillStyle = '#000'; rrect(g, -0.22, -0.22, 0.44, 0.44, 0.06); g.fill(); g.restore();
  g.fillStyle = '#8b949b'; rrect(g, -0.22, -0.22, 0.44, 0.44, 0.06); g.fill(); g.fillStyle = '#c5ccd1'; rrect(g, -0.17, -0.17, 0.34, 0.34, 0.05); g.fill();
  g.fillStyle = '#2c74d8'; g.beginPath(); g.arc(0, 0, 0.11, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(-0.03, -0.03, 0.04, 0, 7); g.fill();
  g.strokeStyle = '#2c74d8'; g.lineWidth = 0.05; g.beginPath(); g.arc(0.34, 0.2, 0.14, 0, 7); g.stroke(); g.beginPath(); g.arc(0.34, 0.2, 0.07, 0, 7); g.stroke();
  return c;
}

function drawCoupling() {   // a brass hose coupling, from above
  const { c, g } = canvasM(0.7, 0.7); g.translate(0.35, 0.35);
  g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 0.08 * PXM; g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, 0.2, 0, 7); g.fill(); g.restore();
  const gr = g.createRadialGradient(-0.05, -0.05, 0.02, 0, 0, 0.22); gr.addColorStop(0, '#f7e08a'); gr.addColorStop(.6, '#c79a2e'); gr.addColorStop(1, '#7c5a14'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 0.2, 0, 7); g.fill();
  g.fillStyle = '#3d2c0a'; g.beginPath(); g.arc(0, 0, 0.07, 0, 7); g.fill();
  return c;
}

function drawCoil() {   // the washdown hose lying in a loose, messy heap on the pontoon, from above: a handful of overlapping, uneven loops thrown down any which way, with a bit of slack at the end (about 1.8 m across)
  const S = 2.1, { c, g } = canvasM(S, S); g.translate(S / 2, S / 2);
  const loops = [   // centre x, y, radii a, b, turn, start angle, end angle (not always a full circle, so the loops read as one hose crossing itself)
    [-0.18, 0.10, 0.62, 0.50, 0.4, 0.2, 6.6], [0.16, -0.14, 0.55, 0.66, 1.9, 0.9, 7.1], [0.05, 0.22, 0.70, 0.44, 2.7, 0.0, 6.3], [-0.12, -0.20, 0.46, 0.58, 0.9, 1.6, 7.4],
    [0.22, 0.12, 0.40, 0.34, 3.5, 0.4, 6.9], [-0.02, -0.02, 0.30, 0.38, 5.0, 2.2, 8.0],
  ];
  loops.forEach(([x, y, a, b, rot, a0, a1], n) => {
    const turn = (w, col, dx = 0, dy = 0, t0 = a0, t1 = a1) => { g.lineCap = 'round'; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.ellipse(x + dx, y + dy, a, b, rot, t0, t1); g.stroke(); };
    g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 0.09 * PXM; g.shadowOffsetY = 0.04 * PXM; turn(0.2, '#2b3a33'); g.restore();   // each loop throws a soft shadow on the ones below
    turn(0.2, '#2b3a33'); turn(0.14, '#8fae9c'); turn(0.04, '#d3e6da', -0.015, -0.015, a0 + 2.6, a0 + 4.6);
  });
  return c;
}

function drawBridgeTex() {   // one tile of the brow, from above: aluminium treads, a lighter handrail line down each side, a post at the tile's joint. Along the tile is x (2.4 m), across is y (1.7 m)
  const LEN = 2.4, W = 1.7, { c, g } = canvasM(LEN, W);
  g.fillStyle = '#aeb6bc'; g.fillRect(0, 0, LEN, W);
  g.fillStyle = '#939ca3'; for (let x = 0.03; x < LEN; x += 0.12) g.fillRect(x, 0.2, 0.05, W - 0.4);   // treads
  g.fillStyle = 'rgba(255,255,255,.18)'; for (let x = 0.08; x < LEN; x += 0.12) g.fillRect(x, 0.2, 0.015, W - 0.4);
  for (const y0 of [0, W - 0.17]) { g.fillStyle = '#e4e9ec'; g.fillRect(0, y0, LEN, 0.17); g.fillStyle = 'rgba(60,70,80,.55)'; g.fillRect(0, y0 + (y0 ? 0 : 0.15), LEN, 0.02); g.fillStyle = '#6b757c'; g.fillRect(0, y0 + 0.075, LEN, 0.03); }   // rail
  g.fillStyle = '#58626a'; for (const y of [0.085, W - 0.085]) { g.beginPath(); g.arc(0.06, y, 0.07, 0, 7); g.fill(); g.beginPath(); g.arc(LEN / 2, y, 0.07, 0, 7); g.fill(); }   // posts
  g.strokeStyle = 'rgba(40,50,58,.5)'; g.lineWidth = 0.025; g.strokeRect(0, 0, LEN, W);
  return c;
}

function drawSpray() {   // a washdown jet from above, nozzle at the left, fanning out to the right: a pale cone, streaks and droplets (4.4 m long)
  const L = 4.4, Hh = 2.6, { c, g } = canvasM(L, Hh, 96); const cy = Hh / 2;
  const cone = g.createLinearGradient(0, 0, L, 0); cone.addColorStop(0, 'rgba(255,255,255,.9)'); cone.addColorStop(.6, 'rgba(235,248,255,.5)'); cone.addColorStop(1, 'rgba(235,248,255,.22)');
  g.fillStyle = cone; g.beginPath(); g.moveTo(0, cy - 0.03); g.lineTo(L, cy - 1.05); g.lineTo(L, cy + 1.05); g.lineTo(0, cy + 0.03); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.035; for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(0.1, cy + k * 0.012); g.lineTo(L * (0.7 + 0.03 * ((k + 4) % 3)), cy + k * 0.2); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.9)'; for (let n = 0; n < 70; n++) { const t = 0.25 + 0.75 * ((n * 0.6180339) % 1), x = t * L, y = cy + (((n * 0.7548776) % 1) - 0.5) * 2 * 1.0 * t; g.beginPath(); g.arc(x, y, 0.025 + 0.03 * ((n * 0.3) % 1), 0, 7); g.fill(); }
  return c;
}
function drawSplash() {   // foam and spray where the jet hits the hull, from above (2.4 m)
  const { c, g } = canvasM(2.4, 2.4, 96); g.translate(1.2, 1.2);
  const gr = g.createRadialGradient(0, 0, 0.05, 0, 0, 1.15); gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(.55, 'rgba(240,250,255,.4)'); gr.addColorStop(1, 'rgba(240,250,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1.15, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)'; for (let n = 0; n < 34; n++) { const a = n * 2.399, r = 0.15 + 0.95 * ((n * 0.618) % 1); g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.03 + 0.04 * ((n * 0.37) % 1), 0, 7); g.fill(); }
  return c;
}

// hose textures (27 Oct 2026, Simon: not the flat red ribbon with white dashes): a round rubber hose seen from above, lit along the top, darker down the sides, with fine rings; a soft shadow under it; and flow shown as a gentle pulse of light travelling along it
const HOSE_STYLE = +(new URLSearchParams(location.search).get('hose')) || 0;   // review aid: ?hose=1 smooth rubber, 2 the same thinner, 3 corrugated suction hose (0 = the chosen default)
const HW = HOSE_STYLE === 3 ? { fuel: 0.36, water: 0.28 } : HOSE_STYLE === 2 ? { fuel: 0.22, water: 0.17 } : { fuel: 0.31, water: 0.24 };   // (default: smooth rubber, Simon's pick, a little thinner than the first version, 27 Oct)   // hose widths in metres (drawn thicker than real so they read at this scale)
function hoseTexture(edge, body, hi, ring) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 48); gr.addColorStop(0, edge); gr.addColorStop(.2, body); gr.addColorStop(.42, hi); gr.addColorStop(.58, body); gr.addColorStop(.86, body); gr.addColorStop(1, edge); g.fillStyle = gr; g.fillRect(0, 0, 64, 48);
  if (HOSE_STYLE === 3) { const rb = g.createLinearGradient(0, 0, 64, 0); rb.addColorStop(0, 'rgba(0,0,0,.55)'); rb.addColorStop(.35, 'rgba(0,0,0,.05)'); rb.addColorStop(.55, 'rgba(255,255,255,.22)'); rb.addColorStop(.75, 'rgba(0,0,0,.05)'); rb.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = rb; g.fillRect(0, 0, 64, 48); }   // corrugated: a rib profile every tile
  else { g.fillStyle = ring; g.fillRect(0, 0, 4, 48); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(4, 0, 3, 48); }   // a ring (rib) every tile
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function pulseTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  const h = g.createLinearGradient(0, 0, 128, 0); h.addColorStop(0, 'rgba(255,245,240,0)'); h.addColorStop(.5, 'rgba(255,245,240,.62)'); h.addColorStop(1, 'rgba(255,245,240,0)'); g.fillStyle = h; g.fillRect(0, 0, 128, 32);
  g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, 32); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, 128, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 32; const g = c.getContext('2d'); const v = g.createLinearGradient(0, 0, 0, 32); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(.5, 'rgba(0,0,0,.5)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, 4, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- Simon's layout, as smooth measured paths ----
const bayHdg = b => b.hdg;                                                       // the way the bay's rectangle points on the board (degrees true)
const A_HDG = (L.bayA.hdg + 180) % 360, B_HDG = L.bayB.hdg, V_HDG = L.bayV.hdg;   // tanker A faces south (opposite to Kinship), B faces north, back to back; the van drives in, loops and reverses into its bay, so it parks facing the way its bay points
// the long brow: Simon's 'gang' line, a bridge running north-south over the gap between the pontoon and the wall; anyone walking near it is put exactly on it
const GANG = mkPath(L.gang, { smooth: false }), gA = toEN(L.gang[0]), gB = toEN(L.gang[1]);
const nearBridge = ll => { const p = toEN(ll), dx = gB[0] - gA[0], dy = gB[1] - gA[1], t = Math.max(0, Math.min(1, ((p[0] - gA[0]) * dx + (p[1] - gA[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - (gA[0] + dx * t), p[1] - (gA[1] + dy * t)) < 2.6; };
// a walk that crosses the brow end to end (north to south, or the other way): the bridge part is laid exactly down the middle of the brow, with the rounded approach and departure either side
function viaBridge(lls, southToNorth = false) {
  const near = lls.map(nearBridge), i = near.indexOf(true), j = near.lastIndexOf(true), N = toLL(gA), S = toLL(gB), first = southToNorth ? S : N, last = southToNorth ? N : S;
  return joinPaths([mkPath([...lls.slice(0, i), first]), mkPath([first, last], { smooth: false }), mkPath([last, ...lls.slice(j + 1)])]);
}
const gangAt = m => toLL(GANG.pos(GANG.len - m));   // a point on the bridge, m metres from its south end
const P = {
  inA: mkPath([...L.inA, L.bayA.c]),
  inBfwd: mkPath(L.inB.slice(0, 15)),                                           // forward to point 15 ...
  inBrev: mkPath([L.inB[14], ...L.inB.slice(15), L.bayB.c]),                    // ... then back along the rest into the bay
  inVfwd: mkPath(L.inV.slice(0, 17)),                                            // the van drives forward to the turn (point 17 of its route) ...
  inVrev: mkPath([L.inV[16], ...L.inV.slice(17), L.bayV.c]),                     // ... and reverses back into the bay
  outA: mkPath([L.bayA.c, ...L.outA]),                                            // tanker A drives on south, loops round and goes out north
  outB: mkPath([L.bayB.c, ...L.outB]),
  outV: mkPath([L.bayV.c, ...L.outV]),
  hoseA: mkPath(L.hoseA), hoseB: mkPath(L.hoseB),
  walkA: viaBridge(L.walkA), walkB: mkPath(L.walkB), walkP: viaBridge(L.walkP), hoseW: mkPath(L.hoseW),
};
// vehicles are brought on at the edge of the view: the routes run in from far off the top, and no story time is spent there (NLIM metres north of the wall's kink)
const NLIM = 205;
const trimIn = p => { let i = 0; while (i < p.pts.length - 1 && p.pts[i][1] > NLIM) i++; return subPath(p, p.cum[i], p.len); };
const trimOut = p => { let i = p.pts.length - 1; for (let k = 0; k < p.pts.length; k++) if (p.pts[k][1] > NLIM) { i = k; break; } return subPath(p, 0, p.cum[i]); };
for (const k of ['inA', 'inBfwd', 'inVfwd']) P[k] = trimIn(P[k]);
for (const k of ['outA', 'outB', 'outV']) P[k] = trimOut(P[k]);
const SLOW = 0.5;   // 31 Oct 2026 (later), Simon: "the people and vehicles are still moving way too fast, slow them right down": every speed below is halved. (The scroll track is resized to match, quayTail: slowing things down at the same scroll length would change nothing you can see.)
const VIN = 2.1 * SLOW, VREV = 0.6 * SLOW, VOUT = 1.9 * SLOW, VIN_VAN = VIN * 2 / 3;   // 31 Oct 2026, Simon: the provisions van drives in a third slower than the tankers (VIN_VAN); its reversing into the bay (VREV) is unchanged   // vehicle speeds, m per story second (arriving, reversing, leaving): half of the first version's, 27 Oct
const PEOPLE = 2 / 3, HOSE_RUN = 0.7 * PEOPLE * SLOW;   // 31 Oct 2026, Simon: every person except the garbage men a third (33%) slower than on 29 Oct: the walkers below, the hose run out from the reel (HOSE_RUN) and the washdown sweep (VS). The scroll track was lengthened to match (quayTail) so the vehicles keep their pace on the scroll.
const WALK = { A1: 0.9 * PEOPLE * SLOW, B1: 0.8 * PEOPLE * SLOW, P1: 0.9 * PEOPLE * SLOW, W1: 1.0 * PEOPLE * SLOW, G1: 1.3 * SLOW };   // walking speeds in metres per story second. 29 Oct 2026, Simon: the people moved far too fast next to the vehicles (the garbage man at 3.0 was faster than the vehicles arrive at, 2.1; the rest 1.0 to 1.7): now all well under half the vehicles' speed, the garbage runs the brisker ones. (The hoses are run out at 0.7, the washdown sweep at VS 0.6.)

// tanker A's far-side crewman (A1): walks to the brow where the hose will cross, waits there while it is run out overhead, steps off to the pontoon to meet it, and feeds it along to the yacht
const D_BROW = nearestD(P.walkA, L.hoseA[3]), D_PT4 = nearestD(P.hoseA, L.hoseA[4]), D_BSOUTH = nearestD(P.walkA, toLL(gB));
const seaward = (m, off) => { const dx = gB[0] - gA[0], dy = gB[1] - gA[1], l = Math.hypot(dx, dy), p = GANG.pos(GANG.len - m); return toLL([p[0] - dy / l * off, p[1] + dx / l * off]); };   // m metres from the brow's south end, off metres seaward of the brow line (the hull's edge is about 6 m seaward)
const onPontoon = m => { const dx = gB[0] - gA[0], dy = gB[1] - gA[1], l = Math.hypot(dx, dy), p = GANG.pos(GANG.len - m); return toLL([p[0] - dy / l * 3.0, p[1] + dx / l * 3.0]); };   // m metres from the brow's south end, 3 m seaward of it: the pontoon's middle
const A1 = (() => {   // walks to the brow where the hose will cross and waits there; when it has gone over he finishes the brow to its south end, steps onto the pontoon, walks back along it to the hose end, and feeds it to the yacht
  const toBrow = subPath(P.walkA, 0, D_BROW), brow2 = subPath(P.walkA, D_BROW, D_BSOUTH), onPon = mkPath([toLL(gB), onPontoon(0.5), onPontoon(8), L.hoseA[4]]), tail = subPath(P.hoseA, D_PT4, P.hoseA.len - 1.5);
  return { path: joinPaths([toBrow, brow2, onPon, tail]), dBrow: toBrow.len, stepLen: brow2.len + onPon.len, tailLen: tail.len, dPt4: D_PT4 };
})();
// the water crew: from the yacht's stern along the pontoon to the pedestal, with the hose end back to the yacht, then to the stern again
const BIN_LL = [49.1805567, -2.1130187], BIN_APP = [49.1805228, -2.1130057], PED_LL = L.hoseW[0];   // the bins by the head of the quay (s 173.8, 14.2 m in), the pedestal where the water hose starts
const W = (() => {
  const toPed = mkPath([toLL(P.hoseW.pos(P.hoseW.len)), seaward(10.5, 4.6), seaward(17, 3.0), PED_LL]), hose = subPath(P.hoseW, 0, P.hoseW.len - 1.5), back = mkPath([toLL(P.hoseW.pos(P.hoseW.len - 1.5)), toLL(P.hoseW.pos(P.hoseW.len))]);   // (1.5 m: he steps aboard where the hose goes in, and the hull covers him)
  return { toPed, hose, back, path: joinPaths([toPed, hose, back]) };
})();
const crewWalkG = joinPaths([mkPath([...[...L.walkP].reverse().slice(0, 4), toLL(gB)]), mkPath([toLL(gB), toLL(gA)], { smooth: false }), mkPath([toLL(gA), BIN_APP, BIN_LL])]);   // a garbage run: the yacht's stern, the whole length of the brow (dead centre), to the bins
// the washdown (28 Oct 2026): a second pedestal on the pontoon further north, abeam the yacht's forward half. One crew member comes out over the hull's edge carrying the hose in a loose coil, sets it down by the pedestal,
// connects, and sweeps the hull's pontoon side south with the hose paying out of the coil; coming back north the slack trails and loops behind him; at the end he coils it all up, disconnects, picks the coil up and goes aboard
const G_BROW = [nearestD(crewWalkG, toLL(gB)), nearestD(crewWalkG, toLL(gA))], P_BROW = [nearestD(P.walkP, toLL(gA)), nearestD(P.walkP, toLL(gB))];   // along a garbage run (yacht to bins) and along the provisions walk (van to yacht): where the brow starts and ends (31 Oct 2026: so the two men can pass each other on it)
const PED2_M = 38, WD_OFF = 3.4, VS = 0.6 * PEOPLE * SLOW, WD_DMAX = 22, WD_DEND = 2.5, WD_DCOIL = 1.3, WD_LTOT = 26, WD_SLACK = 1.07, WD_STUB = 2.2, WD_HALF = 0.3, WD_PEDV = 1.2, LINE0 = seaward(PED2_M, WD_OFF), EAST_BRG = bearingEN(GANG.pos(GANG.len - PED2_M), toEN(seaward(PED2_M, 5)));   // (VS: the sweep speed; EAST_BRG: which way is seaward, towards the hull)
const WD = (() => {
  const line = mkPath([LINE0, seaward(PED2_M - WD_DMAX, WD_OFF)], { smooth: false });   // the line he sweeps along, from abeam the pedestal to the south end of the hull's pontoon side
  // he comes off the yacht at the stern (where the water man does) and walks up the pontoon to the pedestal with the coil; at the end he carries it all the way back and goes aboard at the stern
  const STERN_LL = toLL(P.hoseW.pos(P.hoseW.len));
  const out3 = mkPath([STERN_LL, seaward(10.5, 4.6), seaward(17, 3.2), seaward(26, 3.3), seaward(34, 3.4), LINE0]), back = mkPath([toLL(line.pos(WD_DCOIL)), seaward(34, 3.4), seaward(26, 3.3), seaward(17, 3.2), seaward(10.5, 4.6), STERN_LL]);
  return { line, out3, back };
})();
// a frame on the pontoon: s metres south of the pedestal, v metres seaward of the sweep line
const WD_P0 = toEN(LINE0), WD_U = (q => [q[0] - WD_P0[0], q[1] - WD_P0[1]])(WD.line.pos(1)), WD_N = (q => [q[0] - WD_P0[0], q[1] - WD_P0[1]])(toEN(seaward(PED2_M, WD_OFF + 1)));
const wdEN = (s, v) => [WD_P0[0] + WD_U[0] * s + WD_N[0] * v, WD_P0[1] + WD_U[1] * s + WD_N[1] * v], WD_K = wdEN(2.0, -1.1), PED2_LL = toLL(wdEN(0, -WD_PEDV));   // PED2_LL: the pedestal, WD_PEDV metres landward of his sweep line (towards the brow); the coil lies beside the start of the run   // WD_K: where the coil lies, beside the pedestal on the landward side
// The hose from the pedestal to his hand (d metres south of the pedestal) with Lp metres paid out. Taut-ish going south: a gentle snake. Coming back north the length stays out, so the hose lies along the pontoon
// as a long hairpin that shortens as he walks, both legs wandering, the slack looping behind him. (Only the look matters, so the arc length is approximate.)
function wdHose(d, Lp) {
  const tip = Math.max(d, (Lp / WD_SLACK + d) / 2), hp = smooth(0, 2.5, tip - d), R = WD_HALF * hp, sc = tip - R, F = smooth(0, 3, sc), step = 0.35, pts = [];
  const m1 = s => 0.5 * Math.sin(s * 1.05 + 0.6) * smooth(0, 2, s) * smooth(0, 1.5, tip - s), m2 = s => 0.5 * Math.sin(s * 1.35 + 2.1) * smooth(0, 1.5, tip - s) * smooth(0, 1.5, s - d), base = s => -WD_PEDV * (1 - smooth(1.6, 4.4, s)) * smooth(0, 2.5, tip - s);   // (the hose starts at the pedestal, runs by the coil, and comes out to his line)
  for (let s = 0; s < sc; s += step) pts.push(wdEN(s, m1(s) + base(s) + R * smooth(0, 3, s)));
  if (R > 0.02) {
    for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; pts.push(wdEN(sc + R * Math.sin(a), R * F * Math.cos(a))); }
    for (let s = sc - step; s > d + 0.01; s -= step) pts.push(wdEN(s, -R * F * smooth(0, 2.2, s - d) + m2(s)));
  }
  pts.push(wdEN(d, 0)); if (pts.length < 2) pts.push(wdEN(d + 0.01, 0));
  return fromDense(pts);
}
const TRIPS = 3, TRIP_GAP = 4, FUEL_L = 26000, WATER_L = 2400, TRIP_M3 = 0.2, CASES = 3;

// ---- the choreography: story time in seconds, computed from the path lengths. Order (Simon): tanker A, tanker B, the van, the provisions man arrives, the water connection, the water man goes on garbage runs, the provisions man leaves during them ----
export const TL = (() => {
  const t = {};
  const LEAD = 24;   // 29 Oct 2026, Simon: the call-out card is to appear and fill out completely before the first tanker comes into view: the story starts this many seconds before it (the card is up from the first moment)
  t.aIn = [1 + LEAD, 1 + LEAD + P.inA.len / VIN]; t.aDoor = t.aIn[1] + 1.2;                         // tanker A arrives; its two step out
  t.a2Reel = [t.aDoor, t.aDoor + 3]; t.a1Go = t.aDoor + 0.8;                          // one to the reel, one (A1) off along the quay to the brow
  t.a1Brow = t.a1Go + A1.dBrow / WALK.A1;                                           // A1 waits on the brow, where the hose will cross
  t.hoseA = [t.a1Brow + 1.5, t.a1Brow + 1.5 + A1.dPt4 / HOSE_RUN];                       // the hose is run out from the reel, over the brow, to the pontoon
  t.a1Step = [t.hoseA[1] + 0.5, t.hoseA[1] + 0.5 + A1.stepLen / WALK.A1];           // A1 steps off the brow to meet the end
  t.a1Tail = [t.a1Step[1], t.a1Step[1] + A1.tailLen / (WALK.A1 * 0.9)];             // and feeds it along the rest of the way to the yacht
  t.pump = [t.a1Tail[1] + 3, 0];                                                    // connected: fuelling starts
  t.bFwd = [t.pump[0] + 5, 0]; t.bFwd[1] = t.bFwd[0] + P.inBfwd.len / VIN;          // tanker B arrives
  t.bRev = [t.bFwd[1] + 1.4, 0]; t.bRev[1] = t.bRev[0] + P.inBrev.len / VREV;
  t.b1Go = t.bRev[1] + 1.2; t.b1Arr = t.b1Go + P.walkB.len / WALK.B1;               // its driver joins hose B to tanker A
  t.hoseB = [t.b1Go, t.b1Arr]; t.flowB = t.b1Arr + 1.5;
  // 31 Oct 2026, Simon: the garbage can start sooner: the first garbage man comes off the yacht as tanker B is arriving. And the provisions man goes down the brow with his first load as the SECOND garbage man is coming up it
  // (they pass each other half way along the brow), but not before the van has parked.
  t.g0 = t.bFwd[0] + 6; t.gT = crewWalkG.len / WALK.G1; t.gTurn = 2 * t.gT + 1.6;
  const gOff = (G_BROW[0] + G_BROW[1]) / 2 / WALK.G1, pOff = (P_BROW[0] + P_BROW[1]) / 2 / WALK.P1;   // seconds from a garbage run's start (at the yacht) / from the provisions man's start (at the van) to the middle of the brow
  // 31 Oct 2026 (later), Simon: bring the van earlier. It no longer waits for tanker B's hose to be joined (flowB): it comes in as soon as B has driven in (B is then reversing into its bay), or earlier still if the meeting needs it,
  // so that it is parked just in time for the provisions man to go down the brow as the second garbage man comes up it.
  const p1Want = t.g0 + t.gTurn + TRIP_GAP + gOff - pOff;
  t.vFwd = [Math.max(t.bFwd[1] + 4, p1Want - 1.5 - (P.inVfwd.len / VIN_VAN + 1.2 + P.inVrev.len / VREV)), 0]; t.vFwd[1] = t.vFwd[0] + P.inVfwd.len / VIN_VAN;             // the van arrives
  t.vRev = [t.vFwd[1] + 1.2, 0]; t.vRev[1] = t.vRev[0] + P.inVrev.len / VREV; t.vIn = [t.vFwd[0], t.vRev[1]];
  t.p1Go = Math.max(t.vIn[1] + 1.5, p1Want);      // he goes down with his first load once the van is parked, and not before the second garbage run could reach the brow
  t.gStart = [t.g0, t.p1Go + pOff - gOff]; for (let k = 2; k < TRIPS; k++) t.gStart.push(t.gStart[k - 1] + t.gTurn + TRIP_GAP);   // the second run is timed so the two men meet half way along the brow (it waits a little if the van was late); the third follows it
  t.gEnd = t.gStart[TRIPS - 1] + t.gTurn; t.gMeet = t.p1Go + pOff;
  t.p1Arr = t.p1Go + P.walkP.len / WALK.P1;                // the provisions man carries it to the yacht's stern
  // the yacht's crew: the water man connects fresh water, then starts the garbage runs
  t.w1Go = t.p1Arr + 2.5; t.w1Ped = t.w1Go + W.toPed.len / WALK.W1; t.w1End = t.w1Ped + 1.0 + W.hose.len / (WALK.W1 * 0.9); t.w1Home = t.w1End + 2.0 + W.back.len / WALK.W1;
  t.water = [t.w1End + 2.0, 0];   // (it ends, and the second crew member takes the hose off, once the washdown is over: see below)
  // 5 Nov 2026, Simon: "shorten quay - reduce to one provision run". The provisions man takes the hamper and cases down once, goes back up to the van (as the first garbage man comes down, as before) and drives away.
  // Everything chained after the van (tanker B leaving, fuelling complete, tanker A leaving) comes forward with it. (29 Oct 2026 to 5 Nov 2026 he made two runs.)
  t.p1Back = Math.max(t.p1Arr + 4, t.gStart[0] + t.gT + 1.6); t.p1Home = t.p1Back + P.walkP.len / WALK.P1;
  t.p1Top = t.p1Back + (P.walkP.len - Math.min(P_BROW[0], P_BROW[1])) / WALK.P1;   // when, on his way back, he reaches the top of the brow (its quay end)
  t.vOut = [t.p1Home + 1.5, 0]; t.vOut[1] = t.vOut[0] + P.outV.len / VOUT;           // the van leaves
  t.b1Ret = [t.vOut[0] + 3, 0]; t.b1Ret[1] = t.b1Ret[0] + P.walkB.len / WALK.B1;     // B's driver takes hose B away ...
  t.bOut = [t.b1Ret[1] + 1.5, 0]; t.bOut[1] = t.bOut[0] + P.outB.len / VOUT;         // ... and tanker B leaves
  t.pump[1] = t.bOut[1] + 4;                                                        // fuelling completes
  t.a1Ret = [t.pump[1] + 2, 0, 0]; t.a1Ret[1] = t.a1Ret[0] + A1.tailLen / (WALK.A1 * 0.9); t.a1Ret[2] = t.a1Ret[1] + A1.stepLen / WALK.A1;   // A1 comes back along the pontoon to the brow
  t.hoseAback = [t.a1Ret[2], t.a1Ret[2] + A1.dPt4 / HOSE_RUN];                           // and the hose is taken back over the brow to the reel
  t.a1Home = t.hoseAback[1] + 0.5 + A1.dBrow / WALK.A1;
  t.aOut = [t.a1Home + 2.5, 0]; t.aOut[1] = t.aOut[0] + P.outA.len / VOUT;           // tanker A leaves
  // the washdown: one crew member comes out while the water is running
  t.wd0 = t.p1Top; t.wdPed = t.wd0 + WD.out3.len / WALK.W1; t.wdConn = [t.wdPed, t.wdPed + 6];                                  // out with the coil to the pedestal; sets it down, connects, takes the nozzle   // 5 Nov 2026, Simon: the washdown man appears as the provisions man reaches the top of the brow on his way back to the van (1 Nov to 5 Nov: when the second load got aboard)
  t.wdS1 = [t.wdConn[1], t.wdConn[1] + WD_DMAX / VS]; t.wdS2 = [t.wdS1[1] + 2.5, t.wdS1[1] + 2.5 + (WD_DMAX - WD_DEND) / VS];      // the sweep south, then back north
  t.wdCoil = [t.wdS2[1] + 0.5, t.wdS2[1] + 11]; t.wdEnd = t.wdCoil[1] + 2 + WD.back.len / WALK.W1;                                   // coils it all up, disconnects, picks it up and goes aboard
  // 1 Nov 2026, Simon: the fresh water takes longer: it completes just after the washdown has finished (5 s after the washdown man is back aboard), and then the second crew member takes the hose off
  t.water[1] = t.wdEnd + 5;
  t.w2Go = t.water[1] + 0.5; t.w2End = t.w2Go + W.back.len / WALK.W1; t.w2Ped = t.w2End + 3.0 + W.hose.len / (WALK.W1 * 0.9); t.w2Home = t.w2Ped + W.toPed.len / WALK.W1;   // a second crew member takes the water hose off
  t.end = Math.max(t.aOut[1], t.gEnd, t.w2Home, t.wdEnd) + 14;
  return t;
})();

export function createQuayWork({ scene, stage, faceAt, worldOffsetTo, M_PER_UNIT, KIN_S, project }) {
  const items = [];
  function sprite(canvas, wM, hM, order) {
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM / M_PER_UNIT, hM / M_PER_UNIT), mat); mesh.rotation.set(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ'); mesh.renderOrder = order;
    const group = new THREE.Group(); group.add(mesh); group.visible = false; scene.add(group); const sp = { group, mesh, mat, tex }; items.push(sp); return sp;
  }
  const tankerC = drawTanker();
  const tA = sprite(tankerC, TANKER_LEN + 0.6, 3.0, 22), tB = sprite(tankerC, TANKER_LEN + 0.6, 3.0, 22), van = sprite(drawVan(), VAN_LEN + 0.5, 2.7, 22);
  const mkP = (hat, vest, bands) => ({ sp: sprite(drawPerson(hat, vest, bands), 2.5, 2.05, 25), hdg: 0 });
  const pA1 = mkP('#ffffff'), pA2 = mkP('#ff7a00'), pB1 = mkP('#ffffff'), pP1 = mkP('#ffffff', '#e5392c', false), pW1 = mkP('#ffffff', '#2f86f0', false), pW2 = mkP('#ffffff', '#2f86f0', false), pG = mkP('#ffffff', '#2f86f0', false);
  const hamper = sprite(drawHamper(), 1.0, 0.7, 26), crate1 = sprite(drawCrate('#6fae3c'), 1.0, 0.72, 26), crate2 = sprite(drawCrate('#d9472b'), 1.0, 0.72, 26), bag = sprite(drawBag(), 0.8, 0.8, 26);
  const bins = sprite(drawBins(), 1.9, 1.3, 21), pedestal = sprite(drawPedestal(), 1.1, 1.1, 21), pedestal2 = sprite(drawPedestal(), 1.1, 1.1, 21);
  const pD1 = mkP('#ffffff', '#2f86f0', false), coilS = sprite(drawCoil(), 2.1, 2.1, 25.6), spray = sprite(drawSpray(), 4.4, 2.6, 27), splash = sprite(drawSplash(), 2.4, 2.4, 27);
  const couplings = [sprite(drawCoupling(), 0.7, 0.7, 28), sprite(drawCoupling(), 0.7, 0.7, 28), sprite(drawCoupling(), 0.7, 0.7, 28), sprite(drawCoupling(), 0.7, 0.7, 28), sprite(drawCoupling(), 0.7, 0.7, 28)];
  const pulse = pulseTexture(), shadowTex = shadowTexture(), fuelTex = hoseTexture('#2a0507', '#7a1118', '#b8343a', 'rgba(0,0,0,.32)'), waterTex = hoseTexture('#0d2f66', '#1f66c4', '#62a9f2', 'rgba(0,0,0,.25)'), washTex = hoseTexture('#2b3a33', '#8fae9c', '#d3e6da', 'rgba(0,0,0,.2)');   // the washdown hose: pale grey-green, unlike the red fuel and blue water hoses
  const hoseW = P.hoseW;   // the water hose, from the pedestal to the hull's edge (under the hull, so it ends there)

  // hoses: a coloured ribbon, with a lighter dashed ribbon over it that runs while the liquid flows
  function ribbon(color, tex, order) {
    const N = 90, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2 * 2), 2));
    const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color, map: tex || null, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, opacity: 0 });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = order; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); return { mesh, geo, mat, N };
  }
  const mkHose = tex => ({ shadow: ribbon(0xffffff, shadowTex, 22.5), base: ribbon(0xffffff, tex, 26.2), flow: ribbon(0xffffff, pulse, 26.4) });
  const hoseObjs = { A: mkHose(fuelTex), B: mkHose(fuelTex), W: mkHose(waterTex), D: mkHose(washTex) };

  // the brow, with a soft shadow under it (laid along Simon's line each frame, since the scene's scale changes)
  const bridgeTex = new THREE.CanvasTexture(drawBridgeTex()); bridgeTex.wrapS = THREE.RepeatWrapping; bridgeTex.colorSpace = THREE.SRGBColorSpace; bridgeTex.anisotropy = 4;
  const bridge = ribbon(0xffffff, bridgeTex, 21), bridgeShadow = ribbon(0x000000, null, 20.5);
  function layRibbon(R, path, width, uvLen, a) {
    const N = R.N, w = width / M_PER_UNIT * geoK / 2, pos = R.geo.attributes.position, uv = R.geo.attributes.uv;
    for (let i = 0; i < N; i++) {
      const d = path.len * i / (N - 1), p = path.pos(d), p2 = path.pos(Math.min(path.len, d + 0.4)), p1 = path.pos(Math.max(0, d - 0.4)), te = p2[0] - p1[0], tn = p2[1] - p1[1], tl = Math.hypot(te, tn) || 1e-6, X = wp(p), sx = -te / tl * w, sz = tn / tl * w;
      pos.setXYZ(i * 2, X[0] + sx, 0.355, X[1] + sz); pos.setXYZ(i * 2 + 1, X[0] - sx, 0.355, X[1] - sz); uv.setXY(i * 2, d / uvLen, 0); uv.setXY(i * 2 + 1, d / uvLen, 1);
    }
    pos.needsUpdate = true; uv.needsUpdate = true; R.mat.opacity = a; R.mesh.visible = a > 0.002;
  }

  // the checklist card
  const card = document.createElement('div'); card.className = 'sq-list';
  card.innerHTML = '<svg class="sq-frame"><rect pathLength="1"/></svg><div class="sq-head"><svg class="sq-tris" viewBox="0 0 34 9"><polygon style="--j:0" points="0,0 10,0 5,9"/><polygon style="--j:1" points="12,0 22,0 17,9"/><polygon style="--j:2" points="24,0 34,0 29,9"/></svg><span>Alongside: services</span></div><div class="sq-now"></div><div class="sq-rows">' + [['fuel', 'Fuel', 'ULSD (VAT and Duty Free)'], ['prov', 'Provisions', 'by van, to the stern'], ['water', 'Fresh water', 'from the pontoon'], ['waste', 'Garbage', 'to the quay bins, 0.2 m³ a trip'], ['wash', 'Washdown', 'deck and hull, pontoon side']]
    .map(([k, a, b], n) => '<div class="sq-row" style="--i:' + n + '" data-k="' + k + '"><i class="sq-tick"></i><span>' + a + '<small>' + b + '</small></span><b data-v>-</b><em><u></u></em></div>').join('') + '</div>';
  stage.appendChild(card);
  const nowEl = card.querySelector('.sq-now'), rowsEl = card.querySelector('.sq-rows'); let nowText = '';
  // 28 Oct 2026, Simon: the card pops up by the yacht's starboard side, linked to it with a small call-out line (on a phone it stays in the top-right corner)
  const lead = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); lead.setAttribute('class', 'sq-lead');
  lead.innerHTML = '<polyline class="sq-ln" pathLength="1" fill="none"/><g class="sq-xh"><circle class="sq-ring" r="7" fill="none"/><circle class="sq-pt" r="2.6"/><path d="M-13 0H-7M7 0H13M0 -13V-7M0 7V13" fill="none"/></g>'; stage.appendChild(lead);
  const leadLine = lead.querySelector('.sq-ln'), leadX = lead.querySelector('.sq-xh'), HULL_MID = faceAt(KIN_S - 2, 5.2), HULL_EDGE = faceAt(KIN_S - 2, 10.3);   // the middle of the yacht (she lies port side to the wall; starboard is the water side)
  let cardW = 0, cardH = 0, cardMeasure = 0;
  let cardOut = false;   // 1 Nov 2026, Simon: when the way out begins the card closes as a timed animation: the five rows (.sq-rows) shrink up from the bottom, so the card itself gets shorter and keeps its rounded corners and border; the 'All services complete' line holds and blinks, then the rest goes (sq-out; --rows-h is the rows' full height)
  let cardOn = false;   // (31 Oct 2026, Simon: the call-out and the card fold out as a timed animation again, not scrubbed by the scroll: the sq-on class starts the CSS animations when the card first appears, and again if the visitor scrolls back and forward)
  function placeCard(a) {
    const narrow = innerWidth <= 520 || !project, on = a > 0.02;
    if (on !== cardOn) { cardOn = on; card.classList.toggle('sq-on', on); lead.classList.toggle('sq-on', on); }
    if (narrow) { card.classList.remove('sq-pinned'); card.style.transform = ''; lead.style.opacity = '0'; return; }
    if (!cardW || (!cardOut && ++cardMeasure % 60 === 0)) { cardW = card.offsetWidth; cardH = card.offsetHeight; }   // (not while it is closing: it shrinks, and the position below is worked out from the full height)
    const W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight, [ax, ay] = project(HULL_MID), [ex] = project(HULL_EDGE), halfBeam = Math.abs(ex - ax);
    const up = 78, want = Math.max(ax + halfBeam + 100, ax + up + 66), shrink = Math.max(0.78, Math.min(1, (W - 16 - want) / cardW)), left = Math.max(12, Math.min(want, W - cardW * shrink - 16));   // a fixed distance from the hull's side (it only gives way when the window is too narrow); the card above and to the right: the line goes up at 45 degrees, then straight in
    const top = Math.max(124, Math.min(ay - up - 22, H - cardH - 16)), ly = top + 22, dy = Math.max(8, ay - ly), bx = ax + dy;   // bx: where the 45 degree leg ends
    const pop = (0.94 + 0.06 * a) * shrink;
    card.classList.add('sq-pinned'); card.style.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px) scale(' + pop.toFixed(3) + ')';
    leadLine.setAttribute('points', ax.toFixed(1) + ',' + ay.toFixed(1) + ' ' + bx.toFixed(1) + ',' + ly.toFixed(1) + ' ' + left.toFixed(1) + ',' + ly.toFixed(1));
    leadX.setAttribute('transform', 'translate(' + ax.toFixed(1) + ',' + ay.toFixed(1) + ')'); lead.style.opacity = a.toFixed(2);
  }
  const tagLayer = document.createElement('div'); tagLayer.className = 'sq-tags'; stage.appendChild(tagLayer);
  const tags = {}; const tagEl = k => tags[k] || (tags[k] = (() => { const e = document.createElement('div'); e.className = 'sq-tag'; e.style.opacity = '0'; tagLayer.appendChild(e); return { e, text: '' }; })());
  function putTag(k, en, a, text) { const T = tagEl(k); if (a <= 0.01 || !project) { T.e.style.opacity = '0'; return; } const xy = project(toLL(en)); if (T.text !== text) { T.e.textContent = text; T.text = text; } T.e.style.opacity = a.toFixed(2); T.e.style.transform = 'translate(' + xy[0].toFixed(1) + 'px,' + xy[1].toFixed(1) + 'px)'; }
  const rows = {}; card.querySelectorAll('.sq-row').forEach(r => { rows[r.dataset.k] = { el: r, v: r.querySelector('[data-v]'), bar: r.querySelector('u'), state: '', text: '' }; });
  function setRow(k, state, text, frac) { const r = rows[k]; if (r.state !== state) { r.el.dataset.state = state; r.state = state; } if (r.text !== text) { r.v.textContent = text; r.text = text; } r.bar.style.transform = 'scaleX(' + clamp01(frac).toFixed(3) + ')'; }
  const fmt = n => Math.round(n).toLocaleString('en-GB');

  let geoK = 1;
  const wp = en => worldOffsetTo(0, toLL(en));
  function putEN(sp, en, hdg, a, y = 0.36, k = 1) {
    if (a <= 0.002) { sp.group.visible = false; return; }
    const [x, z] = wp(en); sp.group.visible = true; sp.group.position.set(x, y, z); sp.group.scale.set(geoK * k, geoK * k, geoK * k); sp.group.rotation.y = -(hdg - 90) * Math.PI / 180; sp.mat.opacity = a;
  }
  const putLL = (sp, ll, hdg, a, y) => putEN(sp, toEN(ll), hdg, a, y);

  // ---- vehicles ----
  // arriving: along the path with an ease-out, heading follows the road and settles on the bay's heading
  function arrive(path, t, [t0, t1], park, win = 3.5) { const d = path.len * easeOut(seg(t0, t1, t)), h = path.brg(d, win); return { en: path.pos(d), hdg: lerpAng(h, park, smooth(path.len - 9, path.len, d)) }; }
  // leaving: heading swings from the parked heading to the road's over the first few metres
  function leave(path, t, [t0, t1], park, swing, win = 3.5) { const u = seg(t0, t1, t), d = path.len * easeIn(u), h = path.brg(d, win); return { en: path.pos(d), hdg: lerpAng(park, h, smooth(0, swing, d)) }; }

  // forward along `pf`, then reversed back along `pr` (the heading swings round with the reversing and settles on the bay's), as tanker B and the van do
  function fwdThenBack(pf, pr, t, tf, trv, park) {
    if (t < trv[0]) { const d = pf.len * easeOut(seg(tf[0], tf[1], t)); return { en: pf.pos(d), hdg: pf.brg(d, 3.5) }; }
    const d = pr.len * easeIO(seg(trv[0], trv[1], t)), fwdEnd = pf.brg(pf.len, 3.5), back = (pr.brg(d, 2.5) + 180) % 360;
    return { en: pr.pos(d), hdg: lerpAng(lerpAng(fwdEnd, back, smooth(0, 4, d)), park, smooth(pr.len - 6, pr.len, d)) };
  }

  // ---- people: along a walk path at a steady speed, forward or back, facing the way they go ----
  function onWalk(path, t, t0, v, rev) { const d = clamp01((t - t0) * v / path.len) * path.len, dd = rev ? path.len - d : d, f = rev ? -1 : 1, lim = x => Math.max(0, Math.min(path.len, x)), a = path.pos(dd); return { en: a, hdg: bearingEN(path.pos(lim(dd - f * 0.7)), path.pos(lim(dd + f * 0.7))) || 0, moving: d > 0 && d < path.len, d }; }   // heading is the way they are going (and stays that way when they stop)
  const faceTo = (from, to) => bearingEN(toEN(from), toEN(to));

  // ---- a hose drawn from a path: from its start to the distance `reach` (metres) ----
  const hosePos = (H, path, reach, width, flowFrac, vis, tSec, coupling, color) => {
    if (vis <= 0.002 || reach < 0.3) { H.shadow.mesh.visible = false; H.base.mesh.visible = false; H.flow.mesh.visible = false; if (coupling) coupling.group.visible = false; return; }
    const w = width / M_PER_UNIT * geoK, N = H.base.N, X = [], Nrm = [];
    for (let i = 0; i < N; i++) {
      const d = reach * i / (N - 1), p = path.pos(d), p2 = path.pos(Math.min(path.len, d + 0.4)), p1 = path.pos(Math.max(0, d - 0.4)), te = p2[0] - p1[0], tn = p2[1] - p1[1], tl = Math.hypot(te, tn) || 1e-6;
      X.push(wp(p)); Nrm.push([-te / tl, tn / tl]);   // world: north is +x, east is +z; the sideways step is the tangent turned a quarter
    }
    for (const part of [H.shadow, H.base, H.flow]) {
      const pos = part.geo.attributes.position, uv = part.geo.attributes.uv, off = (part === H.flow ? w * 0.7 : part === H.shadow ? w * 2.1 : w) / 2, uvLen = part === H.flow ? 3.4 : HOSE_STYLE === 3 ? 0.22 : 0.8;
      for (let i = 0; i < N; i++) {
        const d = reach * i / (N - 1), sx = Nrm[i][0] * off, sz = Nrm[i][1] * off;
        pos.setXYZ(i * 2, X[i][0] + sx, part === H.shadow ? 0.365 : 0.37, X[i][1] + sz); pos.setXYZ(i * 2 + 1, X[i][0] - sx, part === H.shadow ? 0.365 : 0.37, X[i][1] - sz);
        const u = d / uvLen; uv.setXY(i * 2, u, 0); uv.setXY(i * 2 + 1, u, 1);
      }
      pos.needsUpdate = true; uv.needsUpdate = true; part.mat.opacity = part === H.flow ? flowFrac * vis : vis; part.mesh.visible = part === H.flow ? flowFrac * vis > 0.01 : true;
    }
    pulse.offset.x = -(tSec * 0.5) % 1;
    if (coupling) putEN(coupling, path.pos(reach), 0, vis, 0.38);
  };

  function update(q, geoKNow, tSec, browA = q > 0.0005 ? 1 : 0, outK = 1) {   // outK: the services card and its call-out fade away as the way out begins (chapter 5)   // browA: how far the brow has faded in (it arrives with the pontoon, before the chapter's story starts)
    geoK = geoKNow;
    layRibbon(bridgeShadow, GANG, 2.3, 2.4, browA * 0.3); layRibbon(bridge, GANG, 1.7, 2.4, browA);
    const T = q * TL.end;
    if (q <= 0.0005) { for (const s of items) s.group.visible = false; for (const H of Object.values(hoseObjs)) for (const p of [H.shadow, H.base, H.flow]) p.mesh.visible = false; card.style.opacity = '0'; lead.style.opacity = '0'; return; }
    // the fixtures: bins and pedestal are just there
    const fx = smooth(0, 0.01, q); putLL(bins, BIN_LL, L.bayA.hdg - 4, fx); putLL(pedestal, PED_LL, 27, fx); putLL(pedestal2, PED2_LL, 27, fx);

    // vehicles
    const a = T < TL.aOut[0] ? arrive(P.inA, T, TL.aIn, A_HDG, 4) : leave(P.outA, T, TL.aOut, A_HDG, 3, 4);
    putEN(tA, a.en, a.hdg, T > TL.aIn[0] - 0.3 && T < TL.aOut[1] + 0.3 ? 1 : 0);
    const b = T < TL.bOut[0] ? fwdThenBack(P.inBfwd, P.inBrev, T, TL.bFwd, TL.bRev, B_HDG) : leave(P.outB, T, TL.bOut, B_HDG, 6, 3.5);
    putEN(tB, b.en, b.hdg, T > TL.bFwd[0] - 0.3 && T < TL.bOut[1] + 0.3 ? 1 : 0);
    const v = T < TL.vOut[0] ? fwdThenBack(P.inVfwd, P.inVrev, T, TL.vFwd, TL.vRev, V_HDG) : leave(P.outV, T, TL.vOut, V_HDG, 3, 3);
    putEN(van, v.en, v.hdg, T > TL.vIn[0] - 0.3 && T < TL.vOut[1] + 0.3 ? 1 : 0);

    // ---- people ----
    const fadeIn = (t, t0) => smooth(t0, t0 + 0.7, t), fadeOut = (t, t1) => 1 - smooth(t1 - 0.7, t1, t);
    const lim = (p, x) => Math.max(0, Math.min(p.len, x)), hdgAt = (p, d, f) => bearingEN(p.pos(lim(p, d - f * 0.7)), p.pos(lim(p, d + f * 0.7))) || 0;
    // tanker A's two: one stays at the hose reel; A1 walks to the brow, waits there while the hose is run out overhead, meets it at the pontoon and feeds it along to the yacht
    const reelLL = toLL([P.hoseA.pos(0)[0] + 0.55 - 0.82, P.hoseA.pos(0)[1] - 1.6]);   // (the quay man stands close in by the tanker, 1.8 m south of the hose outlet towards the cab, clear of the connection)
    const aLife = T >= TL.aDoor && T < TL.a1Home + 0.5, aOp = fadeIn(T, TL.aDoor) * fadeOut(T, TL.a1Home + 0.5), dTail0 = A1.dBrow + A1.stepLen;
    let d1;
    if (T < TL.a1Go) d1 = 0; else if (T < TL.a1Brow) d1 = (T - TL.a1Go) * WALK.A1; else if (T < TL.a1Step[0]) d1 = A1.dBrow;
    else if (T < TL.a1Step[1]) d1 = A1.dBrow + A1.stepLen * seg(TL.a1Step[0], TL.a1Step[1], T); else if (T < TL.a1Tail[1]) d1 = dTail0 + A1.tailLen * seg(TL.a1Tail[0], TL.a1Tail[1], T);
    else if (T < TL.a1Ret[0]) d1 = A1.path.len; else if (T < TL.a1Ret[1]) d1 = A1.path.len - A1.tailLen * seg(TL.a1Ret[0], TL.a1Ret[1], T);
    else if (T < TL.a1Ret[2]) d1 = dTail0 - A1.stepLen * seg(TL.a1Ret[1], TL.a1Ret[2], T); else if (T < TL.hoseAback[1] + 0.5) d1 = A1.dBrow; else d1 = Math.max(0, A1.dBrow - (T - TL.hoseAback[1] - 0.5) * WALK.A1);
    if (aLife) { pA1.hdg = hdgAt(A1.path, d1, T < TL.a1Ret[0] ? 1 : -1); putEN(pA1.sp, A1.path.pos(d1), pA1.hdg, aOp); } else pA1.sp.group.visible = false;
    if (aLife) {
      const k = easeIO(seg(TL.a2Reel[0], TL.a2Reel[1], T)), p0 = P.walkA.pos(0), en = [lerp(p0[0], toEN(reelLL)[0], k), lerp(p0[1], toEN(reelLL)[1], k)];
      putEN(pA2.sp, en, k < 1 ? bearingEN(p0, toEN(reelLL)) : 84, aOp);
    } else pA2.sp.group.visible = false;
    // tanker B's driver: out to A's manifold with hose B, waits, back for the retrieval, then into the cab
    let wb = null, bOp = 0;
    if (T >= TL.bRev[1] + 0.3 && T < TL.b1Ret[0]) { wb = onWalk(P.walkB, T, TL.b1Go, WALK.B1, false); bOp = fadeIn(T, TL.bRev[1] + 0.3); }
    else if (T >= TL.b1Ret[0] && T < TL.b1Ret[1] + 1.0) { wb = onWalk(P.walkB, T, TL.b1Ret[0], WALK.B1, true); bOp = fadeOut(T, TL.b1Ret[1] + 1.0); }
    if (wb) putEN(pB1.sp, wb.en, (pB1.hdg = wb.moving ? wb.hdg : pB1.hdg), bOp); else pB1.sp.group.visible = false;
    // the provisions man: carries the hamper and cases to the yacht, goes aboard; later he comes back (during the garbage runs) and drives the van away
    let wp1 = null, pOp = 0, carry = 0;
    if (T >= TL.vIn[1] + 0.3 && T < TL.p1Home + 0.8) {
      if (T < TL.p1Back) { wp1 = onWalk(P.walkP, T, TL.p1Go, WALK.P1, false); pOp = fadeIn(T, TL.vIn[1] + 0.3) * (T > TL.p1Arr ? fadeOut(T, TL.p1Arr + 2.0) : 1); carry = T < TL.p1Arr - 0.4 ? 1 : 0; }   // run 1: the hamper and cases down to the yacht, then aboard
      else { wp1 = onWalk(P.walkP, T, TL.p1Back, WALK.P1, true); pOp = fadeIn(T, TL.p1Back + 0.2) * fadeOut(T, TL.p1Home + 0.8); }                                                                   // back up to the van, and a moment at it
    }
    if (wp1) putEN(pP1.sp, wp1.en, (pP1.hdg = wp1.moving ? wp1.hdg : pP1.hdg), pOp); else pP1.sp.group.visible = false;
    const hs = h => (h * Math.PI) / 180, fwd = (en, h, f, s) => [en[0] + Math.sin(hs(h)) * f + Math.cos(hs(h)) * s, en[1] + Math.cos(hs(h)) * f - Math.sin(hs(h)) * s];
    if (carry && wp1) { const h = pP1.hdg; if (carry === 1) putEN(hamper, fwd(wp1.en, h, 0.75, 0), h, pOp, 0.375); else hamper.group.visible = false; putEN(crate1, fwd(wp1.en, h, 0.5, 0.55), h, pOp, 0.375); putEN(crate2, fwd(wp1.en, h, 0.5, -0.55), h, pOp, 0.375); }
    else { hamper.group.visible = false; crate1.group.visible = false; crate2.group.visible = false; }
    // the water man: from the stern along the pontoon (not the brow) to the pedestal, takes the hose end back to the yacht and connects it, walks to the stern; then the garbage runs
    const lenA = W.toPed.len, lenB = W.hose.len, lenC = W.back.len, vW = WALK.W1;
    let wd = null, wOpa = 0, wF = 1, reachW = 0, w2 = null;
    if (T >= TL.w1Go && T < TL.w1Home + 0.6) {
      if (T < TL.w1Ped) wd = (T - TL.w1Go) * vW; else if (T < TL.w1Ped + 1.0) wd = lenA; else if (T < TL.w1End) wd = lenA + lenB * seg(TL.w1Ped + 1.0, TL.w1End, T); else if (T < TL.w1End + 2.0) wd = lenA + lenB; else wd = lenA + lenB + (T - TL.w1End - 2.0) * vW;
      wOpa = fadeIn(T, TL.w1Go) * fadeOut(T, TL.w1Home + 0.6);
      if (wd >= lenA) { const prog = Math.min(lenB, wd - lenA); reachW = Math.min(hoseW.len, prog + 1.5 * clamp01(prog / lenB)); }
    } else if (T >= TL.w2Go && T < TL.w2Home + 0.6) {   // the second crew member: to the hose end, takes the hose off, walks it back to the pedestal and on to the stern
      const R = reversePath(W.path); let rd;
      if (T < TL.w2End) rd = (T - TL.w2Go) * vW; else if (T < TL.w2End + 3.0) rd = lenC; else if (T < TL.w2Ped) rd = lenC + lenB * seg(TL.w2End + 3.0, TL.w2Ped, T); else rd = lenC + lenB + (T - TL.w2Ped) * vW;
      wd = rd; w2 = R; wOpa = fadeIn(T, TL.w2Go) * fadeOut(T, TL.w2Home + 0.6); wF = 1;
      const prog = rd < lenC ? lenB : rd > lenC + lenB ? 0 : lenB - (rd - lenC);
      reachW = rd < lenC ? hoseW.len : rd > lenC + lenB ? 0 : Math.min(hoseW.len, prog + 1.5 * clamp01(prog / lenB));
    } else reachW = (T >= TL.w1Home + 0.6 && T < TL.w2Go) ? hoseW.len : 0;
    if (wd != null) { const sp = w2 ? pW2 : pW1, P0 = w2 || W.path; sp.hdg = hdgAt(P0, wd, 1); putEN(sp.sp, P0.pos(wd), sp.hdg, wOpa); }
    if (wd == null || !(w2 == null)) pW1.sp.group.visible = wd != null && w2 == null;
    if (!w2) pW2.sp.group.visible = false;
    // the garbage runs: one man (his own figure since 31 Oct 2026), three trips to the bins across the chapter (each lands 0.2 m3, 0.6 m3 in all)
    let wg = null, gOp = 0, bagOn = 0, drops = 0, gTrip = 0;
    for (let k = 0; k < TRIPS; k++) {
      const t0 = TL.gStart[k], tBin = t0 + TL.gT, tBack = tBin + 1.6;
      if (T >= tBin + 0.7) drops++;
      if (T >= t0 && T < tBack + TL.gT + 0.5) {
        gTrip = k + 1;
        if (T < tBin) { wg = onWalk(crewWalkG, T, t0, WALK.G1, false); bagOn = 1; } else if (T < tBack) { wg = { en: crewWalkG.pos(crewWalkG.len), hdg: pG.hdg, moving: false }; bagOn = T < tBin + 0.7 ? 1 : 0; } else wg = onWalk(crewWalkG, T, tBack, WALK.G1, true);
        gOp = fadeIn(T, t0) * fadeOut(T, tBack + TL.gT + 0.5);
      }
    }
    if (wg) putEN(pG.sp, wg.en, (pG.hdg = wg.moving ? wg.hdg : pG.hdg), gOp); else pG.sp.group.visible = false;
    if (bagOn && wg) putEN(bag, fwd(wg.en, pG.hdg, 0.7, 0.15), pG.hdg, gOp, 0.375); else bag.group.visible = false;

    // ---- the washdown: one crew member comes out over the hull's edge carrying the hose in a loose coil, sets it down by the second pedestal, connects, and sweeps the hull's pontoon side south, the hose paying out of the coil;
    //      coming back north the slack trails and loops behind him; at the end he coils it all up, disconnects, picks the coil up and goes aboard ----
    let w3pos = null, hoseD = null, sw = 0, Lp = 0, hv = 0;   // hv: how visible the hose is
    if (T >= TL.wd0 && T < TL.wdEnd + 0.6) {
      const op = fadeIn(T, TL.wd0) * fadeOut(T, TL.wdEnd + 0.6), e3 = WD.out3.len, LpMax = WD_SLACK * WD_DMAX, tCo = TL.wdCoil[0] + 1.5;
      let en, h3, d = 0, dh = 0, onLine = false, cu = 1;   // cu: 0 the coil is in his arms, 1 it lies on the pontoon
      if (T < TL.wdPed) { const dd = (T - TL.wd0) * vW; en = WD.out3.pos(dd); h3 = hdgAt(WD.out3, dd, 1); cu = 0; }
      else if (T < TL.wdS1[0]) { en = WD.out3.pos(e3); h3 = lerpAng(hdgAt(WD.out3, e3, 1), EAST_BRG, smooth(TL.wdS1[0] - 1.2, TL.wdS1[0], T)); cu = easeIO(seg(TL.wdPed, TL.wdPed + 1.5, T)); }
      else if (T < TL.wdCoil[1]) {
        d = T < TL.wdS1[1] ? WD_DMAX * seg(TL.wdS1[0], TL.wdS1[1], T) : T < TL.wdS2[0] ? WD_DMAX : T < TL.wdS2[1] ? WD_DMAX - (WD_DMAX - WD_DEND) * seg(TL.wdS2[0], TL.wdS2[1], T) : T < tCo ? WD_DEND - (WD_DEND - WD_DCOIL) * easeIO(seg(TL.wdCoil[0], tCo, T)) : WD_DCOIL;
        dh = T < TL.wdS1[1] ? Math.max(d, WD_STUB) : d;   // (the hose end lies where it was left, 2 m from the pedestal, until he has walked to it and taken it up)
        en = WD.line.pos(d); onLine = true; h3 = T < TL.wdS2[1] ? EAST_BRG : lerpAng(EAST_BRG, bearingEN(en, WD_K), smooth(TL.wdS2[1], TL.wdS2[1] + 1, T));
        Lp = T < TL.wdS1[1] ? WD_SLACK * dh : T < tCo ? LpMax : LpMax * (1 - easeIO(seg(tCo, TL.wdCoil[1] - 1, T)));
      }
      else if (T < TL.wdCoil[1] + 2) { en = WD.line.pos(WD_DCOIL); h3 = bearingEN(en, WD_K); cu = 1 - easeIO(seg(TL.wdCoil[1], TL.wdCoil[1] + 1.5, T)); }
      else { const dd = (T - TL.wdCoil[1] - 2) * vW; en = WD.back.pos(dd); h3 = hdgAt(WD.back, dd, 1); cu = 0; }
      w3pos = en; pD1.hdg = h3; putEN(pD1.sp, en, h3, op);
      const carried = fwd(en, h3, 0.95, 0), kc = 0.3 + 0.7 * Math.sqrt(clamp01(1 - Lp / WD_LTOT));   // the coil is as big as the hose left in it
      putEN(coilS, [lerp(carried[0], WD_K[0], cu), lerp(carried[1], WD_K[1], cu)], 0, op, 0.372, lerp(0.75, kc, cu));
      sw = smooth(TL.wdS1[0] + 2.5, TL.wdS1[0] + 3.3, T) * (1 - smooth(TL.wdS2[1] - 0.2, TL.wdS2[1] + 0.5, T));
      if (onLine && Lp > 0.3) { hoseD = wdHose(dh, Lp); hv = smooth(0.3, 2.0, Lp); }
      else if (T >= TL.wdConn[0] + 2.5 && T < TL.wdS1[0]) { Lp = WD_SLACK * WD_STUB; hoseD = wdHose(WD_STUB, Lp); hv = smooth(TL.wdConn[0] + 2.5, TL.wdConn[0] + 3.5, T); }   // connected: a short, not quite straight run from the pedestal to the coil
    } else { pD1.sp.group.visible = false; coilS.group.visible = false; }
    {
      const jit = 0.9 + 0.1 * Math.sin(tSec * 21);
      if (w3pos && sw > 0.02) {
        const ux = Math.sin(hs(EAST_BRG)), uy = Math.cos(hs(EAST_BRG));
        putEN(spray, [w3pos[0] + ux * 2.4, w3pos[1] + uy * 2.4], EAST_BRG, 0.78 * sw * jit, 0.39);
        putEN(splash, [w3pos[0] + ux * 4.0, w3pos[1] + uy * 4.0], EAST_BRG + 40 * Math.sin(tSec * 7), 0.85 * sw * (0.8 + 0.2 * Math.sin(tSec * 13)), 0.395);
      } else { spray.group.visible = false; splash.group.visible = false; }
      putEN(couplings[4], toEN(PED2_LL), 0, smooth(TL.wdConn[0] + 2.5, TL.wdConn[0] + 3.2, T) * (1 - smooth(TL.wdCoil[1] - 0.8, TL.wdCoil[1] - 0.2, T)), 0.38);   // connected to the pedestal until he has coiled it up
    }

    // ---- hoses ----
    // A: run out from the reel over the brow to the pontoon (A1 waiting on the brow), fed along to the yacht by A1, taken back the same way
    let reachA;
    if (T < TL.hoseA[0]) reachA = 0; else if (T < TL.hoseA[1]) reachA = A1.dPt4 * easeIO(seg(TL.hoseA[0], TL.hoseA[1], T));
    else if (T < TL.hoseAback[0]) { const prog = Math.max(0, d1 - dTail0); reachA = A1.dPt4 + prog + 1.5 * clamp01(prog / A1.tailLen); }
    else reachA = A1.dPt4 * (1 - easeIO(seg(TL.hoseAback[0], TL.hoseAback[1], T)));
    const pumpK = seg(TL.pump[0], TL.pump[1], T), pumping = smooth(TL.pump[0], TL.pump[0] + 1.5, T) * (1 - smooth(TL.pump[1] - 1.5, TL.pump[1], T));
    hosePos(hoseObjs.A, P.hoseA, reachA, HW.fuel, pumping, T > TL.hoseA[0] - 0.2 && T < TL.hoseAback[1] + 0.2 ? 1 : 0, tSec, couplings[0], 0xc9261e);
    // B: out with its driver to tanker A (the daisy chain), flowing while fuelling, back with the driver
    const extB = easeIO(seg(TL.hoseB[0], TL.hoseB[1], T)), retB = easeIO(seg(TL.b1Ret[0], TL.b1Ret[1], T)), reachB = P.hoseB.len * extB * (1 - retB);
    const flowB = smooth(TL.flowB, TL.flowB + 1.5, T) * (1 - smooth(TL.b1Ret[0] - 1.5, TL.b1Ret[0], T));
    hosePos(hoseObjs.B, P.hoseB, reachB, HW.fuel, flowB * pumping, T > TL.hoseB[0] - 0.2 && T < TL.b1Ret[1] + 0.2 ? 1 : 0, tSec, couplings[1], 0xc9261e);
    // water: the water man carries the end from the pedestal to the yacht; the second crew member takes it off
    const waterK = seg(TL.water[0], TL.water[1], T), flowW = smooth(TL.water[0], TL.water[0] + 1.2, T) * (1 - smooth(TL.water[1] - 1.2, TL.water[1], T));
    hosePos(hoseObjs.W, hoseW, reachW, HW.water, flowW, T > TL.w1Ped && T < TL.w2Ped + 0.2 ? 1 : 0, tSec, couplings[2], 0x2c74d8);

    // washdown hose: pale grey-green, from the second pedestal out of the coil to the man with the nozzle
    hosePos(hoseObjs.D, hoseD || WD.line, hoseD ? hoseD.len : 0, HW.fuel * 0.78, sw * 0.9, hoseD ? hv : 0, tSec, couplings[3], 0x9ab5a4);

    // ---- the checklist, the 'now' line and the tags ----
    const fuelDone = T >= TL.pump[1], provDone = T >= TL.p1Back + 0.4, waterDone = T >= TL.water[1], wasteDone = drops >= TRIPS;
    setRow('fuel', fuelDone ? 'done' : T >= TL.pump[0] ? 'active' : 'idle', fuelDone ? fmt(FUEL_L) + ' L' : T >= TL.pump[0] ? fmt(FUEL_L * pumpK) + ' L' : '-', fuelDone ? 1 : pumpK);
    setRow('prov', provDone ? 'done' : T >= TL.vIn[1] ? 'active' : 'idle', provDone ? 'hamper + ' + CASES + ' cases' : T >= TL.p1Arr + 0.6 ? 'hamper + ' + CASES + ' cases' : T >= TL.vIn[1] ? 'on the way' : '-', provDone ? 1 : T < TL.p1Arr ? 0.95 * seg(TL.p1Go, TL.p1Arr, T) : 0.95);   // (one run, 5 Nov 2026: the bar fills as he carries it down and completes when he steps off the yacht)
    setRow('water', waterDone ? 'done' : T >= TL.w1Go ? 'active' : 'idle', waterDone ? fmt(WATER_L) + ' L' : T >= TL.water[0] ? fmt(WATER_L * waterK) + ' L' : T >= TL.w1Go ? 'Connecting' : '-', waterDone ? 1 : waterK);
    setRow('waste', wasteDone ? 'done' : T >= TL.g0 ? 'active' : 'idle', T >= TL.g0 ? (drops * TRIP_M3).toFixed(1) + ' m³' : '-', wasteDone ? 1 : drops / TRIPS + (bagOn ? 0.5 / TRIPS : 0));
    { const washDone = T >= TL.wdS2[1], mins = Math.round(40 * clamp01((T - TL.wdS1[0]) / (TL.wdS2[1] - TL.wdS1[0])));
      setRow('wash', washDone ? 'done' : T >= TL.wd0 ? 'active' : 'idle', washDone ? '40 min' : T >= TL.wdS1[0] ? mins + ' min' : T >= TL.wd0 ? 'Connecting' : '-', washDone ? 1 : clamp01((T - TL.wdS1[0]) / (TL.wdS2[1] - TL.wdS1[0]))); }
    // what is happening now: the latest step that has started and is not over (steps overlap, the newest wins)
    const STEPS = [
      [0, TL.a1Go, 'Bunkers arriving'], [TL.a1Go, TL.pump[0], 'Bunker connection in progress'], [TL.pump[0], TL.bFwd[1], 'Connected: fuelling starts'],
      [TL.bFwd[1], TL.flowB + 4, 'No.2 tanker arrived: connecting to master'],
      [TL.vFwd[0] + 4, TL.p1Go, 'Provision van arrives'], [TL.p1Go, TL.p1Arr + 3, 'Provisions on their way to the yacht'],
      [TL.w1Go, TL.water[0], 'Connecting fresh water'], [TL.water[0], TL.water[0] + 6, 'Fresh water connected'],
      [TL.wd0, TL.wdS1[0], 'Connecting washdown hose'], [TL.wdS1[0], TL.wdS2[1], 'Crew washing down'], [TL.g0, TL.gEnd, 'Garbage runs in progress'],
            [TL.bOut[1], TL.hoseAback[1], 'Fuelling complete: disconnecting'], [TL.aOut[0], TL.aOut[1], 'Bunkers departing'], [TL.aOut[1], TL.end + 99, 'All services complete: vessel turned around, ready to rest or depart'],
    ];
    let now = ''; let best = -1; for (const [t0, t1, txt] of STEPS) if (T >= t0 && T < t1 && t0 > best) { best = t0; now = txt; }
    if (!now) now = T < TL.pump[0] ? 'Bunker connection in progress' : T < TL.pump[1] ? (T >= TL.g0 && T < TL.gEnd ? 'Garbage runs in progress' : 'Fuelling in progress') : 'Fuelling complete';
    else if (T >= TL.g0 && T < TL.gEnd && best < TL.g0) now = 'Garbage runs in progress';
    if (now !== nowText) { nowEl.textContent = now; nowText = now; }
    putTag('D', w3pos || [0, 0], w3pos && T < TL.wdEnd ? 0.95 * (1 - seg(TL.wdS1[0] + 3.5, TL.wdS1[0] + 4.1, T)) : 0, 'Washdown');   // (29 Oct 2026, Simon: the call-out is on him from the moment he steps off the yacht ...; 4 Nov 2026, Simon: ... until a second after he starts spraying (the spray is full at wdS1[0] + 3.3), when it fades away)
    putTag('P', wp1 ? wp1.en : [0, 0], wp1 && carry >= 1 ? 0.95 : 0, 'Provisions');   // (his name card shows while he carries the load down to the yacht)
    putTag('W', wd != null && !w2 ? W.path.pos(wd) : [0, 0], wd != null && !w2 && T < TL.water[0] + 4 ? 0.95 : 0, 'Fresh water');
    putTag('G', wg ? wg.en : [0, 0], wg && bagOn && gTrip === 1 ? 0.95 : 0, 'Garbage');
    const closing = outK < 0.995; if (closing !== cardOut) { cardOut = closing; if (closing) card.style.setProperty('--rows-h', rowsEl.offsetHeight + 'px'); card.classList.toggle('sq-out', closing); lead.classList.toggle('sq-out', closing); }
    const cardA = smooth(0, 0.8, T); card.style.opacity = cardA.toFixed(3); placeCard(cardA);   // 28 Oct 2026, Simon: the card pops up as the first truck comes on, not when it has parked
  }
  function dispose() { for (const s of items) { scene.remove(s.group); s.mesh.geometry.dispose(); s.mat.dispose(); s.tex.dispose(); } for (const H of Object.values(hoseObjs)) for (const part of [H.shadow, H.base, H.flow]) { scene.remove(part.mesh); part.geo.dispose(); part.mat.dispose(); } for (const R of [bridge, bridgeShadow]) { scene.remove(R.mesh); R.geo.dispose(); R.mat.dispose(); } bridgeTex.dispose(); pulse.dispose(); shadowTex.dispose(); fuelTex.dispose(); waterTex.dispose(); washTex.dispose(); card.remove(); tagLayer.remove(); lead.remove(); }
  return { update, dispose, focus: () => faceAt(KIN_S - 4, -3), timeline: TL };
}
