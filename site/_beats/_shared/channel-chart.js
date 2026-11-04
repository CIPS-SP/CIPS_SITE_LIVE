/* _beats/_shared/channel-chart.js — the Channel Islands chart: dark land, teal islands (OSM coastlines), TSS lanes,
   flight comets to London/Paris/Amsterdam, place labels. Lifted from globe-dotmatrix (atlantic-gateway/globe-dots.html) so
   any beat can show it. Usage:
     const chart = await buildChannelChart(containerEl, { flights:true, tss:true, towns:true });
     chart.setView(0)        // 0 = whole Channel … 1 = tight on Jersey (same curve as the AG globe)
     chart.frame(cx, cy, vw) // or set the SVG viewBox directly (chart units: 1000 wide)
   Needs: topojson-client (import map), world-atlas land-10m (unpkg, falls back to land-110m), channel-chart.css. */
import * as topojson from 'topojson-client';

const LON = [-6.5, 5.5], LAT = [47.5, 52.7], WV = 1000;
const HV = WV * ((LAT[1] - LAT[0]) / ((LON[1] - LON[0]) * Math.cos((LAT[0] + LAT[1]) / 2 * Math.PI / 180)));
export const CHART = { width: WV, height: HV, islands: { cx: 350, cy: 440 }, jersey: { cx: 365.8, cy: 456.0 } };
// THE GATEWAY FRAME — the chart's opening view: Falmouth/Pendennis in the west, London and the south coast, the Dutch
// yards (Feadship, Oceanco, Amels) in the east, down to St Malo. One definition, used by cloud-pass to frame the chart
// AND by globe-simple to know where to drift the islands to, so the hand-off matches at any window size.
export const GATEWAY = { cx: 512, cy: 330, vw: 1000, offsetX: -42 };
// THE DIVE CURVE — 0 = the whole Channel, 1 = tight on Jersey. cloud-pass zooms along it; seaway-wake picks it up
// where cloud-pass left off, so the islands are in the same place when we break through the cloud.
export function frameAtZoom(z, offsetX = GATEWAY.offsetX) {
  z = Math.min(1, Math.max(0, z));
  return { cx: 333.3 + 32.5 * z, cy: 422.5 + 33.5 * z, vw: 1000 - 889 * z, offsetX };
}
// Where a chart point lands on screen (fractions of a W×H stage) for a given frame, with `slice` cover-fit.
export function screenFraction(pt, frame, W, H) {
  const vw = frame.vw, vh = vw * 0.6756, cx = frame.cx + (frame.offsetX || 0);
  const x0 = cx - vw / 2, y0 = frame.cy - vh / 2;
  const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
  return { x: (ox + (pt.cx - x0) * s) / W, y: (oy + (pt.cy - y0) * s) / H };
}
// Where the Channel Islands land on screen when the chart is drawn in the gateway frame (globe hand-off target).
export function islandsScreen(W, H, frame = GATEWAY) { return screenFraction(CHART.islands, frame, W, H); }
const px = lon => (lon - LON[0]) / (LON[1] - LON[0]) * WV, py = lat => (LAT[1] - lat) / (LAT[1] - LAT[0]) * HV;
const XY = (lon, lat) => px(lon).toFixed(1) + ',' + py(lat).toFixed(1);
const ringsToPath = rings => rings.map(r => r.map((pt, i) => (i ? 'L' : 'M') + XY(pt[0], pt[1])).join('') + 'Z').join('');
  function bbox(ring) {
  let minLon = 1e9, maxLon = -1e9, minLat = 90, maxLat = -90;
  for (const [L, A] of ring) {
    if (L < minLon) minLon = L; if (L > maxLon) maxLon = L;
    if (A < minLat) minLat = A; if (A > maxLat) maxLat = A;
  }
  return { minLon, maxLon, minLat, maxLat };
}

async function loadLand() {
  for (const res of ['land-10m', 'land-110m']) {
    try {
      const topo = await fetch(new URL('../_vendor/world-atlas-2/' + res + '.json', import.meta.url).href, { cache: 'force-cache' }).then(r => r.json());
      const geo = topojson.feature(topo, topo.objects.land); const feats = geo.type === 'FeatureCollection' ? geo.features : [geo];
      const pp = []; feats.forEach(f => { const g = f.geometry; if (g.type === 'Polygon') pp.push(g.coordinates); else if (g.type === 'MultiPolygon') g.coordinates.forEach(x => pp.push(x)); });
      if (pp.length) return pp;
    } catch (e) { /* try next */ }
  }
  return [];
}

