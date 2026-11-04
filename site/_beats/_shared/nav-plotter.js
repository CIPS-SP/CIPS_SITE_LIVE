/* _beats/_shared/nav-plotter.js — the real "AIS and chart plotter" panel, ported to any beat.
 *
 * 25 Sep 2026, Simon: "the game is now also built into my site and assets... we should just be able to pull
 * from there." Right call — this is a genuine port (not a from-scratch guess) of `drawPlotter()` in
 * `_beats/seaway-wake/game.js` (~line 779 onward) and its `.plotter-box` markup in `game.html`/`game.css`: a
 * north-up 2D canvas chart — graticule, the pilotage route, the planned magenta track with waypoints, real
 * nautical seamark symbology, our own ship as a triangle with a heading line, a north arrow, a scale bar, the
 * "NOT FOR NAVIGATION" disclaimer, and an SOG/COG/XTE/DTW readout row — with the same pan/zoom/follow/
 * full-screen interaction. That code already lives inside CIPS/site (not CIPS/bring-her-in) — this reuses it
 * directly, generalised so any beat can mount one against its own geography data and a live position, rather
 * than only the one scripted crossing game.js itself drives.
 *
 * 25 Sep 2026, Simon: brought up to parity with the game's own plotter — the raster OpenStreetMap/EMODnet chart
 * (GEO.chart) and its real OSM seamark data now draw here too (same fallback to the hand-charted coast polygon
 * + hand-placed marks while the raster hasn't loaded, and same skip-if-the-data-already-has-it logic as
 * drawPlotter()), plus an optional pilot-boat marker (pilotOffset — a beat supplies its own, since a scripted
 * crossing has no real pilot object to read). Still left out: live AIS traffic targets — that needs a live feed
 * plumbed into the beat itself, which nothing here does yet; ask before building it, it's a separate piece of work.
 *
 * Usage:
 *   const plotter = mountNavPlotter(stage, { GEO, shipLatLng: () => [lat,lng], headingDeg: () => 96, speedKts: () => 12,
 *     assetsBase: ctx.base, pilotOffset: () => ({z, lane}) | null });   // z/lane in NM, ahead/starboard of the ship
 *   plotter.update(dt);   // every frame
 *   plotter.destroy();
 */
const DEG = Math.PI / 180;
const NM_PER_DEG_LAT = 60;
const MERC = lat => Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG));   // for the raster's Web Mercator plate (same as game.js's own MERC)

// a point z NM ahead / lane NM to starboard of a true heading from g — same idea as game.js's gMove()/geoToSim(),
// flattened (fine over the few NM a plotter panel ever shows)
function gOffset(g, hdgDeg, z, lane) {
  const cosLat = Math.cos(g[0] * DEG), h = hdgDeg * DEG;
  const dLat = (z * Math.cos(h) + lane * Math.cos(h + Math.PI / 2)) / NM_PER_DEG_LAT;
  const dLon = (z * Math.sin(h) + lane * Math.sin(h + Math.PI / 2)) / NM_PER_DEG_LAT / cosLat;
  return [g[0] + dLat, g[1] + dLon];
}

function greatCircle(a, b) {
  const cosLat = Math.cos(a[0] * DEG);
  const dNm = Math.hypot((b[0] - a[0]) * NM_PER_DEG_LAT, (b[1] - a[1]) * NM_PER_DEG_LAT * cosLat);
  const brgDeg = ((Math.atan2((b[1] - a[1]) * cosLat, b[0] - a[0]) / DEG) + 360) % 360;
  return { dNm, brgDeg };
}

// where a point falls against a route's legs: which leg, how far along it, and the perpendicular offset (nm) —
// same idea as game.js's own routeFix(), simplified for a scripted (not freely-steered) vessel.
function routeFix(pos, route) {
  const cosLat = Math.cos(pos[0] * DEG);
  const toXY = g => [g[1] * cosLat, g[0]];   // local flat-earth projection, nm-ish units, fine over a few nm
  const p = toXY(pos);
  let best = { i: 0, t: 0, xteNm: Infinity };
  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i]), b = toXY(route[i + 1]);
    const abx = b[0] - a[0], aby = b[1] - a[1], len2 = abx * abx + aby * aby || 1;
    let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2; t = Math.max(0, Math.min(1, t));
    const cx = a[0] + abx * t, cy = a[1] + aby * t, xteNm = Math.hypot(p[0] - cx, p[1] - cy) * NM_PER_DEG_LAT;
    if (xteNm < best.xteNm) best = { i, t, xteNm };
  }
  return best;
}

