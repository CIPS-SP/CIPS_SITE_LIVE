/* quay-paths.js — plain geometry for the quay chapter (no three.js, so it can be tested in node): Simon's routes and walks are lat/lng polylines; here they become smooth, length-parameterised
   paths in metres from the wall's kink (east, north), with a position and true bearing at any distance along them. */
const O = [49.179105, -2.113923], M_LAT = 111320, COS = Math.cos(49.18 * Math.PI / 180);
export const toEN = ll => [(ll[1] - O[1]) * M_LAT * COS, (ll[0] - O[0]) * M_LAT];
export const toLL = en => [O[0] + en[1] / M_LAT, O[1] + en[0] / (M_LAT * COS)];
export const bearingEN = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI + 360) % 360;   // true bearing from a to b (east, north)
export const angDiff = (a, b) => ((b - a + 540) % 360) - 180;                                              // signed shortest turn from a to b, degrees
export const lerpAng = (a, b, t) => (a + angDiff(a, b) * t + 360) % 360;

// centripetal Catmull-Rom through the points, sampled about every `step` metres
function crSample(P, step) {
  const out = [P[0]], n = P.length, d = (a, b) => Math.pow(Math.hypot(a[0] - b[0], a[1] - b[1]), 0.5) || 1e-3;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= m; k++) {
      const t = t1 + (t2 - t1) * k / m, L = (a, b, ta, tb) => [(a[0] * (tb - t) + b[0] * (t - ta)) / (tb - ta), (a[1] * (tb - t) + b[1] * (t - ta)) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  return out;
}

// A path from dense points in metres (east, north): length, and a position and true bearing at any distance along it.
export function fromDense(pts) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const pos = d => { d = Math.max(0, Math.min(len, d)); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; } const a = pts[lo], b = pts[hi], l = cum[hi] - cum[lo], t = l > 1e-9 ? (d - cum[lo]) / l : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const brg = (d, win = 2.5) => bearingEN(pos(d - win), pos(d + win));
  return { len, pos, brg, at: (d, win) => ({ en: pos(d), brg: brg(d, win) }), pts, cum, first: pts[0], last: pts[pts.length - 1] };
}
// lls: [[lat, lng], ...]. opts.smooth (default true): round the corners; false keeps straight runs exactly straight.
export function mkPath(lls, opts = {}) { const raw = lls.map(toEN); return fromDense(opts.smooth === false ? raw : crSample(raw, 0.5)); }
// paths laid end to end (each one's last point is the next one's first), so a straight run can sit between two rounded ones
export function joinPaths(paths) { const pts = []; for (const p of paths) pts.push(...(pts.length ? p.pts.slice(1) : p.pts)); return fromDense(pts); }
// the part of a path between two distances (metres along it); the reverse of a path; the distance along a path of the point nearest a lat/lng
export function subPath(p, d0, d1) { const pts = []; for (let d = d0; d < d1; d += 0.5) pts.push(p.pos(d)); pts.push(p.pos(d1)); return fromDense(pts); }
export const reversePath = p => fromDense([...p.pts].reverse());
export function nearestD(p, ll) { const e = toEN(ll); let best = 1e9, bd = 0; for (let d = 0; d <= p.len; d += 0.25) { const q = p.pos(d), dist = Math.hypot(q[0] - e[0], q[1] - e[1]); if (dist < best) { best = dist; bd = d; } } return bd; }   // (sampled along the path, so a long straight run with only two vertices is searched along its length)
export const pathLL = (path, d) => toLL(path.pos(d));
