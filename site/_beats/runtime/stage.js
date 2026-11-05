/* _beats/runtime/stage.js — the ONE piece of scroll logic shared by every beat and both websites.
 *
 * A page calls:
 *   import { run } from './_beats/runtime/stage.js';
 *   run([{ beat:'globe-simple', track:'190vh', options:{...} }, ...], { root:'#beats', base:'./_beats/' });
 *
 * For each entry the runtime:
 *   1. creates  <section class="beat beat-<name>" style="height:<track>"><div class="beat-stage"></div></section>
 *      (or adopts an existing <section data-beat="<name>"> inside root, in document order)
 *   2. injects  <name>/beat.css once, loads <name>/beat.html into the stage
 *   3. imports  <name>/beat.js and calls  mount(stage, options, ctx)  →  { update(p), resize(), destroy(), exit() }
 *   4. drives   update(p) with p = 0..1 over the beat's own track, only while the beat is near the viewport
 *   5. handoff: ctx.handoff holds the merged exit() states of all earlier beats (e.g. yachtScreenPx)
 *      and warns if a beat's declared `needs` are not provided by anything before it.
 *
 * PINNED GROUPS (added 2026-08-21): give consecutive entries the same `group:'opening'` and they share ONE sticky stage.
 *   Each beat becomes a full-size layer inside it (stacked in order; `over:true` lifts a transition beat above its
 *   neighbours, e.g. clouds over both globe and sea). The group's height is the sum of the tracks; each beat's p runs
 *   over its own slice. Nothing slides — the globe becomes the clouds becomes the sea in the same space.
 *   `fade: 0.15` on an entry makes the runtime fade that layer in over the first 15 % of its slice (for opaque beats).
 *   `fadePrev: [0.03, 0.2]` fades the PREVIOUS layer out over that range of this beat's slice (retire the globe once the chart is in).
 * Beats never read window.scrollY. Beats never touch each other. Order is the array. That is the whole contract.
 */
