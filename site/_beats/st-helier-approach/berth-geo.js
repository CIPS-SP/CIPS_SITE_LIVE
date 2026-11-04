/* The berth, in metres (30 Oct 2026): everything the berthing game needs to know about the harbour above the pier heads, as plain numbers with no WebGL, so the game's model can run in node as well as on the page.
   Frame: [east, north] metres from the kink in the Albert Pier east face (FACE[0], 49.179105, -2.113923). Headings in degrees clockwise from north.
   These numbers MIRROR the constants in beat.js (FACE, KIN_S, KIN_HDG, BERTH_OFFSET_M, NEIGH, DOCK_PIECES, NNQ, ...: Simon's layout from 4 to 10 Oct 2026). When the game goes into the beat, beat.js should import them from here
   instead of keeping its own copy; until then the two must be kept in step (tools/site-directions/test-berth-game.mjs checks the berth pose against the scene's own: p = 1 sits at BERTH_LL). */

export const HULL = { L: 50, B: 9.5 };   // Kinship against the land (beat.js HULL_M = 50; the lab's beam)

const M_LAT = 111320, FACE_LL = [[49.179105, -2.113923], [49.179307, -2.113841], [49.179582, -2.113640], [49.179777, -2.113477], [49.179912, -2.113360], [49.180071, -2.113217], [49.180264, -2.113051], [49.180438, -2.112898]];
const COS_F = Math.cos(49.18 * Math.PI / 180), ORIGIN = FACE_LL[0];
export const ll2en = ll => [(ll[1] - ORIGIN[1]) * M_LAT * COS_F, (ll[0] - ORIGIN[0]) * M_LAT];
export const en2ll = en => [ORIGIN[0] + en[1] / M_LAT, ORIGIN[1] + en[0] / (M_LAT * COS_F)];

// the Albert Pier east face (the wall), south to north, carried on 70 m past the last point as the scene does
export const FACE = FACE_LL.map(ll2en);
{ const a = FACE[FACE.length - 2], b = FACE[FACE.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]); FACE.push([b[0] + (b[0] - a[0]) / d * 70, b[1] + (b[1] - a[1]) / d * 70]); }
const CUM = [0]; for (let i = 1; i < FACE.length; i++) CUM.push(CUM[i - 1] + Math.hypot(FACE[i][0] - FACE[i - 1][0], FACE[i][1] - FACE[i - 1][1]));
export function faceAt(s) {   // the wall at s metres from the kink: point, bearing, and the outboard (east-going) unit vector
  s = Math.max(0, Math.min(CUM[CUM.length - 1], s)); let i = 1; while (i < CUM.length - 1 && CUM[i] < s) i++;
  const a = FACE[i - 1], b = FACE[i], L = CUM[i] - CUM[i - 1], t = L ? (s - CUM[i - 1]) / L : 0, te = (b[0] - a[0]) / L, tn = (b[1] - a[1]) / L;
  return { e: a[0] + (b[0] - a[0]) * t, n: a[1] + (b[1] - a[1]) * t, brg: ((Math.atan2(te, tn) * 180 / Math.PI) + 360) % 360, oe: tn, on: -te };
}
export const faceXY = (s, out = 0) => { const f = faceAt(s); return [f.e + out * f.oe, f.n + out * f.on]; };
export function alongOut(e, n) {   // where a point is against the wall: s along it (m from the kink) and `out` metres outboard of it
  let best = null; for (let s = 0; s <= CUM[CUM.length - 1]; s += 0.5) { const f = faceAt(s), d = (e - f.e) * (e - f.e) + (n - f.n) * (n - f.n); if (!best || d < best.d) best = { s, d }; }
  const f = faceAt(best.s); return { s: best.s, out: (e - f.e) * f.oe + (n - f.n) * f.on, brg: f.brg };
}

// the berths (beat.js: Simon, 10 Oct): the yacht already berthed in the south slot, bow south; Kinship in the north slot
export const KIN_S = 138.5, KIN_HDG = 27.0, BERTH_OFFSET_M = 5.2;
export const NEIGH = { s: 71.1, out: 4.1, hdg: 205.0, lenM: 52, beamM: 9.5 };
export const BERTH = (() => { const c = faceXY(KIN_S, BERTH_OFFSET_M); return { e: c[0], n: c[1], hdg: KIN_HDG }; })();   // where Kinship lies alongside: the ghost berth
export const BERTH_LL = en2ll([BERTH.e, BERTH.n]);

// a rectangle (centre, heading, length, beam) as a polygon, [east, north] corners
export function rect(cx, cy, hdgDeg, len, beam) {
  const h = hdgDeg * Math.PI / 180, f = [Math.sin(h), Math.cos(h)], r = [Math.cos(h), -Math.sin(h)], hl = len / 2, hb = beam / 2, c = (a, b) => [cx + f[0] * a + r[0] * b, cy + f[1] * a + r[1] * b];
  return [c(hl, -hb), c(hl, hb), c(-hl, hb), c(-hl, -hb)];
}

