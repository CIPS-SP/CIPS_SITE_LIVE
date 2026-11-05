/* The way out (31 Oct 2026, Simon): the last chapter of the journey. After the quay the yacht casts off and the camera lifts (beat.js), the Savannah departure plays full screen (video-moment.js, a `full` moment),
   the closing line comes up over the open sea, and then the WHOLE FRAME (scene, footage, chart plotter) shrinks into the picture panel in the home page's hero, which shows a still of the same frame with the plotter
   in the same corner: the plotter seems to slide up and right into the page. This file is only the page side of that:
   - the closing line;
   - the shrink: the group's pinned stage is scaled and clipped from the whole window down to the hero panel's rectangle (a cover fit, rounded corners) as r goes 0.86 -> 1, then fades into the still
     that lies underneath (they show the same picture), so there is nothing to swap;
   - `has-finale` on <html>: index.html then lets the home page start one window height early (negative margin), drops the wave divider, and measures "where the main site begins" from there. Because the page
     would otherwise slide up beneath the frame while it lands (two panels, one moving), the hero is held where it will come to rest: from r 0.8 it is moved UP by exactly the distance the scroll has still to
     go (`slide`), so it sits still at its first-view position, hidden under the full-size stage, and is simply revealed as the frame shrinks onto its picture panel; at the end `slide` is 0 and the page scrolls on.
   It is a pure function of r (0..1 through the chapter), like everything else in the beat: scrolling back undoes it. No phone fallback: the static beat never builds this. */