export async function buildChannelChart(container, o = {}) {
  const opt = Object.assign({ flights: true, tss: true, towns: true, labels: true, yards: false, islandsUrl: new URL('./channel-islands.geo.json', import.meta.url).href }, o);
  if (!document.querySelector('link[data-channel-chart-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./channel-chart.css', import.meta.url).href; l.dataset.channelChartCss = '1'; document.head.appendChild(l); }
  const [polys, CIGEO] = await Promise.all([loadLand(), fetch(opt.islandsUrl).then(r => r.json()).catch(() => null)]);
  let land = '';
  polys.forEach(rings => { const b = bbox(rings[0]); if (b.maxLon < LON[0] || b.minLon > LON[1] || b.maxLat < LAT[0] || b.minLat > LAT[1]) return; land += '<path class="land" d="' + ringsToPath(rings) + '"/>'; });
  let isles = '';
  if (CIGEO && CIGEO.features) CIGEO.features.forEach(f => { const g = f.geometry; if (g.type === 'Polygon') isles += '<path class="isle" d="' + ringsToPath(g.coordinates) + '"/>'; });
  const pxPerLat = HV / (LAT[1] - LAT[0]);
  function tssScheme(lon, lat, bearingDeg, lenDeg, W, gap) {
    const cx = px(lon), cy = py(lat);
    const b = bearingDeg * Math.PI / 180, dx = Math.sin(b), dy = -Math.cos(b), nx = -dy, ny = dx;
    const L = lenDeg * pxPerLat, P = (a, c) => a.toFixed(1) + ',' + c.toFixed(1);
    const lane = (sign, adir) => {
      const ox = nx * sign * (W / 2 + gap / 2), oy = ny * sign * (W / 2 + gap / 2);
      const ccx = cx + ox, ccy = cy + oy, hx = dx * L / 2, hy = dy * L / 2, wx = nx * W / 2, wy = ny * W / 2;
      let s = '<path class="tssblk" d="M' + P(ccx-hx-wx, ccy-hy-wy) + ' L' + P(ccx+hx-wx, ccy+hy-wy) +
        ' L' + P(ccx+hx+wx, ccy+hy+wy) + ' L' + P(ccx-hx+wx, ccy-hy+wy) + 'Z"/>';
      for (let i = 0; i < 3; i++) {
        const t = ((i + 0.5) / 3 - 0.5), chx = ccx + dx * L * t, chy = ccy + dy * L * t, ax = dx * adir, ay = dy * adir;
        s += '<path class="tssch" d="M' + P(chx - ax*W*0.1 - nx*W*0.32, chy - ay*W*0.1 - ny*W*0.32) +
          ' L' + P(chx + ax*W*0.28, chy + ay*W*0.28) +
          ' L' + P(chx - ax*W*0.1 + nx*W*0.32, chy - ay*W*0.1 + ny*W*0.32) + '"/>';
      }
      return s;
    };
    return lane(1, 1) + lane(-1, -1); // two opposite-direction lanes = the two-sided scheme
  }

  const tss = opt.tss ? (tssScheme(-2.75, 50.00, 60, 0.32, 13, 5) + tssScheme(1.40, 50.90, 45, 0.34, 13, 5) + tssScheme(-5.50, 48.55, 5, 0.34, 13, 5)) : '';
  const CI0 = [-2.35, 49.42];
  const cities = [[-0.13, 51.5, 'rf1', 'fg1'], [4.90, 52.37, 'rf2', 'fg2'], [2.35, 48.85, 'rf3', 'fg3']];
  let defs = '<defs>';
  cities.forEach(([lon, lat, cls, gid]) => { defs += '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + px(CI0[0]).toFixed(1) + '" y1="' + py(CI0[1]).toFixed(1) + '" x2="' + px(lon).toFixed(1) + '" y2="' + py(lat).toFixed(1) + '"><stop offset="0" stop-color="#FF8A1E" stop-opacity="0"/><stop offset="0.7" stop-color="#FF8A1E" stop-opacity="0.25"/><stop offset="1" stop-color="#FFB247" stop-opacity="1"/></linearGradient>'; });
  defs += '</defs>';
  let flights = '';
  if (opt.flights) cities.forEach(([lon, lat, cls, gid]) => { flights += '<path class="rflight ' + cls + '" style="stroke:url(#' + gid + ')" d="M' + XY(CI0[0], CI0[1]) + ' L' + XY(lon, lat) + '"/>'; });
  const mk = (lon, lat, name, cls) => { const x = px(lon), y = py(lat); return '<circle class="mk" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6"/><text class="lbl ' + (cls || '') + '" x="' + (x + 12).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '">' + name + '</text>'; };
  const ilbl = (lon, lat, name) => '<text class="lbl cilbl ilbl" x="' + (px(lon) + 10).toFixed(1) + '" y="' + (py(lat) - 4).toFixed(1) + '">' + name + '</text>';
  const town = (lon, lat, name) => { const x = px(lon), y = py(lat); return '<circle class="towndot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.4"/><text class="town" x="' + (x + 5).toFixed(1) + '" y="' + (y + 2.6).toFixed(1) + '">' + name + '</text>'; };
  let marks = '';
  const title = (lon, lat, name) => '<text class="lbl cilbl citl" x="' + px(lon).toFixed(1) + '" y="' + py(lat).toFixed(1) + '" text-anchor="middle">' + name + '</text>';
  const titleMain = (lon, lat, name) => '<text class="lbl cilbl citlmain" x="' + px(lon).toFixed(1) + '" y="' + py(lat).toFixed(1) + '" text-anchor="middle">' + name + '</text>';
  if (opt.labels) marks += mk(-0.13, 51.5, 'London') + mk(2.35, 48.85, 'Paris') + mk(4.90, 52.37, 'Amsterdam')
    + titleMain(-2.45, 49.97, 'THE ATLANTIC GATEWAY') + title(-2.45, 49.86, 'The Channel Islands') + ilbl(-2.11, 49.19, 'Jersey') + ilbl(-2.58, 49.46, 'Guernsey') + ilbl(-2.20, 49.72, 'Alderney') + ilbl(-2.02, 48.63, 'St Malo');
  // superyacht yards inside this frame — short names only
  const YARDS = [ { lon: 4.90, lat: 52.38, name: 'Feadship' }, { lon: 4.66, lat: 51.87, name: 'Oceanco' },
                  { lon: 3.57, lat: 51.44, name: 'Amels' }, { lon: -5.07, lat: 50.15, name: 'Pendennis' } ];
  const yard = (lon, lat, name) => { const x = px(lon), y = py(lat); return '<rect class="yarddot" x="' + (x - 1.4).toFixed(1) + '" y="' + (y - 1.4).toFixed(1) + '" width="2.8" height="2.8"/><text class="yard" x="' + (x + 4).toFixed(1) + '" y="' + (y - 2.6).toFixed(1) + '">' + name + '</text>'; };
  if (opt.yards) YARDS.forEach(y => { marks += yard(y.lon, y.lat, y.name); });
  if (opt.towns) marks += town(-2.106, 49.186, 'St Helier') + town(-2.536, 49.455, 'St Peter Port') + town(-1.40, 50.90, 'Southampton') + town(-3.53, 50.72, 'Exeter') + town(-5.07, 50.15, 'Falmouth') + town(-2.02, 48.65, 'St Malo') + town(-1.68, 48.11, 'Rennes');
  container.classList.add('channel-chart');
  container.innerHTML = '<svg viewBox="0 0 ' + WV + ' ' + HV.toFixed(0) + '" preserveAspectRatio="xMidYMid slice">' + defs + land + isles + '<g class="tssg">' + tss + '</g><g class="rflights">' + flights + '</g>' + marks + '</svg>';
  const svg = container.querySelector('svg');
  const api = {
    svg,
    offsetX: 0,   // chart units added to every frame (negative = map moves RIGHT on screen)
    frame(cx, cy, vw) { const vh = vw * 0.6756; cx += api.offsetX; svg.setAttribute('viewBox', (cx - vw / 2).toFixed(1) + ' ' + (cy - vh / 2).toFixed(1) + ' ' + vw.toFixed(1) + ' ' + vh.toFixed(1)); },
    // 0 = whole Channel (vw 1000, centred 333,422) … 1 = tight on Jersey (vw 111) — the AG globe's dive curve
    setView(z) { z = Math.min(1, Math.max(0, z)); api.frame(333.3 + (365.8 - 333.3) * z, 422.5 + (456.0 - 422.5) * z, 1000 + (111 - 1000) * z); }
  };
  return api;
}