export async function run(list, opts = {}) {
  const root = typeof opts.root === 'string' ? document.querySelector(opts.root) : (opts.root || document.body);
  // resolve against the PAGE url (fetch does that already; dynamic import() would resolve against this file)
  const base = new URL((opts.base || './_beats/').replace(/\/?$/, '/'), document.baseURI).href;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const beats = [];
  const handoff = {};
  const existing = Array.from(root.querySelectorAll('section[data-beat]'));
  // cache-busting: stamp every beat file URL with the catalogue's generated time (beats.json is rebuilt by the library routine)
  let ver = '';
  try { const cat = await (await fetch(base + 'beats.json', { cache: 'no-cache' })).json(); ver = '?v=' + encodeURIComponent(cat.generated || ''); } catch (e) { ver = '?v=' + Date.now(); }

  const vh = () => innerHeight;
  const toPx = v => { if (typeof v === 'number') return v; const m = String(v).match(/^([\d.]+)(vh|px)?$/); return m ? (m[2] === 'px' ? +m[1] : +m[1] / 100 * vh()) : vh(); };
  const groups = {};   // name → { section, stage, members:[] }
  // 5 Nov 2026, Simon ("still getting this empty dark blue page on loading"): the globe was built, but the next scenes were mounted straight after it, and their set-up (models, big chart
  // images going up to the graphics card) kept the browser busy for seconds, so the finished globe could not reach the screen: the loading screen went and the page stayed dark.
  // Now the globe is shown first: after mounting it the runtime waits for `cips:globe-ready` (or `cips:globe-failed`, or 12 s) and a few frames, and between later scenes it lets a frame through.
  const globeShown = new Promise(res => { addEventListener('cips:globe-ready', res, { once: true }); addEventListener('cips:globe-failed', res, { once: true }); setTimeout(res, 12000); });
  const frames = n => new Promise(res => { const f = () => (--n <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const breathe = () => Promise.race([frames(2), new Promise(res => setTimeout(res, 120))]).then(() => new Promise(res => setTimeout(res, 0)));   // (a hidden tab has no frames: never wait on them alone)

  for (let i = 0; i < list.length; i++) {
    const item = typeof list[i] === 'string' ? { beat: list[i] } : list[i];
    const name = item.beat;
    const dir = base + name + '/';
    // 24 Sep 2026, Simon: lockStageScroll() below, applied to every .beat-stage — found chasing a real bug in
    // globe-live, where its own content is genuinely wider than the stage (a "reason boxes" row, positioned off to
    // the side for its own layout reasons). A .beat-stage with overflow:hidden and content wider than itself is
    // still, per the browser's own default behaviour, a scrollable region — something (confirmed live: focus
    // landing on the stage itself once whatever it was showing closes right after a click, e.g. "Bring in a demo
    // vessel") scrolls it sideways, and EVERY position:absolute child (hero copy, the callout card, anything else
    // pinned by px/vw) visibly drags left or right with it — exactly the "way off to the left" Simon kept seeing.
    // tabIndex=-1 alone (tried first) does NOT stop this — the element stayed the live document.activeElement and
    // scrollLeft still moved — so this snaps scrollLeft/Top back to 0 on the stage's own 'scroll' event instead,
    // which catches it regardless of what triggers it. tabIndex=-1 is kept anyway, since nothing in any beat needs
    // Tab to reach the stage itself (real controls inside it keep their own natural tab order).
    const lockStageScroll = el => el.addEventListener('scroll', () => { if (el.scrollLeft || el.scrollTop) { el.scrollLeft = 0; el.scrollTop = 0; } }, { passive: true });
    let section, stage, layer = null;
    if (item.group) {
      let g = groups[item.group];
      if (!g) {
        section = document.createElement('section'); section.className = 'beat-group beat-group-' + item.group; section.dataset.group = item.group;
        stage = document.createElement('div'); stage.className = 'beat-stage'; stage.tabIndex = -1; lockStageScroll(stage); section.appendChild(stage); root.appendChild(section);
        g = groups[item.group] = { section, stage, members: [] };
      }
      layer = document.createElement('div'); layer.className = 'beat beat-' + name + ' beat-layer'; layer.dataset.beat = name;
      layer.style.zIndex = String(10 + i + (item.over ? 50 : 0));
      const inner = document.createElement('div'); inner.className = 'beat-stage'; inner.tabIndex = -1; lockStageScroll(inner); layer.appendChild(inner);
      g.stage.appendChild(layer);
      g.members.push({ item, layer });
      section = g.section; stage = inner;
    } else {
      section = existing.find(s => s.dataset.beat === name && !s.dataset.mounted);
      if (!section) { section = document.createElement('section'); root.appendChild(section); }
      section.dataset.beat = name; section.dataset.mounted = '1';
      section.classList.add('beat', 'beat-' + name);
      if (item.track) section.style.height = item.track;
      stage = section.querySelector('.beat-stage');
      if (!stage) { stage = document.createElement('div'); stage.className = 'beat-stage'; section.appendChild(stage); }
      stage.tabIndex = -1; lockStageScroll(stage);
    }

    // css once
    if (!document.querySelector(`link[data-beat-css="${name}"]`)) {
      await new Promise(res => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = dir + 'beat.css' + ver; l.dataset.beatCss = name;
        l.onload = res; l.onerror = () => { console.warn(`[beats] ${name}: beat.css missing`); res(); }; document.head.appendChild(l); });
    }
    // markup
    try { stage.innerHTML = await (await fetch(dir + 'beat.html' + ver, { cache: 'no-cache' })).text(); }
    catch (e) { console.warn(`[beats] ${name}: beat.html not found`, e); }
    // module
    let ctrl = null;
    try {
      const mod = await import(dir + 'beat.js' + ver);
      const needs = mod.needs || [];
      for (const n of needs) if (!(n in handoff)) console.warn(`[beats] ${name} needs "${n}" but no earlier beat provides it — using its default.`);
      ctrl = await mod.mount(stage, Object.assign({}, mod.defaults || {}, item.options || {}), { base: dir, ver, handoff: Object.assign({}, handoff), reduced, index: i, name, layer });
      try { ctrl?.resize?.(); } catch (_) {}                       // sizes are final now that css + markup are in
      if (ctrl && typeof ctrl.exit === 'function') Object.assign(handoff, ctrl.exit() || {});
    } catch (e) { console.error(`[beats] ${name}: mount failed`, e); (layer || section).classList.add('beat-failed'); }
    beats.push({ name, item, section, stage, layer, ctrl, visible: false, lastP: -1, group: item.group || null });
    if (name === 'globe-live') { await globeShown; await Promise.race([frames(6), new Promise(res => setTimeout(res, 400))]); }
    else if (i < list.length - 1) await breathe();
  }
  // size the pinned groups: height = sum of member tracks; compute each member's slice
  function layoutGroups() {
    for (const gname in groups) {
      const g = groups[gname]; let acc = 0;
      // 3 Oct 2026, Simon (folding cloud-pass into the start of seaway-wake): `overlap` ('80vh') on a member starts its slice that
      // much EARLIER, inside the previous member's last stretch — both beats progress together there (the earlier one is still the
      // `active` one, so an `over` beat keeps its cover/reveal rules; the later one is already live under it and moving). The group
      // is shorter by the overlap. Default 0 = every group behaves exactly as before.
      g.members.forEach((m, k) => { const T = toPx(m.item.track || '100vh'), ov = k > 0 ? Math.min(toPx(m.item.overlap || '0px'), acc) : 0; m.start = acc - ov; m.len = (k === g.members.length - 1) ? Math.max(1, T - vh()) : T; acc += T - ov; });
      g.section.style.height = acc + 'px';
    }
  }
  layoutGroups(); addEventListener('resize', layoutGroups, { passive: true });

  // ---- reviewer aids (2026-09-14, for non-technical review): ?hud shows "beat · 42%" in the corner so feedback can cite a
  //      position; ?goto=beat-name:0.42 scrolls straight to that point on load. Neither does anything unless asked for.
  const qs = new URLSearchParams(location.search);
  const hud = qs.has('hud') || qs.has('review') ? (() => { const d = document.createElement('div'); d.className = 'beat-hud';
    d.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;font:600 12px/1.4 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.62);padding:6px 10px;border-radius:8px;pointer-events:none;letter-spacing:.02em';
    document.body.appendChild(d); return d; })() : null;
  function scrollTargetFor(b, p) {
    if (b.group) { const g = groups[b.group], m = g.members.find(x => x.layer === b.layer); return g.section.offsetTop + m.start + p * m.len; }
    return b.section.offsetTop + p * Math.max(0, b.section.offsetHeight - innerHeight);
  }
  const goto = qs.get('goto');
  if (goto) { const [gname, gp] = goto.split(':'); const b = beats.find(x => x.name === gname);
    if (b) setTimeout(() => { layoutGroups(); scrollTo({ top: scrollTargetFor(b, Math.min(1, Math.max(0, parseFloat(gp) || 0))), behavior: 'auto' }); }, 400); }

  // visibility
  const io = new IntersectionObserver(es => { for (const e of es) beats.filter(x => x.section === e.target).forEach(b => b.visible = e.isIntersecting); }, { rootMargin: '25% 0px' });
  new Set(beats.map(b => b.section)).forEach(sec => io.observe(sec));

  // drive
  let frameId = 0;
  const scrolledOf = g => g._fid === frameId ? g._scrolled : -g.section.getBoundingClientRect().top;   // (read once per frame, before anything writes: see frame())
  function progressOf(b) {
    if (b.group) {
      const g = groups[b.group], m = g.members.find(x => x.layer === b.layer);
      const scrolled = scrolledOf(g);
      return Math.min(1, Math.max(0, (scrolled - m.start) / m.len));
    }
    const r = b.section.getBoundingClientRect(); const total = r.height - innerHeight;
    return total <= 0 ? (r.top <= 0 ? 1 : 0) : Math.min(1, Math.max(0, -r.top / total));
  }
  // adaptive quality (29 Oct 2026, performance): measured on an integrated GPU, the page's biggest cost was not the scenes but the frosted-glass blur (CSS backdrop-filter) laid over them every frame: the four tilt-shift
  // bands and the glass panels. So when the page cannot hold about 40 fps it steps down, one step at a time, undoing a step that did not help: level 1 drops the broad tilt-shift bands, level 2 drops all tilt-shift
  // and all backdrop blur (panels keep their tint), then the WebGL canvases are drawn at a lower resolution (window.__renderScale, down to 0.6). Steps are never taken back during a visit (no flicker); the level
  // is remembered for the visit (sessionStorage). ?quality=0 turns it off (full quality always), ?quality=2 forces level 2, ?scale=0.8 fixes the render scale.
  const RS = { ema: 16.7, last: 0, slow: 0, coolUntil: 0, lockedUntil: 0, verify: null, off: false }, MIN_SCALE = 0.6, qsP = new URLSearchParams(location.search);
  window.__renderScale = 1; window.__perfLevel = 0;
  const applyLevel = v => { window.__perfLevel = v; document.documentElement.classList.toggle('perf-1', v === 1); document.documentElement.classList.toggle('perf-2', v >= 2); try { sessionStorage.setItem('cips.perfLevel', String(v)); } catch (_) {} };
  { const st = document.createElement('style'); st.textContent = 'html.perf-1 .tiltshift>div:nth-child(odd){display:none!important}html.perf-2 .tiltshift{display:none!important}html.perf-2 *,html.perf-2 *::before,html.perf-2 *::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'; document.head.appendChild(st); }
  { const qq = qsP.get('quality'), qsc = qsP.get('scale'); let v = 0; try { v = +(sessionStorage.getItem('cips.perfLevel') || 0) || 0; } catch (_) {}
    if (qq !== null && !isNaN(+qq)) { v = Math.min(2, Math.max(0, +qq)); RS.off = true; }
    if (qsc !== null && !isNaN(+qsc)) { window.__renderScale = Math.min(1, Math.max(MIN_SCALE, +qsc)); RS.off = true; }
    if (qq === null && !isNaN(v)) { const px = innerWidth * innerHeight; if (px >= 1.6e6) v = Math.max(v, 1); }   // 30 Oct 2026: a window of about 1920x960 or bigger (1.6 million CSS pixels) starts at level 1: on an integrated GPU the full-quality blur held the harbour and the pilot approach at 30-36 fps there and level 1 at 44-56, and the steps below used to be taken only after the visitor had already put up with a stretch of lag
    applyLevel(v); }
  function setScale(v) { v = Math.round(Math.min(1, Math.max(MIN_SCALE, v)) * 100) / 100; if (v === window.__renderScale) return; window.__renderScale = v; dispatchEvent(new Event('cips:renderscale')); }
  function degrade(t) {   // one step down, remembering how to undo it
    const lvl = window.__perfLevel, sc = window.__renderScale;
    if (lvl < 2) { RS.verify = { before: RS.ema, undo: () => applyLevel(lvl) }; applyLevel(lvl + 1); }
    else if (sc > MIN_SCALE) { RS.verify = { before: RS.ema, undo: () => setScale(sc) }; setScale(sc - 0.1); }
    else return;
    RS.coolUntil = t + 2000; RS.slow = 0;
  }
  function adaptQuality(t) {
    if (RS.off) return;
    const dt = t - RS.last; RS.last = t; if (!(dt > 0) || dt > 200 || document.hidden) { RS.slow = 0; return; }   // a hitch (loading, a hidden tab) says nothing about the steady rate
    RS.ema += (dt - RS.ema) * 0.08;
    if (t < RS.coolUntil) return;
    if (RS.verify) { const v = RS.verify; RS.verify = null; if (RS.ema > v.before * 0.92) { v.undo(); RS.lockedUntil = t + 60000; RS.coolUntil = t + 3000; return; } }   // no faster: that was not the cost
    if (RS.ema > 22) RS.slow += dt; else RS.slow = 0;   // (30 Oct 2026: was 27 ms / 1.5 s: the page sat at 30-36 fps without ever stepping down; now below about 45 fps for a second)
    if (RS.slow > 1000 && t > RS.lockedUntil) degrade(t);
  }
  // warm-up of the next scene (30 Oct 2026, performance): every scene is mounted at load but draws nothing until it goes live, so its first draw (shader compile, the big plate textures going up to the GPU, the first
  // plate chunks) all landed in the frames at the changeover: 200-270 ms freezes at seaway-wake -> noirmont-transit (the footage clip stood still with them, which looked like it cutting out) and at noirmont -> st-helier.
  // So once the active beat is past `warmFrom` (default 0.6) the next beat, still hidden, is drawn at its own start (p 0) a few times: when the visitor has paused scrolling for a moment (nobody notices a hitch while the
  // picture is still), or once the changeover is close (0.9) whatever they are doing. A scene is a pure function of p, so this changes nothing but when the work is done. Off for a beat with `warm:false`.
  const WARM_STEPS = 3;
  function warmNext(b, idx, active, ap, g, am) {
    if (idx !== active + 1 || !b.ctrl || b.item.warm === false || (b.warmN || 0) >= WARM_STEPS) return;
    if (ap < (am.item.warmFrom ?? 0.6)) return;
    const now = performance.now(); if (now - (b.warmAt || 0) < 450) return;   // the images asked for by the last step need time to decode before the next one uploads them
    const calm = now - (g._moveAt || 0) > 160, close = ap >= 0.9;
    if (!calm && !close) return;
    b.warmAt = now; b.warmN = (b.warmN || 0) + 1;
    const w0 = performance.now();
    try { b.ctrl.update(0, { changed: true, warm: true }); } catch (e) { b.warmN = WARM_STEPS; console.warn(`[beats] ${b.name} warm-up`, e); }
    (window.__warmLog || (window.__warmLog = [])).push([b.name, b.warmN, +(performance.now() - w0).toFixed(0), +ap.toFixed(2), calm ? 'calm' : 'moving']);   // (dev aid: how long each step took)
  }
  function frame(t) {
    requestAnimationFrame(frame);
    adaptQuality(t); frameId++;
    for (const gname in groups) { const g = groups[gname]; const sc = -g.section.getBoundingClientRect().top; if (Math.abs(sc - (g._prevSc ?? sc)) > 0.5) g._moveAt = performance.now(); g._prevSc = sc; g._scrolled = sc; g._fid = frameId; }
    if (hud) { let label = '';
      for (const b of beats) { const r = b.section.getBoundingClientRect(); if (!(r.top <= 0 && r.bottom > 0)) continue;
        if (b.group) { const g = groups[b.group]; const scrolled = -r.top; const m = g.members.find(m => scrolled >= m.start && scrolled < m.start + m.len) || g.members[g.members.length - 1];
          label = `${m.layer.dataset.beat} · ${Math.round(Math.min(1, Math.max(0, (scrolled - m.start) / m.len)) * 100)}%`; }
        else label = `${b.name} · ${Math.round(progressOf(b) * 100)}%`;
        break; }
      hud.textContent = label || 'page top'; }
    for (const b of beats) {
      if (!b.ctrl || !b.visible) continue;
      const p = progressOf(b); let carry = 0, footOnly = false;
      if (b.layer) {
        // a layer is live while its slice is active or it is the immediate neighbour of the active one; otherwise hidden (saves GPU)
        const g = groups[b.group]; const idx = g.members.findIndex(x => x.layer === b.layer);
        const scrolled = scrolledOf(g);
        let active = g.members.findIndex(m => scrolled >= m.start && scrolled < m.start + m.len);
        if (active < 0) active = scrolled < 0 ? 0 : g.members.length - 1;
        const am = g.members[active], ap = Math.min(1, Math.max(0, (scrolled - am.start) / am.len));
        // earlier layer: live only if directly beneath the active one (it shows through transitions)
        // later layer: hidden until it becomes active — unless the active beat is an `over` transition past its reveal point
        //              (default 0.5 = the cover is complete), so the next scene is waiting underneath when the clouds part
        // 29 Oct 2026 (performance): the earlier layer is only kept alive (updated, rendered) while it can still be seen: through the active beat's fade / fadePrev, or for the first few percent of the beat
        // (`keepPrev`, default 3%) so a hard cut has time to load. It used to stay live for the whole of the next beat: two sea shaders, two plotters and two sets of plates drawn at once, the first one unseen.
        const prevSeen = idx === active - 1 && ((am.item.fadePrev ? ap < am.item.fadePrev[1] : am.item.fade ? ap < am.item.fade : ap < (am.item.keepPrev ?? 0.03)) || !!(b.ctrl && b.ctrl.keepAlive && b.ctrl.keepAlive()));   // (keepAlive: a clip that carries over into the next beat is still playing)
        // 31 Oct 2026: a beat that has been left but whose footage clip is still on (keepAlive) is not drawn any more, only its footage is kept going (`footage()` below, which also gets `carry`: how many viewport heights
        // the scroll is past the end of this beat), so a clip can keep looping for a stretch of the next beat (the moment's `hold`) without a second sea being rendered underneath.
        if (idx < active) carry = Math.max(0, (scrolled - (g.members[idx].start + g.members[idx].len)) / innerHeight * 100);
        footOnly = idx === active - 1 && prevSeen && !((am.item.fadePrev ? ap < am.item.fadePrev[1] : am.item.fade ? ap < am.item.fade : ap < (am.item.keepPrev ?? 0.03))) && !!b.ctrl.footage;
        const live = idx === active || prevSeen || (idx === active + 1 && am.item.over && ap >= (am.item.reveal ?? 0.5));
        b.layer.style.visibility = live && !footOnly ? 'visible' : 'hidden';
        if (footOnly) { try { b.ctrl.footage(p, { carry }); } catch (e) { console.error(`[beats] ${b.name}.footage`, e); } b.lastP = p; continue; }
        if (!live) { warmNext(b, idx, active, ap, g, am); continue; }
        // opacity is owned by exactly one rule at a time, and is RESET when nobody owns it — otherwise a layer faded by
        // the next beat's fadePrev stayed dim if the visitor scrolled back up before that fade had finished (2026-09-13)
        if (idx === active) {
          b.layer.style.opacity = b.item.fade ? Math.min(1, p / b.item.fade).toFixed(3) : '';
          if (idx > 0 && !b.item.fadePrev) g.members[idx - 1].layer.style.opacity = '';
        }
        if (b.item.fadePrev && idx > 0 && idx === active) { const [a0, a1] = b.item.fadePrev; const prev = g.members[idx - 1].layer; prev.style.opacity = (1 - Math.min(1, Math.max(0, (p - a0) / (a1 - a0)))).toFixed(3); }
      }
      try { const pb = window.__pb, t0 = pb ? performance.now() : 0; b.ctrl.update(p, { changed: p !== b.lastP, carry }); if (pb) { const e = pb[b.name] || (pb[b.name] = [0, 0]); e[0] += performance.now() - t0; e[1]++; } } catch (e) { console.error(`[beats] ${b.name}.update`, e); b.ctrl = null; }   // (window.__pb: optional per-beat timing, set by tools/site-directions/perf-run.js)
      b.lastP = p;
    }
  }
  requestAnimationFrame(frame);
  addEventListener('resize', () => beats.forEach(b => b.ctrl?.resize?.()), { passive: true });
  return {
    beats,
    destroy() { io.disconnect(); beats.forEach(b => b.ctrl?.destroy?.()); }
  };
}

/* helpers beats may import */
export const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };
export const cinematicSilk = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ≈ cubic-bezier(.45,.05,.55,.95)
