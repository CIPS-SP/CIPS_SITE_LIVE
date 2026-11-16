/* _beats/_shared/video-moment.js — real footage in a plotter-style viewport above the chart plotter.
 *
 * 26 Oct 2026, Simon: footage at chosen moments of the scrolled journey, in a viewport above the plotter, same width (layout B) with an
 * Expand button to a wider size, and it plays by itself (P). Plan: DOCS/PLAN-journey-video-moments.md. The five clips are in site/videos/journey/
 * (cut by _beats/tools/site-directions/cut-journey-clips.py from the picks made on the video picker board).
 *
 * Usage, from a scrolled beat (never the games: the plotter corner belongs to their HUD):
 *   const vm = mountVideoMoment(stage, { moments: [{ id, src, poster, title, from, to }], plotter, reduced: ctx.reduced });
 *   vm.update(p, { blocked: holdGame.active });   // every frame, with the beat's own p (0..1)
 *   vm.destroy();
 * A moment is on while p is inside [from, to]. It loads quietly once p is `lead` short of `from`, slides in and plays from the start, silent, and goes
 * away when the visitor scrolls out of the window or closes it. When the clip ends it plays again and keeps looping for as long as they stay inside the window (scrolling or not: it only goes when they leave the window). A moment with `finish: true` that has started keeps playing to its end
 * after the scroll leaves its window forwards (for a clip whose window is short, or runs into the next scene). A click on the picture pauses it (until they leave the window).
 * Reduced motion, data saver or a slow connection: the poster still is shown with a play button instead of autoplaying.
 *
 * FULL SCREEN moments (31 Oct 2026, Simon: the departure that closes the journey): a moment with `full: true` is not shown in the small viewport but across the whole stage, under the chart plotter (which stays on top,
 * so the footage and the plotter shrink together into the home page). It fades in when the window opens, plays once from the start (no loop) and holds on its last frame for as long as the window lasts; leaving
 * the window either way fades it out. Reduced motion or a slow connection: the poster is shown instead. The stage's own z-index rules apply (it sits at 5, the plotter at 6).
 */
