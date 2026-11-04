/* _beats/globe-live/flights.js — LIVE FLIGHTS to and from the islands (HLC Globe Lab, 16 Sep 2026).
   Reads <BUFFER_URL>/flights.json (the Fly buffer polls adsb.lol — free community ADS-B — every ~12 s for the circle around the
   islands, resolves each callsign's route once and names the operator). Draws, on the sphere:
     • an aircraft marker per island flight (inbound / outbound / local), rotated to its track, lifted a little by altitude
     • a trail behind each aircraft along the path it actually flew (the buffer keeps the last 12 minutes of fixes), fading with age —
       cyan for inbound, warm for outbound, white for local; the route arc to the far airport was dropped (Howard, 16 Sep: real trail)
     • a small label — operator · from → to · altitude — that hides on the far side of the globe
   Shown only once the detailed Channel picture is in (fades in over the deep zoom, p ≈ .72–.80; Howard, 16 Sep); its own on/off
   switch sits in the #aisControl strip next to the AIS one. Nothing here reads scrollY or another beat's DOM. */
import * as THREE from 'three152';
import { CSS2DObject } from 'three152/addons/renderers/CSS2DRenderer.js';

const DEG = Math.PI / 180;
const AIRPORTS = { JER: [49.208, -2.195], GCI: [49.435, -2.602], ACI: [49.706, -2.215] };
const smooth01 = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
function planeTexture() {   // a small light-blue aircraft silhouette, nose up
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.translate(32, 32); x.fillStyle = '#a8e4ff'; x.strokeStyle = 'rgba(4,7,14,.7)'; x.lineWidth = 2; x.lineJoin = 'round';   // light blue (Howard, 16 Sep) — reads as aircraft against the white ship markers
  x.beginPath(); x.moveTo(0, -26); x.lineTo(5, -14); x.lineTo(6, 2); x.lineTo(28, 12); x.lineTo(28, 17); x.lineTo(6, 12); x.lineTo(4, 22); x.lineTo(11, 27); x.lineTo(11, 30);
  x.lineTo(0, 27); x.lineTo(-11, 30); x.lineTo(-11, 27); x.lineTo(-4, 22); x.lineTo(-6, 12); x.lineTo(-28, 17); x.lineTo(-28, 12); x.lineTo(-6, 2); x.lineTo(-5, -14); x.closePath();
  x.fill(); x.stroke();
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
// ---- SIMULATED FLIGHTS (go-live build, Simon + Howard, 4 Nov 2026) ----------------------------------------------------------------
// When the page is built without live data, a handful of invented aircraft fly the real approach and departure lines to and from the
// islands' airports, in the same data shape as the buffer's flights.json, so everything downstream (markers, trails, labels, the click-a-plane
// card) is unchanged. They are labelled "Simulated flight" and the switch reads "Flights Simulated". Nothing is fetched.
const SIM_AIRPORTS = { JER: { iata: 'JER', name: 'Jersey Airport', city: 'Jersey', lat: 49.208, lon: -2.195 }, GCI: { iata: 'GCI', name: 'Guernsey Airport', city: 'Guernsey', lat: 49.435, lon: -2.602 }, ACI: { iata: 'ACI', name: 'Alderney Airport', city: 'Alderney', lat: 49.706, lon: -2.215 } };
const SIM_FAR = { LGW: { iata: 'LGW', name: 'London Gatwick', city: 'London', lat: 51.148, lon: -0.19 }, MAN: { iata: 'MAN', name: 'Manchester', city: 'Manchester', lat: 53.354, lon: -2.275 }, BHX: { iata: 'BHX', name: 'Birmingham', city: 'Birmingham', lat: 52.454, lon: -1.748 }, SOU: { iata: 'SOU', name: 'Southampton', city: 'Southampton', lat: 50.95, lon: -1.357 }, EXT: { iata: 'EXT', name: 'Exeter', city: 'Exeter', lat: 50.734, lon: -3.414 } };
const SIM_FLIGHTS = [
  { hex: 'sim001', cs: 'SIM101', island: 'JER', far: 'LGW', dir: 'in', gs: 200, at: 0.08 }, { hex: 'sim002', cs: 'SIM102', island: 'JER', far: 'MAN', dir: 'in', gs: 210, at: 0.58 },
  { hex: 'sim003', cs: 'SIM103', island: 'JER', far: 'BHX', dir: 'out', gs: 210, at: 0.33 }, { hex: 'sim004', cs: 'SIM104', island: 'JER', far: 'EXT', dir: 'out', gs: 190, at: 0.83 },
  { hex: 'sim005', cs: 'SIM105', island: 'GCI', far: 'LGW', dir: 'in', gs: 200, at: 0.21 }, { hex: 'sim006', cs: 'SIM106', island: 'GCI', far: 'SOU', dir: 'out', gs: 180, at: 0.69 },
];
const SIM_RUN_NM = 90;   // how far out each simulated flight starts (or ends)
function simFeed(nowMs) {
  const aircraft = [];
  for (const f of SIM_FLIGHTS) {
    const isl = SIM_AIRPORTS[f.island], far = SIM_FAR[f.far];
    const dLat = far.lat - isl.lat, dLon = far.lon - isl.lon;
    const distNm = Math.hypot(dLat * 60, dLon * 60 * Math.cos(isl.lat * DEG)), frac = Math.min(1, SIM_RUN_NM / distNm), runNm = frac * distNm;
    const period = runNm / f.gs * 3600;                       // seconds for one run; the position moves at exactly gs knots
    const pAt = ms => ms / 1000 / period + f.at;               // progress in runs; the fractional part is the position along the run
    const at = p => {                                           // p: progress (fraction = along the run); inbound runs far → island, outbound island → far
      const u = p - Math.floor(p), t = f.dir === 'in' ? 1 - u : u;
      const lat = isl.lat + dLat * frac * t, lon = isl.lon + dLon * frac * t;
      const climb = f.dir === 'in' ? Math.max(0, 23000 * Math.pow(t, 1.2)) : 23000 * Math.pow(u, 0.8);
      return { lat, lon, alt: Math.max(f.dir === 'in' ? 0 : 0, climb) };
    };
    const p0 = pAt(nowMs), cur = at(p0), sign = f.dir === 'in' ? -1 : 1;
    const track = (Math.atan2(sign * dLon * Math.cos(isl.lat * DEG), sign * dLat) / DEG + 360) % 360;
    const trail = [];
    for (let k = 12; k >= 1; k--) {                             // 30-second fixes for the last six minutes, not across a restart of the run
      const ms = nowMs - k * 30000, p = pAt(ms); if (Math.floor(p) !== Math.floor(p0)) continue;
      const q = at(p); trail.push([q.lat, q.lon, q.alt, ms]);
    }
    const from = f.dir === 'in' ? far : isl, to = f.dir === 'in' ? isl : far;
    aircraft.push({ hex: f.hex, callsign: f.cs, operator: 'Simulated flight', island: f.island, dir: f.dir, from, to, lat: cur.lat, lon: cur.lon, alt: cur.alt, ground: false,
      track, gs: f.gs, vr: f.dir === 'in' ? -1200 : 1800, seen: 0, trail, type: 'Simulated aircraft', desc: 'Simulated aircraft' });
  }
  return { ok: true, aircraft };
}
export function initFlights(g) {
  // g: { globe, CFG, lonLatToVec3, camera, stage, bufferUrl, showIn:[p0,p1], control }
  const { globe, CFG, lonLatToVec3, camera, stage } = g; const R = CFG.radius; const showIn = g.showIn || [0.72, 0.80];
  const group = new THREE.Group(); group.renderOrder = 5; globe.add(group);
  // trails: one Line per aircraft, vertex colours fade from black (oldest) to the tint (newest); additive so the fade reads over the map
  const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const TRAIL_MIN = 6;               // minutes of trail drawn (Howard, 16 Sep: about half of the first cut)
  const TINT = { in: new THREE.Color(0xbfefff), out: new THREE.Color(0xffd9a8), local: new THREE.Color(0xe6eef5) };
  const tex = planeTexture();
  const items = new Map();          // hex → { sprite, label, labelEl, trail, d, at }
  let enabled = true; try { enabled = sessionStorage.getItem('hlc_flights_on') !== '0'; } catch (_) {}
  let layerA = 0, lastPoll = 0, status = 'loading', count = 0;
  const gq = new THREE.Quaternion(), camWorld = new THREE.Vector3(), tmp = new THREE.Vector3();

  // ---- the switch, in the same strip as the AIS one
  const control = g.control || document.getElementById('aisControl');
  let sw = null, word = null;
  if (control && !control.querySelector('[data-flights]')) {
    const sep = document.createElement('span'); sep.className = 'sep'; sep.style.cssText = 'width:1px;height:14px;background:rgba(255,255,255,.18);margin:0 2px';
    word = document.createElement('div'); word.className = 'lmode fl wait'; word.dataset.flights = '1'; word.innerHTML = '<i></i><b>CI Flights</b>';
    sw = document.createElement('button'); sw.type = 'button'; sw.setAttribute('aria-label', 'Live flights on / off'); sw.title = 'Live flights on / off'; sw.dataset.flights = '1';
    control.appendChild(sep); control.appendChild(word); control.appendChild(sw);
    const css = document.createElement('style'); css.textContent = `
#aisControl .lmode.fl.wait i{background:#FFB247}#aisControl .lmode.fl.live{color:#bfefff}#aisControl .lmode.fl.live i{background:#bfefff;box-shadow:0 0 8px #bfefff;animation:none}
#aisControl .lmode.fl.off{color:#7f8b99}#aisControl .lmode.fl.off i{background:#55606d;box-shadow:none;animation:none}
#aisControl button[data-flights]{background:#bfefff}#aisControl button[data-flights].off{background:#55606d}#aisControl button[data-flights].off::after{left:2px}
.beat-stage .flabel-anchor{position:absolute;width:0;height:0;overflow:visible}
.beat-stage .flabel{position:absolute;left:0;top:0;transform:translate(9px,-50%);white-space:nowrap;pointer-events:none;display:flex;flex-direction:column;align-items:flex-start;gap:2px;font:500 9px/1 'Jost',system-ui,sans-serif;letter-spacing:.06em;color:#eaf7ff;text-shadow:0 1px 2px rgba(0,0,0,.8);opacity:0}
.beat-stage .flabel b{font-weight:600;color:#fff;letter-spacing:.1em;text-transform:uppercase;font-size:9px}
.beat-stage .flabel b[hidden]{display:none}
.beat-stage .flabel em{font:500 8.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#cfe6ff;font-style:normal}
.beat-stage .flabel span{color:#bfefff;font-size:8.5px;letter-spacing:.04em}
.beat-stage .fhover{position:absolute;z-index:7;width:20px;height:20px;margin:-10px 0 0 -10px;border:1.5px solid #bfefff;border-radius:50%;pointer-events:none;box-shadow:0 0 8px rgba(191,239,255,.45)}
.beat-stage .fcallout{position:absolute;z-index:9;width:236px;background:rgba(6,10,18,.9);border:1px solid rgba(191,239,255,.35);border-left:3px solid #bfefff;border-radius:10px;padding:10px 12px 9px;color:#eaf7ff;font:400 12px/1.4 'Jost',Inter,system-ui,sans-serif;backdrop-filter:blur(8px);pointer-events:auto;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.beat-stage .fcallout .fc-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.beat-stage .fcallout .fc-head b{font-size:13px;font-weight:700;color:#fff}
.beat-stage .fcallout .fc-head em{margin-left:auto;font:500 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#bfefff;font-style:normal}
.beat-stage .fcallout .fc-route{font-size:12.5px;color:#fff;margin-bottom:6px}
.beat-stage .fcallout .fc-route small{display:block;font-size:10px;color:#9fd8e8;letter-spacing:.04em}
.beat-stage .fcallout .frow{display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-top:1px solid rgba(255,255,255,.07)}
.beat-stage .fcallout .frow span{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#7fb2c4;flex:0 0 auto}
.beat-stage .fcallout .frow b{font-weight:600;color:#eafff9;font-variant-numeric:tabular-nums;text-align:right}
.beat-stage .fcallout .fc-close{position:absolute;right:8px;top:6px;background:none;border:0;color:#7fb2c4;font-size:14px;cursor:pointer;line-height:1}
.beat-stage .fleader{position:absolute;inset:0;width:100%;height:100%;z-index:8;pointer-events:none;overflow:visible}
.beat-stage .fleader[hidden]{display:none}
.beat-stage .fleader line{stroke:rgba(191,239,255,.7);stroke-width:1.2;stroke-dasharray:3 3}`;
    document.head.appendChild(css);
    sw.addEventListener('click', () => { enabled = !enabled; try { sessionStorage.setItem('hlc_flights_on', enabled ? '1' : '0'); } catch (_) {} applyEnabled(); });
  }
  function setWord() { if (!word) return; const w = status === 'live' && enabled ? `CI Flights · ${count}` : status === 'sim' && enabled ? 'Flights Simulated' : 'CI Flights';
    word.className = 'lmode fl ' + (!enabled ? 'off' : status === 'live' ? 'live' : status === 'err' ? 'err' : 'wait'); word.querySelector('b').textContent = w; word.title = !enabled ? 'Flights off' : status === 'live' ? `${count} flights to / from the islands now` : status === 'sim' ? 'Example flights, not live data' : status === 'err' ? 'Flights: feed error' : 'Flights: loading'; }
  function applyEnabled() { if (sw) sw.classList.toggle('off', !enabled); setWord(); try { window.dispatchEvent(new CustomEvent('flights:toggle', { detail: { on: enabled } })); } catch (_) {} }

  // ---- geometry
  const pos = (lat, lon, altFt) => lonLatToVec3(lon, lat, R * (1.0035 + 0.012 * Math.min(1, Math.max(0, (altFt || 0) / 38000))));   // altitude exaggerated ×~7 so a climb-out reads
  function buildTrail(it, d) {
    // vertices: the buffer's fixes (oldest first) then the aircraft's current position, which frame() keeps moving between polls
    const cut = Date.now() - TRAIL_MIN * 60e3; const fixes = (d.trail || []).filter(f => f[0] != null && f[1] != null && f[3] > cut);
    const n = fixes.length + 1; if (n < 3) { if (it.trail) it.trail.visible = false; return; }
    const tint = TINT[d.dir] || TINT.local, posA = new Float32Array(n * 3), colA = new Float32Array(n * 3);
    for (let i = 0; i < fixes.length; i++) { const f = fixes[i]; const v = pos(f[0], f[1], f[2] ?? d.alt); posA.set([v.x, v.y, v.z], i * 3);
      const k = Math.pow((i + 1) / n, 1.25); colA.set([tint.r * k, tint.g * k, tint.b * k], i * 3); }   // fade in with age → brightest at the aircraft
    const v = pos(d.lat, d.lon, d.alt); posA.set([v.x, v.y, v.z], (n - 1) * 3); colA.set([tint.r, tint.g, tint.b], (n - 1) * 3);
    if (!it.trail) { it.trail = new THREE.Line(new THREE.BufferGeometry(), trailMat); it.trail.renderOrder = 5; it.trail.frustumCulled = false; group.add(it.trail); }
    it.trail.geometry.dispose(); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(posA, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    it.trail.geometry = geo; it.trail.visible = true;
  }
  function ensure(d) {
    let it = items.get(d.hex);
    if (!it) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
      sprite.renderOrder = 6; group.add(sprite);
      const outer = document.createElement('div'); outer.className = 'flabel-anchor'; const el = document.createElement('div'); el.className = 'flabel'; outer.appendChild(el);   // the renderer positions the anchor; our offset lives on the inner label
      const label = new CSS2DObject(outer); group.add(label);
      it = { sprite, label, labelEl: el, trail: null, d, at: 0, text: '' }; items.set(d.hex, it);
    }
    it.d = d; it.at = performance.now();
    buildTrail(it, d);
    const who = d.operator || d.airline || d.callsign || d.reg || 'aircraft';
    const route = d.from && d.to ? `${d.from.iata} → ${d.to.iata}` : d.dir === 'in' ? `inbound · ${d.island}` : d.dir === 'out' ? `outbound · ${d.island}` : d.dir === 'local' ? 'local' : '';
    const onGround = d.ground || (d.alt != null && d.alt <= 50); const alt = onGround ? 'on the ground' : d.alt != null ? `${Math.round(d.alt / 100) * 100} ft` : '';
    // the operator's name in text (airline logos dropped 30 Oct 2026, Simon: the logo files were never in the repo and the free logo CDN was a third party). Private / light aircraft show name or registration.
    const nameHtml = `<b>${who}</b>`;
    const cs = d.callsign && d.callsign !== who ? `<em>${d.callsign}</em>` : '';    // not repeated when the 'name' is the callsign itself (private aircraft)                       // small logo + small callsign on one line (Howard, 16 Sep)
    // kept simple (Howard, 16 Sep): logo + callsign, then the route only — no operator text beside a logo, no type, no altitude
    const text = nameHtml + (route && route !== 'local' ? `<span>${route}</span>` : '');       // name with the route beneath; no callsign (Howard, 16 Sep)
    if (it.text !== text) { it.labelEl.innerHTML = text; it.text = text; }
  }
  async function poll() {
    if (!g.bufferUrl && !g.simulated) { status = 'err'; setWord(); return; }
    try { const j = g.simulated ? simFeed(Date.now()) : await (await fetch(g.bufferUrl + '/flights.json', { cache: 'no-store' })).json();
      if (!j.ok) throw new Error(j.err || 'buffer: flights not ok');
      const keep = new Set();
      for (const d of j.aircraft) { if (!(d.island || d.dir === 'local')) continue; keep.add(d.hex); ensure(d); }
      for (const [hex, it] of items) if (!keep.has(hex) && performance.now() - it.at > 90000) { group.remove(it.sprite); group.remove(it.label); if (it.trail) { group.remove(it.trail); it.trail.geometry.dispose(); } items.delete(hex); }
      count = keep.size; status = g.simulated ? 'sim' : 'live';
      if (calloutHex && items.get(calloutHex)) renderCard(items.get(calloutHex));
    } catch (e) { status = 'err'; console.warn('[flights]', e.message); }
    setWord();
  }
  // ---- click a plane: a callout with the full picture (operator, flight, route with airport names, aircraft, altitude, speed,
  //      heading, climb / descent, distance and time to the island airport). Follows the aircraft; closes on a click elsewhere or Esc.
  const host = g.host || stage; let downX = 0, downY = 0, calloutHex = null;
  const card = document.createElement('div'); card.className = 'fcallout'; card.hidden = true; stage.appendChild(card);
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leader.setAttribute('class', 'fleader'); leader.innerHTML = '<line x1="0" y1="0" x2="0" y2="0"/>'; leader.toggleAttribute("hidden", true); stage.appendChild(leader);
  const leaderLine = leader.querySelector('line');
  const toScreen = v => { const w = v.clone().applyMatrix4(globe.matrixWorld).project(camera); const W = host.clientWidth || 1, H = host.clientHeight || 1; if (w.z > 1) return null; return [(w.x + 1) / 2 * W, (1 - w.y) / 2 * H]; };
  const hostOff = () => { const a = host.getBoundingClientRect(), b = stage.getBoundingClientRect(); return [a.left - b.left, a.top - b.top]; };
  const nmBetween = (a, b) => { const R = 3440.065, φ1 = a.lat * DEG, φ2 = b.lat * DEG, dφ = (b.lat - a.lat) * DEG, dλ = (b.lon - a.lon) * DEG; const x = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
  function renderCard(it) {
    const d = it.d, who = d.operator || d.airline || '';
    const name = who && (!d.iata || true) ? `<b>${who || d.reg || d.callsign}</b>` : `<b>${d.reg || d.callsign}</b>`;
    const ap = x => x ? `${x.name || x.iata}${x.city ? ' · ' + x.city : ''}` : '';
    const route = d.from && d.to ? `<div class="fc-route">${d.from.iata} → ${d.to.iata}<small>${ap(d.from)}</small><small>${ap(d.to)}</small></div>` : d.dir === 'in' ? `<div class="fc-route">Inbound · ${d.island}</div>` : d.dir === 'out' ? `<div class="fc-route">Outbound · ${d.island}</div>` : '';
    const rows = [];
    if (d.type || d.reg) rows.push(['Aircraft', [d.desc || d.type, d.reg].filter(Boolean).join(' · ')]);
    if (d.ground || (d.alt != null && d.alt <= 50)) rows.push(['Status', 'On the ground']); else if (d.alt != null) rows.push(['Altitude', `${Math.round(d.alt / 100) * 100} ft` + (d.vr ? (d.vr > 200 ? ' · climbing' : d.vr < -200 ? ' · descending' : '') : '')]);
    if (d.gs) rows.push(['Speed', `${Math.round(d.gs)} kts`]); if (d.track != null && !d.ground) rows.push(['Heading', `${Math.round(d.track).toString().padStart(3, '0')}°`]);
    const dest = d.dir === 'in' && d.to && d.to.lat != null ? d.to : d.dir === 'in' && d.island && AIRPORTS[d.island] ? { lat: AIRPORTS[d.island][0], lon: AIRPORTS[d.island][1] } : null;
    if (dest && !d.ground) { const nm = nmBetween(d, dest); rows.push(['To run', `${nm < 10 ? nm.toFixed(1) : Math.round(nm)} nm`]); if (d.gs > 40) { const min = nm / d.gs * 60; rows.push(['ETA', min < 1 ? 'now' : `${Math.round(min)} min`]); } }
    card.innerHTML = `<button class="fc-close" type="button" aria-label="Close">×</button><div class="fc-head">${name}${d.callsign ? `<em>${d.callsign}</em>` : ''}</div>${route}` + rows.map(([k, v]) => `<div class="frow"><span>${k}</span><b>${v}</b></div>`).join('');
    card.querySelector('.fc-close').onclick = ev => { ev.stopPropagation(); closeCard(); };
  }
  function closeCard() { calloutHex = null; card.hidden = true; leader.toggleAttribute("hidden", true); }
  function placeCard() {
    const it = calloutHex && items.get(calloutHex); if (!it || !group.visible || it.sprite.material.opacity <= 0) { if (calloutHex) closeCard(); return; }
    const q = toScreen(it.sprite.position); if (!q) { card.hidden = true; leader.toggleAttribute("hidden", true); return; }
    const [ox, oy] = hostOff(); const x = q[0] + ox, y = q[1] + oy; const W = stage.clientWidth, H = stage.clientHeight;
    const cw = card.offsetWidth || 236, ch = card.offsetHeight || 120; let cx = x + 26, cy = y - ch - 18;
    if (cx + cw > W - 8) cx = x - cw - 26; if (cy < 8) cy = y + 18; if (cy + ch > H - 8) cy = H - ch - 8;
    card.style.left = cx.toFixed(0) + 'px'; card.style.top = cy.toFixed(0) + 'px'; card.hidden = false;
    const ax = cx > x ? cx : cx + cw, ay = cy + ch > y ? (cy < y ? y : cy) : cy + ch;
    leaderLine.setAttribute('x1', x); leaderLine.setAttribute('y1', y); leaderLine.setAttribute('x2', ax); leaderLine.setAttribute('y2', Math.min(Math.max(ay, cy), cy + ch)); leader.toggleAttribute("hidden", false);
  }
  const HIT = 22;
  function pick(clientX, clientY) {   // the nearest visible aircraft within HIT px of a stage point, with its screen position
    if (!group.visible) return null;
    const r = host.getBoundingClientRect(); const x = clientX - r.left, y = clientY - r.top; let best = null, bd = HIT * HIT, bq = null;
    for (const it of items.values()) { if (it.sprite.material.opacity <= 0) continue; const q = toScreen(it.sprite.position); if (!q) continue; const dd = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (dd < bd) { bd = dd; best = it; bq = q; } }
    return best ? { it: best, q: bq } : null;
  }
  // hover: a small ring snaps to the aircraft a click would pick (same idea as the ship ring; the plane wins when both are near)
  const ring = document.createElement('div'); ring.className = 'fhover'; ring.hidden = true; stage.appendChild(ring);
  let hoverT = 0;
  stage.addEventListener('pointermove', e => {
    const now = performance.now(); if (now - hoverT < 40) return; hoverT = now;
    if (e.buttons || e.target.closest('.lpanel, .lshipcard, .fcallout, .lcallout, a, button, input')) { ring.hidden = true; return; }
    const hit = pick(e.clientX, e.clientY);
    if (!hit) { ring.hidden = true; return; }                                  // no plane: let the ship layer's own hover run
    const r = host.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    ring.style.left = (r.left - sr.left + hit.q[0]) + 'px'; ring.style.top = (r.top - sr.top + hit.q[1]) + 'px'; ring.hidden = false; host.style.cursor = 'pointer';
    const shipRing = stage.querySelector('.lhover'); if (shipRing) shipRing.hidden = true;
    e.stopPropagation();
  }, true);
  stage.addEventListener('pointerleave', () => { ring.hidden = true; });
  stage.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; }, true);
  stage.addEventListener('click', e => {
    if (e.target.closest('.fcallout')) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;
    const hit = pick(e.clientX, e.clientY); const best = hit && hit.it;
    if (best) { calloutHex = best.d.hex; renderCard(best); placeCard(); e.stopPropagation(); }   // a plane wins over a ship at the same spot
    else if (calloutHex && !e.target.closest('.lpanel, .lshipcard, .lcallout, button, input')) closeCard();
  }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });

  // ---- per frame: layer opacity, dead-reckoned positions, rotation, screen-size, labels
  function frame(now, p, worldPerPx) {
    if (now - lastPoll > 15000) { lastPoll = now; poll(); }
    const target = enabled ? smooth01((p - showIn[0]) / (showIn[1] - showIn[0])) : 0;
    layerA += (target - layerA) * 0.12;
    trailMat.opacity = layerA;
    group.visible = layerA > 0.01;
    if (!group.visible) { for (const it of items.values()) it.labelEl.style.opacity = '0'; if (calloutHex) closeCard(); return; }
    globe.getWorldQuaternion(gq); camera.getWorldPosition(camWorld);
    const px = 11;   // marker size on screen (smaller — Howard, 16 Sep)
    for (const it of items.values()) {
      const d = it.d, age = Math.min(60, (now - it.at) / 1000);
      let lat = d.lat, lon = d.lon;
      const stale = (d.seen || 0) + age;                                        // seconds since the feed last heard it
      if (stale > 90 || (d.ground && stale > 30) || (d.alt != null && d.alt <= 50 && stale > 30)) { it.sprite.material.opacity = 0; it.labelEl.style.opacity = '0'; it.front = false; it.labelA = 0; if (it.trail) it.trail.visible = false; continue; }
      if (d.gs && d.track != null && !d.ground && (d.seen || 0) < 20) {         // dead reckoning between fixes: gs kts → nm/s → degrees
        const nm = d.gs / 3600 * age; lat += nm / 60 * Math.cos(d.track * DEG); lon += nm / 60 * Math.sin(d.track * DEG) / Math.cos(d.lat * DEG); }
      const v = pos(lat, lon, d.alt); it.sprite.position.copy(v); it.label.position.copy(v);
      if (it.trail && it.trail.visible) { const pa = it.trail.geometry.attributes.position; pa.setXYZ(pa.count - 1, v.x, v.y, v.z); pa.needsUpdate = true; }   // the trail's head follows the marker
      const s = worldPerPx ? px * worldPerPx : R * 0.01; it.sprite.scale.set(s, s, 1);
      it.sprite.material.rotation = -(d.track || 0) * DEG;                   // nose along the track (north-up view in the deep zoom)
      it.sprite.material.opacity = layerA * (d.dir === 'local' ? 0.7 : 1);
      // labels: front side only, and only when the marker is at least a few px from the previous one is not handled — keep it simple
      const wn = tmp.copy(v).normalize().applyQuaternion(gq); const toCam = camWorld.clone().sub(wn.clone().multiplyScalar(R)).normalize();
      it.front = wn.dot(toCam) > 0.15; it.labelA = (d.ground || (d.alt != null && d.alt <= 50)) ? 0 : layerA * (d.dir === 'local' ? 0.6 : 1);   // aircraft on the ground: marker only (labels pile up on the apron)
    }
    // de-clutter: project each label to the screen and push later ones down out of the way of earlier ones
    const placed = []; const W = stage.clientWidth || 1, H = stage.clientHeight || 1;
    for (const it of items.values()) {
      if (!it.front || it.labelA <= 0) { it.labelEl.style.opacity = '0'; continue; }
      const sp = it.label.position.clone().applyMatrix4(globe.matrixWorld).project(camera); const sx = (sp.x + 1) / 2 * W, sy = (1 - sp.y) / 2 * H;
      let dy = 0; for (const q of placed) if (Math.abs(q.x - sx) < 150 && Math.abs(q.y + q.dy - (sy + dy)) < 34) dy = q.y + q.dy + 34 - sy;
      placed.push({ x: sx, y: sy, dy }); it.labelEl.style.transform = `translate(10px, calc(-50% + ${dy.toFixed(0)}px))`;
      it.labelEl.style.opacity = it.labelA.toFixed(3);
    }
    placeCard();
  }
  applyEnabled(); poll();
  return { frame, get enabled() { return enabled; }, get count() { return count; }, destroy() { closeCard(); globe.remove(group); } };
}