// the pontoons (beat.js DOCK_PIECES: Simon's dock layout, phase 1, 10 Oct)
const DOCK_LL = [
  [[49.18009, -2.113319], [49.179173, -2.113985], [49.179169, -2.113953], [49.180022, -2.113331], [49.180079, -2.113282]],
  [[49.180022, -2.113331], [49.180489, -2.11294], [49.180479, -2.112877], [49.180004, -2.113272]],
  [[49.180457, -2.112848], [49.180639, -2.112702], [49.18067, -2.112792], [49.180488, -2.112938]],
  [[49.180635, -2.11282], [49.180668, -2.112793], [49.180563, -2.112487], [49.18053, -2.112514]],
  [[49.180393, -2.112558], [49.180546, -2.112435], [49.180563, -2.112487], [49.180411, -2.11261]]];
export const PONTOONS = DOCK_LL.map(p => p.map(ll2en));

// the New North Quay and the yacht across the channel on it (beat.js NNQ, NNQ_CRANE, NNQ_OFF, NNQ_LEN_M)
const NNQ = [[49.179473, -2.111945], [49.179702, -2.111748], [49.179972, -2.111548], [49.180183, -2.111330]].map(ll2en);
{
  const a = NNQ[0], e1 = [NNQ[3][0] - a[0], NNQ[3][1] - a[1]], L = Math.hypot(e1[0], e1[1]), u = [e1[0] / L, e1[1] / L];
  const cr = ll2en([49.179428, -2.111859]), s = (cr[0] - a[0]) * u[0] + (cr[1] - a[1]) * u[1], mid = [a[0] + u[0] * s, a[1] + u[1] * s];
  var NNQ_BRG = (Math.atan2(u[0], u[1]) * 180 / Math.PI + 360) % 360, west = (NNQ_BRG - 90) * Math.PI / 180;
  var NNQ_YACHT_C = [mid[0] + 15.7 * Math.sin(west), mid[1] + 15.7 * Math.cos(west)], NNQ_U = u;
}
export const NNQ_YACHT = { c: NNQ_YACHT_C, hdg: NNQ_BRG, lenM: 90, beamM: 17 };   // beam is a guess from the picture (the scene draws her about 9 m off each side of the centre line)

// everything the hull can hit, as named polygons in [east, north] metres. `kind`: 'pontoon' (fendered: a gentle touch is fine), 'yacht', 'quay' (hard)
export const OBSTACLES = (() => {
  const wallLand = [[-400, -400], [0, -400], ...FACE.map(p => p.slice()), [FACE[FACE.length - 1][0] - 400, FACE[FACE.length - 1][1]]];   // the pier: everything west of the wall (south of the kink the wall runs due north)
  const u = NNQ_U, ext = (p, k) => [p[0] + u[0] * k, p[1] + u[1] * k];
  const nnqLand = [ext(NNQ[0], -140), ...NNQ.map(p => p.slice()), ext(NNQ[3], 140), [ext(NNQ[3], 140)[0] + 400, ext(NNQ[3], 140)[1]], [ext(NNQ[0], -140)[0] + 400, ext(NNQ[0], -140)[1]]];
  const nc = faceXY(NEIGH.s, NEIGH.out);
  return [
    ...PONTOONS.map((poly, i) => ({ name: 'pontoon ' + (i + 1), kind: 'pontoon', poly })),
    { name: 'the yacht berthed ahead', kind: 'yacht', poly: rect(nc[0], nc[1], NEIGH.hdg, NEIGH.lenM, NEIGH.beamM) },
    { name: 'the yacht across the channel', kind: 'yacht', poly: rect(NNQ_YACHT.c[0], NNQ_YACHT.c[1], NNQ_YACHT.hdg, NNQ_YACHT.lenM, NNQ_YACHT.beamM) },
    { name: 'the pier', kind: 'quay', poly: wallLand },
    { name: 'the New North Quay', kind: 'quay', poly: nnqLand },
  ];
})();

// the run starts where Simon marked it (30 Oct 2026, the picker: p 0.675, 136 m south of the berth, heading up the channel); the scene's own speed there is about 4.25 knots
export const START_LL = [49.17897740217617, -2.1130144187242297];
export const START = (() => { const c = ll2en(START_LL); return { e: c[0], n: c[1], hdg: 358.976, kn: 4.25 }; })();

// Kinship's outline in her own axes (x forward, y to starboard), a flat transom at the stern and pointed at the bow: points the contact test and the ghost berth walk round
export const HULL_OUTLINE = (() => {
  const pts = [], N = 12, hb = f => (HULL.B / 2) * (f >= 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(f, 2.2))) : Math.sqrt(1 - 0.33 * Math.pow(-f, 4)));   // 30 Oct 2026 (Simon): a flat stern, 82% of the full beam across the transom, until there is a starboard-side-to option
  for (let i = 0; i <= N; i++) { const f = i / N * 2 - 1; pts.push([f * HULL.L / 2, hb(f)]); }
  for (let i = N; i >= 0; i--) { const f = i / N * 2 - 1; pts.push([f * HULL.L / 2, -hb(f)]); }
  return pts;
})();