// 1 Oct 2026, Simon: "the route goes way too fast" led to checking the plotter's own readouts directly — XTE was
// reading several KM at times in noirmont-transit. Real cause: every drawing of the magenta "planned track" plus
// the XTE/next-waypoint fix (routeFix, above) was hardcoded to GEO.route — seaway-wake's own 4-point route. Her
// real position there DOES stay on GEO.route by construction, so this always worked for that beat, but
// noirmont-transit's own ship follows a different, longer route (GEO.pilotage.slice(3)) that continues well past
// GEO.route's own last waypoint — routeFix clamps its own `t` to [0,1], so once she's past GEO.route's end, XTE
// becomes the straight-line distance back to that now-distant, fixed last point, growing without bound as she
// continues. `route` is a new, optional param (default GEO.route, so seaway-wake's own call site is unchanged)
// for exactly this: the actual planned-track line the caller's own shipLatLng() is being driven along.
// 1 Oct 2026, Simon: "find oyster rocks and platte rk... make sure they are shown on the plate AND the
// plotter" — a couple of real marks (Platte Beacon, Oyster Beacon) exist in the real OSM seamark data without
// their own name tag; the beat's own 3D-scene markers can assign a name locally, but this file does its OWN
// independent fetch of the same JSON, so it never saw that. `markNames` (default none, so seaway-wake's own
// call site is unchanged) lets a caller supply the same position->name assignment here too, so the plotter's
// own label matches the plate's.
export function mountNavPlotter(stage, { GEO, route = GEO.route, shipLatLng, headingDeg = () => 0, speedKts = () => 0, compact = false, assetsBase = '', pilotOffset = null, markNames = [], zoomTarget = null, hiChart = null } = {}) {   // hiChart (4 Oct 2026): { src, meta } — a sharper chart of a small area, drawn over the main raster once the plotter is zoomed in past what the 3 m/px raster can show (the chart goes to blocks otherwise)   // zoomTarget (4 Oct 2026): () => px per NM the chart should be showing, e.g. following the scene's own zoom; null = leave the zoom to the visitor. A manual zoom/drag holds it off for 7 s.
  // 30 Sep 2026, Simon: "the chart in the plotter looks much lower resolution in the beat than in the game" —
  // traced it, not guessed: this stylesheet is fetched over the network (async), but plotSize() below measures
  // the canvas's real layout box SYNCHRONOUSLY, right after mount — and nothing else ever re-measures it outside
  // the "full screen" toggle. If that first measurement lands before this stylesheet has actually applied, the
  // canvas is still at the browser's bare default box (300×150, the standard unstyled <canvas> intrinsic size),
  // not the real 250×250 square — confirmed live: the beat's own plotter canvas backing store measured 600×300
  // (stretched, non-square) against game.html's correct 500×500 for the identical PW=250,PH=250,PS=1,PX=2
  // constants (already verified identical between this file and game.js's own drawPlotter()). Re-run plotSize()
  // once this stylesheet actually finishes loading, so a genuinely premature first measurement gets corrected.
  let cssLink = document.querySelector('link[data-nav-plotter-css]');
  if (!cssLink) { cssLink = document.createElement('link'); cssLink.rel = 'stylesheet'; cssLink.href = new URL('./nav-plotter.css', import.meta.url).href; cssLink.dataset.navPlotterCss = '1'; document.head.appendChild(cssLink); cssLink.addEventListener('load', () => plotSize()); }

  // the raster OpenStreetMap/EMODnet chart + its real OSM seamark data, same source game.js's own drawPlotter() reads;
  // GEO.chart's paths are relative to the seaway-wake folder, not this shared module, so the caller's own base applies
  // 29 Oct 2026 (performance): the charts are big images (the main one 7168 x 5888, 169 MB decoded; the harbour ones ~50 MB). Drawn whole, the browser could not keep them decoded and decoded them again on nearly every
  // draw: about 650 ms of main-thread time per second in the later beats. tools/plates-build/tile-charts.js cuts each into 1024 px tiles (+ a small overview) and adds `tiles` to its meta json; only the tiles on view are
  // loaded and drawn (the overview stands in for a tile that is still loading). A chart without `tiles` is drawn whole, as before.
  const rImg = R => R.tiles ? R.tiles.ov : R.img, rReady = R => { const i = rImg(R); return !!(R.meta && i && i.complete && i.naturalWidth); };
  function rInit(R, m, srcUrl) {   // R: { img, meta, tiles? } — call once the meta json is in
    R.meta = m;
    if (m.tiles) { const base = srcUrl.replace(/[^/]*$/, '') + m.tiles.dir, ov = new Image(); ov.addEventListener('load', () => { poke = true; }); ov.src = base + 'ov.webp'; R.tiles = { size: m.tiles.size, cols: m.tiles.cols, rows: m.tiles.rows, base, ov, imgs: new Map() }; }
    else { R.img.addEventListener('load', () => { poke = true; }); R.img.src = srcUrl; }
  }
  function tileImg(R, q, r) {
    const T = R.tiles, k = r * T.cols + q; let e = T.imgs.get(k);
    if (!e) { e = new Image(); e.addEventListener('load', () => { poke = true; }); e.src = T.base + 't-' + q + '-' + r + '.webp'; if (T.imgs.size > 20) { const first = T.imgs.keys().next().value; T.imgs.delete(first); } }
    else { T.imgs.delete(k); }
    T.imgs.set(k, e); return e;   // (most recently used last; the oldest are let go so the decoded tiles never pile up)
  }
  function drawRaster(c, R, sx0, sy0, sw, sh, dx, dy, dw, dh) {   // the part [sx0, sy0, sw, sh] of the chart's full image, onto [dx, dy, dw, dh]
    if (!R.tiles) { c.drawImage(R.img, sx0, sy0, sw, sh, dx, dy, dw, dh); return; }
    const T = R.tiles, S = T.size, W = R.meta.w, H = R.meta.h, kx = dw / sw, ky = dh / sh, ov = T.ov, ovK = ov.naturalWidth / W;
    const x0 = Math.max(0, sx0), y0 = Math.max(0, sy0), x1 = Math.min(W, sx0 + sw), y1 = Math.min(H, sy0 + sh); if (x1 <= x0 || y1 <= y0) return;
    for (let r = Math.floor(y0 / S); r <= Math.floor((y1 - 1) / S); r++) for (let q = Math.floor(x0 / S); q <= Math.floor((x1 - 1) / S); q++) {
      const tx = q * S, ty = r * S, ix0 = Math.max(x0, tx), iy0 = Math.max(y0, ty), ix1 = Math.min(x1, tx + S, W), iy1 = Math.min(y1, ty + S, H), t = tileImg(R, q, r), ok = t.complete && t.naturalWidth;
      const ddx = dx + (ix0 - sx0) * kx - 0.4, ddy = dy + (iy0 - sy0) * ky - 0.4, ddw = (ix1 - ix0) * kx + 0.8, ddh = (iy1 - iy0) * ky + 0.8;   // (a hair of overlap so no seam shows between tiles)
      if (ok) c.drawImage(t, ix0 - tx, iy0 - ty, ix1 - ix0, iy1 - iy0, ddx, ddy, ddw, ddh);
      else c.drawImage(ov, ix0 * ovK, iy0 * ovK, (ix1 - ix0) * ovK, (iy1 - iy0) * ovK, ddx, ddy, ddw, ddh);
    }
  }
  const chart = { img: new Image(), meta: null, tiles: null, marks: [] };
  if (GEO.chart) {
    fetch(assetsBase + GEO.chart.meta).then(r => r.json()).then(m => rInit(chart, m, assetsBase + GEO.chart.src)).catch(() => {});
    fetch(assetsBase + GEO.chart.marks).then(r => r.json()).then(j => { chart.marks = (j.marks || []).filter(m => m.type !== 'landmark' && m.type !== 'anchorage')
      .map(m => { if (m.name) return m; const hit = markNames.find(n => Math.abs(m.lat - n.match[0]) < 0.0005 && Math.abs(m.lon - n.match[1]) < 0.0005); return hit ? Object.assign({}, m, { name: hit.as }) : m; }); }).catch(() => {});
  }

  // Sharper charts over the main raster (23 Oct 2026): hiChart may be one spec or a list, drawn in order (a wide, lighter one first, then a closer, sharper one). Each: { src, meta, from, span } where it fades in over `span` once the zoom passes
  // `from` times the main raster's own scale (defaults 1.0 and 0.5: the original behaviour).
  const hiList = [].concat(hiChart || []).map(spec => ({ spec, img: new Image(), meta: null, tiles: null, wanted: false }));
  function needHi(h) { if (h.wanted) return; h.wanted = true; fetch(h.spec.meta).then(r => r.json()).then(m => rInit(h, m, h.spec.src + (m.v ? '?v=' + m.v : ''))).catch(() => {}); }
  const root = document.createElement('div');
  root.className = 'plotter-box' + (compact ? ' plotter-compact' : '');
  root.innerHTML = `
    <div class="plotter-top"><span>CHART PLOTTER</span><button type="button" class="pfollow" title="Follow the ship">⌖</button><button type="button" class="pfull" title="Full screen (Esc to leave)">⛶</button></div>
    <canvas class="plotter"></canvas>
    <div class="pz"><button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="out" title="Zoom out">−</button></div>
    <div class="plotter-data"><div><b data-plot="sog">0.0</b><span>SOG kn</span></div><div><b data-plot="cog">—</b><span>COG °T</span></div><div><b data-plot="xte">0 m ·</b><span>XTE</span></div><div><b data-plot="dtw">—</b><span data-plot="wpt">next</span></div></div>
  `;
  stage.appendChild(root);

  const canvas = root.querySelector('canvas.plotter'), pc = canvas.getContext('2d');
  const pro = { sog: root.querySelector('[data-plot="sog"]'), cog: root.querySelector('[data-plot="cog"]'), xte: root.querySelector('[data-plot="xte"]'), dtw: root.querySelector('[data-plot="dtw"]'), wpt: root.querySelector('[data-plot="wpt"]') };
  const box = root; let PW = 250, PH = 250, PS = 1; const PX = 2;
  function plotSize() {
    const full = root.classList.contains('plotter-full'); PS = full ? 1.6 : 1;
    const r = canvas.getBoundingClientRect();
    // guards a premature measurement (this stylesheet not yet applied — see mountNavPlotter's own comment
    // above) from corrupting the already-correct 250×250 default below with the browser's bare unstyled canvas
    // box: the real box is always square outside "full" mode (nav-plotter.css:13), so a non-square reading here
    // is exactly the un-styled-canvas symptom, not a real 250×250-vs-legitimately-different-size case.
    if (!r.width || !r.height || (!full && Math.abs(r.width - r.height) > 4)) return;
    PW = Math.max(100, Math.round((r.width || 250) / PS)); PH = Math.max(100, Math.round((r.height || 250) / PS));
    canvas.width = Math.round(PW * PS * PX); canvas.height = Math.round(PH * PS * PX);
  }
  canvas.width = Math.round(PW * PS * PX); canvas.height = Math.round(PH * PS * PX);   // correct default backing store immediately, before any DOM measurement — plotSize() only ever refines this once real layout is confirmed square (or corrects it later via the stylesheet's own load event above)
  plotSize();

  // starts centred on the route's own first waypoint, not a live shipLatLng() read — the caller's own position
  // getter can depend on state (e.g. a scroll progress variable) that isn't initialised until its own mount()
  // finishes, and this runs synchronously during that same mount(). The very first real update() call re-centres
  // it onto her actual position immediately after (the "follow" easing below), so nothing is visibly stale.
  const view = { follow: true, centre: route[0].slice(), pxPerNm: 62, idle: 0, zoomLock: 0 };
  let pDrag = null;
  box.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; pDrag = { x: e.clientX, y: e.clientY, c: view.centre.slice() }; box.setPointerCapture?.(e.pointerId); e.stopPropagation(); });
  box.addEventListener('pointermove', e => { if (!pDrag) return; const r = canvas.getBoundingClientRect(); const sx = PW / r.width; const dx = (e.clientX - pDrag.x) * sx, dy = (e.clientY - pDrag.y) * sx;
    const cosLat = Math.cos(pDrag.c[0] * DEG); view.centre = [pDrag.c[0] + dy / view.pxPerNm / 60, pDrag.c[1] - dx / view.pxPerNm / 60 / cosLat]; view.follow = false; view.idle = 0; e.stopPropagation(); });
  addEventListener('pointerup', () => { pDrag = null; });
  box.addEventListener('wheel', e => { e.preventDefault(); view.pxPerNm = Math.max(25, Math.min(3500, view.pxPerNm * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); view.follow = false; view.idle = 0; view.zoomLock = 7; }, { passive: false });
  root.querySelector('.pfollow').addEventListener('click', () => { view.follow = true; });
  root.querySelectorAll('.pz button').forEach(b => b.addEventListener('click', () => { view.pxPerNm = Math.max(25, Math.min(3500, view.pxPerNm * (b.dataset.z === 'in' ? 1.3 : 1 / 1.3))); view.idle = 0; view.zoomLock = 7; }));
  const fullBtn = root.querySelector('.pfull');
  fullBtn.addEventListener('click', () => { root.classList.toggle('plotter-full'); fullBtn.textContent = root.classList.contains('plotter-full') ? '⤡' : '⛶'; plotSize(); });
  const escHandler = e => { if (e.key === 'Escape' && root.classList.contains('plotter-full')) fullBtn.click(); };
  addEventListener('keydown', escHandler);

  function drawSeamark(c, m, x, y) {   // a subset of the game's own real chart symbology (GEO.marks' own k values)
    if (m.k === 'light') { c.fillStyle = '#fff'; c.strokeStyle = '#222'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 4, 0, 6.283); c.fill(); c.stroke(); c.fillStyle = '#d32f2f'; c.beginPath(); c.arc(x, y, 1.8, 0, 6.283); c.fill();
      c.fillStyle = '#334'; c.textAlign = 'left'; c.font = '600 7px Jost, system-ui, sans-serif'; c.fillText(m.name || '', x + 6, y - 1); if (m.chr) { c.font = '500 6px Jost, system-ui, sans-serif'; c.fillText(m.chr, x + 6, y + 6); } }
    else if (m.k === 'rock') { c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.stroke();
      if (m.name) { c.fillStyle = '#334'; c.textAlign = 'left'; c.font = '500 6px Jost, system-ui, sans-serif'; c.fillText(m.name, x + 5, y + 2); } }
    else if (m.k === 'pilot') { c.fillStyle = '#e01ea0'; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y); c.lineTo(x, y + 5); c.lineTo(x - 4, y); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x, y - 2.5); c.lineTo(x + 2, y); c.lineTo(x, y + 2.5); c.lineTo(x - 2, y); c.closePath(); c.fill();
      c.fillStyle = '#7a1660'; c.textAlign = 'left'; c.font = '600 7px Jost, system-ui, sans-serif'; c.fillText('Plt', x + 6, y + 3); }
    else if (m.k === 'anch') { c.strokeStyle = '#1b6fa8'; c.lineWidth = 1.2; c.setLineDash([2, 2]); c.beginPath(); c.arc(x, y, 7, 0, 6.283); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#1b6fa8'; c.textAlign = 'center'; c.font = '600 8px Jost, system-ui, sans-serif'; c.fillText('⚓', x, y + 3);
      c.textAlign = 'left'; c.font = '600 7px Jost, system-ui, sans-serif'; c.fillText(m.name || '', x + 9, y + 3); }
    else if (m.k === 'ncard') { c.fillStyle = '#111'; c.fillRect(x - 3, y - 2, 6, 6); c.fillStyle = '#f4c20d'; c.fillRect(x - 3, y - 2, 6, 3); c.fillStyle = '#111';
      c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x, y - 7); c.lineTo(x + 3, y - 3); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x - 3, y - 8); c.lineTo(x, y - 12); c.lineTo(x + 3, y - 8); c.closePath(); c.fill();
      c.fillStyle = '#334'; c.textAlign = 'left'; c.font = '600 7px Jost, system-ui, sans-serif'; c.fillText(m.name || '', x + 6, y + 3); }
    else if (m.k === 'wk') { c.strokeStyle = '#333'; c.lineWidth = 1; c.setLineDash([1.5, 1.5]); c.beginPath(); c.arc(x, y, 5, 0, 6.283); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#334'; c.textAlign = 'left'; c.font = '500 6px Jost, system-ui, sans-serif'; c.fillText('Wk', x + 7, y + 2); }
    else if (m.k === 'moor') { c.fillStyle = '#f4c20d'; c.beginPath(); c.arc(x, y, 2, 0, 6.283); c.fill(); }
    else if (m.k === 'label') { c.fillStyle = 'rgba(40,60,30,.8)'; c.textAlign = 'center'; c.font = '600 6.5px Jost, system-ui, sans-serif'; c.fillText(m.name || '', x, y); }
  }

  // the real OSM seamark symbology (GEO.chart.marks' own OSM tags), verbatim from game.js's drawSeamark()
  const lightChr = m => { const g = k => m['light:' + k] ?? m['light:1:' + k]; const ch = g('character'); if (!ch) return ''; const grp = g('group'), col = g('colour'), per = g('period');
    return ch + (grp ? '(' + grp + ')' : '') + (col ? { white: 'W', red: 'R', green: 'G', yellow: 'Y' }[col] || '' : '') + (per ? ' ' + per + 's' : ''); };
  function drawChartMark(c, m, x, y) {
    const t = m.type, top = (m['topmark:shape'] || ''), tc = m['topmark:colour'];
    const label = (m.name ? m.name + ' ' : '') + lightChr(m);
    const flare = () => { c.fillStyle = 'rgba(224,30,160,.85)'; c.beginPath(); c.moveTo(x + 1, y - 1); c.lineTo(x + 7, y - 6); c.lineTo(x + 4, y - 1.5); c.closePath(); c.fill(); };
    if (t === 'light_major' || t === 'light_minor') { c.fillStyle = '#111'; c.beginPath(); c.arc(x, y, t === 'light_major' ? 2.4 : 1.6, 0, 6.283); c.fill(); flare(); }
    else if (t === 'buoy_lateral' || t === 'beacon_lateral') { const port = m.category === 'port' || m.colour === 'red' || tc === 'red' || /can/.test(m.shape || ''); c.fillStyle = port ? '#d32f2f' : '#2e9e44'; c.beginPath();
      if (port) c.rect(x - 2.5, y - 4, 5, 5); else { c.moveTo(x, y - 5); c.lineTo(x + 3, y + 1); c.lineTo(x - 3, y + 1); c.closePath(); } c.fill(); if (t === 'beacon_lateral') { c.strokeStyle = '#111'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x, y + 5); c.stroke(); } if (m['light:character']) flare(); }
    else if (t === 'buoy_cardinal' || t === 'beacon_cardinal') { const up = /2 cones up/.test(top), down = /2 cones down/.test(top), base = /base together/.test(top), pt = /point together/.test(top);
      const bands = up ? ['#111', '#f4c20d'] : down ? ['#f4c20d', '#111'] : base ? ['#111', '#f4c20d', '#111'] : ['#f4c20d', '#111', '#f4c20d'];
      const h = 7, bh = h / bands.length; bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(x - 2, y - 2 + i * bh, 4, bh); });
      c.fillStyle = '#111'; const cone = (cy, upward) => { c.beginPath(); if (upward) { c.moveTo(x, cy - 2.6); c.lineTo(x + 2.2, cy); c.lineTo(x - 2.2, cy); } else { c.moveTo(x, cy); c.lineTo(x + 2.2, cy - 2.6); c.lineTo(x - 2.2, cy - 2.6); } c.closePath(); c.fill(); };
      if (up) { cone(y - 3, true); cone(y - 6, true); } else if (down) { cone(y - 3, false); cone(y - 6, false); } else if (base) { cone(y - 6, true); cone(y - 3, false); } else { cone(y - 3, true); cone(y - 6, false); }
      if (m['light:character']) flare(); }
    else if (t === 'beacon_isolated_danger' || t === 'buoy_isolated_danger') { c.fillStyle = '#111'; c.fillRect(x - 2, y - 2, 4, 3); c.fillStyle = '#d32f2f'; c.fillRect(x - 2, y + 1, 4, 3); c.fillStyle = '#111'; c.beginPath(); c.arc(x, y - 4, 1.4, 0, 6.283); c.arc(x, y - 7.2, 1.4, 0, 6.283); c.fill(); if (m['light:character']) flare(); }
    else if (t === 'buoy_special_purpose' || t === 'beacon_special_purpose') { c.fillStyle = '#f4c20d'; c.beginPath(); c.arc(x, y, 2.2, 0, 6.283); c.fill(); c.strokeStyle = '#8a6d00'; c.lineWidth = 0.8; c.stroke(); if (/x-shape/.test(top)) { c.strokeStyle = '#111'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 2, y - 6); c.lineTo(x + 2, y - 2.5); c.moveTo(x + 2, y - 6); c.lineTo(x - 2, y - 2.5); c.stroke(); } if (m['light:character']) flare(); }
    else if (t === 'pilot_boarding') { c.fillStyle = '#e01ea0'; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y); c.lineTo(x, y + 5); c.lineTo(x - 4, y); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.font = '700 6px Jost, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('P', x, y + 2.2); }
    else if (t === 'rock') { c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke(); c.fillStyle = '#333'; [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a, y + b, 0.7, 0, 6.283); c.fill(); }); }
    else if (t === 'wreck') { c.strokeStyle = '#333'; c.lineWidth = 1; c.setLineDash([1.5, 1.5]); c.beginPath(); c.arc(x, y, 5, 0, 6.283); c.stroke(); c.setLineDash([]); }
    else return;
    if (label) { c.fillStyle = '#334'; c.font = '600 6.5px Jost, system-ui, sans-serif'; c.textAlign = 'left'; c.fillText(label, x + 6, y + 3); }
  }

  // 29 Oct 2026 (performance): the plotter is a small panel; redrawing it 60 times a second (every stroke, label and chart tile) cost more than the scene behind it. It now redraws at most about 15 times a second
  // (full rate in the full-screen view, at once on any touch or when a chart tile arrives) and not at all while it is off screen. Everything that moved per frame now moves by elapsed time instead.
  let lastDrawAt = 0, drawVisible = true, poke = true;
  function draw() {
    if (!drawVisible) return;
    const now = performance.now(); if (!poke && now - lastDrawAt < 64 && !root.classList.contains('plotter-full')) return;
    poke = false; lastDrawAt = now; drawNow();
  }
  function drawNow() {
    const me = shipLatLng ? shipLatLng() : route[0];
    // the zoom follows the scene's zoom by TIME, not by frame (23 Oct 2026): 12% of the gap per frame at 60 fps is about 7.7 per second, so a slow frame rate no longer leaves the plotter lagging well behind the scene
    const nowT = performance.now(), dtZ = Math.min(0.25, Math.max(0.001, (nowT - (view.lastT || nowT - 16.7)) / 1000)); view.lastT = nowT;
    if (view.zoomLock > 0) view.zoomLock -= dtZ;
    if (zoomTarget && view.zoomLock <= 0) { const t = zoomTarget(); if (t > 0) view.pxPerNm = Math.max(25, Math.min(3500, view.pxPerNm * Math.pow(t / view.pxPerNm, 1 - Math.exp(-7.7 * dtZ)))); }
    if (!view.follow) { view.idle += dtZ; if (view.idle > 7) view.follow = true; }
    if (view.follow) { const kC = 1 - Math.pow(0.8, dtZ * 60); view.centre = [lerp1(view.centre[0], me[0], kC), lerp1(view.centre[1], me[1], kC)]; }
    const K = view.pxPerNm, C = view.centre, cosLat = Math.cos(C[0] * DEG);
    const X = g => PW / 2 + (g[1] - C[1]) * 60 * cosLat * K, Y = g => PH / 2 - (g[0] - C[0]) * 60 * K;
    const c = pc; c.setTransform(PX * PS, 0, 0, PX * PS, 0, 0); c.clearRect(0, 0, PW, PH);
    c.fillStyle = '#d6e9f3'; c.fillRect(0, 0, PW, PH);
    const rasterOn = rReady(chart);
    if (rasterOn) {   // the real chart: Mercator plate → this equirectangular window (locally the same shape; the difference over 5 M is under a pixel)
      const b = chart.meta.bounds, iw = chart.meta.w || chart.img.naturalWidth, ih = chart.meta.h || chart.img.naturalHeight; const mN = MERC(b.north), mS = MERC(b.south);
      const px = g => [(g[1] - b.west) / (b.east - b.west) * iw, (mN - MERC(g[0])) / (mN - mS) * ih];
      const tl = [C[0] + (PH / 2) / K / 60, C[1] - (PW / 2) / K / 60 / cosLat], br = [C[0] - (PH / 2) / K / 60, C[1] + (PW / 2) / K / 60 / cosLat];
      const [sx0, sy0] = px(tl), [sx1, sy1] = px(br); drawRaster(c, chart, sx0, sy0, sx1 - sx0, sy1 - sy0, 0, 0, PW, PH);
    }
    // the sharper chart over it, faded in as the main raster starts to pixelate (it covers just its own area; outside it the main chart carries on)
    if (hiList.length && rasterOn) {
      const nat = (chart.meta.w || chart.img.naturalWidth) / ((chart.meta.bounds.east - chart.meta.bounds.west) * 60 * cosLat), tl = [C[0] + (PH / 2) / K / 60, C[1] - (PW / 2) / K / 60 / cosLat], br = [C[0] - (PH / 2) / K / 60, C[1] + (PW / 2) / K / 60 / cosLat];
      for (const h of hiList) {
        const a = Math.max(0, Math.min(1, (K / nat - (h.spec.from ?? 1.0)) / (h.spec.span ?? 0.5)));
        if (a > 0) needHi(h);
        if (a > 0 && rReady(h)) {
          const b = h.meta.bounds, iw = h.meta.w || h.img.naturalWidth, ih = h.meta.h || h.img.naturalHeight, mN = MERC(b.north), mS = MERC(b.south);
          const n = Math.min(tl[0], b.north), s = Math.max(br[0], b.south), w = Math.max(tl[1], b.west), e = Math.min(br[1], b.east);
          if (n > s && e > w) {
            const px = g => [(g[1] - b.west) / (b.east - b.west) * iw, (mN - MERC(g[0])) / (mN - mS) * ih], [sx0, sy0] = px([n, w]), [sx1, sy1] = px([s, e]);
            const dx0 = X([n, w]), dy0 = Y([n, w]), dx1 = X([s, e]), dy1 = Y([s, e]);
            c.imageSmoothingQuality = 'high'; c.globalAlpha = a; drawRaster(c, h, sx0, sy0, sx1 - sx0, sy1 - sy0, dx0, dy0, dx1 - dx0, dy1 - dy0); c.globalAlpha = 1;
          }
        }
      }
    }
    // graticule every 0.01°
    c.strokeStyle = 'rgba(0,60,90,.08)'; c.lineWidth = 1;
    const lon0 = Math.floor((C[1] - PW / 2 / K / 60 / cosLat) * 100) / 100, lon1 = C[1] + PW / 2 / K / 60 / cosLat;
    for (let lon = lon0; lon <= lon1; lon += 0.01) { const x = X([0, lon]); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, PH); c.stroke(); }
    const lat0 = Math.floor((C[0] - PH / 2 / K / 60) * 100) / 100, lat1 = C[0] + PH / 2 / K / 60;
    for (let lat = lat0; lat <= lat1; lat += 0.01) { const y = Y([lat, 0]); c.beginPath(); c.moveTo(0, y); c.lineTo(PW, y); c.stroke(); }
    // the land: the coast polyline closed away to the north (the same real, checked outline GEO.coast carries) — only while the raster hasn't loaded
    if (!rasterOn && GEO.coast?.length) { c.fillStyle = '#e9dcb6'; c.strokeStyle = '#b39b62'; c.lineWidth = 1.2; c.beginPath();
      GEO.coast.forEach((g, i) => i ? c.lineTo(X(g), Y(g)) : c.moveTo(X(g), Y(g)));
      const last = GEO.coast[GEO.coast.length - 1]; c.lineTo(X([49.30, last[1]]), Y([49.30, last[1]])); c.lineTo(X([49.30, GEO.coast[0][1]]), Y([49.30, GEO.coast[0][1]])); c.closePath(); c.fill(); c.stroke(); }
    // the wider pilotage route on to St Helier, if supplied (dashed grey — the line the pilots use)
    if (GEO.pilotage?.length) { c.strokeStyle = 'rgba(60,70,80,.55)'; c.lineWidth = 1; c.setLineDash([6, 3]); c.beginPath();
      GEO.pilotage.forEach((g, i) => i ? c.lineTo(X(g), Y(g)) : c.moveTo(X(g), Y(g))); c.stroke(); c.setLineDash([]); }
    // leading lines (23 Oct 2026, Simon): optional GEO.leadLines = [[[lat, lng], [lat, lng]], ...], each drawn dashed in the same grey as the pilotage line (the transits a vessel steers on into a harbour)
    if (GEO.leadLines?.length) { c.strokeStyle = 'rgba(60,70,80,.55)'; c.lineWidth = 1; c.setLineDash([6, 3]); for (const [p, q] of GEO.leadLines) { c.beginPath(); c.moveTo(X(p), Y(p)); c.lineTo(X(q), Y(q)); c.stroke(); } c.setLineDash([]); }
    // the planned track, magenta, with the waypoints
    c.strokeStyle = '#e01ea0'; c.lineWidth = 1.7; c.beginPath(); route.forEach((g, i) => i ? c.lineTo(X(g), Y(g)) : c.moveTo(X(g), Y(g))); c.stroke();
    route.forEach(g => { c.beginPath(); c.arc(X(g), Y(g), 3, 0, 6.283); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#e01ea0'; c.lineWidth = 1.4; c.stroke(); });
    // course to steer from where she is now: dashed, to the next waypoint
    const fix = routeFix(me, route), nextWp = route[fix.i + 1] || route[route.length - 1];
    c.strokeStyle = '#e01ea0'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(me), Y(me)); c.lineTo(X(nextWp), Y(nextWp)); c.stroke(); c.setLineDash([]);
    // marks: the charted seamarks (real OSM data) where we have them — then our own hand-placed labels, moorings and anchorage
    if (chart.marks.length) { for (const m of chart.marks) { const x = X([m.lat, m.lon]), y = Y([m.lat, m.lon]); if (x < -20 || x > PW + 20 || y < -20 || y > PH + 20) continue; drawChartMark(c, m, x, y); }
      if (GEO.corbiere) { const L = GEO.corbiere.at, x = X(L), y = Y(L), r = 22; for (const [a, b, col] of GEO.corbiere.sectors || []) { c.strokeStyle = col === 'R' ? 'rgba(211,47,47,.8)' : 'rgba(40,40,40,.5)'; c.lineWidth = col === 'R' ? 2 : 1; c.beginPath(); c.arc(x, y, r, (a - 90) * DEG, (b - 90) * DEG); c.stroke(); } } }
    c.font = '600 7px Jost, system-ui, sans-serif';
    for (const m of GEO.marks || []) { const x = X(m.at), y = Y(m.at); if (x < -20 || x > PW + 20 || y < -20 || y > PH + 20) continue;
      if (chart.marks.length && !/^(anch|moor|label)$/.test(m.k)) continue;   // the data has the rest
      drawSeamark(c, m, x, y); c.font = '600 7px Jost, system-ui, sans-serif'; }
    // Corbière's light sectors, if this leg's data has it and the chart data hasn't already drawn them — a real chart shows red exactly where she'd see it
    if (!chart.marks.length && GEO.corbiere) { const L = GEO.corbiere.at, x = X(L), y = Y(L), r = 22;
      for (const [a, b, col] of GEO.corbiere.sectors || []) { c.strokeStyle = col === 'R' ? 'rgba(211,47,47,.8)' : 'rgba(40,40,40,.5)'; c.lineWidth = col === 'R' ? 2 : 1; c.beginPath(); c.arc(x, y, r, (a - 90) * DEG, (b - 90) * DEG); c.stroke(); } }
    // the pilot launch, if the caller supplies one (a scripted beat has no real pilot object — it works out its own offset)
    if (pilotOffset) { const off = pilotOffset(); if (off) { const g = gOffset(me, headingDeg(), off.z, off.lane); c.fillStyle = '#e8590c'; c.beginPath(); c.arc(X(g), Y(g), 2.5, 0, 6.283); c.fill(); } }
    // our ship, with its heading line
    const hdg = headingDeg(); const sx = X(me), sy = Y(me);
    c.save(); c.translate(sx, sy); c.rotate(hdg * DEG); c.strokeStyle = 'rgba(0,0,0,.4)'; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -Math.max(20, speedKts() * 2.5)); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(0, -7); c.lineTo(4, 5); c.lineTo(0, 3); c.lineTo(-4, 5); c.closePath(); c.fill(); c.restore();
    // north arrow and scale bar
    c.fillStyle = '#334'; c.font = '600 8px Jost, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('N', PW - 12, 12);
    c.beginPath(); c.moveTo(PW - 12, 16); c.lineTo(PW - 15, 24); c.lineTo(PW - 9, 24); c.closePath(); c.fill();
    // the scale bar follows the zoom (5 Oct 2026, Simon: it was fixed at 0.5 nm): the first round distance that makes a bar at least ~36 px long
    const mPerPx = 1852 / K, bars = [2, 5, 10, 20, 50, 100, 200, 500, 926, 1852, 3704, 9260], barM = bars.find(m => m / mPerPx >= 36) || bars[bars.length - 1], barPx = barM / mPerPx;
    c.strokeStyle = '#334'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(8, PH - 8); c.lineTo(8 + barPx, PH - 8); c.moveTo(8, PH - 10.5); c.lineTo(8, PH - 5.5); c.moveTo(8 + barPx, PH - 10.5); c.lineTo(8 + barPx, PH - 5.5); c.stroke();
    c.font = '500 6.5px Jost, system-ui, sans-serif'; c.textAlign = 'left'; c.fillText(barM < 926 ? barM + ' m' : (barM / 1852) + ' nm', 8, PH - 12);
    c.fillStyle = 'rgba(120,20,30,.85)'; c.font = '700 6.5px Jost, system-ui, sans-serif'; c.textAlign = 'right'; c.fillText('NOT FOR NAVIGATION', PW - 6, PH - 5);
    if (rasterOn) { c.fillStyle = 'rgba(40,50,60,.7)'; c.font = '500 5.5px Jost, system-ui, sans-serif'; c.fillText('© OpenStreetMap contributors · EMODnet', PW - 6, PH - 13); }
    // readouts — dNm/brgDeg for the waypoint reuse the same real geography, not a separate guess
    const gc = greatCircle(me, nextWp), xteM = fix.xteNm * 1852;
    pro.sog.textContent = speedKts().toFixed(1); pro.cog.textContent = String(Math.round(((hdg % 360) + 360) % 360)).padStart(3, '0');
    pro.xte.textContent = (xteM < 5 ? '0' : Math.round(xteM)) + ' m'; pro.dtw.textContent = gc.dNm.toFixed(2);
    pro.wpt.textContent = GEO.names ? (GEO.names[fix.i + 1] || GEO.names[GEO.names.length - 1]) : 'next wpt';
  }
  const lerp1 = (a, b, t) => a + (b - a) * t;
  // a plain sea-colour fill only, so the panel isn't pure-blank before the host's own first update() call — NOT
  // a call to draw() itself, which reads the caller's shipLatLng()/headingDeg() getters; those can depend on
  // state (e.g. a scroll progress variable) that only exists once the host's own mount() has fully finished,
  // and this constructor runs synchronously inside that same mount().
  pc.setTransform(PX * PS, 0, 0, PX * PS, 0, 0); pc.fillStyle = '#d6e9f3'; pc.fillRect(0, 0, PW, PH);

  function destroy() { removeEventListener('keydown', escHandler); root.remove(); }
  for (const evn of ['pointerdown', 'pointermove', 'wheel', 'click', 'keydown']) root.addEventListener(evn, () => { poke = true; }, { passive: true });   // a touch redraws at once
  addEventListener('resize', () => { poke = true; }, { passive: true });
  new IntersectionObserver(es => { drawVisible = es[es.length - 1].isIntersecting; if (drawVisible) poke = true; }).observe(root);   // nothing to draw while the panel is off screen
  return { update: draw, destroy, root, view };   // (view: the plotter's own zoom / centre, for the beats' debug hooks)
}
