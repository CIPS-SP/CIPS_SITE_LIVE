/* The berthing game's model (30 Oct 2026): "Take the helm: The Berthing". Pure: no DOM, no WebGL, so it runs from node (tools/site-directions/test-berth-game.mjs) as well as on the page.
   The brief is DOCS/BRIEF-berthing-game.md; the handling is DOCS/HANDLING-twin-screw.md.

   The ship is the shared twin-screw model (_shared/twin-screw.js: two engines on levers, rudders, bow and stern thrusters, real metres), in the harbour's own frame (berth-geo.js: metres east and north of the kink in the Albert Pier
   face). On top of it: the tide and the wind, a hull outline walked round against the pontoons, the yachts and the quays, the settle test, the lines (the timing bar, the crew), the haul-in, HOLD POSITION, the pilot's lines, the stars.

   The rules (Simon): no collisions, but no pilot takeover: a hard touch FREEZES the model with `collision` set (the page shows the last frame, the pilot asks "shall we try that again?", then calls reset()); a gentle touch is
   a fender contact. A clean retry still earns the star; the result carries the attempts. No time score. Hold Position works under five knots and any other control releases it.
   Units here: metres, seconds, radians (psi clockwise from north); `kn` figures are knots. */

import { P, newState, step as hullStep, KN, cR } from '../_shared/twin-screw.js';
import { OBSTACLES, HULL, HULL_OUTLINE, START, BERTH, KIN_S, KIN_HDG, alongOut } from './berth-geo.js';

export const CFG = {
  windKn: 12, windFromDeg: 250, setKn: 0.2, setDirDeg: 100,   // a 12 knot WSW wind (as in Hold the Line) and a 0.2 knot set towards the east (Hold the Line has 0.4 in the approaches; inside the harbour it is gentler: 0.4 alone moves a stopped yacht 14 m a minute); from the plate both push the ship away from the pier
  windScale: 0.6,   // how much of the wind's force on the yacht is used: the first version is forgiving (Simon, 30 Oct); at 1.0 a yacht with engines stopped drifts off the pier at about 0.3 m/s (a metre in three seconds)
  airRho: 1.225, areaSide: 330, areaFront: 70, cdSide: 1.0, cdFront: 0.7, cpAhead: 0.06,   // windage of a 50 m yacht (assumed): side and head-on areas (m2), drag coefficients, centre of pressure ahead of amidships (fraction of L)
  thrLockKn: 5.4, thrUnlockKn: 5.0,   // thrusters lock above this speed and come back below it (as in Hold the Line)
  holdMaxKn: 3.0, holdSecsPerKn: 1.0, holdMinSecs: 0.8,   // Hold Position can be pressed under THREE knots and takes hold almost at once: about a second for every knot (3 s at 3 kn, 1 s at 1 kn) (Simon, 30 Oct). Quicker than the engines alone could stop a yacht this size (about 7 s from 3 kn): it is the docking station using more authority than the levers have, a rest, not a skill
  collideKn: 0.6, softKn: 0.3,        // a touch above collideKn closing speed is a collision; the soft landing star is a first touch at softKn or under
  tolAlong: 6, tolGap: 2.5, tolHdgDeg: 5, tolKn: 0.6, settleSecs: 1, looseK: 2,   // the ghost berth: how far along (m), how far off the pontoon (m), how far off parallel (deg), how fast (kn), for how long (s); the prompt is withdrawn outside looseK times those
  zoneBow: 0.20, zoneStern: 0.12, speedBow: 0.55, speedStern: 0.8, missFreeze: 1.5, missesForCrew: 3,   // the lines (tools/proto/berth-lines.html): the bar's green zone as a fraction of the bar, its cycles a second, how long the marker stays put after a miss, misses before the crew throw
  warnSecs: 5,                         // the red warning at the screen edges starts this many seconds before an impact that would be a collision, unless it is averted (Simon, 30 Oct)
  haulSecs: 5,                         // the crew heave her in against the fenders
  holdWX: 0.10, holdWY: 0.15, holdWYaw: 0.25, holdZeta: 1.2, holdKi: 0.0005,   // Hold Position's controller: how brisk (rad/s) it is ahead, sideways and in heading, its damping, and its slow integral term
};

