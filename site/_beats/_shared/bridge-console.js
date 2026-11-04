/* _beats/_shared/bridge-console.js — the bridge console, one panel for every screen (Hold the Line now; the berthing game and Play the arrival next). 23 Oct 2026, Simon's "Console, A+":
   thrusters on the left, the rudder dial and its bar in the middle, the twin engine levers on the right (LINKED by default, UNLINK any time), MIDSHIPS and HOLD POSITION under the rudder.
   Design board: tools/design-board/bridge-controls.html. Handling behind it: DOCS/HANDLING-twin-screw.md.
   It is only a view and a set of inputs: the game owns the state. createBridgeConsole(host, handlers) returns { update(state), destroy() }.
   state: { lev: [port, stbd] (-1 full astern .. +1 full ahead), act: [port, stbd] (where the propellers actually are: they lag the levers), linked, rudder (deg, the bar: +stbd), rudderAct (deg, the dial),
            thr: [bow, stern] (-1 port .. +1 stbd), thLinked, thLocked, lockNote: [line 1, line 2] (optional), canUnlink (false = engines stay linked), holdAvail, holding, mark (lever value of the green mark, e.g. 0.5 = five knots), markLabel }
   handlers: onLever(i, v), onLink(on), onThrLink(on) (the two thrusters), onRudder(deg), onMidships(), onThruster('b' | 's', v) (v = 0 on release: they spring back), onHold(). */
const NS = 'http://www.w3.org/2000/svg';
const f1 = n => (+n).toFixed(1), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pol = (cx, cy, r, deg) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
const arcD = (cx, cy, r, a0, a1) => { const [x0, y0] = pol(cx, cy, r, a0), [x1, y1] = pol(cx, cy, r, a1); return `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 0 1 ${f1(x1)} ${f1(y1)}`; };
const C = { edge: '#2a2d30', line: '#5d666e', dimLit: '#a2abb2', ink: '#e9ecef', dim: '#7f878e', glow: '#ffb347', track: '#050607', port: '#ff5a4d', stbd: '#43d17a' };
let SEQ = 0;