const CSS_URL = new URL('./video-moment.css', import.meta.url).href;
let wideSetting = false;   // the Expand choice carries from one moment (and one beat) to the next
// 5 Nov 2026, Simon: the ON SCENE box flashed up while the page was loading. It was added before its own stylesheet had arrived, so it showed unstyled for a moment.
// Each box now stays hidden until the stylesheet has loaded (or failed).
// seconds of a film with `cuts` left out -> seconds of the file (cuts: [[from, to], ...] in file seconds, in order)
// 15 Nov 2026, Simon (the finale's first shots went by too fast): `warp` on a scrubbed moment gives some shots more of the scroll: [[scroll fraction, seconds of the kept film], ...] in order,
// straight lines between; without it the film runs evenly. The plotter's sync (st-helier-approach) uses the same.
export function warpTime(warp, u, kept) { if (!warp || !warp.length) return u * kept; for (let i = 1; i < warp.length; i++) { const a = warp[i - 1], c = warp[i]; if (u <= c[0]) { const ta = Math.min(kept, a[1]), tc = Math.min(kept, c[1]); return ta + (tc - ta) * (c[0] > a[0] ? (u - a[0]) / (c[0] - a[0]) : 1); } } return kept; }
export function cutTime(cuts, t) { for (const c of cuts || []) { if (t >= c[0]) t += c[1] - c[0]; else break; } return t; }
// the way back (17 Nov 2026, the self-playing phone film): seconds of the file -> seconds of the kept film (a time inside a cut counts as its start), and kept seconds -> the 0..1 of the scrub window
// 18 Nov 2026, Simon (the yacht's swoop up to the pier heads was too quick): a film file can have stretches played slower than the film they stand for (`tallStretch`: [[from, to, factor]] in film seconds,
// the file made with in-between pictures, so it stays smooth); these turn film seconds into file seconds and back
export function stretchFile(st, k) { let add = 0; for (const [a, b, f] of st || []) { if (k <= a) break; if (k < b) return k + add + (k - a) * (f - 1); add += (b - a) * (f - 1); } return k + add; }
export function stretchKept(st, t) { let add = 0; for (const [a, b, f] of st || []) { const fa = a + add, fb = fa + (b - a) * f; if (t <= fa) break; if (t < fb) return a + (t - fa) / f; add += (b - a) * (f - 1); } return t - add; }
const stretchExtra = st => (st || []).reduce((s, x) => s + (x[1] - x[0]) * (x[2] - 1), 0);
// 16 Nov 2026, Simon (iPhone: "a problem repeatedly occurred", or back to the globe loading, after scrolling fast): every On Scene clip passed stayed loaded (its file and its video decoder) for the rest of the
// journey, and a fast scroll loaded them all one after another, which is what makes Safari close the page for memory. On a phone at most CLIP_KEEP clips (of every scene together) stay loaded besides
// the one showing; the oldest are let go (src removed) and load again if the visitor comes back to them.
const CLIP_KEEP = 2, LOADED_CLIPS = [];
function keepFew(m, isShown) {
  if (!PHONE) return;
  const i = LOADED_CLIPS.findIndex(x => x.m === m); if (i >= 0) LOADED_CLIPS.splice(i, 1);
  LOADED_CLIPS.push({ m, isShown });
  while (LOADED_CLIPS.length > CLIP_KEEP + 1) {
    const k = LOADED_CLIPS.findIndex(x => !x.isShown() && x.m !== m); if (k < 0) break;
    const o = LOADED_CLIPS.splice(k, 1)[0].m;
    try { o.v.pause(); o.v.removeAttribute('src'); o.v.load(); } catch (e) {}
    o.loaded = false; o.primed = false; o.ended = false;
  }
}
export function uncutTime(cuts, t) { let k = t; for (const c of cuts || []) { if (t >= c[1]) k -= c[1] - c[0]; else if (t > c[0]) { k -= t - c[0]; break; } else break; } return k; }
export function unwarpTime(warp, k, kept) { if (!warp || !warp.length) return kept > 0 ? Math.max(0, Math.min(1, k / kept)) : 0; for (let i = 1; i < warp.length; i++) { const a = warp[i - 1], c = warp[i], ta = Math.min(kept, a[1]), tc = Math.min(kept, c[1]); if (k <= tc) return a[0] + (c[0] - a[0]) * (tc > ta ? Math.max(0, (k - ta) / (tc - ta)) : 1); } return 1; }
let cssReady = null;
// 14 Nov 2026 (Simon: the finale did not start on his phone): a phone gets a moment's `phoneFile` (the departure film's 720p copy) and the scrubbed film is primed once it has loaded
const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) <= 480;
function loadCss() {
  if (cssReady) return cssReady;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS_URL; l.dataset.videoMomentCss = '1';
  cssReady = new Promise(res => { l.onload = res; l.onerror = res; }); document.head.appendChild(l); return cssReady;
}

