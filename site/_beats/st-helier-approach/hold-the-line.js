/* Hold the Line, in the beat (23 Oct 2026).
   The hands-on stretch of st-helier-approach: the player flies the ship along the real Small Road lead, round onto the Pier Head lead, through the pier heads and round to port into the channel,
   on the same satellite plates, sea, wake and plotter as the scrolled story. This file is the game itself (no WebGL): the physics, the scoring, the controls and the little cards. beat.js feeds it the path
   and, each frame, takes back where the ship is (how far along the path, how far off it, which way the bow points) in place of the scroll position.

   Units: "game metres" (gm) as in the prototype (tools/proto/hold-the-line.html): the ship is 24 gm long, 1 gm/s reads as 1 knot, and K real metres = 1 gm (the hull is HULL_M = 50 m, so K is about 2.08).
   The prototype's numbers are kept; the differences are the curved path (the turns need steady rudder: a feed-forward term in the pilot's hands, and a stronger rudder than the straight-road prototype),
   the lane (wide at the start, narrowing to the pier heads, a little wider again in the channel) and the longer run.
   The model is pure (createModel), so it can be driven from node (tools/site-directions/test-hold-the-line.mjs) as well as from the page. */

import { createBridgeConsole } from '../_shared/bridge-console.js';

export const CFG = {
  shipLen: 24, shipBeam: 5,
  startKn: 8, maxKn: 10, leverKn: 12.5, limitKn: 5, speedLag: 4, speedLagDown: 1.6,   // leverKn: knots per unit of lever, so the five knot mark sits 40% of the way up the ahead stretch (Simon, 23 Oct 2026); maxKn is the speed the other numbers were tuned to
  rudderLag: 0.7, rudderEffect: 0.26, yawDamp: 0.6,        // rudderEffect 0.16 -> 0.26: the prototype road was straight; here the turns ask for about 60% rudder at five knots
  pushStart: 1.0, pushEnd: 2.0,
  sheer: 0.001, gustYaw: 0.005, headStab: 0.10,
  timeScale: 1,   // the game clock against the real one. 23 Oct 2026: 1.35 for a while ("a bit too long"), put back to 1 when Simon found it "all happens a bit too quick"; the run is shorter instead (it starts later)
  setKn: 0.4, setDirDeg: 100, windKn: 12, windFromDeg: 250,   // the tide's set across the approach (knots, towards this bearing: roughly east, across the 022 lead) and the wind (knots, FROM this bearing: WSW). Both slow and steady: no sudden or strong currents in the approaches
  promptSecs: 8, zoneGraceSecs: 0, limitTol: 0.35, bowGm: 12,   // the speed is checked the moment the BOW (half a hull, bowGm, ahead of the ship's centre) clears the far side of the tanker berth: no grace
  engineLagUp: 1.0, engineLagRev: 2.0, astern: 0.65, diffYaw: 0.20,   // the propellers follow the levers (a shaft that has to reverse takes longer); astern thrust is about 65% of ahead (docs/HANDLING-twin-screw.md); the yaw from one engine pulling more than the other
  thrLat: 0.45, thrYaw: 0.10, thrU0: 3.5, thrLockKn: 5.4, thrUnlockKn: 5.0, thrLag: 1.0,   // bow and stern thrusters: sideways speed and yaw per unit, the speed (knots) at which they have half their force, where they lock and unlock, response
  starOnLine: 0.80, missPenalty: 3, bankRescue: 24,
  laneStart: 16, laneGap: 10, laneEnd: 12,                    // lane half-width in gm at the start, at the pier heads, and in the channel at the end (x2.08 for real metres)
};

/* ---------- the model ----------
   path: { length (gm), zoneS (gm: where the five knot limit starts), gapS (gm: the pier heads), curv(s) (rad per gm, + = path turns to starboard), laneAt(s) (half-width, gm) }
   x is metres to starboard of the path centre line, psi the bow's angle to starboard of the path (radians), s the distance run along the path. */