const clamp01 = x => Math.max(0, Math.min(1, x)), lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* 1 Nov 2026, Simon: the film and the shrink play BY THEMSELVES (not under the visitor's thumb), but scrolling back rewinds, and when they stop the playback carries on forwards. It is done as an auto-scroll, so everything above
   stays a pure function of r: from the start of the film (r 0.20) the page scrolls itself forward at the pace each phase needs (AUTO: [from r, to r, seconds]: the film at its own length, then the closing line, then the shrink), the visitor cannot
   scroll AHEAD of it (`reach`), scrolling back (or up through the film) rewinds, and 1.3 s after they stop it resumes from where they left it. A click on the picture pauses it (a play button appears in the middle); a click on that button resumes. Reduced motion: no auto-scroll,
   the film is scrolled by hand as before. */
// 1 Nov 2026 (later), Simon: the WHOLE finale is automatic, from the point where the services card starts to close (r CLOSE_R). The card's own sequence (beat.css: collapse 2.2 s with the message flashing three times as it goes, then a 1.6 s hold with no blinking, then the fade) takes HOLD_S, during which the page
// does not move; then the pull-back (5.5 s, was 7.5 s), the film (its own length), the closing line and the shrink follow. AUTO: [from r, to r, seconds].
export const CLOSE_R = 0.003;   // the services card starts to close here (beat.js)
const HOLD_R = CLOSE_R + 0.0006, HOLD_S = 3.8, PREROLL = 0.05;   // (HOLD_R: just past it, so the card has certainly started)
const AUTO = [[CLOSE_R, 0.20, 5.5], [0.20, 0.62, 11.1], [0.62, 0.74, 3.0], [0.74, 1.0, 3.6]], RESUME_MS = 1300;
const autoRate = r => { if (r < CLOSE_R) return PREROLL; for (const [a, b, sec] of AUTO) if (r >= a && r < b) return (b - a) / sec; return 0; };   // r per second

export function createFinale({ stage, host, line = 'For your call at The Atlantic Gateway.', tail = 0.11294, reduced = false }) {
  const root = document.documentElement; root.classList.add('has-finale');
  const group = host.parentElement;   // the .beat-group section the pinned stage lives in
  const el = document.createElement('div'); el.className = 'sfin-line'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = '<span></span>'; el.firstChild.textContent = line; stage.appendChild(el);
  const hit = document.createElement('div'); hit.className = 'sfin-hit'; stage.appendChild(hit);
  const playBtn = document.createElement('button'); playBtn.type = 'button'; playBtn.className = 'sfin-play'; playBtn.setAttribute('aria-label', 'Play'); playBtn.innerHTML = '<i></i>'; stage.appendChild(playBtn);
  let userPaused = false, reach = 0, mine = 0, head = 0, pausedUntil = 0, lastT = 0, inAuto = false, pxPerR = 0, prevY = null, prevR = 0, holdT = 0, holdDone = false;   // pxPerR: how many pixels of scroll one unit of r takes, measured from the scroll itself (the pinned group holds all five scenes, so its height says nothing about this one's length)
  hit.addEventListener('click', () => { userPaused = !userPaused; });
  // while it plays, scrolling FORWARDS from the playback's position does nothing (the browser is told not to scroll), so the page does not tremble between the visitor's scroll and the playback's
  const aheadNow = () => inAuto && scrollY >= reach - 3;
  const onWheel = e => { if (e.deltaY > 0 && !e.ctrlKey && aheadNow()) e.preventDefault(); };
  const onKey = e => { if (aheadNow() && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName) && [' ', 'PageDown', 'ArrowDown', 'End'].includes(e.key)) e.preventDefault(); };
  addEventListener('wheel', onWheel, { passive: false }); addEventListener('keydown', onKey);
  playBtn.addEventListener('click', e => { e.stopPropagation(); userPaused = false; pausedUntil = 0; });
  function tickAuto(r) {
    const now = performance.now(), dt = Math.min(0.12, Math.max(0, (now - lastT) / 1000)); lastT = now;
    { const y1 = scrollY; if (prevY !== null && Math.abs(y1 - prevY) >= 6 && Math.abs(r - prevR) > 1e-5 && r > 0 && r < 1 && prevR > 0 && prevR < 1) { const e = (y1 - prevY) / (r - prevR); if (e > 0 && isFinite(e)) pxPerR = pxPerR ? lerp(pxPerR, e, 0.25) : e; } prevY = y1; prevR = r; }
    const on = !reduced && r > 0.0005 && r < 1;
    if (!on) { if (inAuto) { inAuto = false; reach = 0; userPaused = false; holdT = 0; holdDone = false; } hit.classList.remove('on'); playBtn.classList.remove('on'); return; }
    if (!inAuto && r > 0.9) return;   // arriving in the last tenth by any other way (Skip to CIPS, a scrollbar drag): not a start; it must not send the visitor back to the beginning of the finale
    let y = scrollY;
    const span = pxPerR || tail * Math.max(1, group.getBoundingClientRect().height - innerHeight);
    if (!inAuto) { inAuto = true; pausedUntil = 0; const y0 = r > HOLD_R + 0.01 ? Math.max(0, y - (r - HOLD_R) * span) : y; if (y0 !== y) scrollTo({ top: y0, behavior: 'instant' }); reach = mine = head = y0; return; }   // (a flick that lands inside the film starts it from its first frame: it cannot be skipped)
    hit.classList.toggle('on', r < AUTO[3][0]); playBtn.classList.toggle('on', userPaused && r < AUTO[3][0]);
    if (y > reach + 3) { scrollTo({ top: reach, behavior: 'instant' }); y = mine = head = reach; }   // not ahead of the playback: scrolling forwards is ignored, and the playback carries on regardless (1 Nov 2026: it used to wait for the scrolling to stop, so a visitor pushing on at the very end froze it and the page shuddered)
    else if (y < mine - 3) { pausedUntil = now + RESUME_MS; head = y; }   // the visitor scrolled back (or up): rewinding; playback resumes when they stop
    else if (y > mine + 3) { head = y; pausedUntil = now + RESUME_MS; }   // forwards by hand, behind the playback
    mine = y;
    if (userPaused || now < pausedUntil) { head = y; return; }
    if (!holdDone && r >= HOLD_R - 0.0001) { holdT += dt; if (holdT >= HOLD_S) holdDone = true; else { head = y; return; } }   // the card is closing: the page waits
    head = Math.max(head, y) + (!holdDone && r < HOLD_R ? PREROLL : autoRate(r)) * span * dt; if (head > reach) reach = head;
    scrollTo({ top: head, behavior: 'instant' }); mine = scrollY;
  }
  let panel = null, hero = null, lastKey = '', held = false;
  const findPanel = () => panel && panel.isConnected ? panel : (panel = document.querySelector('#about .panel .mont'));
  const findHero = () => hero && hero.isConnected ? hero : (hero = document.getElementById('about'));

  function update(r) {
    tickAuto(r);
    // the closing line, over the open sea
    const a = smooth(0.56, 0.62, r) * (1 - smooth(0.70, 0.74, r));
    el.style.opacity = a.toFixed(3); el.style.transform = `translate(-50%, ${(14 * (1 - smooth(0.56, 0.62, r))).toFixed(1)}px)`;
    // the hero, held where it will come to rest (see above), from r 0.8
    const Hh = findHero();
    if (Hh) { if (r >= 0.68) { const gr0 = group.getBoundingClientRect(), slide0 = Math.max(0, gr0.height - innerHeight + gr0.top); const hd = (document.querySelector('header') || {}).offsetHeight || 0; Hh.style.transform = `translateY(${(hd - slide0).toFixed(1)}px)`; held = true; } else if (held) { Hh.style.transform = ''; held = false; } }   // 1 Nov 2026, Simon: held a header's height down, so the main site rests with space between the banner and the hero (it was flush under it)
    // the shrink into the hero panel
    const u = smooth(0.74, 0.86, r), fade = 1 - smooth(0.88, 0.99, r), P = findPanel();
    if (u <= 0 || !P) { if (lastKey !== '') { host.style.transform = ''; host.style.clipPath = ''; host.style.opacity = ''; host.style.pointerEvents = ''; lastKey = ''; } return; }
    const W = host.clientWidth || innerWidth, H = host.clientHeight || innerHeight, pr = P.getBoundingClientRect();
    const T = { l: pr.left, t: pr.top, w: pr.width, h: pr.height };   // the panel, where it is now (held at its resting place)
    const s = Math.max(T.w / W, T.h / H), tx = T.l + (T.w - W * s) / 2, ty = T.t + (T.h - H * s) / 2;   // cover fit: the frame fills the panel
    const ss = lerp(1, s, u), tX = lerp(0, tx, u), tY = lerp(0, ty, u);
    const cl = lerp(0, (T.l - tx) / s, u), ct = lerp(0, (T.t - ty) / s, u), cr = lerp(0, W - (T.l + T.w - tx) / s, u), cb = lerp(0, H - (T.t + T.h - ty) / s, u), rad = lerp(0, 12 / s, u);
    host.style.transformOrigin = '0 0'; host.style.transform = `translate(${tX.toFixed(1)}px, ${tY.toFixed(1)}px) scale(${ss.toFixed(5)})`;
    host.style.clipPath = `inset(${ct.toFixed(1)}px ${cr.toFixed(1)}px ${cb.toFixed(1)}px ${cl.toFixed(1)}px round ${rad.toFixed(1)}px)`;
    host.style.opacity = fade.toFixed(3); host.style.pointerEvents = u > 0.02 ? 'none' : ''; lastKey = 's';
  }
  function destroy() { removeEventListener('wheel', onWheel); removeEventListener('keydown', onKey); root.classList.remove('has-finale'); if (findHero()) hero.style.transform = ''; host.style.transform = host.style.clipPath = host.style.opacity = host.style.pointerEvents = ''; el.remove(); hit.remove(); playBtn.remove(); }
  return { update, destroy };
}