export function mountVideoMoment(stage, { moments = [], plotter = null, reduced = false } = {}) {
  const css = loadCss();
  const conn = navigator.connection || {}, still = !!(reduced || conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') || conn.effectiveType === '3g');

  const root = document.createElement('div'); root.className = 'vm-box' + (wideSetting ? ' wide' : '') + (still ? ' still' : ''); root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Footage from the scene');
  root.innerHTML = '<div class="vm-top"><span class="vm-tag">ON SCENE</span><span class="vm-title"></span><button type="button" class="vm-big" title="Enlarge" aria-label="Enlarge the footage">⤢</button><button type="button" class="vm-x" title="Close" aria-label="Close the footage">×</button></div>'
    + '<div class="vm-frame"><button type="button" class="vm-play" aria-label="Play the footage"><i></i></button></div><div class="vm-bar"><i></i></div>';
  // 27 Oct 2026, Simon: clips were 'cut off' as the scroll moved into the next beat. They were still playing, but the next beat's layer (higher in the stack) was painted over them. So in a pinned group the box lives
  // in the group's stage, above every layer, and stays seen for as long as it plays; the runtime still only calls update() while this beat is live, so the watchdog below ends it once the visitor is well past.
  const layerEl = stage.parentElement, host = layerEl && layerEl.classList.contains('beat-layer') ? layerEl.parentElement : stage;
  if (host !== stage) root.style.zIndex = '200';
  root.style.visibility = 'hidden'; css.then(() => { root.style.visibility = ''; });   // (see loadCss)
  host.appendChild(root);
  const frame = root.querySelector('.vm-frame'), titleEl = root.querySelector('.vm-title'), bar = root.querySelector('.vm-bar i'), bigBtn = root.querySelector('.vm-big'), playBtn = root.querySelector('.vm-play');

  const M = moments.filter(m => !m.full).map(m => {
    const v = document.createElement('video'); v.className = 'vm-v'; v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'none'; v.disablePictureInPicture = true; v.setAttribute('aria-label', m.title || 'Footage');
    if (m.poster) v.poster = m.poster;
    frame.insertBefore(v, playBtn);
    const mm = Object.assign({ lead: 0.1, loaded: false, bad: false, v }, m);
    v.addEventListener('error', () => { mm.bad = true; if (active === mm) swap(null); });
    v.addEventListener('playing', () => { if (active === mm && !userPaused) root.classList.remove('still'); });   // it is playing: no poster button
    v.addEventListener('ended', () => { mm.ended = true; });   // decided in update(): loop if the visitor has stopped scrolling, otherwise fade
    return mm;
  });
  // full screen moments: their own box in the beat's stage, with a video each
  const F = moments.filter(m => m.full).map(m => {
    const box = document.createElement('div'); box.className = 'vm-full'; box.setAttribute('aria-hidden', 'true');
    const v = document.createElement('video'); v.className = 'vm-fv'; v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'none'; v.disablePictureInPicture = true;
    if (m.poster) v.poster = m.poster;
    box.style.visibility = 'hidden'; css.then(() => { box.style.visibility = ''; });   // (see loadCss)
    box.appendChild(v); stage.appendChild(box);
    return Object.assign({ lead: 0.1, loaded: false, bad: false, on: false, started: false }, m, { box, v });
  });
  const fullLoad = m => { if (m.loaded || m.bad) return; m.loaded = true; if (still) return;
    // a scrubbed film is fetched whole and played from memory: a streamed file only seeks where the server supports byte ranges (the local servers do not, and the video then snaps back to 0), a blob always does
    // 16 Nov 2026, Simon (the finale looked soft and jerky on his phone; the bow poked into its last shot): a phone held upright gets `phoneTall`, a tall crop of the full HD film in which
    // every frame is a whole picture (smooth to scrub), ending on the open sea centred on the yacht (`tallCuts` replaces `cuts`), with the CIPS roundel (`tallBadge`, images/brand) coming in above the yacht as it does in the wide film
    const tall = PHONE && m.phoneTall && innerHeight > innerWidth;
    const cuts0 = m.cuts;
    if (tall) { m.cuts = m.tallCuts || []; m.stretch = m.tallStretch || null; m.box.classList.add('vm-tall'); const bd = document.createElement('div'); bd.className = 'vm-badge'; bd.setAttribute('aria-hidden', 'true');
      const im = new Image(); im.alt = ''; im.decoding = 'async'; im.onerror = () => bd.remove(); im.src = m.src.replace(/videos\/journey\/[^/]+$/, 'images/brand/' + (m.tallBadge || 'cips-roundel.png')); bd.appendChild(im);
      m.box.appendChild(bd); }
    const url = tall ? m.src.replace(/[^/]+\.mp4$/, m.phoneTall + '.mp4') : PHONE && m.phoneFile ? m.src.replace(/[^/]+\.mp4$/, m.phoneFile + '.mp4') : m.src;
    const primeOnce = () => m.v.addEventListener('loadeddata', () => { const pr = m.v.play(); if (pr && pr.then) pr.then(() => { if (!m.on || m.scrub) m.v.pause(); }).catch(() => {}); }, { once: true });
    if (m.scrub && PHONE) primeOnce();
    const loadScrub = u => { m.v.preload = 'auto'; fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(bl => { if (m.blobUrl) URL.revokeObjectURL(m.blobUrl); m.blobUrl = URL.createObjectURL(bl); m.v.src = m.blobUrl; m.v.load(); if (tall) watchTall(); }).catch(() => { m.v.src = u; m.v.load(); if (tall) watchTall(); }); };
    // 16 Nov 2026, Simon (iPhone: the finale stuck on its first picture): should the phone not show the tall film (an error, or no picture 12 s after it arrives), it falls back to the wide 720p copy, cuts and all
    let fellBack = false; const fallBack = () => { if (fellBack || !m.phoneFile) return; fellBack = true; m.cuts = cuts0; m.stretch = null; m.box.classList.remove('vm-tall', 'vm-badge-on'); m.tallOn = undefined; m.box.querySelector('.vm-badge')?.remove(); primeOnce(); loadScrub(m.src.replace(/[^/]+\.mp4$/, m.phoneFile + '.mp4')); };
    const watchTall = () => { if (fellBack) return; m.v.addEventListener('error', fallBack, { once: true }); setTimeout(() => { if (!fellBack && m.v.readyState < 2) fallBack(); }, 12000); };
    if (m.scrub) { loadScrub(url); return; }
    m.v.preload = 'auto'; m.v.src = m.src; m.v.load(); };
  const fullOn = m => { m.on = true; m.started = true; m.box.classList.add('on'); if (still) { m.box.classList.add('still'); return; } if (m.scrub) return; try { m.v.currentTime = 0; } catch (e) {} const go = n => { const pr = m.v.play(); if (pr && pr.catch) pr.catch(() => { if (m.on && n < 4) setTimeout(() => go(n + 1), 250 * (n + 1)); }); }; go(0); };
  const fullOff = m => { m.on = false; m.playing = false; m.box.classList.remove('on'); try { m.v.pause(); } catch (e) {} };
  // 31 Oct 2026, Simon: the film and the shrink that follows it must both be scrolled (or both timed); a `scrub: [a, b]` moment is scrolled: the picture is the film at (p - a) / (b - a) of its length, paused, going backwards as well. Seeks are one at a time and the
  // last wanted time is applied when the one in flight lands (the film is cut with a keyframe every 4 frames so a seek is cheap).
  // 5 Nov 2026, Simon: `cuts: [[from, to], ...]` (film seconds) are left out of a scrubbed film: the scroll runs through the rest as if they were not there (the file itself is not re-cut). cutTime() turns
  // seconds of the kept film into seconds of the file; beat.js uses the same to keep the plotter in step.
  const scrubTo = (m, p) => { if (still || !m.v.duration) return; const cuts = m.cuts || [], kept = Math.max(0, m.v.duration - 0.05) - cuts.reduce((a, c) => a + c[1] - c[0], 0) - stretchExtra(m.stretch); m.want = m.playing ? m.v.currentTime : stretchFile(m.stretch, cutTime(cuts, warpTime(m.warp, Math.max(0, Math.min(1, (p - m.scrub[0]) / (m.scrub[1] - m.scrub[0]))), kept))); if (m.box.classList.contains('vm-tall')) { const on = stretchKept(m.stretch, m.want) > 6.9; if (on !== m.tallOn) { m.tallOn = on; m.box.classList.toggle('vm-badge-on', on); } } if (PHONE && m.fitFrom) m.box.classList.toggle('vm-fit', m.want >= m.fitFrom); if (!m.playing && !m.seeking && Math.abs(m.want - m.v.currentTime) > 0.03) { m.seeking = true; try { m.v.currentTime = m.want; } catch (e) { m.seeking = false; } } };
  F.forEach(m => { if (m.scrub) m.v.addEventListener('seeked', () => { m.seeking = false; if (m.on && !m.playing && Math.abs(m.want - m.v.currentTime) > 0.03) { m.seeking = true; try { m.v.currentTime = m.want; } catch (e) { m.seeking = false; } } }); });
  function updateFull(p) {
    for (const m of F) {
      if (m.bad) continue;
      const inWin = p >= m.from && p <= m.to;
      if (p >= m.from - m.lead && p <= m.to) fullLoad(m);
      if (inWin && !m.on) fullOn(m); else if (!inWin && m.on) fullOff(m);
      if (m.scrub && (inWin || (m.on === false && p >= m.from - m.lead && p <= m.to))) scrubTo(m, p);
    }
  }
  let active = null, lastSeen = 0, userPaused = false, lastP = -1, lastMove = 0; const dismissed = new Set(), done = new Set();

  // 30 Oct 2026 (performance): the clip is fetched a little before its window, but the video decoder only started up when the picture appeared, a stall of 100-230 ms at the very moment the clip begins. So once the file has
  // loaded, a silent hidden play-and-pause starts the decoder up ahead of time; start() then seeks to 0 and plays as before (a clip that is being shown is never paused by this).
  // 14 Nov 2026, Simon (phone: each clip froze the first time round, then played on the second loop): on a phone there is no hidden primer, the clip is not sent back to 0 when
  // it is already at the start, and a clip that stops moving while it should be playing is nudged on (update(), below)
  const prime = m => { if (still || m.primed || m.bad || PHONE) return; m.primed = true; const v = m.v; const go = () => { if (active === m) return; const pr = v.play(); if (pr && pr.then) pr.then(() => { if (active !== m) { v.pause(); try { v.currentTime = 0; } catch (e) {} } }).catch(() => {}); }; if (v.readyState >= 2) go(); else v.addEventListener('loadeddata', go, { once: true }); };
  const ensure = m => { if (m.loaded || m.bad) return; m.loaded = true; if (!still) { m.v.preload = 'auto'; m.v.src = m.src; m.v.load(); prime(m); keepFew(m, () => active === m); } };
  function syncWide() { root.classList.toggle('wide', wideSetting); bigBtn.textContent = wideSetting ? '⤣' : '⤢'; bigBtn.title = wideSetting ? 'Smaller' : 'Enlarge'; bigBtn.setAttribute('aria-label', wideSetting ? 'Make the footage smaller' : 'Enlarge the footage'); }
  function start(m) {
    m.ended = false; userPaused = false; m.plays = 1; m.onLoop = false;
    syncWide();   // 5 Nov 2026, Simon: the next clip opens at the size the visitor left the last one (each beat's box is built at load, before any choice, so it is matched here, when a clip opens)
    M.forEach(x => x.v.classList.toggle('cur', x === m)); titleEl.textContent = m.title || ''; bar.style.width = '0'; root.classList.add('on');
    if (still) { m.v.src || (m.v.src = m.src); root.classList.add('still'); return; }   // poster + play button
    root.classList.remove('still'); try { if (!PHONE || m.v.currentTime > 0.05) m.v.currentTime = 0; } catch (e) {}
    // 27 Oct 2026, Simon: some clips started paused with the play button showing. play() also fails when it is merely interrupted (a swap or a pause lands while the file is still loading); that is not a refusal, so it is tried again
    // and only a real refusal (NotAllowedError) leaves the poster and play button. Anything that starts playing clears the button.
    const go = n => { const pr = m.v.play(); if (pr && pr.catch) pr.catch(err => { if (active !== m || userPaused) return; if (err && err.name === 'NotAllowedError') root.classList.add('still'); else if (n < 4) setTimeout(() => go(n + 1), 250 * (n + 1)); else root.classList.add('still'); }); };
    go(0);
  }
  function swap(m) {
    if (active) { try { active.v.pause(); } catch (e) {} }
    active = m; if (m) start(m); else root.classList.remove('on');
  }
  // a click on the picture pauses or plays it (the play triangle is the same button the still-image mode uses); paused stays paused until the visitor leaves the window
  frame.addEventListener('click', () => {
    if (!active) return; const v = active.v;
    if (root.classList.contains('still') || v.paused) { if (!v.src) { v.src = active.src; v.load(); } root.classList.remove('still'); userPaused = false; if (active.ended) { active.ended = false; try { v.currentTime = 0; } catch (e) {} } active.onLoop = true; v.play().catch(() => {}); }
    else { userPaused = true; v.pause(); root.classList.add('still'); }
  });
  bigBtn.addEventListener('click', () => { wideSetting = !wideSetting; syncWide(); });
  root.querySelector('.vm-x').addEventListener('click', () => { if (active) { dismissed.add(active.id); swap(null); } });
  root.addEventListener('pointerdown', e => e.stopPropagation());   // like the plotter: a drag on this panel is not a drag on the scene or a scroll nudge
  if (wideSetting) bigBtn.textContent = '⤣';

  let lastPlaceAt = 0, lastPlaceKey = '';
  function place() {   // sits directly above the plotter, whatever size and scale it is drawn at (the phone layout scales it)
    if (!plotter || !plotter.root) return;
    // 29 Oct 2026 (performance): this read two layout rects every frame, which made the browser recalculate the layout each time (about 150 ms a second in the harbour). The plotter hardly ever moves: look again twice a second, or at once when the window or the plotter's class changes.
    const nowP = performance.now(), key = innerWidth + 'x' + innerHeight + plotter.root.className; if (key === lastPlaceKey && nowP - lastPlaceAt < 500) return; lastPlaceKey = key; lastPlaceAt = nowP;
    const sr = host.getBoundingClientRect(), pr = plotter.root.getBoundingClientRect(); if (!pr.width) return;
    root.style.left = (pr.left - sr.left).toFixed(1) + 'px'; root.style.bottom = (sr.bottom - pr.top + 8).toFixed(1) + 'px';
  }
  function update(p, { blocked = false, carry = 0 } = {}) {
    lastSeen = performance.now(); if (Math.abs(p - lastP) > 1e-5) lastMove = lastSeen; lastP = p; updateFull(p);
    const full = plotter && plotter.root.classList.contains('plotter-full');
    let hit = null;
    for (const m of M) {
      const inWin = p >= m.from && p <= m.to;
      if (p >= m.from - m.lead && p <= m.to) ensure(m);   // fetched quietly a little before it is needed
      if (!inWin && (p < m.from - 0.02 || p > m.to + 0.02)) { dismissed.delete(m.id); done.delete(m.id); }   // out of the window: it can play again next time round
      if (inWin && !m.bad && !hit) hit = m;
    }
    if (hit && (blocked || full || dismissed.has(hit.id) || done.has(hit.id))) hit = null;
    // a moment marked `finish` that has already started plays out to the end even after the scroll has left its window forwards (it never loops or restarts out there); scrolling back before it fades it
    // 31 Oct 2026, Simon: the two `finish` clips never looped because their windows are short (1.7 and 1.1 screens against a 10 s clip: you would have to creep at 110-160 px/s to see it loop once) and they only played out once
    // when left. A moment can now have `hold` (in viewport heights): while the scroll is less than that far past the end of its window (`carry`, given by the runtime) it is treated as still inside it, so it loops as it does inside the window.
    const held = !!(active && active.finish && active.hold && p > active.to && carry < active.hold);
    if (!hit && active && active.finish && (held || !active.ended) && !userPaused && p > active.to) hit = active;
    if (hit !== active) swap(hit);
    // 29 Oct 2026, Simon: "it should only stop if you leave the window, forwards or backwards". The clip used to fade at its end if the visitor was still scrolling and stay away until they left the window and came back, so footage
    // vanished inside its window (worst on a scroll back). Now a clip that ends while the scroll is inside its window simply plays again, and keeps looping for as long as they are inside it; one that has been left forwards
    // (`finish`) plays out to its end and stops; closing it with the x, or a click to pause, still holds it until they leave the window.
    if (active && active.ended && !userPaused) { const outside = (p > active.to && !held) || p < active.from; if (!outside && !still) {
      // 5 Nov 2026, Simon: a moment with `loops: n` stops after n plays and waits on its last frame with the play button; a click plays it on, looping as before
      if (active.loops && active.plays >= active.loops && !active.onLoop) { userPaused = true; root.classList.add('still'); }
      else { active.plays++; active.ended = false; try { active.v.currentTime = 0; } catch (e) {} active.v.play().catch(() => {}); } } else if (outside) { done.add(active.id); swap(null); } }
    if (PHONE && active && !userPaused && !still && !active.ended && active.v.readyState >= 2) {   // (see the note at prime)
      const v = active.v, now = performance.now();
      if (v.paused) { if (now - (active.kickAt || 0) > 800) { active.kickAt = now; v.play().catch(() => {}); } }
      else if (Math.abs(v.currentTime - (active.lastCT ?? -1)) > 0.01) { active.lastCT = v.currentTime; active.lastCTAt = now; }
      else if (now - (active.lastCTAt || now) > 1200) { active.lastCTAt = now; try { v.pause(); v.currentTime = Math.min((v.duration || 1) - 0.1, v.currentTime + 0.05); } catch (e) {} v.play().catch(() => {}); }
    }
    if (active) { place(); const d = active.v.duration; if (d > 0) bar.style.width = (active.v.currentTime / d * 100).toFixed(1) + '%'; }
  }
  // the runtime stops calling update() while the beat is off screen; stop the footage then too, and let it play afresh when the visitor comes back
  const watch = setInterval(() => { if (performance.now() - lastSeen > 2000) { if (active) swap(null); for (const m of F) if (m.on) fullOff(m); dismissed.clear(); done.clear(); } }, 400);   // (also forgets what the visitor closed, so scrolling away and back shows it again)
  function destroy() { clearInterval(watch); swap(null); for (const m of F) { fullOff(m); m.box.remove(); if (m.blobUrl) URL.revokeObjectURL(m.blobUrl); } root.remove(); }
  return { update, destroy, root, isActive: () => !!active || F.some(m => m.on), covered: () => F.some(m => m.on && !m.bad),
    // 17 Nov 2026, Simon (the scrolled film was jerky on his iPhone): the phone's finale PLAYS the scrubbed film (finale.js, `film`) and moves the page along with it; these let it start, stop and read the film.
    // While it plays the film is not seeked to the scroll (the scroll follows the film instead); when the visitor drags it is paused and scrubbed as before.
    filmReady: () => F.some(m => m.scrub && m.on && !m.bad && m.v.readyState >= 2 && m.v.duration > 0),
    filmPlay: rate => { const m = F.find(x => x.scrub && x.on && !x.bad); if (!m || m.v.readyState < 2 || !m.v.duration) return false; if (m.playing) return true; m.playing = true; try { m.v.playbackRate = rate || 1; } catch (e) {} const pr = m.v.play(); if (pr && pr.catch) pr.catch(() => { m.playing = false; }); return true; },
    filmPause: () => { F.forEach(m => { if (m.playing) { m.playing = false; try { m.v.pause(); } catch (e) {} } }); },
    filmFrac: () => { const m = F.find(x => x.scrub && x.on && !x.bad); if (!m || !m.v.duration) return null; if (m.v.ended) return 1; const cuts = m.cuts || []; let t = m.v.currentTime;
      for (const c of cuts) if (t >= c[0] - 0.02 && t < c[1]) { try { m.v.currentTime = c[1]; } catch (e) {} t = c[1]; }   // a cut is jumped over as it is reached
      const kept = Math.max(0, m.v.duration - 0.05) - cuts.reduce((a, c) => a + c[1] - c[0], 0) - stretchExtra(m.stretch); return unwarpTime(m.warp, uncutTime(cuts, stretchKept(m.stretch, t)), kept); } };   // (covered: a full screen film is up (its box is opaque from the moment it is on), so the scene under it need not be drawn: 17 Nov 2026, see st-helier-approach beat.js)   // (isActive: the runtime keeps the beat updating while a clip is still on screen after the beat has been left: see stage.js)
}