// The console lever (-1 full astern .. +1 full ahead) is not the engine demand: the first 40% of the throw to ahead is the SLOW half-power range (Simon, 30 Oct 2026: "more space between stop and 5 kn"), so five knots sits 40% of the way up the ahead stretch,
// as in Hold the Line. Lever 0.4 asks the propellers for 0.2 of their demand (about 5 knots through the water); the rest of the throw runs 0.2 to 1.
export const demandOf = v => Math.sign(v) * (Math.abs(v) <= 0.4 ? Math.abs(v) * 0.5 : 0.2 + (Math.abs(v) - 0.4) * (0.8 / 0.6));
export const leverOf = n => Math.sign(n) * (Math.abs(n) <= 0.2 ? Math.abs(n) / 0.5 : 0.4 + (Math.abs(n) - 0.2) * 0.75);
const D2R = Math.PI / 180, clampN = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const MX = P.mass * P.addX, MY = P.mass * P.addY, IZ = P.mass * (P.kyy * P.L) ** 2 * 1.3, VP = 1.35 * P.Vmax;

// ---- the weather: slow and steady, as in Hold the Line
const setKnAt = (c, t) => c.setKn * (1 + 0.15 * Math.sin(t * 2 * Math.PI / 70 + 1.2));
const windKnAt = (c, t) => c.windKn + 2.5 * Math.sin(t * 2 * Math.PI / 40 + 0.6) + 1.2 * Math.sin(t * 2 * Math.PI / 13);

function pointIn(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function nearestEdge(p, poly) {   // the closest point on the polygon's edge to p, and how far
  let best = { d: 1e9, q: null };
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? clampN(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0, q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best.d) best = { d, q }; }
  return best;
}

