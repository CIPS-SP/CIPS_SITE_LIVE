/* _beats/globe-live/live.js — the LIVE layers on top of the dot-matrix globe (HLC Globe Lab, 15 Sep 2026).
   Three things, all optional, all fed by one AIS registry:
     1. aisPts   — every vessel heard on the feed, as a small cool-white dot on the sphere (front hemisphere only, like the land)
     2. heatMesh — traffic density over the Atlantic Gateway: a raster draped on the Channel whose brightness is a seeded
                   lane prior (the TSS corridors) PLUS everything the live feed has reported since the lab was first opened
                   (accumulated in localStorage, so the picture sharpens the longer the lab is left running)
     3. picker   — "Captains: find your ship": search the live registry by name / MMSI, select → the ship is lit orange,
                   an orange comet arc runs from her to the Channel Islands, the globe turns to hold both in view, a card shows
                   distance / bearing / ETA to St Helier, and "Take me in" hands the page the ship and starts the sequence.
   Feed: aisstream.io over a browser WebSocket (free key in ../../lab-config.js). No key / no socket → a simulated fleet on the
   real lanes, clearly labelled SIMULATED, so the design can be reviewed without the internet.
   Nothing here reads window.scrollY or touches another beat's DOM. */
import * as THREE from 'three152';
import { CSS2DObject } from 'three152/addons/renderers/CSS2DRenderer.js';
import { initFlights } from './flights.js?v=15';   // live flights to / from the islands (deep zoom only), own switch in the strip

const CI_PORT = { lat: 49.18, lng: -2.12, name: 'St Helier' };
const DEG = Math.PI / 180, R_NM = 3440.065;
const gc = (a, b) => { const φ1 = a.lat * DEG, φ2 = b.lat * DEG, dλ = (b.lng - a.lng) * DEG; const x = Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2; return 2 * Math.asin(Math.sqrt(x)) * R_NM; };
const bearing = (a, b) => { const φ1 = a.lat * DEG, φ2 = b.lat * DEG, dλ = (b.lng - a.lng) * DEG; const y = Math.sin(dλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ); return ((Math.atan2(y, x) / DEG) + 360) % 360; };
const smooth01 = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const fmtNm = n => n >= 100 ? Math.round(n) + ' nm' : n.toFixed(1) + ' nm';
const fmtEta = h => !isFinite(h) || h <= 0 ? '—' : h < 1 ? Math.round(h * 60) + ' min' : h < 48 ? Math.round(h) + ' h' : (h / 24).toFixed(1) + ' days';
/* colour by AIS ship type — the convention every captain reads at a glance: cargo green, tanker red, passenger blue,
   high-speed craft yellow, tugs / pilot / special craft teal, fishing orange, pleasure & sailing magenta, unknown grey */
export const typeColor = t => t == null ? '#b9c4d2' : t >= 70 && t <= 79 ? '#4fd15a' : t >= 80 && t <= 89 ? '#ff4d4d' : t >= 60 && t <= 69 ? '#3d8bff' : t >= 40 && t <= 49 ? '#ffe14d' : t === 30 ? '#ff9a3d' : (t === 36 || t === 37) ? '#ff5cf0' : ((t >= 31 && t <= 32) || (t >= 50 && t <= 59)) ? '#3ee6e0' : t === 35 ? '#9aa4b2' : '#d9e2ec';
const typeName = t => t == null ? '' : t >= 80 && t <= 89 ? 'Tanker' : t >= 70 && t <= 79 ? 'Cargo' : t >= 60 && t <= 69 ? 'Passenger' : t === 37 ? 'Pleasure' : t === 36 ? 'Sailing' : t === 30 ? 'Fishing' : t >= 40 && t <= 49 ? 'High-speed craft' : t === 50 ? 'Pilot' : t === 52 ? 'Tug' : t === 31 || t === 32 ? 'Towing' : t === 33 ? 'Dredger' : t === 35 ? 'Military' : t === 51 ? 'Search & rescue' : t === 55 ? 'Law enforcement' : '';
/* 14 Oct 2026, Simon: type and LOA shown small beside the vessel name in the finder list and the voyage card ("Pleasure · 38 m") */
/* 14 Oct 2026: a vessel that is stopped shows "0.0 kn", not a dash (a dash looked like missing data); AIS course 360 means "not available" */
const fmtSpdCog = s => (s.sog != null && s.last ? s.sog.toFixed(1) + ' kn' : '—') + ' / ' + (s.cog != null && s.cog < 360 && (s.sog || 0) > 0.3 ? Math.round(s.cog) + '°' : '—');
const metaLine = (type, len) => [typeName(type), len > 0 ? Math.round(len) + ' m' : ''].filter(Boolean).join(' · ');

/* ---------- Channel density grid (the Atlantic Gateway) ---------- */
const GRID = { lonMin: -8.0, lonMax: 4.0, latMin: 47.3, latMax: 52.4, step: 0.055 };
// seeded lane prior: the corridors every mariner knows — Ushant → Casquets → Dover (both lanes), the CI approaches, Solent, Biscay
const LANES = [
  { w: 1.0, pts: [[-6.3, 48.3], [-5.3, 48.9], [-3.5, 49.55], [-2.6, 49.95], [-1.2, 50.25], [0.4, 50.45], [1.3, 50.85], [1.6, 51.05]] },   // up-Channel lane (north side)
  { w: 1.0, pts: [[-6.2, 48.15], [-5.2, 48.7], [-3.4, 49.35], [-2.5, 49.75], [-1.1, 50.05], [0.5, 50.25], [1.45, 50.7], [1.75, 50.95]] }, // down-Channel lane (south side)
  { w: 0.55, pts: [[-2.12, 49.18], [-2.4, 49.4], [-2.7, 49.7], [-3.0, 49.9]] },         // St Helier → Casquets
  { w: 0.45, pts: [[-2.12, 49.18], [-2.0, 48.9], [-2.02, 48.66]] },                     // Jersey → St Malo
  { w: 0.45, pts: [[-2.54, 49.46], [-2.9, 49.75], [-3.4, 50.1], [-4.1, 50.35]] },       // St Peter Port → Plymouth
  { w: 0.5, pts: [[-1.3, 50.75], [-1.2, 50.6], [-1.0, 50.45], [-0.6, 50.3]] },          // Solent / Nab
  { w: 0.4, pts: [[-4.15, 50.33], [-4.5, 50.0], [-5.0, 49.6], [-5.6, 49.2]] },          // Plymouth → Ushant approaches
  { w: 0.6, pts: [[-7.5, 47.4], [-6.6, 47.9], [-6.0, 48.25]] },                          // Biscay → Ushant
  { w: 0.35, pts: [[-1.5, 49.65], [-1.6, 49.9], [-1.8, 50.2]] },                         // Cherbourg out
  { w: 0.3, pts: [[0.1, 49.45], [-0.2, 49.6], [-0.6, 49.9]] }                            // Le Havre / Seine approaches
];
function buildGrid() {
  const cols = Math.ceil((GRID.lonMax - GRID.lonMin) / GRID.step), rows = Math.ceil((GRID.latMax - GRID.latMin) / GRID.step);
  const prior = new Float32Array(cols * rows);
  const cosLat = Math.cos(49.9 * DEG);
  const segs = [];
  for (const L of LANES) for (let i = 0; i + 1 < L.pts.length; i++) segs.push({ a: L.pts[i], b: L.pts[i + 1], w: L.w });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lon = GRID.lonMin + (c + 0.5) * GRID.step, lat = GRID.latMin + (r + 0.5) * GRID.step;
    let v = 0;
    for (const s of segs) {
      // distance (deg, lon scaled) from the cell to the segment
      const ax = s.a[0] * cosLat, ay = s.a[1], bx = s.b[0] * cosLat, by = s.b[1], px = lon * cosLat, py = lat;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      v = Math.max(v, s.w * Math.exp(-(d * d) / (2 * 0.09 * 0.09)));   // ~0.09° sigma ≈ 5–6 nm lane half-width (max, not sum — summing doubled up at every waypoint and made blobs)
    }
    prior[r * cols + c] = Math.min(1.4, v);
  }
  return { cols, rows, prior, live: new Float32Array(cols * rows) };
}
const cellOf = (lng, lat, g) => { if (lng < GRID.lonMin || lng >= GRID.lonMax || lat < GRID.latMin || lat >= GRID.latMax) return -1; return Math.floor((lat - GRID.latMin) / GRID.step) * g.cols + Math.floor((lng - GRID.lonMin) / GRID.step); };

/* ---------- simulated fleet (no key / offline) ---------- */
const SIM_NAMES = ['AURORA', 'KINSHIP', 'SAVANNAH', 'LADY M', 'ELYSIUM', 'NORTHERN STAR', 'ATLANTIC GOOSE', 'MAERSK ESSEX', 'CMA CGM RHONE', 'STENA HORIZON', 'SEAWAYS PILOT', 'COMMODORE CLIPPER', 'CONDOR LIBERATION', 'BRITTANY FERRIES', 'LA GRANDE HERMINE', 'OCEAN PEARL', 'SILVER WIND', 'BLUE MARLIN', 'GRACE E', 'ODYSSEY', 'TRIDENT', 'WHITE SWAN', 'JERSEY SPIRIT', 'HELIER', 'ORCA', 'CORSAIR', 'RUBIS ATLANTIC', 'DUCHESS', 'SEA HAWK', 'MISTRAL'];
const SIM_ROUTES = [  // [lon,lat] waypoints — Med, Biscay, Channel, North Sea, Atlantic crossing
  [[-5.4, 36.1], [-9.5, 37.5], [-9.8, 42.5], [-7.0, 46.5], [-6.0, 48.2], [-3.4, 49.35], [-1.1, 50.05], [1.5, 50.8], [2.5, 51.9]],
  [[2.5, 51.95], [1.4, 51.0], [0.4, 50.45], [-1.2, 50.25], [-2.6, 49.95], [-5.3, 48.9], [-6.5, 47.8], [-9.6, 43.0], [-9.4, 38.0], [-5.6, 36.0]],
  [[-63.0, 18.0], [-50.0, 30.0], [-30.0, 40.0], [-12.0, 46.0], [-6.2, 48.2], [-3.0, 49.5], [-2.12, 49.18]],
  [[7.4, 43.7], [5.0, 42.0], [3.5, 39.5], [-1.0, 36.6], [-5.4, 36.0], [-9.3, 38.5], [-9.9, 43.5], [-6.5, 47.9], [-4.5, 49.0], [-2.12, 49.18]],
  [[-2.12, 49.18], [-2.02, 48.66]], [[-2.12, 49.18], [-1.62, 49.64]], [[-2.54, 49.46], [-1.3, 50.75]], [[-2.12, 49.18], [-3.4, 50.1], [-4.15, 50.33]],
  [[-74.0, 40.7], [-60.0, 42.5], [-40.0, 47.0], [-20.0, 49.5], [-6.0, 49.6], [-2.6, 49.95], [1.6, 51.05]],
  [[-1.4, 50.9], [-1.1, 50.05], [-1.62, 49.64]], [[-5.07, 50.15], [-6.0, 48.2], [-8.0, 44.0]]
];
function makeSim(n = 420) {
  const ships = [];
  for (let i = 0; i < n; i++) {
    const route = SIM_ROUTES[i % SIM_ROUTES.length]; const dir = Math.random() < 0.5 ? 1 : -1;
    const t = Math.random(), sog = 6 + Math.random() * 14;
    const big = i % 5 === 0;
    ships.push({ mmsi: 900000000 + i, name: (big ? '' : 'M/Y ') + SIM_NAMES[i % SIM_NAMES.length] + (i >= SIM_NAMES.length ? ' ' + (1 + Math.floor(i / SIM_NAMES.length)) : ''), type: big ? 70 : 37, route, dir, t, sog, cog: 0, lat: 0, lng: 0, last: 0 });
  }
  const place = (s, dt) => {
    const segs = s.route.length - 1; s.t += s.dir * dt * (s.sog / 3600) / (segs * 60 * 1.2); // rough: route legs ≈ 60–70 nm each
    if (s.t > 1 || s.t < 0) { s.dir *= -1; s.t = Math.max(0, Math.min(1, s.t)); }
    const f = s.t * segs, k = Math.min(segs - 1, Math.floor(f)), u = f - k; const a = s.route[k], b = s.route[k + 1];
    s.lng = a[0] + (b[0] - a[0]) * u; s.lat = a[1] + (b[1] - a[1]) * u;
    s.cog = bearing({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] }); if (s.dir < 0) s.cog = (s.cog + 180) % 360; s.last = Date.now();
  };
  ships.forEach(s => place(s, 0));
  return { ships, step: dt => ships.forEach(s => place(s, dt)) };
}