export function createBridgeConsole(host, handlers = {}) {
  const H = Object.assign({ onLever() {}, onLink() {}, onThrLink() {}, onRudder() {}, onMidships() {}, onThruster() {}, onHold() {} }, handlers), id = 'bc' + (++SEQ);
  const mk = (tag, a = {}, parent = svg, text) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 620 270'); svg.setAttribute('class', 'bc'); svg.style.cssText = 'display:block;width:100%;height:auto;touch-action:none;user-select:none'; host.appendChild(svg);
  const txt = (t, x, y, o = {}, parent = svg) => mk('text', { x, y, fill: o.fill || '#fff', 'font-size': +((o.size || 9) * 1.14).toFixed(1), 'font-weight': o.weight || 500, 'text-anchor': o.anchor || 'middle', 'letter-spacing': o.ls ?? 1.2, 'font-family': "Jost,system-ui,sans-serif" }, parent, t);
  const defs = mk('defs'); mk('linearGradient', { id: id + 'p', x1: 0, y1: 0, x2: 0, y2: 1 }, defs).innerHTML = '<stop offset="0" stop-color="#1b1d1f"/><stop offset="1" stop-color="#0f1011"/>';
  mk('linearGradient', { id: id + 'k', x1: 0, y1: 0, x2: 0, y2: 1 }, defs).innerHTML = '<stop offset="0" stop-color="#7d858c"/><stop offset=".5" stop-color="#3a3f44"/><stop offset="1" stop-color="#1f2326"/>';
  mk('rect', { x: 4, y: 4, width: 612, height: 262, rx: 14, fill: `url(#${id}p)`, stroke: C.edge, 'stroke-width': 2 });
  const pt = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
  const drag = (hit, onMove, onEnd) => hit.addEventListener('pointerdown', e => {
    if (hit.getAttribute('data-off')) return; try { hit.setPointerCapture(e.pointerId); } catch (_) { /* (a synthetic pointer in a test has no capture) */ } hit.style.cursor = 'grabbing'; onMove(pt(e)); e.preventDefault(); e.stopPropagation();   // (the game page has its own pointerdown handler that takes the pointer for steering: keep it out of this)
    const id = e.pointerId, ends = ['pointerup', 'pointercancel'];
    const mv = ev => { if (ev.pointerId !== id) return; if (ev.pointerType === 'mouse' && ev.buttons === 0) return up(); onMove(pt(ev)); };   // a move with no button held means the release was missed
    const upEv = ev => { if (ev.pointerId === id) up(); };
    let done = false;
    const up = () => { if (done) return; done = true; removeEventListener('pointermove', mv, true); ends.forEach(n => removeEventListener(n, upEv, true)); removeEventListener('blur', up); try { hit.releasePointerCapture(id); } catch (_) {} hit.style.cursor = 'grab'; if (onEnd) onEnd(); };
    addEventListener('pointermove', mv, true); ends.forEach(n => addEventListener(n, upEv, true)); addEventListener('blur', up);
  });
  const button = (x, y, w, h, label, onClick) => {
    const g = mk('g', { style: 'cursor:pointer' }), r = mk('rect', { x, y, width: w, height: h, rx: 5, fill: C.track, stroke: C.line }, g), t = txt(label, x + w / 2, y + h / 2 + 3.4, { size: 9, fill: C.dim, weight: 700, ls: 1.3 }, g);
    g.addEventListener('click', () => { if (!g.getAttribute('data-off')) onClick(); });
    return { g, set(on, onFill, off, text) { r.setAttribute('fill', on ? onFill : C.track); t.setAttribute('fill', on ? '#0b0c0d' : off ? C.dimLit : C.ink); if (text) t.textContent = text; r.setAttribute('stroke', off ? C.dimLit : on ? onFill : C.line); r.setAttribute('stroke-dasharray', off ? '4 3' : ''); r.setAttribute('stroke-width', off ? 1.2 : 1.4); g.setAttribute('opacity', 1); g.setAttribute('data-off', off ? '1' : ''); g.style.cursor = off ? 'default' : 'pointer'; } };   // a greyed-out button keeps a dashed outline and readable lettering, so it still reads as a button that is not available yet
  };

  /* ---------- the rudder: dial and bar (middle) ---------- */
  const DX = 326, DY = 112, DR = 76;
  mk('path', { d: arcD(DX, DY, DR, -70, 0), stroke: C.port, 'stroke-width': 6, fill: 'none', opacity: .9 }); mk('path', { d: arcD(DX, DY, DR, 0, 70), stroke: C.stbd, 'stroke-width': 6, fill: 'none', opacity: .9 });
  for (let a = -35; a <= 35; a += 5) { const long = a % 10 === 0, [x0, y0] = pol(DX, DY, DR - 4, a * 2), [x1, y1] = pol(DX, DY, DR - (long ? 16 : 10), a * 2); mk('line', { x1: f1(x0), y1: f1(y0), x2: f1(x1), y2: f1(y1), stroke: C.ink, 'stroke-width': long ? 1.6 : 1 }); if (long && a !== 0) { const [tx, ty] = pol(DX, DY, DR - 26, a * 2); txt(Math.abs(a), tx, ty + 3.4, { size: 9.5, fill: C.ink, ls: 0 }); } }
  const needle = mk('line', { x1: DX, y1: DY, x2: DX, y2: DY - DR + 8, stroke: C.glow, 'stroke-width': 3, 'stroke-linecap': 'round' }); mk('circle', { cx: DX, cy: DY, r: 6, fill: C.glow });
  txt('RUDDER', DX, DY + 20, { size: 8.5, fill: C.dim, ls: 1.6 }); const degTxt = txt('MIDSHIPS', DX, DY + 33, { size: 9, fill: C.glow, weight: 700, ls: 1.2 });
  const RX = 246, RW = 160, RY = 190, RC = RX + RW / 2, rspan = RW / 2 - 12;
  mk('rect', { x: RX, y: RY - 8, width: RW, height: 16, rx: 8, fill: C.track, stroke: C.edge }); mk('line', { x1: RC, y1: RY - 13, x2: RC, y2: RY + 13, stroke: C.dim, 'stroke-width': 1.4 });
  for (let a = -30; a <= 30; a += 10) { const xx = RC + a / 35 * rspan; mk('line', { x1: f1(xx), y1: RY + 11, x2: f1(xx), y2: RY + 17, stroke: C.dim }); }
  const rFill = mk('rect', { x: RC, y: RY - 3, width: 0, height: 6, rx: 3, fill: C.stbd }), rKnob = mk('g'); mk('rect', { x: -9, y: -13, width: 18, height: 26, rx: 4, fill: `url(#${id}k)`, stroke: '#8b939a', 'stroke-width': .8 }, rKnob); [-4, 0, 4].forEach(d => mk('line', { x1: d, y1: -8, x2: d, y2: 8, stroke: '#101214' }, rKnob));
  txt('PORT', RX - 6, RY + 4, { size: 8.5, fill: C.port, anchor: 'end', weight: 700, ls: 1 }); txt('STBD', RX + RW + 6, RY + 4, { size: 8.5, fill: C.stbd, anchor: 'start', weight: 700, ls: 1 }); txt('STAYS WHERE SET', RC, RY + 31, { size: 8, fill: C.dim, ls: 1.4 });
  const rHit = mk('rect', { x: RX - 12, y: RY - 20, width: RW + 24, height: 40, fill: 'transparent', style: 'cursor:grab' });
  drag(rHit, p => { let d = clamp((p.x - RC) / rspan * 35, -35, 35); if (Math.abs(d) < 1.5) d = 0; H.onRudder(d); });
  const bMid = button(281, 232, 90, 26, 'MIDSHIPS', () => H.onMidships()), bHold = button(49, 232, 118, 26, 'HOLD POSITION', () => H.onHold());   // one row at y 232: HOLD under the thrusters (centre 108), MIDSHIPS under the rudder (centre 326), LINK / UNLINK under the throttles (centre 519)

  /* ---------- the engines (right): two levers, ahead / stop / astern ---------- */
  const LX = [486, 552], LY = 50, LH = 150, AST = 0.4;   // the stop detent sits 40% of the way up the track: 60% of the throw is ahead, 40% astern (Simon, 23 Oct 2026: 70/30, then 60/40)
  const ly = v => LY + LH * (1 - (v < 0 ? (1 + v) * AST : AST + v * (1 - AST)));   // lever value (-1 full astern .. +1 full ahead) -> y
  const fromY = y => { const f = clamp(1 - (y - LY) / LH, 0, 1); return f < AST ? f / AST - 1 : (f - AST) / (1 - AST); };
  mk('line', { x1: LX[0] - 22, x2: LX[1] + 22, y1: f1(ly(0)), y2: f1(ly(0)), stroke: C.glow, 'stroke-width': 1.4, opacity: .45 });   // the neutral (stop) line, across both levers (Simon, 23 Oct 2026)
  const lev = [0, 1].map(i => {
    const x = LX[i], g = mk('g'); mk('rect', { x: x - 8, y: LY - 4, width: 16, height: LH + 8, rx: 8, fill: C.track, stroke: C.edge }, g);
    [-1, -.5, 0, .5, 1].forEach(v => { const yy = ly(v); mk('line', { x1: x + 14, y1: f1(yy), x2: x + 22, y2: f1(yy), stroke: v === 0 ? C.ink : C.dim, 'stroke-width': v === 0 ? 1.6 : 1.2 }, g); });
    mk('line', { x1: x - 22, x2: x + 22, y1: f1(ly(0)), y2: f1(ly(0)), stroke: C.glow, 'stroke-width': 1.4, opacity: .45 }, g);
    const mark = mk('line', { x1: x - 20, x2: x + 24, y1: 0, y2: 0, stroke: C.stbd, 'stroke-width': 2 }, g), fill = mk('rect', { x: x - 3, width: 6, rx: 3, fill: C.glow, opacity: .55 }, g);
    const actual = mk('line', { x1: x - 18, x2: x - 10, y1: 0, y2: 0, stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .5 }, g);   // where the propeller actually is: it follows the lever (a small, quiet indicator line)
    const knob = mk('g', {}, g); mk('rect', { x: x - 20, y: -9, width: 40, height: 18, rx: 4, fill: `url(#${id}k)`, stroke: '#8b939a', 'stroke-width': .8 }, knob); [-6, -2, 2, 6].forEach(d => mk('line', { x1: x - 14, y1: d, x2: x + 14, y2: d, stroke: '#101214' }, knob));
    txt(i ? 'STBD' : 'PORT', x, LY + LH + 22, { size: 9, fill: C.dim, ls: 1.5 }, g);
    const hit = mk('rect', { x: x - 24, y: LY - 12, width: 48, height: LH + 24, fill: 'transparent', style: 'cursor:grab' }, g);
    drag(hit, p => { let v = fromY(p.y); if (Math.abs(v) < .05) v = 0; H.onLever(i, v); });
    return { mark, fill, actual, knob };
  });
  const linkBar = mk('rect', { x: LX[0], width: LX[1] - LX[0], height: 6, rx: 3, fill: C.glow, opacity: .55 }); linkBar.setAttribute('pointer-events', 'none');
  txt('ENGINES', 519, 38, { size: 8.5, fill: C.dim, ls: 1.6 }); txt('AHEAD', 416, LY + 10, { size: 7, fill: C.dim, anchor: 'start', ls: 1 }); txt('STOP', 416, ly(0) + 3, { size: 7.5, fill: C.glow, anchor: 'start', ls: 1, weight: 700 }); txt('ASTERN', 416, LY + LH - 2, { size: 7, fill: C.dim, anchor: 'start', ls: 1 });
  const markTxt = txt('5 KN', 462, 0, { size: 8.5, fill: C.stbd, anchor: 'end', weight: 700, ls: 1 });
  let engLinked = true; const bLink = button(452, 232, 134, 26, 'ENGINES LINKED', () => H.onLink(!engLinked));   // one toggle for the two engine levers (Simon, 30 Oct 2026; there were two buttons, LINKED and UNLINK)

  /* ---------- the thrusters (left): bow and stern sliders that spring back to centre ---------- */
  const TX = 38, TW = 140, TC = TX + TW / 2, thGroup = mk('g'), thr = [['BOW THRUSTER', 94, 'b'], ['STERN THRUSTER', 162, 'sx']].map(([label, y, key], i) => {
    const g = mk('g', {}, thGroup); txt(label, TC, y - 17, { size: 9, fill: C.dim, ls: 1.5 }, g); mk('rect', { x: TX, y: y - 7, width: TW, height: 14, rx: 7, fill: C.track, stroke: C.edge }, g); mk('line', { x1: TC, y1: y - 12, x2: TC, y2: y + 12, stroke: C.dim, 'stroke-width': 1.4 }, g);
    [-1, -.5, .5, 1].forEach(d => mk('line', { x1: f1(TC + d * TW / 2), y1: y + 10, x2: f1(TC + d * TW / 2), y2: y + 16, stroke: C.dim }, g));
    txt('PORT', TX - 6, y + 4, { size: 8, fill: C.port, anchor: 'end', weight: 700, ls: 1 }, g); txt('STBD', TX + TW + 6, y + 4, { size: 8, fill: C.stbd, anchor: 'start', weight: 700, ls: 1 }, g);
    const fill = mk('rect', { x: TC, y: y - 3, width: 0, height: 6, rx: 3, fill: C.stbd }, g), knob = mk('g', {}, g); mk('rect', { x: -8, y: -12, width: 16, height: 24, rx: 4, fill: `url(#${id}k)`, stroke: '#8b939a', 'stroke-width': .8 }, knob);
    const hit = mk('rect', { x: TX - 12, y: y - 20, width: TW + 24, height: 40, fill: 'transparent', style: 'cursor:grab' }, g);
    drag(hit, p => { let v = clamp((p.x - TC) / (TW / 2 - 8), -1, 1); if (Math.abs(v) < .06) v = 0; H.onThruster(i ? 's' : 'b', v); }, () => H.onThruster(i ? 's' : 'b', 0));
    return { y, fill, knob, hit };
  });
  txt('SPRING BACK TO CENTRE', TC, 214, { size: 7.5, fill: C.dim, ls: 1.2 }, thGroup);
  const bThr = button(TC - 32, 112, 64, 19, 'LINK', () => H.onThrLink(!thLinked)); let thLinked = false;   // links the two thrusters: one slider (or key) works both, which walks the ship sideways (unlinked by default)
  const lock = mk('g'); mk('rect', { x: 14, y: 56, width: 190, height: 168, rx: 10, fill: '#050607', opacity: .62 }, lock); mk('rect', { x: TC + 40, y: 117, width: 14, height: 10.5, rx: 2.5, fill: C.dim }, lock); mk('path', { d: `M${TC + 43} 117v-3.5a4 4 0 0 1 8 0v3.5`, stroke: C.dim, 'stroke-width': 2, fill: 'none' }, lock);
  const lockT1 = txt('THRUSTERS LOCKED', TC, 140, { size: 9.5, fill: C.dim, ls: 1.6, weight: 700 }, lock), lockT2 = txt('AVAILABLE BELOW 5 KN', TC, 154, { size: 8, fill: C.stbd, ls: 1.4 }, lock);

  svg.appendChild(bThr.g);   // (above the padlock's shading: it stays readable while the thrusters are locked)
  let lastKey = '';
  function update(s) {
    const key = JSON.stringify(s, (k, v) => typeof v === 'number' ? Math.round(v * 200) / 200 : v); if (key === lastKey) return; lastKey = key;   // nothing moved: leave the SVG alone
    const L = s.lev || [0, 0], A = s.act || L;
    [0, 1].forEach(i => { const e = lev[i], y = ly(L[i]), mid = ly(0); e.knob.setAttribute('transform', `translate(0,${f1(y)})`); e.actual.setAttribute('transform', `translate(0,${f1(ly(A[i]))})`);
      e.fill.setAttribute('y', f1(Math.min(y, mid))); e.fill.setAttribute('height', f1(Math.abs(y - mid))); e.fill.setAttribute('fill', L[i] >= 0 ? C.glow : C.port); const my = ly(s.mark ?? .5); e.mark.setAttribute('y1', f1(my)); e.mark.setAttribute('y2', f1(my)); });
    markTxt.setAttribute('y', f1(ly(s.mark ?? .5) + 3)); markTxt.textContent = s.markLabel || '5 KN';
    linkBar.setAttribute('y', f1(ly(L[0]) - 3)); linkBar.setAttribute('opacity', s.linked ? .55 : 0);
    engLinked = !!s.linked; bLink.set(engLinked, C.stbd, s.canUnlink === false, engLinked ? 'ENGINES LINKED' : 'ENGINES UNLINKED');   // canUnlink false: a game with one throttle keeps the engines linked
    if (s.lockNote) { lockT1.textContent = s.lockNote[0]; lockT2.textContent = s.lockNote[1]; }   // what the padlock says (the arrival: not available at sea)
    const dAct = clamp(s.rudderAct ?? s.rudder ?? 0, -35, 35); needle.setAttribute('transform', `rotate(${f1(dAct * 2)} ${DX} ${DY})`);
    const dc = clamp(s.rudder || 0, -35, 35), kx = RC + dc / 35 * rspan; rKnob.setAttribute('transform', `translate(${f1(kx)},${RY})`); rFill.setAttribute('x', f1(Math.min(RC, kx))); rFill.setAttribute('width', f1(Math.abs(kx - RC))); rFill.setAttribute('fill', dc < 0 ? C.port : C.stbd);
    degTxt.textContent = Math.abs(dAct) < .5 ? 'MIDSHIPS' : Math.round(Math.abs(dAct)) + '° ' + (dAct < 0 ? 'PORT' : 'STBD'); degTxt.setAttribute('fill', Math.abs(dAct) < .5 ? C.dim : (dAct < 0 ? C.port : C.stbd));
    const T = s.thr || [0, 0]; thr.forEach((e, i) => { const x = TC + T[i] * (TW / 2 - 8); e.knob.setAttribute('transform', `translate(${f1(x)},${e.y})`); e.fill.setAttribute('x', f1(Math.min(TC, x))); e.fill.setAttribute('width', f1(Math.abs(x - TC))); e.fill.setAttribute('fill', T[i] < 0 ? C.port : C.stbd); e.hit.setAttribute('data-off', s.thLocked ? '1' : ''); e.hit.style.cursor = s.thLocked ? 'not-allowed' : 'grab'; });
    thLinked = !!s.thLinked; bThr.set(thLinked, C.stbd, !!s.thLocked, thLinked ? 'LINKED' : 'LINK');
    thGroup.setAttribute('opacity', s.thLocked ? .28 : 1); lock.setAttribute('display', s.thLocked ? '' : 'none');
    bMid.set(false, C.glow, false); bHold.set(!!s.holding, C.stbd, !s.holdAvail && !s.holding, s.holding ? 'HOLDING' : s.holdAvail ? 'HOLD POSITION' : 'HOLD · UNDER 3 KN');
  }
  update({ lev: [.5, .5], linked: true, thLocked: true });
  return { update, destroy() { svg.remove(); } };
}