export function createBerthModel(opt = {}) {
  const c = Object.assign({}, CFG, opt), start = Object.assign({}, START, opt.start || {});
  const st = { h: newState(), t: 0, phase: 'approach', attempts: 1, msgs: [], said: {}, collision: null, result: null, now: {} };
  const say = (who, msg, key) => { if (key) { if (st.said[key]) return; st.said[key] = 1; } st.msgs.push({ who, msg, t: st.t }); };

  // ---- the controls (what the Console sends back)
  function initControls() {
    Object.assign(st, { levP: 0, levS: 0, linked: true, lastLev: 0, rud: 0, thB: 0, thS: 0, thLinked: false, thLocked: false, hold: null });
  }
  const release = why => { if (st.hold) { st.hold = null; if (why) say('Pilot', why); } };   // (the pilot says nothing when Hold Position is taken or let go: Simon, 30 Oct)
  function setLever(i, v) { v = clampN(v, -1, 1); const was = [st.levP, st.levS]; st.lastLev = i; if (st.linked) st.levP = st.levS = v; else if (i === 0) st.levP = v; else st.levS = v; if (Math.abs(st.levP - was[0]) > 1e-3 || Math.abs(st.levS - was[1]) > 1e-3) release(); }
  function setLink(on) { if (on && !st.linked) { const v = st.lastLev === 1 ? st.levS : st.levP; st.levP = st.levS = v; } st.linked = !!on; release(); }
  function setRudder(deg) { st.rud = clampN(deg, -P.rudMax, P.rudMax); release(); }
  function setThruster(which, v) { if (st.thLocked) { if (v === 0) st.thB = st.thS = 0; return; } v = clampN(v, -1, 1); if (st.thLinked) st.thB = st.thS = v; else if (which === 'b') st.thB = v; else st.thS = v; if (v !== 0) release(); }   // a thruster sliding back to centre does not count as a touch
  function setThrLink(on) { st.thLinked = !!on; if (on) st.thS = st.thB; }

  // ---- reset: the yacht at the start mark, moving with way on, the engines holding her speed
  function reset(keepAttempts = true) {
    const h = newState(); h.x = start.e; h.y = start.n; h.psi = start.hdg * D2R; h.u = start.kn * KN;
    const n = Math.sqrt(cR() * h.u * h.u / (2 * P.Tmax * Math.max(0.05, 1 - h.u / VP))); h.np = h.ns = n;   // the lever that just holds her speed
    st.h = h; st.t = 0; st.phase = 'approach'; st.collision = null; st.result = null; st.said = {}; st.settleT = 0; st.contact = false; st.firstTouchKn = null; st.touches = 0; st.haul = null; st.acc = 0;
    st.lines = { cur: 'bow', bow: { by: null, misses: 0 }, stern: { by: null, misses: 0 }, clock: 0, freezeUntil: -1 };
    initControls(); st.levP = st.levS = leverOf(n);
    if (!keepAttempts) st.attempts = 1; else if (st.attempts == null) st.attempts = 1;
  }
  reset(false);
  const doRetry = () => { st.attempts++; reset(true); };

  // ---- the weather on this ship
  function weather(t, h) {
    const wk = windKnAt(c, t) * KN, wt = (c.windFromDeg + 180) * D2R, wE = wk * Math.sin(wt), wN = wk * Math.cos(wt);   // the wind's velocity (towards), m/s
    const sk = setKnAt(c, t) * KN, sd = c.setDirDeg * D2R, curE = sk * Math.sin(sd), curN = sk * Math.cos(sd);
    const f = [Math.sin(h.psi), Math.cos(h.psi)], s = [Math.cos(h.psi), -Math.sin(h.psi)], wf = wE * f[0] + wN * f[1], ws = wE * s[0] + wN * s[1];   // wind along her heading (+ from astern) and across (+ towards starboard)
    const k = 0.5 * c.airRho * c.windScale, X = k * c.cdFront * c.areaFront * wf * Math.abs(wf), Y = k * c.cdSide * c.areaSide * ws * Math.abs(ws), N = Y * c.cpAhead * P.L;
    return { wind: { X, Y, N }, curE, curN, windKn: windKnAt(c, t), setKn: setKnAt(c, t) };
  }

  // ---- Hold Position: a controller on the three forces (surge, sway, yaw) that drives her to a target pose using the engines and thrusters, against the wind and the tide
  function holdControls(w, dt) {
    const h = st.h, hd = st.hold, sn = Math.sin(h.psi), cs = Math.cos(h.psi), vgE = h.u * sn + h.v * cs + w.curE, vgN = h.u * cs - h.v * sn + w.curN;
    const eE = hd.e - h.x, eN = hd.n - h.y;
    if (Math.hypot(eE, eN) < 4) { hd.iE = clampN(hd.iE + eE * dt, -30, 30); hd.iN = clampN(hd.iN + eN * dt, -30, 30); } else { hd.iE *= 1 - dt / 20; hd.iN *= 1 - dt / 20; }   // the integral only works near the target (no wind-up on the way in) and leaks away otherwise
    const eX = eE * sn + eN * cs, eY = eE * cs - eN * sn, uG = (vgE - (hd.vE || 0)) * sn + (vgN - (hd.vN || 0)) * cs, vG = (vgE - (hd.vE || 0)) * cs - (vgN - (hd.vN || 0)) * sn, iX = hd.iE * sn + hd.iN * cs, iY = hd.iE * cs - hd.iN * sn;   // error, ground velocity and the integral in her own axes: ahead, to starboard
    const aX = c.holdWX * c.holdWX * eX - 2 * c.holdZeta * c.holdWX * uG + c.holdKi * iX, aY = c.holdWY * c.holdWY * eY - 2 * c.holdZeta * c.holdWY * vG + c.holdKi * iY;   // wanted accelerations (the engines lag more than the thrusters, so surge is the gentler loop)
    const Fx = MX * aX - w.wind.X, Fy = MY * aY - w.wind.Y, Nd = IZ * (c.holdWYaw * c.holdWYaw * wrap(hd.psi - h.psi) - 2 * c.holdWYaw * 1.0 * h.r) - w.wind.N;
    // thrusters first (they do the sideways push and some of the turn), their force fading with speed
    const fth = 1 / (1 + (Math.abs(h.u) / P.thU0) ** P.thK), capB = P.thB * fth, capS = P.thS * fth, lockedOut = st.thLocked;
    const ax_ = -P.thSx * P.L, bx_ = P.thBx * P.L;                                                                      // arms: bow forward (+), stern aft (-)
    let Yb = (Nd + ax_ * Fy) / (bx_ + ax_), Ys = Fy - Yb;   // Yb + Ys = Fy and Yb*bx + Ys*(-ax) = Nd
    const sc = Math.max(1, Math.abs(Yb) / capB, Math.abs(Ys) / capS); Yb /= sc; Ys /= sc;
    const Nrem = Nd - (Yb * bx_ - Ys * ax_);                                                                           // what the thrusters could not do of the turn: differential thrust
    const dT = clampN(Nrem / P.shaft, -2 * P.Tmax * 0.5, 2 * P.Tmax * 0.5), Tp = Fx / 2 + dT / 2, Ts = Fx / 2 - dT / 2;
    const lever = T => T >= 0 ? Math.min(1, Math.sqrt(T / (P.Tmax * Math.max(0.05, 1 - Math.max(0, h.u) / VP)))) : -Math.min(1, Math.sqrt(-T / (P.Tmax * P.astern)));
    return { lp: lever(Tp), ls: lever(Ts), rud: 0, bow: lockedOut ? 0 : clampN(Yb / capB, -1, 1), stern: lockedOut ? 0 : clampN(Ys / capS, -1, 1) };
  }
  function toggleHold() {
    if (st.hold) { release(); return true; }
    if (st.collision || (st.phase !== 'approach' && st.phase !== 'lines')) return false;
    const sp = groundKn(); if (sp >= c.holdMaxKn) return false;
    const h = st.h, w = st.now.w || weather(st.t, h), sn = Math.sin(h.psi), cs = Math.cos(h.psi), vgE = h.u * sn + h.v * cs + w.curE, vgN = h.u * cs - h.v * sn + w.curN;
    const T = Math.max(c.holdMinSecs, sp * c.holdSecsPerKn);   // she is brought to rest over T seconds (her speed in knots, in seconds), where that carries her, and held there on her heading
    st.hold = { e: h.x + vgE * T * 0.5, n: h.y + vgN * T * 0.5, psi: h.psi + h.r * T * 0.5, iE: 0, iN: 0, brake: { t0: st.t, T, u0: h.u, v0: h.v, r0: h.r } };
    return true;
  }
  const groundKn = () => { const h = st.h, w = st.now.w || weather(st.t, h), sn = Math.sin(h.psi), cs = Math.cos(h.psi); return Math.hypot(h.u * sn + h.v * cs + w.curE, h.u * cs - h.v * sn + w.curN) / KN; };

  // ---- contact: the hull outline against everything it can hit
  function outlineWorld() { const h = st.h, sn = Math.sin(h.psi), cs = Math.cos(h.psi); return HULL_OUTLINE.map(([x, y]) => [h.x + x * sn + y * cs, h.y + x * cs - y * sn, x, y]); }
  function contacts(w, dt) {
    const h = st.h, sn = Math.sin(h.psi), cs = Math.cos(h.psi), vgE = h.u * sn + h.v * cs + w.curE, vgN = h.u * cs - h.v * sn + w.curN;
    let worst = null;
    for (const p of outlineWorld()) {
      for (const o of OBSTACLES) {
        if (!pointIn(p, o.poly)) continue;
        const ne = nearestEdge(p, o.poly), dx = ne.q[0] - p[0], dy = ne.q[1] - p[1], d = Math.hypot(dx, dy) || 1e-6, n = [dx / d, dy / d];   // n: out of the obstacle, towards the nearest edge
        const dE = p[0] - h.x, dN = p[1] - h.y, vpE = vgE + h.r * dN, vpN = vgN - h.r * dE, closing = -(vpE * n[0] + vpN * n[1]);   // the point's velocity into the obstacle (clockwise yaw: v = r * (dN, -dE))
        const ao = o.name === 'the pier' ? alongOut(p[0], p[1]) : null, fendered = o.kind === 'pontoon' || (o.name === 'the pier' && ao && ao.s < 200);
        if (!worst || d > worst.d) worst = { o, n, d, closing, fendered, p };
      }
    }
    return worst;
  }

  // ---- the warning: how many seconds until an impact that would be a collision, if she goes on as she is (her way running down at the rate it is now), or null
  function predictImpact(horizon = c.warnSecs, step = 0.25) {
    if (st.collision || (st.phase !== 'approach' && st.phase !== 'lines')) return null;
    const h = st.h, w = st.now.w || weather(st.t, h), sn = Math.sin(h.psi), cs = Math.cos(h.psi), vgE = h.u * sn + h.v * cs + w.curE, vgN = h.u * cs - h.v * sn + w.curN, sp = Math.hypot(vgE, vgN), lim = c.collideKn * KN;
    if (sp < lim * 0.8) return null;
    const a = Math.min(0, st.acc || 0), tStop = a < -1e-4 ? -sp / a : Infinity;   // braking only: a speed that is still building is not assumed to build further
    for (let t = step; t <= horizon + 1e-6; t += step) {
      const tt = Math.min(t, tStop), f = (sp * tt + 0.5 * a * tt * tt) / sp, kk = Math.max(0, 1 + (a / sp) * tt), psi = h.psi + h.r * t, s2 = Math.sin(psi), c2 = Math.cos(psi), px = h.x + vgE * f, py = h.y + vgN * f;
      for (const [x, y] of HULL_OUTLINE) {
        const p = [px + x * s2 + y * c2, py + x * c2 - y * s2];
        for (const o of OBSTACLES) {
          if (!pointIn(p, o.poly)) continue;
          const ne = nearestEdge(p, o.poly), dx = ne.q[0] - p[0], dy = ne.q[1] - p[1], d = Math.hypot(dx, dy) || 1e-6, nx = dx / d, ny = dy / d, ex = p[0] - px, ey = p[1] - py;
          const closing = -((vgE * kk + h.r * ey) * nx + (vgN * kk - h.r * ex) * ny); if (closing > lim || d > 2.5) return t;
        }
      }
    }
    return null;
  }

  // ---- the berth: where she is against the ghost berth, in numbers the page can show
  function berthPose() {
    const h = st.h, ao = alongOut(h.x, h.y), gap = ao.out - HULL.B / 2 + 0.3;   // metres of water between her port side and the pontoon's edge (the dock edge lies 0.3 m inside the wall line)
    const dh = wrap(KIN_HDG * D2R - h.psi) / D2R, along = ao.s - KIN_S;
    return { s: ao.s, out: ao.out, along, gap, dHdg: dh, brg: ao.brg };
  }
  function portGaps() {   // metres off the pontoon at the bow and at the stern (the docking display)
    const h = st.h, sn = Math.sin(h.psi), cs = Math.cos(h.psi), at = x => { const hb = -(HULL.B / 2) * 0.9; const e = h.x + x * sn + hb * cs, n = h.y + x * cs - hb * sn; return alongOut(e, n).out + 0.3; };
    return { bow: at(HULL.L / 2 - 4), stern: at(-HULL.L / 2 + 4) };
  }

  // ---- one small step of the world
  function sub(dt) {
    if (st.collision || st.phase === 'done') return;
    st.t += dt;
    const h = st.h, w = weather(st.t, h); st.now.w = w; st.now.windKn = w.windKn; st.now.setKn = w.setKn;
    if (st.phase === 'hauling') { haul(dt); return; }
    const sp = Math.hypot(h.u, h.v) / KN; st.thLocked = st.thLocked ? sp > c.thrUnlockKn : sp > c.thrLockKn;
    let cmd;
    if (st.hold) { if (!st.hold.noLimit && groundKn() > c.holdMaxKn + 1) release(); }
    if (st.hold && st.hold.brake) {   // taking hold: her way through the water is run down smoothly to just what cancels the tide and wind, so she is at rest over the ground after T seconds
      const B = st.hold.brake, k = clampN((st.t - B.t0) / B.T, 0, 1), e = k * k * (3 - 2 * k), sn = Math.sin(h.psi), cs = Math.cos(h.psi);
      h.u = B.u0 + (-(w.curE * sn + w.curN * cs) - B.u0) * e; h.v = B.v0 + (-(w.curE * cs - w.curN * sn) - B.v0) * e; h.r = B.r0 * (1 - e); h.np *= 1 - e * 0.3; h.ns *= 1 - e * 0.3;
      cmd = { lp: 0, ls: 0, rud: 0, bow: 0, stern: 0 }; st.levP = st.levS = 0; if (k >= 1) st.hold.brake = null;
    } else if (st.hold) { cmd = holdControls(w, dt); st.levP = leverOf(cmd.lp); st.levS = leverOf(cmd.ls); }   // the levers follow the station while it holds (they show "auto" on the console)
    else cmd = { lp: demandOf(st.levP), ls: demandOf(st.levS), rud: st.rud, bow: st.thLocked ? 0 : st.thB, stern: st.thLocked ? 0 : st.thS };
    st.cmd = cmd; const g0 = Math.hypot(h.u * Math.sin(h.psi) + h.v * Math.cos(h.psi) + w.curE, h.u * Math.cos(h.psi) - h.v * Math.sin(h.psi) + w.curN); hullStep(h, cmd, dt, w.wind);
    h.x += w.curE * dt; h.y += w.curN * dt;   // the tide carries her over the ground (everything above is through the water)
    { const g1 = Math.hypot(h.u * Math.sin(h.psi) + h.v * Math.cos(h.psi) + w.curE, h.u * Math.cos(h.psi) - h.v * Math.sin(h.psi) + w.curN); st.acc = (st.acc || 0) * 0.9 + 0.1 * (g1 - g0) / dt; }
    // contact
    const ct = contacts(w, dt);
    if (ct) {
      const kn = ct.closing / KN;
      if (!st.contact) { st.contact = true; st.touches++; if (ct.fendered && st.firstTouchKn == null) st.firstTouchKn = Math.max(0, kn); }
      if (kn > c.collideKn || ct.d > 2.5) { st.collision = { t: st.t, with: ct.o.name, kn, pose: { x: h.x, y: h.y, psi: h.psi }, point: ct.p }; return; }   // (no pilot call here: the page puts up its own card, "Sorry Captain, we'll have to call that one there...", Simon 30 Oct)
      h.x += ct.n[0] * (ct.d + 0.02); h.y += ct.n[1] * (ct.d + 0.02);   // a fender touch: pushed back out, the way in lost
      const sn = Math.sin(h.psi), cs = Math.cos(h.psi); let gE = h.u * sn + h.v * cs + w.curE, gN = h.u * cs - h.v * sn + w.curN; const vn = gE * ct.n[0] + gN * ct.n[1];
      if (vn < 0) { gE -= vn * ct.n[0]; gN -= vn * ct.n[1]; h.u = (gE - w.curE) * sn + (gN - w.curN) * cs; h.v = (gE - w.curE) * cs - (gN - w.curN) * sn; }
      h.r *= Math.max(0, 1 - 3 * dt);
    } else st.contact = false;
    progress(dt);
  }
  function step(dt) { const n = Math.max(1, Math.ceil(dt / 0.05)); for (let i = 0; i < n; i++) sub(dt / n); }

  // ---- what she is doing against the berth: approach, the settle test, the lines
  function progress(dt) {
    const h = st.h, bp = berthPose(), gsp = groundKn(), L = st.lines;
    const d = Math.hypot(BERTH.e - h.x, BERTH.n - h.y);
    st.now.bp = bp; st.now.gsp = gsp; st.now.toBerth = d;
    const inBox = k => Math.abs(bp.along) <= c.tolAlong * k && bp.gap <= c.tolGap * k && bp.gap >= -0.6 && Math.abs(bp.dHdg) <= c.tolHdgDeg * k && gsp <= c.tolKn * k;
    // the pilot's advice (local specifics only: the captain has the con)
    if (st.phase === 'approach') {
      if (st.t > 1) say('Pilot', 'The Albert Pier berth ahead, Captain. Port side to.', 'berth');
      if (d < 90 && gsp > 2.5) say('Pilot', 'Bring the speed down, Captain.', 'slow');
      if (d < 50) say('Pilot', 'Fifty metres to go.', 'd50');
      if (d < 25) say('Pilot', "Half a ship's length to go.", 'd25');
      if (d < 40 && gsp < 1.5 && bp.gap > 3.5) say('Pilot', 'Thrusters to port, gently, Captain.', 'toPort');
      if (d < 40 && gsp < 1.5 && bp.gap < 0.2 && bp.gap > -3) say('Pilot', 'Easy, Captain. Thrusters to starboard.', 'toStbd');
      if (bp.along > c.tolAlong * 2 && d < 40) say('Pilot', 'We have run past the berth, Captain.', 'past');
      st.settleT = inBox(1) ? st.settleT + dt : 0;
      if (st.settleT >= c.settleSecs) { st.phase = 'lines'; say('Pilot', 'Steady, Captain. Bow line first.', 'steady'); }
    } else if (st.phase === 'lines') {
      if (!inBox(c.looseK)) { st.phase = 'approach'; st.settleT = 0; say('Pilot', 'We are drifting off the berth, Captain.', 'drift' + Math.floor(st.t / 20)); return; }
      if (st.t >= L.freezeUntil) L.clock += dt;   // the bar runs; after a miss it stays put while the crew haul the line back
      const cur = L[L.cur];
      if (cur.crewAt != null && st.t >= cur.crewAt && cur.by == null) lineDone(L.cur, 'crew');
    }
  }
  const markPos = () => { const L = st.lines, spd = L.cur === 'bow' ? c.speedBow : c.speedStern, x = L.clock * spd * 2; return Math.abs(((x % 2) + 2) % 2 - 1); };   // 0..1..0 along the bar
  function lineDone(which, by) {
    const L = st.lines; L[which].by = by;
    if (which === 'bow') { L.cur = 'stern'; L.clock = 0; say('Pilot', by === 'crew' ? 'The crew have the bow line. Now the stern.' : 'Bow line ashore. Now the stern line.'); }
    else { say('Pilot', 'All fast. Finished with engines.'); startHaul(); }
  }
  function tap() {   // the player taps the bar
    if (st.phase !== 'lines' || st.collision) return null; const L = st.lines, cur = L[L.cur]; if (st.t < L.freezeUntil || cur.by) return null;
    const z = L.cur === 'bow' ? c.zoneBow : c.zoneStern, hit = Math.abs(markPos() - 0.5) <= z / 2;
    if (hit) { lineDone(L.cur, 'player'); return 'hit'; }
    cur.misses++; L.freezeUntil = st.t + c.missFreeze;
    if (cur.misses >= c.missesForCrew) { cur.crewAt = L.freezeUntil; say('Pilot', 'The crew will throw it, Captain.'); return 'crew'; }
    say('Pilot', 'Missed. The crew are hauling it back.'); return 'miss';
  }
  function crewThrow() { if (st.phase !== 'lines' || st.collision) return false; const L = st.lines; if (L[L.cur].by) return false; lineDone(L.cur, 'crew'); return true; }   // "Let the crew throw", at any time

  // ---- the haul: both lines on, the crew bring her in against the fenders and she is at rest in the berth
  function startHaul() { release(); const h = st.h; st.phase = 'hauling'; st.haul = { t0: st.t, x: h.x, y: h.y, psi: h.psi }; h.u = h.v = h.r = 0; st.levP = st.levS = 0; }
  function haul(dt) {
    const H = st.haul, h = st.h, k = clampN((st.t - H.t0) / c.haulSecs, 0, 1), e = k * k * (3 - 2 * k), tgt = { x: BERTH.e, y: BERTH.n, psi: BERTH.hdg * D2R };
    h.x = H.x + (tgt.x - H.x) * e; h.y = H.y + (tgt.y - H.y) * e; h.psi = H.psi + wrap(tgt.psi - H.psi) * e; h.u = h.v = h.r = 0; h.np = h.ns = 0;
    if (k >= 1) {
      st.phase = 'done'; const L = st.lines, byPlayer = L.bow.by === 'player' && L.stern.by === 'player';
      st.result = { alongside: true, soft: st.firstTouchKn == null || st.firstTouchKn <= c.softKn, lines: byPlayer, attempts: st.attempts, firstTouchKn: st.firstTouchKn, misses: L.bow.misses + L.stern.misses, crew: [L.bow.by, L.stern.by].filter(b => b === 'crew').length };
      say('Pilot', 'Welcome to the Albert Pier, Captain.');
    }
  }

  const info = () => { const h = st.h, bp = berthPose(), pg = portGaps(), w = st.now.w || weather(st.t, h), sn = Math.sin(h.psi), cs = Math.cos(h.psi), b = bp.brg * D2R, away = ((h.u * sn + h.v * cs + w.curE) * Math.cos(b) - (h.u * cs - h.v * sn + w.curN) * Math.sin(b)) / KN; return { impactIn: predictImpact(), closeKn: -away, kn: Math.hypot(h.u, h.v) / KN, gKn: groundKn(), toBerth: Math.hypot(BERTH.e - h.x, BERTH.n - h.y), gap: bp.gap, along: bp.along, dHdg: bp.dHdg, bowGap: pg.bow, sternGap: pg.stern, holdAvail: groundKn() < c.holdMaxKn && (st.phase === 'approach' || st.phase === 'lines') && !st.collision, holding: !!st.hold, windKn: w.windKn, setKn: w.setKn, mark: st.phase === 'lines' ? markPos() : null, mat: st.thLocked }; };
  return { st, cfg: c, demandOf, leverOf, step, reset: doRetry, restart: () => { reset(false); }, setLever, setLink, setRudder, setThruster, setThrLink, toggleHold, tap, crewThrow, info, berthPose, weather: t => weather(t == null ? st.t : t, st.h), outline: outlineWorld, groundKn };
}
