/* The berthing game, on the page (30 Oct 2026): "Take the helm: The Berthing". The page side of berth-game.js: the question card, the readouts, the Console, the pilot's calls, the lines bar, the collision flash and
   reset, the results card and the keyboard. The model (berth-game.js) is pure; beat.js reads the ship's pose from `model.st.h` each frame in place of the scroll position and draws the ghost berth and the tide.
   The look, and nearly all the markup classes, are Hold the Line's (hold-the-line.js, the `sg-` classes in beat.css) so the two games read as one. Brief: DOCS/BRIEF-berthing-game.md. */

import { createBridgeConsole } from '../_shared/bridge-console.js';
import { createBerthModel } from './berth-game.js';

export function createBerthGame(o) {
  // o: { stage, faceSrc, lockScroll(), unlockScroll(), onStart(), onRestart(), onExit(carryOn, finished) }
  const doc = document, el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const root = el('div', 'sg sg-berth'); root.hidden = true; o.stage.appendChild(root);
  root.innerHTML =
    '<div class="sg-choice"><div class="sg-card"><p class="sg-eyebrow">The berth</p><h3>Would you like to take us alongside, Captain?</h3>' +
    '<p class="sg-lead">Bring the yacht alongside the Albert Pier, port side to, inside the faint outline. Slow right down, then walk her in sideways with the thrusters (below five knots). H holds her in place (below three knots). A / D rudder, W / S the engine levers, L links the engines, Q / E bow thruster, Z / C stern thruster. No clock: take your time.</p>' +
    '<div class="sg-btns"><button type="button" class="sg-btn" data-k="keep">Take the Helm</button><button type="button" class="sg-btn alt" data-k="story">Back to the story</button></div></div></div>' +
    '<div class="sg-choice sg-crash"><div class="sg-card"><p class="sg-eyebrow">The berth</p><h3>Sorry, Captain</h3><p class="sg-lead">We\'ll have to call that one there: we\'re at risk of damaging something. Would you like to try again?</p><div class="sg-btns"><button type="button" class="sg-btn" data-k="retry">Try again</button><button type="button" class="sg-btn alt" data-k="skip">Skip</button></div></div></div>' +
    '<div class="sg-hud"><span class="g" data-g="sog"><b data-v="sog">4.2</b><i>kn</i><em>speed</em></span><span class="g" data-g="bow"><b data-v="bow">0</b><i>m</i><em>bow off</em></span><span class="g" data-g="stern"><b data-v="stern">0</b><i>m</i><em>stern off</em></span><span class="g" data-g="cls"><b data-v="cls">0.0</b><i>kn</i><em>closing</em></span></div>' +
    '<div class="sg-vhf" data-v="vhf"></div>' +
    '<div class="sg-rcol" data-v="rcol"><button type="button" class="sg-small sg-pause" data-k="pause">Pause</button>' +
    '<div class="sg-lines" data-v="lines"><div class="cap" data-v="lcap">Bow line</div><div class="track" data-v="ltrack"><div class="zone" data-v="lzone"></div><div class="mk" data-v="lmk"></div></div><div class="hint">tap in the green<br><i>click the bar, or Space</i></div><button type="button" class="sg-small" data-k="crew">Let the crew throw</button></div>' +
    '<div class="sg-wind"><svg viewBox="0 0 48 48" width="46" height="46"><circle class="w-ring" cx="24" cy="24" r="20"/><text class="w-n" x="24" y="10" text-anchor="middle">N</text><g data-v="warrow"><line x1="24" y1="35" x2="24" y2="13"/><path d="M24 8 L29.5 18 L18.5 18 Z"/></g></svg>' +
    '<div class="w-t"><em>Wind</em><b><span data-v="wdir">WSW</span> <span data-v="wkn">12</span><i>kn</i></b></div></div>' + '</div>' +
    '<div class="sg-ctl" data-v="ctl"></div>' +
    '<button type="button" class="sg-small sg-exit" data-v="exit">Back to the journey ×</button>' +
    '<div class="sg-pausewrap"><div class="sg-card"><p class="sg-eyebrow">Paused</p><h3>Take your time, Captain</h3><p class="sg-lead">The yacht, the wind and the tide are all held where they are.</p><div class="sg-btns"><button type="button" class="sg-btn" data-k="resume">Resume</button></div></div></div>' +
    '<div class="sg-end"><div class="sg-card"><p class="sg-stars" data-v="stars"></p><h3 data-v="endH">All fast</h3><p class="sg-lead" data-v="endSub"></p><dl data-v="endDl"></dl><div class="sg-btns"><button type="button" class="sg-btn" data-k="carry">Carry on</button><button type="button" class="sg-btn alt" data-k="again">Go again</button></div></div></div>';
  const q = k => root.querySelector('[data-v="' + k + '"]'), btn = k => root.querySelector('[data-k="' + k + '"]');
  const V = { sog: q('sog'), bow: q('bow'), stern: q('stern'), cls: q('cls'), vhf: q('vhf'), ctl: q('ctl'), warrow: q('warrow'), wdir: q('wdir'), wkn: q('wkn'), exit: q('exit'), stars: q('stars'), endH: q('endH'), endSub: q('endSub'), endDl: q('endDl'),
    rcol: q('rcol'), lines: q('lines'), lcap: q('lcap'), ltrack: q('ltrack'), lzone: q('lzone'), lmk: q('lmk'),
    gSog: root.querySelector('[data-g="sog"]'), gBow: root.querySelector('[data-g="bow"]'), gStern: root.querySelector('[data-g="stern"]'), gCls: root.querySelector('[data-g="cls"]'), choice: root.querySelector('.sg-choice'), crash: root.querySelector('.sg-crash'), end: root.querySelector('.sg-end') };
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'], compass = d => COMPASS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  const G = { active: false, phase: 'off', model: null, hitAt: 0, acc: 0, rud: 0, paused: false };
  const show = (e, on) => e.classList.toggle('on', on), clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const newModel = () => { G.model = createBerthModel(); G.rud = 0; return G.model; };

  // the Console (see _shared/bridge-console.js): the model owns the state, the panel draws it and sends the player's hands back
  const mdl = () => (G.phase === 'play' && !G.paused ? G.model : null);
  const cons = createBridgeConsole(V.ctl, {
    onLever(i, v) { const m = mdl(); if (m) { m.setLever(i, v); sync(); } },
    onLink(on) { const m = mdl(); if (m) { m.setLink(on); sync(); } },
    onRudder(deg) { const m = mdl(); if (m) { G.rud = deg; m.setRudder(deg); sync(); } },
    onMidships() { const m = mdl(); if (m) { G.rud = 0; m.setRudder(0); sync(); } },
    onThruster(which, v) { const m = mdl(); if (m) { m.setThruster(which, v); sync(); } },
    onThrLink(on) { const m = mdl(); if (m) { m.setThrLink(on); sync(); } },
    onHold() { const m = mdl(); if (m) { m.toggleHold(); sync(); } },
  });
  function layoutRight(on) {   // the right-hand column while she plays: the console at the bottom, flush right; above it the wind dial, the lines bar when it is up, and the pause button
    if (!on) return; V.rcol.style.bottom = (24 + V.ctl.offsetHeight + 10) + 'px';
  }
  function sync() {
    const m = G.model; if (!m) return; const st = m.st, h = st.h, inf = m.info(); if (G.phase === 'play') layoutRight(true);
    cons.update({ lev: [st.levP, st.levS], act: [m.leverOf(h.np), m.leverOf(h.ns)], linked: st.linked, rudder: st.rud, rudderAct: h.rud, thr: [st.thB, st.thS], thLinked: st.thLinked, thLocked: st.thLocked, holdAvail: inf.holdAvail, holding: inf.holding, mark: 0.4, markLabel: '5 KN' });   // five knots 40% of the way up the ahead stretch, as in Hold the Line
  }
  // the pilot's calls: cards above the plotter, newest at the bottom (as in Hold the Line)
  function placeVhf() {
    const pl = o.stage.querySelector('.plotter-box'), sr = o.stage.getBoundingClientRect(); if (!pl) { V.vhf.style.left = '24px'; V.vhf.style.bottom = '24px'; return; }
    const r = pl.getBoundingClientRect(); V.vhf.style.left = (r.left - sr.left).toFixed(0) + 'px'; V.vhf.style.width = r.width.toFixed(0) + 'px'; V.vhf.style.bottom = (sr.bottom - r.top + 10).toFixed(0) + 'px';
  }
  const liveCalls = () => [...V.vhf.children].filter(c => !c.classList.contains('out')), fadeCalls = () => { const l = liveCalls(); l.forEach((c, i) => c.classList.toggle('old', i < l.length - 1)); };
  const dropCall = d => { if (!d.isConnected || d.classList.contains('out')) return; d.classList.add('out'); setTimeout(() => { d.remove(); fadeCalls(); }, 320); fadeCalls(); };
  function flush() {
    const st = G.model.st; if (st.msgs.length || V.vhf.children.length) placeVhf();
    while (st.msgs.length) {
      const m = st.msgs.shift(), pilot = m.who === 'Pilot', d = el('div', 'sg-msg' + (pilot && o.faceSrc ? '' : ' noface'), (pilot && o.faceSrc ? '<img src="' + o.faceSrc + '" alt="">' : '') + '<b>' + m.who + '</b><span>' + m.msg + '</span>');
      V.vhf.appendChild(d); setTimeout(() => dropCall(d), 6500); const live = liveCalls(); while (live.length > 2) dropCall(live.shift());
    }
    fadeCalls();
  }

  function open() {
    if (G.active) return; G.active = true; G.phase = 'choice'; root.hidden = false; o.lockScroll(); o.onStart(); newModel();
    show(V.choice, true); show(V.end, false); root.classList.add('on'); root.classList.remove('playing', 'ended', 'hit'); sync();
  }
  function close(carryOn) { if (!G.active) return; setPause(false); show(V.crash, false); root.classList.remove('warning'); const fin = !!(G.model && G.model.st.phase === 'done'); layoutRight(false); G.active = false; G.phase = 'off'; root.hidden = true; root.classList.remove('on', 'playing', 'ended', 'hit'); show(V.choice, false); show(V.end, false); o.unlockScroll(); o.onExit(carryOn === true, fin); }
  function begin() {
    G.phase = 'play'; show(V.choice, false); show(V.end, false); V.vhf.innerHTML = ''; root.classList.add('playing'); root.classList.remove('ended', 'hit'); keys.l = keys.r = false; G.rud = 0;
    const cfg = G.model.cfg; V.wdir.textContent = compass(cfg.windFromDeg); V.warrow.setAttribute('transform', 'rotate(' + ((cfg.windFromDeg + 180) % 360) + ' 24 24)'); sync(); hud();
  }
  btn('keep').onclick = begin; btn('story').onclick = () => close(false);
  btn('again').onclick = () => { layoutRight(false); show(V.end, false); root.classList.remove('playing', 'ended'); newModel(); G.phase = 'choice'; o.onRestart(); show(V.choice, true); sync(); };
  btn('carry').onclick = () => close(true); V.exit.onclick = () => close(false);
  const setPause = on => { if (G.phase !== 'play') on = false; G.paused = on; root.classList.toggle('paused', on); btn('pause').textContent = on ? 'Resume' : 'Pause'; if (on) { keys.l = keys.r = false; } };
  btn('pause').onclick = () => setPause(!G.paused); btn('resume').onclick = () => setPause(false);
  const retry = () => { const m = G.model; show(V.crash, false); m.reset(); root.classList.remove('hit', 'warning'); G.phase = 'play'; G.rud = 0; keys.l = keys.r = false; V.vhf.innerHTML = ''; sync(); hud(); };
  btn('retry').onclick = retry; btn('skip').onclick = () => { show(V.crash, false); close(false); };
  btn('crew').onclick = () => { const m = mdl(); if (m) m.crewThrow(); };
  V.ltrack.addEventListener('pointerdown', e => { const m = mdl(); if (m) { e.preventDefault(); m.tap(); } });

  function hud() {
    const m = G.model, st = m.st, inf = m.info(), sn = inf.gKn;
    V.sog.textContent = sn.toFixed(1); V.bow.textContent = Math.max(0, inf.bowGap).toFixed(inf.bowGap < 10 ? 1 : 0); V.stern.textContent = Math.max(0, inf.sternGap).toFixed(inf.sternGap < 10 ? 1 : 0);
    const cls = Math.max(0, inf.closeKn); V.cls.textContent = cls.toFixed(1);
    V.gSog.className = 'g ' + (inf.toBerth < 40 && sn > 1.5 ? 'warn' : 'ok'); V.gCls.className = 'g ' + (cls >= m.cfg.collideKn ? 'bad' : cls >= 0.3 ? 'warn' : 'ok');
    const near = x => 'g ' + (x < 0.5 ? 'bad' : x < 2 ? 'warn' : 'ok'); V.gBow.className = inf.toBerth < 70 ? near(inf.bowGap) : 'g ok'; V.gStern.className = inf.toBerth < 70 ? near(inf.sternGap) : 'g ok';
    if (st.now.windKn != null) V.wkn.textContent = Math.round(st.now.windKn);
    const wi = G.phase === 'play' && !G.paused ? inf.impactIn : null; root.classList.toggle('warning', wi != null); if (wi != null) root.style.setProperty('--warn', clampN(1 - wi / m.cfg.warnSecs, 0.12, 1).toFixed(2));   // red at the screen edges before an impact: harder and quicker the nearer it is
    // the lines bar
    const on = st.phase === 'lines'; V.lines.classList.toggle('on', on);
    if (on) { const L = st.lines, z = L.cur === 'bow' ? m.cfg.zoneBow : m.cfg.zoneStern, mk = inf.mark == null ? 0.5 : inf.mark; V.lcap.textContent = (L.cur === 'bow' ? 'Bow' : 'Stern') + ' line'; V.lzone.style.height = (z * 100) + '%'; V.lzone.style.top = ((0.5 - z / 2) * 100) + '%'; V.lmk.style.top = (mk * 100) + '%';
      V.lines.classList.toggle('frozen', st.t < L.freezeUntil); }
  }
  function finishCard() {
    const m = G.model, st = m.st, r = st.result; G.phase = 'end';
    V.stars.innerHTML = '★ Alongside' + (r.soft ? '<br>★ Soft landing' : '') + (r.lines ? '<br>★ Lines' : '');
    V.endH.textContent = 'All fast'; V.endSub.textContent = r.attempts > 1 ? 'Alongside on attempt ' + r.attempts + '.' : 'Alongside, first time.';
    V.endDl.innerHTML = '<dt>First touch</dt><dd>' + (r.firstTouchKn == null ? 'none: she was never on the fenders' : r.firstTouchKn.toFixed(1) + ' knots') + '</dd><dt>Lines</dt><dd>' + (r.lines ? 'both thrown by you' : r.crew === 2 ? 'both thrown by the crew' : 'one thrown by the crew') + (r.misses ? ' (' + r.misses + (r.misses > 1 ? ' misses' : ' miss') + ')' : '') + '</dd><dt>Attempts</dt><dd>' + r.attempts + '</dd>';
    root.classList.remove('playing'); root.classList.add('ended'); layoutRight(false); show(V.end, true);
  }

  // keyboard: the panel takes the mouse and touch; these are the keys (the same as Hold the Line, plus H for Hold Position and Space / Enter for the lines bar)
  const KEYS = ['a', 'd', 'w', 's', 'x', ' ', 'enter', 'l', 'h', 'p', 'q', 'e', 'z', 'c', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'], keys = { l: false, r: false }, RUD_ON = 1.8; let keyRud = false;
  function onKeyDown(e) {
    if (!G.active || G.phase !== 'play' || e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key.toLowerCase(); if (!KEYS.includes(k)) return; e.preventDefault(); const m = G.model, st = m.st;
    if (k === 'p') { if (!e.repeat) setPause(!G.paused); return; }
    if (G.paused) return;
    if ((k === ' ' || k === 'enter') && st.phase === 'lines') { if (!e.repeat) m.tap(); return; }
    if (k === 'h') { if (!e.repeat) m.toggleHold(); sync(); return; }
    if (k === 'x' || k === ' ') { G.rud = 0; keyRud = false; m.setRudder(0); }
    else if (k === 'a' || k === 'arrowleft') { keys.l = true; keyRud = true; } else if (k === 'd' || k === 'arrowright') { keys.r = true; keyRud = true; }
    else if (k === 'l') { if (!e.repeat) m.setLink(!st.linked); }
    else if (k === 'q' || k === 'e' || k === 'z' || k === 'c') { m.setThruster((k === 'q' || k === 'e') ? 'b' : 's', (k === 'e' || k === 'c') ? 1 : -1); }   // held to push, let go to stop
    else { const d = (k === 'w' || k === 'arrowup') ? 0.05 : -0.05; if (st.linked) m.setLever(0, clampN(st.levP + d, -1, 1)); else { m.setLever(0, clampN(st.levP + d, -1, 1)); m.setLever(1, clampN(st.levS + d, -1, 1)); } }   // W / S step the levers together, linked or not
    sync();
  }
  function onKeyUp(e) { const k = e.key.toLowerCase(), m = G.model; if (k === 'a' || k === 'arrowleft') keys.l = false; else if (k === 'd' || k === 'arrowright') keys.r = false; else if (m && (k === 'q' || k === 'e')) { m.setThruster('b', 0); if (m.st.thLinked) m.setThruster('s', 0); } else if (m && (k === 'z' || k === 'c')) { m.setThruster('s', 0); if (m.st.thLinked) m.setThruster('b', 0); } }
  function steerKeys(dt) {   // holding A / D winds the rudder on (about half a second to full) and it STAYS where it is when the key is let go
    if (G.phase !== 'play' || !keyRud) return; const tgt = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); if (tgt === 0) return; const rate = RUD_ON * dt * 35; G.rud += Math.max(-rate, Math.min(rate, tgt * 35 - G.rud)); G.model.setRudder(G.rud);
  }
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp);

  return {
    open, close, get active() { return G.active; }, get phase() { return G.phase; }, get model() { return G.model; },
    advance(dt) {   // called every frame while the game is on; the model runs in fixed 1/60 s steps
      if (!G.active || !G.model) return; const m = G.model, st = m.st; if (G.phase === 'choice') { sync(); return; }
      if (G.phase === 'hit') { root.classList.remove('warning'); flush(); if (performance.now() - G.hitAt > 1000) show(V.crash, true); return; }   // the last frame stays up for a second with the red edges, then the card asks whether to try again (nothing resets by itself)
      if (G.phase !== 'play' && G.phase !== 'end') return;
      if (G.paused) { hud(); sync(); return; }
      steerKeys(Math.min(0.1, dt)); G.acc += Math.min(0.1, dt); let n = 0; while (G.acc >= 1 / 60 && n < 10) { m.step(1 / 60); G.acc -= 1 / 60; n++; if (st.collision) break; }
      if (G.phase === 'play') {
        hud(); sync(); flush();
        if (st.collision) { G.phase = 'hit'; G.hitAt = performance.now(); root.classList.add('hit'); }   // the last frame stays on screen while the pilot speaks, then the yacht goes back to the start
        else if (st.phase === 'done') finishCard();
      } else flush();
    },
    destroy() { removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); cons.destroy(); root.remove(); },
  };
}