export function createModel(path, opt = {}) {
  const c = Object.assign({}, CFG, opt);
  const st = { t: 0, s: 0, x: 0, psi: 0, u: c.startKn, r: 0, dA: 0, cmd: 0, T: c.startKn / c.leverKn, levP: c.startKn / c.leverKn, levS: c.startKn / c.leverKn, np: c.startKn / c.leverKn, ns: c.startKn / c.leverKn, linked: true, thLinked: false, thB: 0, thS: 0, thBa: 0, thSa: 0, thLocked: false, drift: 0, gust: 0, pushK: 1,
    inTime: 0, said: {}, prompted: false, crossed: false, speedOK: null, penalty: 0, rescues: 0, rescueT: -9, rescueUntil: 0, maxLat: 0, done: false, eased: false, pilotCon: false, msgs: [] };
  const say = (who, msg, key) => { if (key) { if (st.said[key]) return; st.said[key] = 1; } st.msgs.push({ who, msg }); };
  const prog = () => Math.max(0, Math.min(1, st.s / path.length));
  const pushNow = () => c.pushStart + (c.pushEnd - c.pushStart) * prog();
  // The tide and the wind (23 Oct 2026, Simon: believable, not erratic). The set is a steady stream that breathes by about 15% over a minute or so; its push across the path is its speed times the sine of the angle between
  // the set and the path (so it is across the Small Road, weak along the Pier Head lead). The wind blows at about 12 knots, varying by a few knots over tens of seconds; it turns the bow by the sine of its angle to the ship.
  const D2R = Math.PI / 180, hdgAt = sg => path.hdgAt ? path.hdgAt(sg) * D2R : null;
  const setKnAt = t => c.setKn * (1 + 0.15 * Math.sin(t * 2 * Math.PI / 70 + 1.2));
  const windKnAt = t => c.windKn + 2.5 * Math.sin(t * 2 * Math.PI / 40 + 0.6) + 1.2 * Math.sin(t * 2 * Math.PI / 13);
  const driftAt = (t, sg) => { const h = hdgAt(sg); return setKnAt(t) * (h == null ? 0.98 : Math.sin(c.setDirDeg * D2R - h)); };
  const gustAt = (t, sg) => { const h = hdgAt(sg); return c.gustYaw * (windKnAt(t) / c.windKn) * (h == null ? -0.74 : Math.sin(c.windFromDeg * D2R - h)); };
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

  function pilotHelm() {   // the pilot's hands: steady rudder for the turn (feed-forward) plus a correction for being off the line
    const x = st.x, vx = st.u * Math.sin(st.psi) + st.drift, kap = path.curv(st.s);
    const auth = c.rudderEffect * (0.3 + 0.7 * st.u / 10) / c.yawDamp, ff = auth > 0 ? kap * st.u / auth : 0;
    const rud = clampN(ff - (0.09 * x + 0.32 * vx + 0.75 * st.psi + 0.6 * st.r), -1, 1);
    const wantKn = st.s > path.zoneS - 45 ? c.limitKn - 0.4 : c.startKn;
    return { rud, T: Math.min(1, wantKn / c.leverKn) };
  }
  // The wall (23 Oct 2026, Simon): she cannot stand more than a vessel's width outside the lane edge, so a player who lets go of everything ends up riding one width outside it and carrying on along a safe course, never into a pier or the land.
  // At the pier heads the port side is tighter: the Albert Pier head is only about 20 m off the path there, so the wall closes in to keep her hull inside the lane edge.
  const wallAt = (sg, side) => { const L = path.laneAt(sg); let w = L + c.shipBeam; if (side < 0 && path.gapS != null) { const k = 1 - clampN((Math.abs(sg - path.gapS) - 25) / 35, 0, 1); w = w * (1 - k) + (L - c.shipBeam / 2) * k; } return w; };
  function physics(dt, cmd, T) {
    const kap = path.curv(st.s);
    // the engines: each propeller follows its lever, a shaft that has to reverse takes longer; astern is weaker than ahead. Linked, both levers are one demand (st.T).
    const lag = (n, lev) => n + (lev - n) * Math.min(1, dt / ((Math.sign(n) !== Math.sign(lev) && Math.abs(n) > 0.05 && Math.abs(lev) > 0.02) ? c.engineLagRev : c.engineLagUp));
    st.np = lag(st.np, st.levP); st.ns = lag(st.ns, st.levS);
    const th = n => n >= 0 ? n : c.astern * n, tp = th(st.np), ts = th(st.ns), Tm = (tp + ts) / 2, dTh = tp - ts;   // mean thrust drives her speed; the DIFFERENCE turns her (port pulling more = bow to starboard)
    const uT = Tm >= 0 ? Tm * c.leverKn : Tm * c.leverKn * 0.4;   // astern only brakes her: the game has no sternway
    st.u += (uT - st.u) * Math.min(1, dt / (uT < st.u ? (Tm < 0 ? c.speedLagDown * 0.6 : c.speedLagDown) : c.speedLag)); st.u = Math.max(0, st.u);
    // the thrusters are a low-speed tool: they fade with speed (half force at thrU0 knots) and lock above thrLockKn
    st.thLocked = st.thLocked ? st.u > c.thrUnlockKn : st.u > c.thrLockKn;
    const fth = st.thLocked ? 0 : 1 / (1 + Math.pow(st.u / c.thrU0, 1.6)), kt = Math.min(1, dt / c.thrLag);
    st.thBa += ((st.thLocked ? 0 : st.thB) - st.thBa) * kt; st.thSa += ((st.thLocked ? 0 : st.thS) - st.thSa) * kt;
    const vth = c.thrLat * (st.thBa + st.thSa) * fth, yth = c.thrYaw * (st.thBa - st.thSa) * fth;   // both to starboard: she moves sideways; opposite: she turns on the spot
    st.dA += (cmd - st.dA) * Math.min(1, dt / c.rudderLag);
    st.r += (c.rudderEffect * st.dA * (0.3 + 0.7 * st.u / 10) + c.diffYaw * dTh * (0.35 + 0.65 * st.u / c.maxKn) + yth - c.yawDamp * st.r + c.sheer * st.pushK * clampN(st.x, -14, 14) * (st.u / 10) - c.headStab * st.psi + st.gust) * dt;
    const ds = st.u * Math.cos(st.psi) / Math.max(0.45, 1 - kap * st.x);              // along the path (the inside of a turn is the shorter way round)
    st.psi += (st.r - kap * ds) * dt;                                                   // the path itself is turning: a bow that is not turning with it falls off to the outside
    st.x += (st.u * Math.sin(st.psi) + st.drift + vth) * dt; st.s += ds * dt;
    const side = st.x < 0 ? -1 : 1, w = wallAt(st.s, side);
    if (Math.abs(st.x) > w) { st.x = side * w; if (st.psi * side > 0) st.psi *= Math.max(0, 1 - 3 * dt); st.atWall = true; } else st.atWall = false;   // riding the wall: the bow comes round to the path, she goes along it
  }
  const capT = v => { st.T = Math.min(st.T, v); st.levP = Math.min(st.levP, v); st.levS = Math.min(st.levS, v); };   // the pilot easing her down holds BOTH levers back
  function step(dt) {
    if (st.done && !st.settling) return;
    st.t += dt; st.drift = driftAt(st.t, st.s); st.gust = gustAt(st.t, st.s); st.setKn = setKnAt(st.t); st.windKn = windKnAt(st.t); st.pushK = pushNow() / 1.5;
    let cmd = st.cmd, T = st.T;
    if (st.pilotCon || st.settling || st.t < st.rescueUntil) { const h = pilotHelm(); cmd = h.rud; if (st.pilotCon || st.settling) { T = h.T; st.linked = true; } st.T = T; st.cmd = cmd; }
    if (st.linked) st.levP = st.levS = st.T; else st.T = T = (st.levP + st.levS) / 2;   // linked: one demand, both levers; unlinked: st.T is just their mean
    physics(dt, cmd, T);
    if (st.done) { st.s = Math.min(st.s, path.length + 30); capT(0.35); return; }   // after the run she settles onto the line on the pilot's hands and slows, but does not run on into the channel
    const L = path.laneAt(st.s);
    if (Math.abs(st.x) + c.shipBeam / 2 <= L) st.inTime += dt;
    st.maxLat = Math.max(st.maxLat, Math.abs(st.x));
    st.wallT = st.atWall ? (st.wallT || 0) + dt : 0; if (st.wallT > 2 && st.t - (st.wallMsgT || -99) > 12 && !st.pilotCon) { st.wallMsgT = st.t; say('Pilot', 'You are standing out of the lane, Captain. Bring her back to the line.'); }
    if (Math.abs(st.x) > c.bankRescue && st.t - st.rescueT > 4) { st.rescues++; st.rescueT = st.t; st.rescueUntil = st.t + 2.5; say('Pilot', 'Easy, Captain. I have the wheel for a moment.'); }
    if (st.t >= 0.3 && !st.pilotCon && !st.said.slow) say('Pilot', 'Reduce speed to five knots, Captain.', 'slow');   // the first thing the pilot asks for
    if (st.t >= 3.5 && !st.said.start) say('Pilot', 'Keep the two lights in line, Captain.', 'start');
    if (st.t >= 7 && Math.abs(st.drift) > 0.15) say('Pilot', 'The tide is setting us to ' + (st.drift > 0 ? 'starboard' : 'port') + ', Captain. Allow for it.', 'tide');
    if (path.turnS != null && st.s >= path.turnS - 22) say('Pilot', 'Bring the ship round onto the Pier Head lead.', 'turn1');
    if (path.gapS != null && st.s >= path.gapS - 40) say('Pilot', 'Pier heads ahead. Hold the lead, then port into the channel.', 'gap');
    const toZone = path.zoneS - st.s, secs = toZone / Math.max(0.5, st.u);
    if (!st.prompted && toZone > 0 && secs <= c.promptSecs && st.u > c.limitKn + c.limitTol && !st.pilotCon) { st.prompted = true; say('Pilot', 'Five knots by the tanker berth, Captain.'); }
    if (!st.crossed && st.s + c.bowGm >= path.zoneS) { st.crossed = true; st.zoneT = st.t; }
    if (st.crossed && st.speedOK === null && st.t - st.zoneT >= c.zoneGraceSecs) {
      if (st.u <= c.limitKn + c.limitTol) st.speedOK = true;
      else if (!st.pilotCon) { st.speedOK = false; st.eased = true; say('Pilot', 'Five knots, Captain. I will bring us down.'); }
      else st.speedOK = false;
    }
    if (st.speedOK === true && st.u > c.limitKn + c.limitTol + 0.5 && !st.eased && !st.pilotCon) { st.speedOK = false; st.eased = true; say('Pilot', 'Too fast, Captain. I will ease us down.'); }
    if (st.eased) capT((c.limitKn - 0.3) / c.leverKn);
    if (st.crossed && st.speedOK === true && !st.said.well && !st.pilotCon) say('Pilot', 'Well done, five knots. Hold it there.', 'well');
    if (st.s >= path.length) {
      st.done = true; st.settling = true; const pct = st.inTime / Math.max(0.1, st.t);
      st.result = { pct, lineStar: pct >= c.starOnLine, speedStar: st.speedOK === true && !st.eased && !st.pilotCon, maxLat: st.maxLat, rescues: st.rescues, pilot: st.pilotCon, speedOK: st.speedOK, crossed: st.crossed };
      say('Pilot', 'Well steered. I have the con for the channel.', 'end');
    }
  }
  return { st, step, cfg: c, pilotHelm, takeCon() { if (st.pilotCon && !st.done) { st.pilotCon = false; say('Pilot', 'You have the con, Captain.'); } } };
}