/* ---------- main ---------- */
export async function initLive(g) {
  // g: { THREE-free helpers from beat.js } — lonLatToVec3, makeArc, globe, CFG, SPRITE, worldFade, labelObjs, stage, host, makePoints, CI, faceQuat(lng,lat,northUp)
  const { lonLatToVec3, makeArc, globe, CFG, SPRITE, worldFade, labelObjs, stage, makePoints, camera, host } = g;
  let cfg = { AIS_KEY: '', AIS_BBOX: [[[25, -85], [66, 30]]], AIS_URL: 'wss://stream.aisstream.io/v0/stream', SIM_SHIPS: 420, DENSITY_GRID: true, TRAILS: true, HISTORY_BBOX: [[[43, -12], [54, 6]]], BUFFER_URL: 'http://localhost:8082' };
  if (g.config && typeof g.config === 'object') Object.assign(cfg, g.config);                         // the page's options.ais (CIPS/site) — BUFFER_URL etc.
  else { try { const m = await import('../../lab-config.js'); Object.assign(cfg, m.default || m); } catch (_) { /* no config → simulated */ } }   // the lab

  let priorW = 0.55;   // the hand-seeded lanes' weight: dropped to 0 once real tracks are in (the sea then shows only what ships have actually done)
  const registry = new Map();      // mmsi → { mmsi, name, lat, lng, sog, cog, type, last }
  const trails = new Map();        // mmsi → [[lat, lng], …] recent track (Gateway window only), oldest first
  const TRAIL_MAX = 6, WIN = { latMin: 43, lngMin: -12, latMax: 54, lngMax: 6 };   // where trails are kept (the recorder's box)
  const inWin = (lat, lng) => lat >= WIN.latMin && lat <= WIN.latMax && lng >= WIN.lngMin && lng <= WIN.lngMax;
  window.LAB_AIS = { registry, trails, inWin, typeColor, mode: () => mode, get enabled() { return enabled; } };   // read by channel-night's overlay (same page, read-only)
  let mode = 'connecting', msgCount = 0, lastRender = 0;
  const ui = {
    status: stage.querySelector('[data-live="status"]'), count: stage.querySelector('[data-live="count"]'), channel: stage.querySelector('[data-live="channel"]'),
    input: stage.querySelector('[data-live="search"]'), list: stage.querySelector('[data-live="results"]'), card: stage.querySelector('[data-live="card"]'),
    panel: stage.querySelector('[data-live="panel"]'), follow: stage.querySelector('[data-live="follow"]'), clear: stage.querySelector('[data-live="clear"]')
  };
  /* --- the AIS control: a small fixed strip for the WHOLE page (visible in every beat, in port or not), sitting just above the
         colour key (which toggles with it) — the status pill
         (AIS Live / Loading / Snapshot / Simulated / Error) and an on/off switch. Off = every live element (dots, tracks, icons,
         density, the picker, the key, the chosen ship) hidden and the feed left alone; defaults to ON, a switch-off lasts the visit
         (sessionStorage hlc_ais_on). Other beats read window.LAB_AIS.enabled / listen for 'ais:toggle' (16 Sep 2026). --- */
  let enabled = true; try { enabled = sessionStorage.getItem('hlc_ais_on') !== '0'; } catch (_) {}   // defaults to ON on every visit; a switch-off lasts for the visit (tab) only
  let control = document.getElementById('aisControl');
  if (!control) {
    const css = document.createElement('style'); css.textContent = `
#aisControl{position:fixed;left:5vw;top:calc(9vh - 34px);z-index:9998;display:flex;align-items:center;gap:8px;padding:5px 8px 5px 10px;border-radius:999px;background:rgba(6,10,18,.78);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(8px);font:500 10px 'Jost',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#cfe6ff;user-select:none}
#aisControl .lmode{display:inline-flex;align-items:center;gap:7px;color:#cfe6ff;cursor:pointer}
#aisControl .lmode:hover{color:#fff}
#aisControl .lmode i{width:7px;height:7px;border-radius:50%;background:#7fb2ab}
#aisControl .lmode.wait i{background:#FFB247;animation:lpulse 1s ease-in-out infinite}
#aisControl .lmode.live{color:#7CE3B4}#aisControl .lmode.live i{background:#3ED598;box-shadow:0 0 8px #3ED598;animation:lpulse 1.6s ease-in-out infinite}
#aisControl .lmode.sim{color:#FFB247}#aisControl .lmode.sim i{background:#FFB247}
#aisControl .lmode.err{color:#ff7b7b}#aisControl .lmode.err i{background:#ff5555}
#aisControl.off .lmode{color:#7f8b99}#aisControl.off .lmode i{background:#55606d;box-shadow:none;animation:none}
#aisControl button{appearance:none;border:0;cursor:pointer;width:34px;height:18px;border-radius:999px;background:#3ED598;position:relative;transition:background .2s;padding:0}
#aisControl button::after{content:"";position:absolute;top:2px;left:18px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .2s}
#aisControl.off button{background:#55606d}#aisControl.off button::after{left:2px}
#aisControl span.w{color:#9fb1c4;font-size:9px}
@keyframes lpulse{0%,100%{opacity:1}50%{opacity:.35}}
.beat-stage.ais-off [data-live="panel"],.beat-stage.ais-off [data-live="key"],.beat-stage.ais-off .lshipcard,.beat-stage.ais-off .lhover,.beat-stage.ais-off .lsel,.beat-stage.ais-off .lcallout,.beat-stage.ais-off .lleader{display:none!important}
@media (max-width:820px){#aisControl{left:3vw;top:3vh;padding:4px 6px 4px 8px}}`;
    document.head.appendChild(css);
    control = document.createElement('div'); control.id = 'aisControl';
    control.innerHTML = '<div class="lmode wait"><i></i><b>AIS Loading</b></div><span class="w">off</span><button type="button" aria-label="Live ships on / off" title="Live ships on / off"></button><span class="w">on</span>';
    document.body.appendChild(control);
  }
  const modePill = control.querySelector('.lmode');
  const setStatus = (txt, cls) => { if (ui.status) { ui.status.textContent = txt; ui.status.className = 'lstatus ' + (cls || ''); }
    const word = cls === 'live' ? 'AIS Live' : cls === 'sim' ? (/^last snapshot/i.test(txt) ? 'AIS Snapshot' : 'AIS Simulated') : cls === 'err' ? 'AIS Error' : 'AIS Loading';
    modePill.className = 'lmode ' + (cls || 'wait'); modePill.querySelector('b').dataset.word = word; modePill.querySelector('b').textContent = enabled ? word : 'AIS Off'; modePill.title = txt; };
  const liveObjects = [];                              // every three.js object of the live layer, so on/off is one loop
  function applyEnabled() {
    control.classList.toggle('off', !enabled); stage.classList.toggle('ais-off', !enabled);
    for (const ob of liveObjects) ob.visible = enabled && (ob.__wantVisible !== false);
    modePill.querySelector('b').textContent = enabled ? modePill.querySelector('b').dataset.word || 'AIS Loading' : 'AIS Off';
    try { window.dispatchEvent(new CustomEvent('ais:toggle', { detail: { on: enabled } })); } catch (_) {}
  }
  let flights = null;
  try { flights = initFlights({ globe, CFG, lonLatToVec3, camera, stage, host, bufferUrl: cfg.SIMULATED_ONLY ? null : cfg.BUFFER_URL, simulated: !!cfg.SIMULATED_ONLY, control, showIn: [0.72, 0.80] }); } catch (e) { console.warn('[flights] not started', e.message); }
  control.querySelector('button').onclick = () => { enabled = !enabled; try { sessionStorage.setItem('hlc_ais_on', enabled ? '1' : '0'); } catch (_) {} applyEnabled(); };
  // 18 Sep 2026, Simon: the AIS Live / CI Flights words (both wear .lmode — the AIS one above, flights.js's own
  // appended into this same control) are clickable shortcuts into observe mode (beat.js's onObserveJump) — one
  // delegated listener catches either, the on/off switch is a separate sibling element so it's untouched by this.
  if (typeof g.onObserveJump === 'function' && !control.dataset.jumpBound) {
    control.dataset.jumpBound = '1';
    control.addEventListener('click', e => { if (e.target.closest('.lmode')) g.onObserveJump(); });
  }

  /* --- AIS dots: one preallocated Points buffer (front hemisphere only, same shader as the land) --- */
  const MAX = 24000;
  const AIS_SIZE = 0.0028 * CFG.sizeScale;
  const aisPts = makePoints(Array.from({ length: MAX }, () => new THREE.Vector3(0, 0, -9)), 0xcfe6ff, AIS_SIZE, 0.85, true, false);   // NOT additive: a hundred ships in one pixel stay one dot
  aisPts.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); aisPts.geometry.setDrawRange(0, 0); aisPts.renderOrder = 3;
  const aisColors = new Float32Array(MAX * 3); aisPts.geometry.setAttribute('color', new THREE.BufferAttribute(aisColors, 3).setUsage(THREE.DynamicDrawUsage));
  aisPts.material.vertexColors = true; aisPts.material.color.set(0xffffff); aisPts.material.needsUpdate = true;
  const colCache = new Map(); const colOf = t => { const k = typeColor(t); let c = colCache.get(k); if (!c) { c = new THREE.Color(k); colCache.set(k, c); } return c; };
  const aisFade = { mat: aisPts.material, base: 0.85 }; globe.add(aisPts); worldFade.push(aisFade); liveObjects.push(aisPts);
  aisPts.__wantVisible = false;   // Voyage Planner Phase 1 (16 Sep 2026): no automatic world-view ship swarm — the registry/search/deep-zoom icons keep working, only this always-on dot cloud is suppressed
  // trails: one LineSegments buffer, rebuilt when a track grows — the routes draw themselves
  const TR_MAX = 400000;   // segments
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TR_MAX * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage)); trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({ color: 0x7fc4ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  const trailLines = new THREE.LineSegments(trailGeo, trailMat); trailLines.frustumCulled = false; trailLines.renderOrder = 2; globe.add(trailLines); liveObjects.push(trailLines);
  trailLines.__wantVisible = false;   // Voyage Planner Phase 1: same as aisPts — no automatic wake trails in the world view
  const trailFade = { mat: trailMat, base: 0.32 }; worldFade.push(trailFade);
  /* the close zoom: every vessel in the Gateway window as a MarineTraffic-style icon — an arrow on her course when underway,
     a disc when stopped — coloured by type, sized in screen pixels, oriented on the sphere. Instanced, so thousands are cheap. */
  const ICON_MAX = 6000;
  const arrowGeo = new THREE.BufferGeometry(); arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, -0.62, -0.75, 0, 0, -0.42, 0, 0, -0.42, 0, 0.62, -0.75, 0, 0, 1, 0], 3));
  const discGeo = new THREE.CircleGeometry(0.5, 10);
  const iconMat = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const arrows = new THREE.InstancedMesh(arrowGeo, iconMat(), ICON_MAX), discs = new THREE.InstancedMesh(discGeo, iconMat(), ICON_MAX);
  arrows.frustumCulled = discs.frustumCulled = false; arrows.renderOrder = discs.renderOrder = 4; arrows.count = discs.count = 0; globe.add(arrows); globe.add(discs); liveObjects.push(arrows, discs);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let iconPx = 0;   // screen size in px (0 = hidden), set per frame from the camera depth
  function rebuildIcons(worldPerPx) {
    if (!worldPerPx || iconPx <= 0) { arrows.count = discs.count = 0; return; }
    let na = 0, nd = 0; const size = iconPx * worldPerPx;
    for (const v of registry.values()) {
      if (!inWin(v.lat, v.lng)) continue; if (na >= ICON_MAX && nd >= ICON_MAX) break;
      const n = lonLatToVec3(v.lng, v.lat, CFG.radius * 1.0028); const nn = n.clone().normalize();
      const east = UP.clone().cross(nn).normalize(), north = nn.clone().cross(east).normalize();
      const moving = v.sog > 0.5 && v.cog != null; const b = (moving ? v.cog : 0) * DEG;
      const fwd = north.multiplyScalar(Math.cos(b)).addScaledVector(east, Math.sin(b)).normalize(); const right = fwd.clone().cross(nn).normalize();
      _q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, fwd, nn));
      const mesh = moving ? arrows : discs, i = moving ? na++ : nd++; if (i >= ICON_MAX) continue;
      _s.setScalar(moving ? size : size * 0.55); _m.compose(n, _q, _s); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, colOf(v.type));
    }
    arrows.count = na; discs.count = nd; arrows.instanceMatrix.needsUpdate = true; discs.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true; if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
  }
  let lastIconBuild = 0, lastWorldPerPx = 0;
  function rebuildTrails() {
    const a = trailGeo.attributes.position.array; let n = 0;
    for (const t of trails.values()) { for (let i = 1; i < t.length && n < TR_MAX; i++) {
      if (Math.hypot(t[i][0] - t[i - 1][0], (t[i][1] - t[i - 1][1]) * Math.cos(t[i][0] * DEG)) > 0.22) continue;   // a jump > ~13 nm between fixes is a bad fix / an MMSI reused — not a route
      const u = lonLatToVec3(t[i - 1][1], t[i - 1][0], CFG.radius * 1.0035), v = lonLatToVec3(t[i][1], t[i][0], CFG.radius * 1.0035);
      a[n * 6] = u.x; a[n * 6 + 1] = u.y; a[n * 6 + 2] = u.z; a[n * 6 + 3] = v.x; a[n * 6 + 4] = v.y; a[n * 6 + 5] = v.z; n++; } }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, n * 2); trailsDirty = false;
  }

  /* --- density over the Channel: the grid is painted into a small canvas texture and draped on a sphere patch
         (a raster, not dots — additive dots stacked into a white blob at world scale; a raster scales with the zoom) --- */
  let grid = null, heatMesh = null, heatFade = null, heatCanvas = null, heatCtx = null, heatTex = null, heatImg = null;
  if (cfg.DENSITY_GRID) {
    grid = buildGrid();
    try { const saved = JSON.parse(localStorage.getItem('hlc_lab_density') || 'null'); if (saved && saved.cols === grid.cols && saved.rows === grid.rows && Array.isArray(saved.live)) grid.live.set(saved.live); } catch (_) {}
    heatCanvas = document.createElement('canvas'); heatCanvas.width = grid.cols; heatCanvas.height = grid.rows; heatCtx = heatCanvas.getContext('2d');
    heatImg = heatCtx.createImageData(grid.cols, grid.rows);
    heatTex = new THREE.CanvasTexture(heatCanvas); heatTex.minFilter = THREE.LinearFilter; heatTex.magFilter = THREE.LinearFilter; if ('colorSpace' in heatTex) heatTex.colorSpace = THREE.SRGBColorSpace;
    const D2R = Math.PI / 180;
    const patch = new THREE.SphereGeometry(CFG.radius * 1.0025, 96, 48, (GRID.lonMin + 180) * D2R, (GRID.lonMax - GRID.lonMin) * D2R, (90 - GRID.latMax) * D2R, (GRID.latMax - GRID.latMin) * D2R);
    heatMesh = new THREE.Mesh(patch, new THREE.MeshBasicMaterial({ map: heatTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    heatMesh.renderOrder = 2; globe.add(heatMesh); liveObjects.push(heatMesh); heatMesh.visible = enabled; heatFade = { mat: heatMesh.material, base: 0.9 }; worldFade.push(heatFade);
    heatMesh.__wantVisible = false;   // Voyage Planner Phase 1: no automatic density heatmap in the world view
    paintHeat();
  }
  function paintHeat() {
    if (!grid) return;
    let liveMax = 0; for (let i = 0; i < grid.live.length; i++) if (grid.live[i] > liveMax) liveMax = grid.live[i];
    const d = heatImg.data, cols = grid.cols, rows = grid.rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, o = ((rows - 1 - r) * cols + c) * 4;            // canvas row 0 = north (latMax)
      const lv = liveMax ? Math.sqrt(grid.live[i] / liveMax) : 0;             // live evidence, compressed
      const v = Math.min(1, grid.prior[i] * priorW + lv * 0.9);                // seeded lanes only when there is no real data; otherwise what the feed has actually seen
      // ramp: deep blue → CIPS orange → pale hot; alpha rises with the square so the lanes read as bands, not a wash
      const t = v < 0.5 ? v * 2 : (v - 0.5) * 2;
      const R = v < 0.5 ? 43 + (244 - 43) * t : 244 + (255 - 244) * t, G = v < 0.5 ? 111 + (83 - 111) * t : 83 + (217 - 83) * t, Bb = v < 0.5 ? 168 + (0 - 168) * t : 0 + (168 - 0) * t;
      const a = v < 0.03 ? 0 : 0.10 + 0.90 * v * v;
      d[o] = R; d[o + 1] = G; d[o + 2] = Bb; d[o + 3] = Math.round(255 * a);
    }
    heatCtx.putImageData(heatImg, 0, 0); heatTex.needsUpdate = true;
  }
  let lastSave = 0;
  function saveHeat(now) { if (!grid || now - lastSave < 30000) return; lastSave = now; try { localStorage.setItem('hlc_lab_density', JSON.stringify({ cols: grid.cols, rows: grid.rows, live: Array.from(grid.live, x => +x.toFixed(2)) })); } catch (_) {} }

  /* --- registry updates --- */
  function report(mmsi, lat, lng, sog, cog, name, type, at, fromSnapshot, len, imo) {
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return;
    let s = registry.get(mmsi);
    if (!s) { s = { mmsi, name: '', lat, lng, sog: 0, cog: 0, type: null, last: 0 }; registry.set(mmsi, s); }
    s.lat = lat; s.lng = lng; if (sog != null) s.sog = sog; if (cog != null) s.cog = cog; if (name) s.name = name; if (type != null) s.type = type; if (len != null) s.len = len; if (imo != null) s.imo = imo; s.last = at || Date.now(); s.hist = !!fromSnapshot;
    if (grid) { const i = cellOf(lng, lat, grid); if (i >= 0) grid.live[i] += 1; }
    if (cfg.TRAILS && !fromSnapshot && inWin(lat, lng)) {
      let t = trails.get(mmsi); if (!t) { t = []; trails.set(mmsi, t); }
      const l = t[t.length - 1];
      if (!l || Math.hypot(lat - l[0], (lng - l[1]) * Math.cos(lat * DEG)) > 0.0025) { t.push([lat, lng]); if (t.length > TRAIL_MAX) t.shift(); trailsDirty = true; }
    }
  }
  let trailsDirty = false;
  /* --- history: the recorder's last-6-hours file seeds the registry, the trails and the density before the live feed arrives --- */
  async function loadHistory() {
    if (cfg.SIMULATED_ONLY) return null;   // go-live build: no recorded tracks either, only the simulated fleet
    try {
      const h = await (await fetch(bufferUrl ? bufferUrl + '/tracks.json' : new URL('assets/ais-history.json', import.meta.url), { cache: 'no-store' })).json();
      let n = 0, pts = 0; const keep = Date.now() - 6 * 3600 * 1000;
      for (const k in h.vessels) { const v = h.vessels[k], mmsi = +k; if (!v.p || !v.p.length) continue;
        const track = v.p.filter(q => q[0] * 60000 >= keep); if (!track.length) continue;
        for (const q of track) { if (grid) { const i = cellOf(q[2], q[1], grid); if (i >= 0) grid.live[i] += 0.5; } }
        if (cfg.TRAILS) trails.set(mmsi, track.slice(-TRAIL_MAX).map(q => [q[1], q[2]]));   // the last few fixes (≈ 20–30 min underway): a short wake that shows her course, not the whole night
        const q = track[track.length - 1]; if (!registry.has(mmsi)) registry.set(mmsi, { mmsi, name: v.n || '', lat: q[1], lng: q[2], sog: q[3], cog: q[4], type: v.t, last: q[0] * 60000, hist: true });
        n++; pts += track.length; }
      trailsDirty = true; if (n > 200) priorW = 0; if (grid) paintHeat();
      console.log('[globe-live] history:', n, 'vessels,', pts, 'points, generated', h.generated);
      return { n, generated: h.generated };
    } catch (_) { return null; }
  }
  /* --- the BUFFER: tools/ais-buffer.mjs — everything the feed has ever said, instantly; live only on request --- */
  let bufferUrl = null;
  async function ingestSnapshot(snap) {
    let n = 0; for (const v of snap.vessels || []) { const [mmsi, lat, lng, sog, cog, t, type, name] = v; report(mmsi, lat, lng, sog, cog, name, type, t * 60000, true); n++; }
    return n;
  }
  // is the buffer genuinely populated by live traffic? (its /health says: socket up, messages arriving now, a real spread of
  // vessels heard since it started — not merely replayed from its files). Older buffers without the field: judge by positions.
  let bufferWarming = false;
  async function bufferReady() {
    if (cfg.SIMULATED_ONLY) return { up: false, ready: false };   // never contacts the buffer
    try { const h = await (await fetch(cfg.BUFFER_URL + '/health', { cache: 'no-store' })).json(); return { up: true, ready: h.ready != null ? !!h.ready : h.positions >= 150, h }; } catch (_) { return { up: false, ready: false }; }
  }
  async function loadSnapshot() {
    if (cfg.SIMULATED_ONLY) return null;   // go-live build (Simon + Howard, 4 Nov 2026; options.ais.SIMULATED_ONLY in index.html): simulated fleet only, no recorded snapshot
    // 1. the buffer process, once it is genuinely fed by live traffic; 2. the file it wrote last (served with the page) — either way the globe
    //    is complete before anything is live. A buffer that is up but still warming is not shown until it is ready (see adoptBuffer)
    const b = await bufferReady();
    if (b.up && b.ready) { try { const r = await fetch(cfg.BUFFER_URL + '/snapshot.json', { cache: 'no-store' }); if (r.ok) { bufferUrl = cfg.BUFFER_URL; return { n: await ingestSnapshot(await r.json()), src: 'buffer' }; } } catch (_) {} }
    bufferWarming = b.up;
    try { const r = await fetch(new URL('assets/ais-snapshot.json', import.meta.url), { cache: 'no-store' }); if (r.ok) return { n: await ingestSnapshot(await r.json()), src: 'file' }; } catch (_) {}
    if (b.up) { try { const r = await fetch(cfg.BUFFER_URL + '/snapshot.json', { cache: 'no-store' }); if (r.ok) return { n: await ingestSnapshot(await r.json()), src: 'thin' }; } catch (_) {} }   // no file: the buffer's thin real picture beats an invented one
    return null;
  }
  const snap = await loadSnapshot();
  let history = await loadHistory();
  function evict() { const cut = Date.now() - 25 * 60000, cutH = Date.now() - 6.5 * 3600 * 1000; for (const [k, s] of registry) if (s.last < (s.hist ? cutH : cut)) { registry.delete(k); trails.delete(k); trailsDirty = true; } }

  /* --- feed: aisstream.io or simulation --- */
  let sim = null, ws = null, retry = 0;
  function connect() {
    if (cfg.SIMULATED_ONLY) { startSim('example ships, not live data'); return; }
    if (!cfg.AIS_KEY || !('WebSocket' in window)) { startSim('no key — simulated fleet'); return; }
    setStatus('connecting to AIS…', 'wait');
    try { ws = new WebSocket(cfg.AIS_URL); } catch (e) { startSim('socket refused — simulated fleet'); return; }
    ws.binaryType = 'arraybuffer';               // aisstream sends BINARY frames (JSON bytes) — decode, don't JSON.parse a Blob
    const dec = new TextDecoder();
    let gotAny = false;
    ws.onopen = () => { setStatus('subscribed — waiting for traffic…', 'wait'); ws.send(JSON.stringify({ APIKey: cfg.AIS_KEY, BoundingBoxes: cfg.AIS_BBOX, FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'] })); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : dec.decode(ev.data)); } catch (_) { return; }
      if (m.error) { setStatus('AIS: ' + m.error, 'err'); return; }
      const md = m.MetaData || {}; const mmsi = md.MMSI; if (!mmsi) return;
      gotAny = true; msgCount++;
      if (mode !== 'live') { mode = 'live'; setStatus('live · aisstream.io' + (history ? ' · +6 h history' : ''), 'live'); }
      const name = (md.ShipName || '').trim();
      if (m.MessageType === 'ShipStaticData') {   // Voyage Planner Phase 3 (17 Sep 2026): capture LOA + IMO whenever static data arrives — free enrichment, no extra fetch (direct-feed path only; the buffer's own bulk formats don't carry either yet, see 17 Sep notes)
        const d = m.Message.ShipStaticData || {}; const dim = d.Dimension || {};
        const len = (dim.A || dim.B) ? Math.round((dim.A || 0) + (dim.B || 0)) : null;
        report(mmsi, md.latitude, md.longitude, null, null, name || (d.Name || '').trim(), d.Type, undefined, undefined, len, d.ImoNumber || null);
        return;
      }
      const pr = m.Message.PositionReport || m.Message.StandardClassBPositionReport || {};
      report(mmsi, md.latitude, md.longitude, pr.Sog, pr.Cog, name, null);
    };
    ws.onclose = () => { if (mode === 'sim' || mode === 'buffer') return; if (!gotAny && retry === 0) { startSim('AIS unreachable — simulated fleet'); return; } retry++; setStatus('AIS reconnecting…', 'wait'); setTimeout(connect, Math.min(30000, 2000 * retry)); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
  }
  function startSim(why) {
    mode = 'sim'; sim = makeSim(cfg.SIM_SHIPS);
    for (const s of sim.ships) report(s.mmsi, s.lat, s.lng, s.sog, s.cog, s.name, s.type);
    setStatus('SIMULATED · ' + why, 'sim');
  }
  let es = null, pollT = 0;
  function liveOn(on) {   // the beats close to the islands ask for live; the globe is happy with a fresh snapshot every 30 s
    if (!bufferUrl) return false;
    if (on && !es) { const b = cfg.HISTORY_BBOX[0]; es = new EventSource(bufferUrl + '/live?box=' + [b[0][0], b[0][1], b[1][0], b[1][1]].join(','));
      es.onmessage = ev => { try { const [mmsi, lat, lng, sog, cog, type, name] = JSON.parse(ev.data); report(mmsi, lat, lng, sog, cog, name, type); } catch (_) {} };
      setStatus('live · buffer + stream', 'live'); }
    else if (!on && es) { es.close(); es = null; setStatus('buffer · ' + registry.size.toLocaleString() + ' vessels', 'live'); }
    return true;
  }
  window.LAB_AIS.live = liveOn; window.LAB_AIS.vessel = async mmsi => { if (!bufferUrl) return null; try { return await (await fetch(bufferUrl + '/vessel/' + mmsi)).json(); } catch (_) { return null; } };
  if (bufferUrl) { mode = 'buffer'; setStatus('buffer · ' + registry.size.toLocaleString() + ' vessels' + (history ? ' · ' + (cfg.HISTORY_HOURS || 6) + ' h tracks' : ''), 'live'); }
  else if (snap && bufferWarming) { mode = 'file'; setStatus('buffer warming up · showing ' + (snap.src === 'file' ? 'last snapshot' : 'what it has so far') + ' · ' + snap.n.toLocaleString() + ' vessels', 'wait'); }
  else if (snap) { mode = 'file'; setStatus('last snapshot · ' + snap.n.toLocaleString() + ' vessels (buffer not running)', 'sim'); connect(); }
  else connect();
  // ...and whenever the buffer comes up and is genuinely populated by live traffic, it becomes the data shown: the simulated fleet
  // or the page's own socket is dropped, its snapshot and tracks replace what was on the globe, and the picker's list refreshes
  let adopting = false;
  async function adoptBuffer() {
    if (bufferUrl || adopting) return; const b = await bufferReady(); if (!b.ready) { if (b.up && mode !== 'file') { bufferWarming = true; } return; }
    adopting = true;
    try {
      const r = await fetch(cfg.BUFFER_URL + '/snapshot.json', { cache: 'no-store' }); if (!r.ok) return;
      const data = await r.json();
      if (sim) { for (const s of sim.ships) { registry.delete(s.mmsi); trails.delete(s.mmsi); } sim = null; trailsDirty = true; }
      mode = 'buffer';   // set before closing the socket so its onclose does not reconnect or start the simulation
      if (ws) { try { ws.close(); } catch (_) {} ws = null; }
      bufferUrl = cfg.BUFFER_URL; bufferWarming = false;
      await ingestSnapshot(data); history = await loadHistory();
      setStatus('buffer · ' + registry.size.toLocaleString() + ' vessels' + (history ? ' · ' + (cfg.HISTORY_HOURS || 6) + ' h tracks' : '') + ' · live', 'live');
      renderList(); if (selected) { const s = registry.get(selected.mmsi); if (s) selected = s; }
      console.log('[globe-live] buffer adopted —', b.h?.liveVessels, 'vessels heard live');
    } catch (_) {} finally { adopting = false; }
  }
  const adoptTimer = setInterval(adoptBuffer, 10000);

  /* --- captain picker --- */
  let selected = null, selMesh = null, selArc = null, selLabel = null, focusQuat = null, focusMix = 0;
  let selectedExtra = null;   // Voyage Planner Phase 3 (17 Sep 2026): the fuller per-vessel lookup (LOA, destination, callsign) — fetched once per selection, shared by the panel card and the callout rather than each fetching its own copy
  // Voyage Planner Phase 4 (17 Sep 2026): once "Change Destination: Jersey" is clicked, beat.js takes over drawing
  // this ship on her own scripted route — her real live position/marker/callout here would otherwise keep updating
  // underneath it and fight for the screen. routeMode just switches this file's own rendering off for her; selected
  // stays set throughout (LAB_SHIP, the finder list, etc. all still need her identity) — beat.js reads her snapshot
  // once, at the moment of the click, via the onChangeDestination callback below, not from this file again after.
  let routeMode = false;
  // 17 Sep 2026, Simon: two settle destinations share the turn-then-release mechanism below — "Go to ship"/"Choose
  // her" (focusIsShip=true, halve idle spin once settled so a followed vessel stays visible longer) and the
  // callout's own "X" (focusIsShip=false, recentre to the Channel Islands then resume normal-speed idle spin).
  let slowSpin = false, focusIsShip = false;
  let zoomTarget = 1, zoomNow = 1;   // camera depth as a fraction of the world view (1 = the full globe, 0.22 = close on a ship)
  const selGeo = new THREE.BufferGeometry(); selGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const SEL_SIZE = CFG.endpointSize * 1.15;
  selMesh = new THREE.Points(selGeo, new THREE.PointsMaterial({ color: new THREE.Color(0xF45300), size: SEL_SIZE, map: SPRITE, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  selMesh.visible = false; selMesh.__wantVisible = false; selMesh.frustumCulled = false; selMesh.renderOrder = 4; globe.add(selMesh); liveObjects.push(selMesh); worldFade.push({ mat: selMesh.material, base: 1 });
  const selEl = document.createElement('div'); selEl.className = 'pinlabel pinship'; const selSpan = document.createElement('span'); selEl.appendChild(selSpan);
  selLabel = new CSS2DObject(selEl); selLabel.visible = false; selLabel.__wantVisible = false; globe.add(selLabel); liveObjects.push(selLabel); const selLabelRec = { el: selEl, normal: new THREE.Vector3(0, 0, 1) }; labelObjs.push(selLabelRec);

  /* Voyage Planner Phase 3, 2nd pass (17 Sep 2026) — Simon: selecting a ship should automatically overlay a pulsing
     chevron on her, "same style as the kinship in the demo", without needing to click anything first (that used to
     be gated behind "Show her"). Kinship's own marker (beat.js: kinAisCore/Flash/Glow) is positioned from a scripted
     0..1 track progress (u) she moves along; a live-selected real ship has no such track, so this is a from-scratch
     but visually identical build — same chevron path, same glow gradient, same three-layer core/flash/glow
     construction — just driven by real lat/lng (toScreen(), already used for the hover ring/click card below) and
     wall-clock time instead of scripted progress for the pulse rhythm. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (t, attrs) => { const e = document.createElementNS(SVGNS, t); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const SEL_AIS_D = 'M7,0 L-5,-4 L-2,0 L-5,4 Z';   // identical to Kinship's KIN_AIS_D — a chevron, tip = bow, 0deg = east
  const selFx = document.createElementNS(SVGNS, 'svg'); selFx.setAttribute('class', 'lselfx'); selFx.setAttribute('aria-hidden', 'true'); stage.appendChild(selFx);
  const selFxDefs = svgEl('defs', {}); selFxDefs.innerHTML = '<radialGradient id="lsel-comet"><stop offset="0" stop-color="#fff0dc" stop-opacity="1"/><stop offset=".35" stop-color="#FF8A1E" stop-opacity=".9"/><stop offset="1" stop-color="#FF8A1E" stop-opacity="0"/></radialGradient>';
  const selChevGlow = svgEl('circle', { r: '9', fill: 'url(#lsel-comet)' });
  const selChevCore = svgEl('path', { d: SEL_AIS_D, fill: '#C9D6E4', stroke: 'rgba(4,7,14,.55)', 'stroke-width': '0.6' });
  const selChevFlash = svgEl('path', { d: SEL_AIS_D, fill: '#FF7A12' });
  selFx.append(selFxDefs, selChevGlow, selChevCore, selChevFlash);
  let selectedAt = 0;   // performance.now() at selection — drives the pulse's initial "arrival" burst + steady breathing after, time-based since there's no track progress to key off
  const SEL_PULSE_PERIOD = 1.4, SEL_PULSE_FLOOR = 0.42, SEL_PULSE_BURST = 1.5;   // period/floor mirror Kinship's KIN_AIS rhythm; burst is a decay window in seconds (Kinship's is in track-progress units, not directly comparable)

  function results(q) {
    q = (q || '').trim().toUpperCase(); const out = [];
    for (const s of registry.values()) {
      if (!q) { if (!s.name) continue; }
      else if (!(s.name.toUpperCase().includes(q) || String(s.mmsi).startsWith(q))) continue;
      out.push(s); if (out.length > 400) break;
    }
    // nearest to the islands first when there is no query; otherwise alphabetical
    out.sort(q ? (a, b) => a.name.localeCompare(b.name) : (a, b) => gc(a, CI_PORT) - gc(b, CI_PORT));
    return out.slice(0, 60);
  }
  /* The buffer's bulk snapshot carries no LOA, only its per-vessel lookup does: so the vessels in the finder list are looked up quietly (a few at a time, once each) and their length (and a
     missing type) fills in beside the name as the answers arrive. */
  const detailQueue = []; let detailBusy = 0;
  function wantDetail(s) { if (!bufferUrl || s.detail !== undefined) return; s.detail = 0; detailQueue.push(s.mmsi); pumpDetail(); }
  function pumpDetail() {
    while (detailBusy < 4 && detailQueue.length) {
      const m = detailQueue.shift(); detailBusy++;
      fetch(bufferUrl + '/vessel/' + m).then(r => r.json()).then(full => {
        const s = registry.get(m); if (!s) return; cacheDetail(m, full); s.detail = 1; if (full.t != null && full.t !== 0 && (s.type == null || s.type === 0)) s.type = full.t;
        const li = ui.list && ui.list.querySelector('li[data-mmsi="' + m + '"] .lmeta'); if (li) li.textContent = metaLine(s.type, s.len);
      }).catch(() => { const s = registry.get(m); if (s) s.detail = 2; }).finally(() => { detailBusy--; pumpDetail(); });
    }
  }
  function renderList() {
    if (!ui.list) return; const q = ui.input ? ui.input.value : '';
    const rs = results(q); ui.list.innerHTML = '';
    if (!rs.length) { ui.list.innerHTML = '<li class="lempty">' + (registry.size ? 'No vessel by that name yet — names arrive on the feed a few minutes after positions.' : 'Listening…') + '</li>'; return; }
    for (const s of rs) {
      const li = document.createElement('li'); li.dataset.mmsi = s.mmsi;
      li.innerHTML = '<div class="lline"><b>' + (s.name || 'MMSI ' + s.mmsi) + '</b><small class="lmeta">' + metaLine(s.type, s.len) + '</small></div><span>' + fmtNm(gc(s, CI_PORT)) + ' to ' + CI_PORT.name + '</span>'; wantDetail(s);
      li.addEventListener('click', () => select(s.mmsi)); ui.list.appendChild(li);
    }
  }
  // Voyage Planner Phase 3 (17 Sep 2026): the buffer's bulk snapshot/live formats don't carry LOA or IMO — only its
  // per-vessel lookup does (see select()/showCard() below) — so a vessel only shows either in the LIST once someone's
  // looked at her card at least once this visit. Not a full fix (the buffer's bulk formats would need to start
  // carrying them for that), but free and worth doing regardless.
  function cacheDetail(mmsi, full) { const s = registry.get(mmsi); if (s) { if (full.len != null) s.len = full.len; if (full.imo != null) s.imo = full.imo; } }
  /* Voyage Planner Phase 3, 2nd pass (17 Sep 2026, Simon): selecting a ship arms her pulsing chevron automatically,
     no "Show her" click needed. Turning the globe to face her, though, moved OUT of here (17 Sep, same day) — Simon
     noticed selecting AND THEN "Go to ship" turned the globe twice (select() used to centre immediately, "Go to
     ship" centred again straight after); dropped the one here so the globe only ever turns once, on "Go to ship"
     (the finder's button or the on-globe click card's, both the same wording now) — the committing action — not on
     a mere browse-the-list selection. */
  async function select(mmsi) {
    const s = registry.get(mmsi); if (!s) return; selected = s; selectedExtra = null; selectedAt = performance.now();
    closeCallout(); zoomTarget = 1;   // callout/zoom still reset on every fresh selection — those stay a deliberate "Follow" action, not automatic
    if (selArc) { globe.remove(selArc); selArc.geometry.dispose(); selArc = null; }
    selArc = makeArc({ lat: s.lat, lng: s.lng }, { lat: g.CI.lat, lng: g.CI.lng }); selArc.visible = enabled; globe.add(selArc); worldFade.push({ mat: selArc.material, base: 1, kind: 'arc' });   // fades with the other arcs (~75%) — by then Kinship carries the story
    const v = lonLatToVec3(s.lng, s.lat, CFG.radius * 1.0029); selGeo.attributes.position.setXYZ(0, v.x, v.y, v.z); selGeo.attributes.position.needsUpdate = true;   // selMesh itself stays hidden now — the pulsing chevron (placeChevron, below) is the marker, matching Kinship's single-marker look rather than a dot-plus-chevron combo
    selLabel.position.copy(lonLatToVec3(s.lng, s.lat, CFG.radius * 1.02)); selLabel.__wantVisible = true; selLabel.visible = enabled; selSpan.textContent = s.name || 'MMSI ' + s.mmsi; selLabelRec.normal.copy(selLabel.position).normalize();
    stage.classList.add('has-ship'); setExpanded(true); renderCard(); window.LAB_SHIP = { mmsi: s.mmsi, name: s.name, type: s.type };
    if (stage.classList.contains('vcard-panel')) { if (window.scrollY > 0) window.scrollTo(0, 0); engageSelected(); }   // 4 Oct 2026, Simon: choosing a ship centres the globe on her straight away and shows her details in the finder's voyage card — no separate "Go to ship" step
    // the fuller lookup (LOA, destination, IMO) — one fetch per selection, shared by the card and the callout
    if (bufferUrl) { const m = s.mmsi; try { const full = await (await fetch(bufferUrl + '/vessel/' + m)).json(); cacheDetail(m, full); if (selected && selected.mmsi === m) { selectedExtra = { imo: full.imo, dest: full.dest, len: full.len, draught: full.draught, name: full.n, type: full.t, eta: full.eta }; renderCard(); renderCallout(); } } catch (_) {} }
  }
  function clearSel() {
    selected = null; selectedExtra = null; focusQuat = null; slowSpin = false;
    selMesh.visible = false; selMesh.__wantVisible = false; selLabel.visible = false; selLabel.__wantVisible = false;
    if (selArc) { globe.remove(selArc); selArc = null; }
    stage.classList.remove('has-ship', 'following'); window.LAB_SHIP = null;
  }
  // 17 Sep 2026, Simon: drop the computed distance/ETA-to-St-Helier rows (Bound for moves below Speed/course, a
  // Posted ETA row — the vessel's own broadcast ETA, not our computed one — sits after it, shows '—' for now since
  // neither the buffer nor the direct feed surfaces it yet, same "wired and ready" situation as IMO). No "Take me to
  // St Helier" button here — Simon, same day: that only belongs once she's actually being followed (the callout,
  // renderCallout() below), not in this preview-while-browsing card; "Go to ship" in .lactions is this card's own
  // commit action.
  function renderCard() {
    if (!ui.card || !selected || routeMode) return; const s = selected, x = selectedExtra || {}; const type = x.type ?? s.type;
    ui.card.innerHTML = '<div class="lname">' + (x.name || s.name || 'MMSI ' + s.mmsi) + (metaLine(type, x.len ?? s.len) ? ' <small class="lmeta">' + metaLine(type, x.len ?? s.len) + '</small>' : '') + '</div>' +
      '<div class="ldist">' + fmtNm(gc(s, CI_PORT)) + ' from St Helier</div>' +
      (x.imo ? '<div class="lrow"><span>IMO</span><b>' + x.imo + '</b></div>' : '') +
      (typeName(type) ? '<div class="lrow"><span>Type</span><b>' + typeName(type) + '</b></div>' : '') +
      (x.draught ? '<div class="lrow"><span>Draft</span><b>' + x.draught + ' m</b></div>' : '') +
      '<div class="lrow"><span>Position</span><b>' + s.lat.toFixed(3) + '°, ' + s.lng.toFixed(3) + '°</b></div>' +
      '<div class="lrow"><span>Speed / course</span><b>' + fmtSpdCog(s) + '</b></div>' +
      (x.dest ? '<div class="lrow"><span>Bound for</span><b>' + x.dest + '</b></div>' : '') +
      (x.eta ? '<div class="lrow"><span>Posted ETA</span><b>' + x.eta + '</b></div>' : '');   // 14 Oct 2026: the feed does not carry the ETA yet, so the row only appears when a vessel actually has one
  }
  // the panel starts minimised (search bar only); expand on the button, on typing, or when a ship is chosen
  const expandBtn = stage.querySelector('[data-live="expand"]');
  const setExpanded = on => { if (!ui.panel) return; ui.panel.classList.toggle('expanded', !!on); if (expandBtn) { expandBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); expandBtn.firstChild.textContent = on ? 'Hide ships ' : 'Ships nearby '; } };
  expandBtn?.addEventListener('click', e => { e.stopPropagation(); setExpanded(!ui.panel.classList.contains('expanded')); if (ui.panel.classList.contains('expanded')) renderList(); });
  // 17 Sep 2026, Simon: same reasoning as the example-vessel button (beat.js) — "Change ship" deliberately leaves
  // scroll/zoom wherever it was, so a fresh search needs to reset to the full world view itself, right when the
  // captain actually starts typing (not on every keystroke once already there — window.scrollTo(0,0) is a no-op
  // when scrollY is already 0).
  ui.input?.addEventListener('input', () => { if (window.scrollY > 0) window.scrollTo(0, 0); if (ui.input.value && !ui.panel.classList.contains('expanded')) setExpanded(true); renderList(); });
  // 19 Sep 2026, Simon: had to click a search result twice before the card appeared — the periodic list refresh
  // below (every 4s, while the search box isn't focused) does ui.list.innerHTML = '' and rebuilds every <li> from
  // scratch; if that lands between a captain's mousedown and click on a result (a real race — clicking a non-
  // focusable <li> blurs the input immediately, which is exactly what lifts the old focus-based guard), the element
  // their click was headed for is destroyed mid-gesture and the click never reaches the new one. Tracks hover over
  // the list itself as a second guard, same idea as the existing focus check.
  let listHover = false;
  ui.list?.addEventListener('mouseenter', () => { listHover = true; });
  ui.list?.addEventListener('mouseleave', () => { listHover = false; });
  ui.clear?.addEventListener('click', () => { clearSel(); zoomTarget = 1; closeCallout(); });
  /* "Go to ship" (17 Sep 2026, 2nd pass; relabelled from "Follow this ship" 17 Sep) — replaces "Show her"/"Take me in"
     as the one committing action left on the card. She's already marked and centred from select() itself now; this
     hides the finder (stage.following — beat.css hides the panel, beat.js's reopen pill brings it back) and opens
     her Kinship-style callout. Deliberately doesn't dispatch lab:takemein any more — Simon: we don't need that ride
     functionality on this button right now, it's moving elsewhere. No zoom any more either (tried 0.22, then 0.45 —
     Simon, 17 Sep, same day: recentre only, stay at the original world-view zoom — the dot-matrix/arcs/lanes
     wrapping glitch some amount of zoom-in was causing kept resurfacing, this sidesteps it entirely). */
  // (4 Oct 2026, Simon: in the finder-card layout this now runs from select() itself, and the button is gone — kept as one function so both paths stay identical)
  function engageSelected() {
    if (!selected) return;
    stage.classList.add('following');
    focusIsShip = true; focusQuat = g.faceQuat(selected.lng, selected.lat); focusMix = 0; zoomTarget = 1;
    openCallout();
  }
  ui.follow?.addEventListener('click', engageSelected);
  // keep the panel's own pointer events from spinning the globe
  ui.panel?.addEventListener('pointerdown', e => e.stopPropagation());

  /* --- click a ship on the globe: nearest vessel to the click (front hemisphere), a live-data preview card, no
         commit action of its own (17 Sep 2026, Simon: a "Go to ship" here too, on top of the finder's and the
         callout's, was one too many places to start the same action from) --- */
  const card = document.createElement('div'); card.className = 'lshipcard'; card.hidden = true; stage.appendChild(card);
  let downX = 0, downY = 0, cardMmsi = null;
  const toScreen = (lat, lng) => { if (!camera) return null; const W = host.clientWidth, H = host.clientHeight; const w = lonLatToVec3(lng, lat, CFG.radius * 1.0028).applyQuaternion(globe.quaternion);   // the same height the dots and icons are drawn at — at the close zoom a hair of height is many pixels of parallax
    const toCam = camera.position.clone().sub(w); if (w.dot(toCam) <= 0) return null;   // far side
    const v = w.clone().project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };   // host-relative px (the host's own 2 vw shift is already in its bounding rect)
  const HIT = 30;   // px — a forgiving aim: the nearest ship within this radius is the one you mean
  // fleetIn gates every one of these the same way it gates the icons themselves: nothing here is pickable before the icons
  // that represent it are actually visible (Simon, 16 Sep 2026 — "no AIS ships/markers should be clickable before visible")
  window.LAB_AIS.toScreen = toScreen; window.LAB_AIS.pick = (x, y) => { if (fleetIn <= 0.02) return null; let best = null, bd = HIT * HIT; for (const v of registry.values()) { const q = toScreen(v.lat, v.lng); if (!q) continue; const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; best = v; } } return best; };
  stage.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
  stage.addEventListener('click', async e => {
    if (e.target.closest('.lpanel, .lshipcard, a, button, input')) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;   // a drag, not a click
    if (fleetIn <= 0.02) return;
    const r = host.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = HIT * HIT;
    if (window.LAB_DEBUG) console.log('[globe-live] click', x, y, 'reg', registry.size);
    for (const v of registry.values()) { const q = toScreen(v.lat, v.lng); if (!q) continue; const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; best = v; } }
    if (!best) { card.hidden = true; cardMmsi = null; return; }
    cardMmsi = best.mmsi; showCard(best, e.clientX - stage.getBoundingClientRect().left, e.clientY - stage.getBoundingClientRect().top);
    if (bufferUrl) { try { const full = await (await fetch(bufferUrl + '/vessel/' + best.mmsi)).json(); cacheDetail(best.mmsi, full); if (cardMmsi === best.mmsi) showCard(Object.assign({}, best, { name: full.n || best.name, type: full.t ?? best.type, imo: full.imo, dest: full.dest, len: full.len }), null, null); } catch (_) {} }
  });
  // hover: a small ring snaps to whichever ship the click would pick, so the aim is obvious before you click
  const ring = document.createElement('div'); ring.className = 'lhover'; ring.hidden = true; stage.appendChild(ring);
  let hoverT = 0;
  stage.addEventListener('pointermove', e => {
    const now = performance.now(); if (now - hoverT < 40) return; hoverT = now;
    if (e.target.closest('.lpanel, .lshipcard, a, button, input') || e.buttons) { ring.hidden = true; host.style.cursor = ''; return; }
    const r = host.getBoundingClientRect(); const v = window.LAB_AIS.pick(e.clientX - r.left, e.clientY - r.top);
    if (!v) { ring.hidden = true; host.style.cursor = ''; return; }
    const q = toScreen(v.lat, v.lng); const sr = stage.getBoundingClientRect();
    ring.style.left = (r.left - sr.left + q[0]) + 'px'; ring.style.top = (r.top - sr.top + q[1]) + 'px'; ring.style.borderColor = typeColor(v.type); ring.hidden = false; host.style.cursor = 'pointer';
  });
  stage.addEventListener('pointerleave', () => { ring.hidden = true; host.style.cursor = ''; });
  // 17 Sep 2026, Simon: this card is just a live-data preview now, no "Go to ship" of its own any more — having a
  // commit action here too (on top of the finder's and the callout's) was confusing, one too many places to start
  // from. Closes on its own "X" or by clicking elsewhere on the globe (unchanged); either way it's just this one
  // card going away, not the reset-everything the callouts' X's do.
  function showCard(v, x, y) {
    const tn = t => (t == null || t === 0) ? 'Type not broadcast' : typeName(t) || 'Type ' + t; const d = gc(v, CI_PORT);
    card.innerHTML = '<button type="button" class="lshipcard-close" aria-label="Close">&times;</button>' +
      '<b style="color:' + typeColor(v.type) + '">' + (v.name || 'MMSI ' + v.mmsi) + '</b><span>' + tn(v.type) + (v.len ? ' · ' + v.len + ' m' : '') + '</span>' +
      '<i>MMSI ' + v.mmsi + (v.imo ? ' · IMO ' + v.imo : '') + '</i><i>' + (v.sog != null ? v.sog.toFixed(1) + ' kn' : '—') + ' · ' + (v.cog != null ? Math.round(v.cog) + '°' : '—') + ' · ' + fmtNm(d) + ' to St Helier</i>' +
      (v.dest ? '<i>Bound for ' + v.dest + '</i>' : '');   // 17 Sep 2026, Simon: dropped the "click elsewhere to close" hint text — both ways of closing it (elsewhere-click, the X above) still work, just not spelled out any more
    card.querySelector('.lshipcard-close').addEventListener('click', () => { card.hidden = true; cardMmsi = null; });
    if (x != null) { const W = stage.clientWidth, H = stage.clientHeight; card.style.left = Math.min(W - 260, Math.max(8, x + 14)) + 'px'; card.style.top = Math.min(H - 170, Math.max(8, y - 10)) + 'px'; }
    card.hidden = false;
  }
  /* --- "Follow this ship": the globe centres on the chosen ship (already done from select()), and a callout with
         who she is, where she is bound, speed, distance and ETA hangs off her with a leader line — following her on
         screen until the fly-in starts. Styled to match Kinship's own callout exactly (17 Sep 2026, 2nd pass, Simon)
         — wears Kinship's own kin-callout-card/-title/-row classes directly (beat.css), no bespoke CSS of its own.
         The pulsing marker itself is now placeChevron()'s job (below), armed straight from select() — this callout
         is purely the "Follow" extra, not the marker. */
  const callout = document.createElement('div'); callout.className = 'kin-callout-card'; callout.hidden = true;
  // 3 Oct 2026: in the finder-card layout (stage.vcard-panel, beat.js) the callout sits in the finder's own voyage slot instead of floating
  (stage.classList.contains('vcard-panel') ? (stage.querySelector('[data-g="voyageSlot"]') || stage) : stage).appendChild(callout);
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leader.setAttribute('class', 'lleader'); leader.innerHTML = '<line x1="0" y1="0" x2="0" y2="0"/>'; leader.toggleAttribute("hidden", true); stage.appendChild(leader);
  const leaderLine = leader.querySelector('line');
  // the callout's own "X" (17 Sep 2026, Simon) — built into renderCallout()'s innerHTML below, so one delegated
  // listener here (rather than re-attaching on every re-render) catches it. Cancels the selection and takes the
  // captain all the way back to the start, same as the finder panel's own X — reuses that button's handler
  // (voyagePanelClose, beat.js) rather than duplicating its reset logic here. voyagePanelClose's own reset chain
  // (via clear -> clearSel()) drops focusQuat outright with no animation, leaving the globe wherever it happened to
  // be facing — Simon, same day: it should recentre on the Channel Islands and settle back into normal idle spin,
  // same turn-then-release mechanism as "Go to ship" (frame(), below), just aimed at CI instead of a vessel.
  // 18 Sep 2026, Simon's follow-up: rather than the card just sitting there until scroll starts, it should visibly
  // "recalculate" — her old live rows (Position/Speed/Bound for/Posted ETA) clear, then type back in as the new
  // simulated ones (Speed/Destination/ETA — Position doesn't get one yet, she hasn't started moving), THEN the
  // button starts pulsing. placeCallout() (below) hides this same card once real scroll begins and beat.js's own
  // live route card — already showing the identical Destination/ETA by then — takes over, so it reads as one
  // continuous card rather than a hard swap.
  const routeTypeText = (el, s, t) => { const v = s.slice(0, Math.round(s.length * Math.max(0, Math.min(1, t)))); if (el.textContent !== v) el.textContent = v; };
  function runChangeDestinationSequence(totalNm) {
    const btn = callout.querySelector('.ltake'); if (!btn) return;
    btn.classList.remove('pulse'); btn.textContent = 'Calculating route…';
    const JOURNEY_LABELS = ['Position', 'Speed', 'Bound for', 'Posted ETA'];
    [...callout.querySelectorAll('.kin-callout-row')].forEach(r => { if (JOURNEY_LABELS.includes(r.querySelector('.k')?.textContent)) r.remove(); });
    const distEl = callout.querySelector('.kin-callout-dist'); distEl.textContent = '';
    const mk = label => { const row = document.createElement('div'); row.className = 'kin-callout-row'; row.innerHTML = '<span class="k">' + label + '</span><span class="v"></span>'; callout.insertBefore(row, btn); return row.querySelector('.v'); };
    const destEl = mk('Destination'), etaEl = mk('ETA');
    const steps = [[distEl, fmtNm(totalNm) + ' from St Helier'], [destEl, 'Jersey'], [etaEl, fmtEta(totalNm / 14) + ' @14kn']];
    let i = 0;
    function typeStep() {
      if (i >= steps.length) { btn.textContent = 'Scroll to continue your journey'; btn.classList.add('pulse'); return; }
      const [el, text] = steps[i], dur = 260, start = performance.now();
      (function frame(now) {
        const t = Math.min(1, (now - start) / dur); routeTypeText(el, text, t);
        if (t < 1) requestAnimationFrame(frame); else { i++; setTimeout(typeStep, 90); }
      })(start);
    }
    setTimeout(typeStep, 1100);   // "Calculating route…" holds a moment before the new rows type in
  }
  callout.addEventListener('click', e => {
    if (e.target.closest('.ltake')) {
      // the card used to vanish the instant this was clicked, leaving a dead gap before her scripted route's own
      // callout faded in a moment later (only once scroll actually started, u>0). Now it stays up and visibly
      // recalculates instead (runChangeDestinationSequence, above). selFx (her live chevron) still hides
      // immediately — that one really is stale the instant routeMode arms, her scripted marker takes over that role.
      // 19 Sep 2026, Simon: "the sprite seemed to lag behind" once scrolling started — found the real cause: selLabel
      // (her floating name tag, a separate CSS2DObject) was never hidden here, only selFx was — it stayed pinned at
      // her real static position for the whole scripted journey while beat.js's own route marker moved off along
      // the animated path, reading as the name tag "lagging" further and further behind as she travelled.
      if (!selected || !g.onChangeDestination) return;
      if (e.target.closest('.ltake').textContent.startsWith('Calculating')) return;
      const snapshot = { mmsi: selected.mmsi, lat: selected.lat, lng: selected.lng, name: selectedExtra?.name || selected.name, typeLabel: typeName(selectedExtra?.type ?? selected.type), imo: selectedExtra?.imo, len: selectedExtra?.len, draught: selectedExtra?.draught };
      routeMode = true; selFx.style.opacity = '0'; selLabel.visible = false; selLabel.__wantVisible = false;
      const planned = g.onChangeDestination(snapshot);
      if (planned) runChangeDestinationSequence(planned.totalNm);
      return;
    }
    if (!e.target.closest('.kin-callout-close')) return;
    stage.querySelector('[data-live="panelClose"]')?.click();
    focusIsShip = false; focusQuat = g.faceQuat(g.CI.lng, g.CI.lat); focusMix = 0;
  });
  let calloutOn = false, calloutT = 0;
  function openCallout() {   // select() already fetches/shares selectedExtra — nothing more to look up here
    calloutOn = true; stage.classList.add('at-ship'); renderCallout();
  }
  function closeCallout() { calloutOn = false; stage.classList.remove('at-ship'); callout.hidden = true; leader.toggleAttribute("hidden", true); }
  // same layout change as renderCard() above (17 Sep 2026, Simon) — same rows/labels, same order, just in the
  // kin-callout-row k/v markup so it keeps Kinship's own look. Button now two lines — "Change Destination:" then
  // "JERSEY" on its own line (17 Sep, same day; was "Take me to St Helier" on one line, then "Change Destination:
  // ST HELIER" pulsing) — .ltake-l1/-l2 force the split regardless of width, rather than relying on wrapping.
  const ltakePulseT0 = performance.now();
  function renderCallout() {
    if (!calloutOn || !selected || routeMode) return; const s = selected, x = selectedExtra || {}; const type = x.type ?? s.type;
    callout.innerHTML = '<button type="button" class="kin-callout-close" aria-label="Cancel and start over">&times;</button>' +
      '<div class="kin-callout-title">' + (x.name || s.name || 'MMSI ' + s.mmsi) + (metaLine(type, x.len ?? s.len) ? ' <small class="lmeta">' + metaLine(type, x.len ?? s.len) + '</small>' : '') + '</div>' +
      '<div class="kin-callout-dist">' + fmtNm(gc(s, CI_PORT)) + ' from St Helier</div>' +
      (x.imo ? '<div class="kin-callout-row"><span class="k">IMO</span><span class="v">' + x.imo + '</span></div>' : '') +
      (typeName(type) ? '<div class="kin-callout-row"><span class="k">Type</span><span class="v">' + typeName(type) + '</span></div>' : '') +
      (x.draught ? '<div class="kin-callout-row"><span class="k">Draft</span><span class="v">' + x.draught + ' m</span></div>' : '') +
      '<div class="kin-callout-row"><span class="k">Position</span><span class="v">' + s.lat.toFixed(3) + '°, ' + s.lng.toFixed(3) + '°</span></div>' +
      '<div class="kin-callout-row"><span class="k">Speed</span><span class="v">' + fmtSpdCog(s) + '</span></div>' +
      (x.dest ? '<div class="kin-callout-row"><span class="k">Bound for</span><span class="v">' + x.dest + '</span></div>' : '') +
      (x.eta ? '<div class="kin-callout-row"><span class="k">Posted ETA</span><span class="v">' + x.eta + '</span></div>' : '') +
      '<button type="button" class="ltake pulse"><span class="ltake-l1">Change Destination:</span><span class="ltake-l2">JERSEY</span></button>';
    // innerHTML rebuilds every few seconds restart the CSS animation; keep the pulse phase continuous (3s cycle)
    const lt = callout.querySelector('.ltake'); if (lt) lt.style.animationDelay = -((performance.now() - ltakePulseT0) % 3000) + 'ms';
  }
  function placeCallout(p) {
    // finder-card layout (3 Oct 2026): no leader line, no floating position, no hiding for the fly-in — the card is a static block in the panel
    if (stage.classList.contains('vcard-panel')) {
      leader.toggleAttribute("hidden", true); callout.style.opacity = '1';
      callout.hidden = routeMode ? p > 0.02 : !(calloutOn && selected);   // route mode: beat.js's own route card takes over in the same slot once scroll starts
      return;
    }
    // 18 Sep 2026: while route mode's own "scroll to continue" prompt is up (armed by the .ltake click above), this
    // card just needs to stay put and then get out of the way — no leader line (nothing live to point at any more),
    // hidden once beat.js's own scripted callout is due to start taking over (VOYAGE_ROUTE.show[0], beat.js) —
    // reversible on p, same as everything else here, so scrolling back to the top brings the prompt back too.
    if (routeMode) { leader.toggleAttribute("hidden", true); callout.style.opacity = '1'; callout.hidden = p > 0.02; return; }
    if (!calloutOn || !selected) return;
    if (p > 0.30 && p < 0.70) { callout.hidden = true; leader.toggleAttribute("hidden", true); return; }   // the fly-in has the frame; the callout returns in the deep zoom or if the reader scrolls up
    const q = toScreen(selected.lat, selected.lng); if (!q) { callout.hidden = true; leader.toggleAttribute("hidden", true); return; }
    const r = host.getBoundingClientRect(), sr = stage.getBoundingClientRect(); const x = r.left - sr.left + q[0], y = r.top - sr.top + q[1];
    const W = stage.clientWidth, H = stage.clientHeight, cw = callout.offsetWidth || 220, ch = callout.offsetHeight || 110;
    const left = x + 120 + cw > W * 0.68;   // card sits up and to the right of her — or to the left, clear of the picker panel on the right
    const cx = left ? Math.max(8, x - 120 - cw) : Math.min(W - cw - 8, x + 120), cy = Math.min(H - ch - 8, Math.max(8, y - ch - 90));
    callout.style.left = cx + 'px'; callout.style.top = cy + 'px'; callout.style.opacity = '1'; callout.hidden = false;   // kin-callout-card defaults to opacity:0 (Kinship's own fade-in) — force it here since this one shows/hides via [hidden], not a scroll-driven fade
    leaderLine.setAttribute('x1', x); leaderLine.setAttribute('y1', y); leaderLine.setAttribute('x2', left ? cx + cw : cx); leaderLine.setAttribute('y2', cy + ch); leader.toggleAttribute("hidden", false);
  }
  /* the pulsing chevron itself — armed the instant a ship is selected (not gated behind "Follow"), positioned live
     every frame off her real lat/lng/cog. Same three-layer construction as Kinship's own marker (selFx/selChev*,
     declared up near selMesh), just time-driven rather than track-driven for the pulse. */
  function placeChevron(now) {
    if (!selected || routeMode) { selFx.style.opacity = '0'; return; }
    const s = selected, q = toScreen(s.lat, s.lng);
    if (!q) { selFx.style.opacity = '0'; return; }
    const r = host.getBoundingClientRect(), sr = stage.getBoundingClientRect(); const x = r.left - sr.left + q[0], y = r.top - sr.top + q[1];
    let ang = 0;
    if (s.cog != null) {   // heading in screen space: project a point a little further along her course and take the angle between the two — same trick Kinship's own marker uses, just from real COG instead of a scripted track tangent
      const b = s.cog * DEG, dd = 0.05, cosLat = Math.max(0.2, Math.cos(s.lat * DEG));
      const q2 = toScreen(s.lat + Math.cos(b) * dd, s.lng + Math.sin(b) * dd / cosLat);
      if (q2) ang = Math.atan2((r.top - sr.top + q2[1]) - y, (r.left - sr.left + q2[0]) - x) * 180 / Math.PI;
    }
    const t = 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')';
    const tSec = (now - selectedAt) / 1000;
    const wave = SEL_PULSE_FLOOR + (1 - SEL_PULSE_FLOOR) * (0.5 + 0.5 * Math.cos(tSec / SEL_PULSE_PERIOD * 2 * Math.PI));
    const burst = 1 + 0.8 * Math.exp(-tSec / SEL_PULSE_BURST * 3);
    const flash = Math.min(1, wave * burst);
    selChevCore.setAttribute('transform', t + ' scale(1.15)');
    selChevFlash.setAttribute('transform', t + ' scale(' + (1.15 * (1 + flash * 0.65)).toFixed(3) + ')'); selChevFlash.style.opacity = Math.min(1, flash * 1.3).toFixed(3);
    selChevGlow.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') scale(' + (1 + flash * 4.2).toFixed(2) + ')'); selChevGlow.style.opacity = flash.toFixed(3);
    selFx.style.opacity = '1';
  }
  /* --- per-frame --- */
  const tmpQ = new THREE.Quaternion();
  let inChannel = 0, lastList = 0, fleetIn = 0;   // fleetIn: 0-1, the deep-zoom local-ship icons' own reveal — matches the matrix->satellite transition (p 0.56-0.74), not camera depth, so they're never visible/clickable before the imagery that would show them (Simon, 16 Sep 2026)
  function frame(now, f, p, depthRatio, worldPerPx) {
    flights?.frame(now, p, worldPerPx);                                   // independent of the AIS switch
    if (!enabled) { if (selArc) selArc.visible = false; return; }
    if (selArc) selArc.visible = true;
    if (sim) sim.step(f * 16.7 / 1000 * 40);   // simulated time runs ×40 so the fleet visibly moves
    if (sim && now - lastRender > 1500) for (const s of sim.ships) report(s.mmsi, s.lat, s.lng, s.sog, s.cog, s.name, s.type);
    if (bufferUrl && !es && now - pollT > 30000) { pollT = now; fetch(bufferUrl + '/snapshot.json', { cache: 'no-store' }).then(r => r.json()).then(ingestSnapshot).catch(() => {}); }
    if (now - lastRender > 500) {
      lastRender = now; evict();
      const pos = aisPts.geometry.attributes.position.array; let n = 0; inChannel = 0;
      for (const s of registry.values()) { if (n >= MAX) break; const v = lonLatToVec3(s.lng, s.lat, CFG.radius * 1.0028); pos[n * 3] = v.x; pos[n * 3 + 1] = v.y; pos[n * 3 + 2] = v.z; const cc = colOf(s.type); aisColors[n * 3] = cc.r; aisColors[n * 3 + 1] = cc.g; aisColors[n * 3 + 2] = cc.b; n++; if (s.lng > GRID.lonMin && s.lng < GRID.lonMax && s.lat > GRID.latMin && s.lat < GRID.latMax) inChannel++; }
      aisPts.geometry.attributes.position.needsUpdate = true; aisPts.geometry.attributes.color.needsUpdate = true; aisPts.geometry.setDrawRange(0, n);
      if (ui.count) ui.count.textContent = n.toLocaleString(); if (ui.channel) ui.channel.textContent = inChannel.toLocaleString();
      if (grid && (mode === 'live' || sim)) { paintHeat(); saveHeat(now); }
      if (trailsDirty) rebuildTrails();
      if (selected && !routeMode) { const v = lonLatToVec3(selected.lng, selected.lat, CFG.radius * 1.0029); selGeo.attributes.position.setXYZ(0, v.x, v.y, v.z); selGeo.attributes.position.needsUpdate = true; renderCard(); renderCallout(); }
      if (now - lastList > 4000 && document.activeElement !== ui.input && !listHover) { lastList = now; renderList(); }
    }
    // the fly-in brings the camera from FAR_Z to NEAR_Z (≈8× closer to the surface): shrink the live dots so they keep their
    // screen size, and retire them over the last part so the hand-off frame is still "the islands as one orange dot"
    const zoom = smooth01((p - 0.33) / 0.29), keep = 1 - smooth01((p - 0.55) / 0.2);
    // deepness: 0 at the fly-in's end, 1 at the close zoom over Jersey (from the real camera depth, not p)
    const deep = depthRatio != null ? smooth01((Math.log(0.16 / 1.35) - Math.log(Math.max(1e-4, depthRatio))) / (Math.log(0.16 / 1.35) - Math.log(0.0062 / 1.35))) : 0;
    // dots: never below ~1.6 px on screen, up to 3 px as we close — then they yield to the icons
    if (worldPerPx) aisPts.material.size = Math.max(AIS_SIZE * (depthRatio != null ? depthRatio : 1 + (0.16 / 1.35 - 1) * zoom), (1.6 + 1.4 * zoom) * worldPerPx); else aisPts.material.size = AIS_SIZE * (1 + (0.16 / 1.35 - 1) * zoom);
    aisFade.base = 0.85 * (1 - 0.9 * smooth01((deep - 0.12) / 0.15));
    // the chosen ship's orange marker: a sprite with size attenuation grows with every step closer — at the deep zoom it filled
    // the screen. Keep it ~4× an AIS dot on screen at any depth, and hand over to a modest halo once the icons carry the ships.
    { const dr = depthRatio != null ? depthRatio : 1 + (0.16 / 1.35 - 1) * zoom; const px = 14;   // ≈ 7 css px at fov 55 — a clear halo under her icon, never a blob
      selMesh.material.size = worldPerPx ? Math.max(SEL_SIZE * dr, px * worldPerPx) : SEL_SIZE * dr; }
    // icons: arrive with the satellite imagery, not before — same p window the night aerial fades in on (beat.js NIGHT, [0.56,0.74]),
    // so nothing is clickable while the view is still the dot-matrix and there's nothing there to see it against
    fleetIn = smooth01((p - 0.56) / 0.18);
    iconPx = fleetIn > 0.02 ? 4 + 4 * smooth01((deep - 0.1) / 0.6) : 0;   // 4 → 8 px once revealed, still sized from real camera depth: small enough that a raft of ships in harbour reads as many, not one
    const iconA = fleetIn;   // opacity in sync with fleetIn alone now — was also multiplied by a deep-based factor that only opened up much later (~80%), so visible and clickable disagreed; Simon, 16 Sep 2026
    arrows.material.opacity = discs.material.opacity = 0.95 * iconA;
    if (worldPerPx && (now - lastIconBuild > 400 || Math.abs(worldPerPx - lastWorldPerPx) / worldPerPx > 0.08)) { lastIconBuild = now; lastWorldPerPx = worldPerPx; rebuildIcons(worldPerPx); }
    if (heatFade) heatFade.base = (0.7 + 0.3 * zoom) * keep;
    trailFade.base = (0.22 + 0.22 * zoom) * (1 - 0.75 * smooth01(deep / 0.5));   // tracks step back as soon as the deep zoom begins, so the ships read as ships
    // 17 Sep 2026, Simon: "Go to ship" (finder button or on-globe click card) turns the globe to face her over about
    // a second (this ramp), but
    // used to then hold that blend at full strength forever — meaning drag input kept getting accumulated but almost
    // entirely swallowed by the ongoing slerp toward the fixed focusQuat, so the globe felt locked once she was
    // centred. Once the turn completes, fold it into beat.js's own rotation baseline (settleFocus) and drop
    // focusQuat — zero visual jump, but drag/idle-spin are fully back in control from then on, same as before any
    // ship was selected.
    if (focusQuat) {
      focusMix = Math.min(1, focusMix + 0.018 * f);
      if (focusMix >= 1) { g.settleFocus(focusQuat); focusQuat = null; focusMix = 0; slowSpin = focusIsShip; }   // 17 Sep 2026, Simon: halve idle spin once settled on a followed vessel (not on the X's CI recentre) so she stays visible longer before drifting off
    }
    placeCallout(p);
    placeChevron(now);   // armed straight from selection, independent of calloutOn/p — Voyage Planner Phase 3, 2nd pass
  }
  // called by the beat with its spin/drag quaternion; returns the quaternion to use (ship + islands framed while p is small)
  function focusDepth(p, f) {
    zoomNow += (zoomTarget - zoomNow) * Math.min(1, 0.04 * (f || 1));
    const k = 1 - Math.min(1, Math.max(0, (p - 0.26) / 0.12));   // held through the world view; released as the fly-in starts (0.26–0.38)
    return 1 + (zoomNow - 1) * k;
  }
  function applyFocus(q, p) {
    if (!focusQuat) return q;
    const k = focusMix * (1 - Math.min(1, Math.max(0, (p - 0.26) / 0.12)));   // held through the world view; the scroll's own settle takes over from p≈.26 (fully by .38, when the globe turns to the islands)
    return tmpQ.copy(q).slerp(focusQuat, k * k * (3 - 2 * k));
  }
  applyEnabled();
  // Voyage Planner Phase 4: beat.js calls this to hand rendering of the selected ship back to live.js — on any of
  // the existing full resets (voyagePanelClose, "Change ship", starting the demo vessel/monitor mode instead).
  // routeMode arming now also hides selLabel (the .ltake click handler, above) — hand it back if routeMode is
  // switched off again while she's still selected (e.g. route planning failed after the click), same as selFx which
  // placeChevron() restores on its own next frame; selLabel has no per-frame restore, so it needs putting back here.
  function setRouteMode(on) { routeMode = !!on; if (!routeMode && calloutOn) renderCallout(); if (!routeMode && selected) { selLabel.__wantVisible = true; selLabel.visible = enabled; } }
  // 4 Oct 2026, Simon: "when we click demo vessel, have the globe centre on the vessel upon first click" — the same turn-then-release a chosen live ship gets
  function focusOn(lng, lat) { focusIsShip = true; focusQuat = g.faceQuat(lng, lat); focusMix = 0; zoomTarget = 1; }
  return { frame, applyFocus, focusDepth, focusOn, get enabled() { return enabled; }, get selected() { return selected; }, get mode() { return mode; }, get spinScale() { return slowSpin ? 0.5 : 1; }, get fleetIn() { return fleetIn; }, setRouteMode, destroy() { clearInterval(adoptTimer); flights?.destroy?.(); try { ws?.close(); } catch (_) {} } };
}