/* ---------- the page side: cards, controls, lane drawing ---------- */
export function createHoldTheLine(o) {
  // o: { stage, makePath() -> path for this run, onStart(), onEnd(result), onExit(), lockScroll(), unlockScroll() }
  const doc = document, el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const root = el('div', 'sg'); root.hidden = true; o.stage.appendChild(root);
  root.innerHTML =
    // the look follows "Play the arrival" (seaway-wake): the title-card style for the question and the results, the instrument strip for the readouts, the Harbour Master's call card for the pilot's lines, and its slider bars with a grip for the controls
    '<div class="sg-choice"><div class="sg-card"><p class="sg-eyebrow">The Small Roads</p><h3>Would you like to take us down the roads, Captain?</h3>' +
    '<p class="sg-lead">Keep the two lights in line. A / D or the rudder bar put the rudder on (X centres it), W / S or the engine levers set the speed (L links and unlinks the two engines), and below five knots Q / E and Z / C work the bow and stern thrusters. The rudder and the levers stay where you set them. Slow to five knots by the tanker berth.</p>' +
    '<div class="sg-btns"><button type="button" class="sg-btn" data-k="keep">I\'ll keep the con</button><button type="button" class="sg-btn alt" data-k="hand">Pilot, you have the con</button></div></div></div>' +
    '<div class="sg-hud"><span class="g" data-g="sog"><b data-v="sog">8.0</b><i>kn</i><em>speed</em></span><span class="g" data-g="on"><b data-v="on">100</b><i>%</i><em>on the line</em></span><span class="g" data-g="off"><b data-v="off">0</b><i>m</i><em>off the line</em></span></div>' +
    '<div class="sg-vhf" data-v="vhf"></div>' +
    '<div class="sg-wind"><svg viewBox="0 0 48 48" width="46" height="46"><circle class="w-ring" cx="24" cy="24" r="20"/><text class="w-n" x="24" y="10" text-anchor="middle">N</text><g data-v="warrow"><line x1="24" y1="35" x2="24" y2="13"/><path d="M24 8 L29.5 18 L18.5 18 Z"/></g></svg>' +
    '<div class="w-t"><em>Wind</em><b><span data-v="wdir">WSW</span> <span data-v="wkn">12</span><i>kn</i></b></div></div>' +
    '<div class="sg-ctl" data-v="ctl"></div>' +
    '<button type="button" class="sg-small sg-con" data-v="con" hidden>Pilot has the con. Touch the helm to take it.</button>' +
    '<button type="button" class="sg-small sg-exit" data-v="exit">Back to the journey ×</button>' +
    '<div class="sg-end"><div class="sg-card"><p class="sg-stars" data-v="stars"></p><h3 data-v="endH">Into the channel</h3><p class="sg-lead" data-v="endSub"></p><dl data-v="endDl"></dl><div class="sg-btns"><button type="button" class="sg-btn" data-k="carry">Carry on</button><button type="button" class="sg-btn alt" data-k="again">Go again</button></div></div></div>';
  const q = k => root.querySelector('[data-v="' + k + '"]'), btn = k => root.querySelector('[data-k="' + k + '"]');
  const V = { sog: q('sog'), on: q('on'), off: q('off'), vhf: q('vhf'), ctl: q('ctl'), warrow: q('warrow'), wdir: q('wdir'), wkn: q('wkn'), con: q('con'), exit: q('exit'), stars: q('stars'), endH: q('endH'), endSub: q('endSub'), endDl: q('endDl'),
    gSog: root.querySelector('[data-g="sog"]'), gOn: root.querySelector('[data-g="on"]'), gOff: root.querySelector('[data-g="off"]'), choice: root.querySelector('.sg-choice'), end: root.querySelector('.sg-end') };
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'], compass = d => COMPASS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  const G = { active: false, phase: 'off', model: null, path: null, toastT: 0 };
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const show = (e, on) => e.classList.toggle('on', on);

  // the bridge console (see _shared/bridge-console.js): the game owns the state, the panel draws it and sends the player's hands back
  const cons = createBridgeConsole(V.ctl, {
    onLever(i, v) { const st = G.model && G.model.st; if (!st || G.phase !== 'play') return; st.lastLev = i; if (st.linked) { st.T = v; st.levP = st.levS = v; } else { if (i === 0) st.levP = v; else st.levS = v; st.T = (st.levP + st.levS) / 2; } G.model.takeCon(); sync(); },
    onLink(on) { const st = G.model && G.model.st; if (!st || G.phase !== 'play') return; if (on && !st.linked) { const v = st.lastLev === 1 ? st.levS : st.levP; st.T = st.levP = st.levS = v; } st.linked = on; G.model.takeCon(); sync(); },   // linking again: both follow the lever moved last
    onRudder(deg) { const st = G.model && G.model.st; if (!st || G.phase !== 'play') return; st.cmd = deg / 35; keyRud = false; G.model.takeCon(); sync(); },
    onMidships() { const st = G.model && G.model.st; if (!st || G.phase !== 'play') return; st.cmd = 0; keyRud = false; G.model.takeCon(); sync(); },
    onThruster(which, v) { const st = G.model && G.model.st; if (!st || G.phase !== 'play' || st.thLocked) { if (st && v === 0) st.thB = st.thS = 0; return; } if (st.thLinked) st.thB = st.thS = v; else if (which === 'b') st.thB = v; else st.thS = v; G.model.takeCon(); sync(); },   // linked: either slider works both thrusters the same way (the ship walks sideways)
    onThrLink(on) { const st = G.model && G.model.st; if (!st || G.phase !== 'play') return; st.thLinked = on; if (on) st.thS = st.thB; G.model.takeCon(); sync(); },
  });
  // The right-hand column while she plays (Simon, 23 Oct 2026): the console at the bottom, flush right; the leading-light view stacked on it; the wind dial on that, all aligned right and the same width as the lead panel.
  function layoutRight(on) {
    const ld = o.stage.querySelector('.slead-hud'), wd = root.querySelector('.sg-wind');
    if (!on) { if (ld) ld.style.bottom = ''; return; }
    const ch = V.ctl.offsetHeight, cw = V.ctl.offsetWidth, lh = ld ? ld.offsetHeight : 0;
    if (ld) ld.style.bottom = (24 + ch + 10) + 'px';
    wd.style.bottom = (24 + ch + 10 + lh + 10) + 'px'; if (ld) wd.style.width = ld.offsetWidth + 'px';
    V.con.style.right = (24 + cw + 12) + 'px';   // "Pilot has the con" sits just left of the console
  }
  function sync() {
    const st = G.model && G.model.st; if (!st) return; if (G.phase === 'play') layoutRight(true);
    cons.update({ lev: [st.levP, st.levS], act: [st.np, st.ns], linked: st.linked, rudder: st.cmd * 35, rudderAct: st.dA * 35, thr: [st.thB, st.thS], thLinked: st.thLinked, thLocked: st.thLocked, holdAvail: false, holding: false, mark: G.model.cfg.limitKn / G.model.cfg.leverKn, markLabel: '5 KN' });
  }
  function placeVhf() {   // the pilot's calls (the same width as the plotter) stack up from just above the chart plotter (left edge on its left edge), newest at the bottom
    const pl = o.stage.querySelector('.plotter-box'), sr = o.stage.getBoundingClientRect(); if (!pl) { V.vhf.style.left = '24px'; V.vhf.style.bottom = '24px'; return; }
    const r = pl.getBoundingClientRect(); V.vhf.style.left = (r.left - sr.left).toFixed(0) + 'px'; V.vhf.style.width = r.width.toFixed(0) + 'px'; V.vhf.style.bottom = (sr.bottom - r.top + 10).toFixed(0) + 'px';
  }
  const liveCalls = () => [...V.vhf.children].filter(c => !c.classList.contains('out'));
  const fadeCalls = () => { const l = liveCalls(); l.forEach((c, i) => c.classList.toggle('old', i < l.length - 1)); };   // everything but the newest call is dimmed, so it plainly reads as older
  const dropCall = d => { if (!d.isConnected || d.classList.contains('out')) return; d.classList.add('out'); setTimeout(() => { d.remove(); fadeCalls(); }, 320); fadeCalls(); };
  function flush() {   // the pilot's lines: call cards above the plotter, newest at the bottom, fading (the Harbour Master's call card from the arrival game)
    if (G.model.st.msgs.length || V.vhf.children.length) placeVhf();   // (and every frame while a call is showing: the plotter can change size)
    const st = G.model.st;
    while (st.msgs.length) {
      const m = st.msgs.shift(), pilot = m.who === 'Pilot', d = el('div', 'sg-msg' + (pilot && o.faceSrc ? '' : ' noface'), (pilot && o.faceSrc ? '<img src="' + o.faceSrc + '" alt="">' : '') + '<b>' + m.who + '</b><span>' + m.msg + '</span>');
      V.vhf.appendChild(d); setTimeout(() => dropCall(d), 6500);   // a new call rises in at the bottom, just above the plotter, and pushes the older ones up
      const live = liveCalls(); while (live.length > 2) dropCall(live.shift());
    }
    fadeCalls(); }

  function begin(hand) {
    G.path = o.makePath(); G.model = createModel(G.path); const st = G.model.st; st.pilotCon = !!hand; G.phase = 'play';
    show(V.choice, false); show(V.end, false); V.vhf.innerHTML = ''; V.con.hidden = !hand; root.classList.add('playing'); root.classList.remove('ended');
    keys.l = keys.r = false; keyRud = false;
    V.wdir.textContent = compass(G.model.cfg.windFromDeg); V.warrow.setAttribute('transform', 'rotate(' + ((G.model.cfg.windFromDeg + 180) % 360) + ' 24 24)');   // the arrow points the way the wind is blowing (north is up)
    if (hand) { st.msgs.push({ who: 'Bridge', msg: 'Pilot, you have the con.' }, { who: 'Pilot', msg: 'I have the con.' }); }
    sync(); hud();
  }
  function open() {
    if (G.active) return; G.active = true; G.phase = 'choice'; root.hidden = false; o.lockScroll(); o.onStart();
    G.path = o.makePath(); G.model = createModel(G.path); show(V.choice, true); show(V.end, false); root.classList.add('on'); root.classList.remove('playing', 'ended'); V.con.hidden = true; sync();
  }
  function close(carryOn) { if (!G.active) return; layoutRight(false); G.active = false; G.phase = 'off'; root.hidden = true; root.classList.remove('on', 'playing', 'ended'); show(V.choice, false); show(V.end, false); o.unlockScroll(); o.onExit(carryOn === true); }
  btn('keep').onclick = () => begin(false); btn('hand').onclick = () => begin(true);
  btn('again').onclick = () => { layoutRight(false); show(V.end, false); root.classList.remove('playing', 'ended'); G.phase = 'choice'; G.path = o.makePath(); G.model = createModel(G.path); o.onRestart(); show(V.choice, true); V.con.hidden = true; sync(); };
  btn('carry').onclick = () => close(true);
  V.exit.onclick = () => close(false);
  V.con.onclick = () => G.model.takeCon();

  function hud() {
    const m = G.model, st = m.st, L = G.path.laneAt(st.s), pct = st.t > 0.5 ? st.inTime / st.t : 1;
    if (st.windKn != null) V.wkn.textContent = Math.round(st.windKn);
    V.sog.textContent = st.u.toFixed(1); V.on.textContent = Math.round(pct * 100); V.off.textContent = Math.round(Math.abs(st.x) * 2.08); V.gOff.className = 'g ' + (Math.abs(st.x) + m.cfg.shipBeam / 2 <= L ? 'ok' : Math.abs(st.x) - m.cfg.shipBeam / 2 <= L ? 'warn' : 'bad');   // metres off the line (a game metre is about 2.08 m)
    V.gSog.className = 'g ' + (st.s >= G.path.zoneS ? (st.u <= m.cfg.limitKn + m.cfg.limitTol ? 'ok' : 'bad') : st.u > m.cfg.limitKn ? 'warn' : 'ok');
    V.gOn.className = 'g ' + (pct >= m.cfg.starOnLine ? 'ok' : pct > 0.6 ? 'warn' : 'bad');
    root.classList.toggle('near-l', st.x < 0 && Math.abs(st.x) + m.cfg.shipBeam / 2 > L * 0.6); root.classList.toggle('near-r', st.x > 0 && Math.abs(st.x) + m.cfg.shipBeam / 2 > L * 0.6);
  }
  function finishCard() {
    const m = G.model, st = m.st, r = st.result; G.phase = 'end';
    V.stars.innerHTML = r.pilot ? 'The pilot took us down the roads.' : (r.speedStar ? '★ Harbour speed<br>' : '') + (r.lineStar ? '★ On the line' : '');
    V.endH.textContent = 'Into the channel';
    V.endSub.textContent = r.pilot ? 'A calm ride, and no stars for the roads this time.' : (r.lineStar && r.speedStar ? 'Two stars, and holding five knots.' : 'The stars need five knots or under past the tanker berth, and ' + Math.round(m.cfg.starOnLine * 100) + '% of the time inside the lane.');
    V.endDl.innerHTML = '<dt>On the line</dt><dd>' + Math.round(r.pct * 100) + '% of the time</dd><dt>Speed past the tanker berth</dt><dd>' + (r.crossed ? (r.speedOK ? 'five knots or under' : 'too fast; the pilot eased us') : '—') + '</dd><dt>Furthest off the line</dt><dd>' + (r.maxLat * 2.08).toFixed(0) + ' m</dd>';
    root.classList.remove('playing'); root.classList.add('ended'); layoutRight(false); show(V.end, true); o.onEnd(r);
  }

  // keys: the panel takes the mouse and touch; these are the keyboard
  // A / D lean on the rudder: holding a key winds it on towards full (about half a second), letting go brings it back to amidships, so a tap is a touch of helm rather than a slam to full. W / S step the speed lever by half a knot.
  const KEYS = ['a', 'd', 'w', 's', 'x', ' ', 'l', 'q', 'e', 'z', 'c', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'], keys = { l: false, r: false }, RUD_ON = 1.8; let keyRud = false;
  function onKeyDown(e) {
    if (!G.active || G.phase !== 'play' || e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key.toLowerCase(); if (!KEYS.includes(k)) return; e.preventDefault(); const st = G.model.st;
    if (k === 'x' || k === ' ') { st.cmd = 0; keyRud = false; }   // X or Space: rudder amidships
    else if (k === 'a' || k === 'arrowleft') { keys.l = true; keyRud = true; } else if (k === 'd' || k === 'arrowright') { keys.r = true; keyRud = true; }
    else if (k === 'l') { if (st.linked) st.linked = false; else { const v = st.lastLev === 1 ? st.levS : st.levP; st.T = st.levP = st.levS = v; st.linked = true; } }
    else if (k === 'q' || k === 'e' || k === 'z' || k === 'c') { if (!st.thLocked) { const v = (k === 'e' || k === 'c') ? 1 : -1; if (st.thLinked) st.thB = st.thS = v; else if (k === 'q' || k === 'e') st.thB = v; else st.thS = v; } }   // held to push, let go to stop
    else { const d = (k === 'w' || k === 'arrowup') ? 0.05 : -0.05; const cl = v => Math.max(-1, Math.min(1, v)); if (st.linked) { st.T = cl(st.T + d); st.levP = st.levS = st.T; } else { st.levP = cl(st.levP + d); st.levS = cl(st.levS + d); st.T = (st.levP + st.levS) / 2; } }   // W / S step the levers together, linked or not
    G.model.takeCon(); sync();
  }
  function onKeyUp(e) { const k = e.key.toLowerCase(); if (k === 'a' || k === 'arrowleft') keys.l = false; else if (k === 'd' || k === 'arrowright') keys.r = false; else if ((k === 'q' || k === 'e') && G.model) { G.model.st.thB = 0; if (G.model.st.thLinked) G.model.st.thS = 0; } else if ((k === 'z' || k === 'c') && G.model) { G.model.st.thS = 0; if (G.model.st.thLinked) G.model.st.thB = 0; } }
  function steerKeys(dt) {   // holding A / D winds the rudder on (about half a second to full) and it STAYS where it is when the key is let go
    if (G.phase !== 'play' || !keyRud) return; const st = G.model.st, tgt = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); if (tgt === 0) return;
    const rate = RUD_ON * dt; st.cmd += Math.max(-rate, Math.min(rate, tgt - st.cmd));
  }
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp);

  return {
    open, close, get active() { return G.active; }, get phase() { return G.phase; }, get model() { return G.model; }, get path() { return G.path; },
    advance(dt) {   // called every frame while the game is on; the model runs in fixed 1/60 s steps
      if (!G.active || !G.model) return; if (G.phase !== 'play' && G.phase !== 'end') return;
      steerKeys(Math.min(0.1, dt)); G.acc = (G.acc || 0) + Math.min(0.1, dt) * (G.model.cfg.timeScale || 1); const m = G.model; let n = 0;   // the game runs a little faster than the clock (timeScale), so five knots LOOKS quicker and the run is shorter
      while (G.acc >= 1 / 60 && n < 10) { m.step(1 / 60); G.acc -= 1 / 60; n++; }
      if (G.phase === 'play') { hud(); sync(); flush(); if (m.st.done) finishCard(); } else { flush(); }
    },
    settled() { const st = G.model && G.model.st; return !!st && Math.abs(st.x) < 0.8 && Math.abs(st.psi) < 0.035; },
    destroy() { removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); cons.destroy(); root.remove(); },
  };
}
