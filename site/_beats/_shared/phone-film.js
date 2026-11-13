/* _beats/_shared/phone-film.js — the lighter journey for phones (13 Nov 2026, Simon chose "lighter phone version").
 *
 * Small touch screens (and any device that cannot run the 3D scenes) get the static fallback of seaway-wake, noirmont-transit and
 * st-helier-approach. That used to be one still yacht for the whole journey. Now each of those beats lays this over its fallback: the
 * journey's own film clips, one per stretch of the scroll, shown the full width of the screen with that stretch's caption above, on a
 * blurred, darkened copy of the clip's poster. A stretch with no clip leaves the fallback (the yacht on the sea) showing, with its caption.
 *
 *   const pf = mountPhoneFilm(stage, { dir: '<url of videos/journey/>', scenes: [{ from, to, file?, title?, eyebrow, sub, cuts? }] });
 *   pf.update(p);   // every frame, with the beat's own p (0..1)
 *   pf.destroy();
 * A clip loads a little before its stretch, plays silent and on a loop while the scroll is inside it, and pauses when the scroll leaves
 * or the beat stops being drawn. cuts: [[from, to], ...] seconds of the file that are skipped (the departure film, as on desktop).
 * Data saver, a slow connection or reduced motion: the poster is shown and nothing plays by itself (a tap plays it).
 */
const CSS_URL = new URL('./phone-film.css', import.meta.url).href;
let cssReady = null;
function loadCss() {
  if (cssReady) return cssReady;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS_URL;
  cssReady = new Promise(res => { l.onload = res; l.onerror = res; }); document.head.appendChild(l); return cssReady;
}

// what a beat's staticCtrl calls: nothing if the beat has no `phone` scenes; the beat's own caption (.scopy) is hidden, the film carries the captions
export function phoneFilm(stage, o, ctx, copyEl) {
  if (!o || !o.phone || !o.phone.length) return null;
  if (copyEl) copyEl.style.display = 'none';
  return mountPhoneFilm(stage, { dir: ctx.base + '../../videos/journey/', scenes: o.phone, reduced: !!ctx.reduced });
}

export function mountPhoneFilm(stage, { dir, scenes = [], reduced = false } = {}) {
  const css = loadCss();
  const conn = navigator.connection || {};
  const still = !!(reduced || conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') || conn.effectiveType === '3g');
  const root = document.createElement('div'); root.className = 'phf'; root.style.visibility = 'hidden'; css.then(() => { root.style.visibility = ''; });
  root.innerHTML = '<div class="phf-bgs"></div><div class="phf-body"><div class="phf-cap"><p class="phf-tag"></p><p class="phf-eye"></p><p class="phf-sub"></p></div>'
    + '<div class="phf-frame"><button type="button" class="phf-play" aria-label="Play the footage"><i></i></button></div></div>';
  stage.appendChild(root);
  const bgs = root.querySelector('.phf-bgs'), frame = root.querySelector('.phf-frame'), cap = root.querySelector('.phf-cap');
  const tagEl = root.querySelector('.phf-tag'), eyeEl = root.querySelector('.phf-eye'), subEl = root.querySelector('.phf-sub'), playBtn = root.querySelector('.phf-play');

  const S = scenes.map((s, i) => {
    const m = Object.assign({ lead: 0.08, i }, s);
    if (m.file) {
      m.src = dir + m.file + '.mp4'; m.poster = dir + m.file + '.jpg';
      const bg = document.createElement('div'); bg.className = 'phf-bg'; bg.style.backgroundImage = `url("${m.poster}")`; bgs.appendChild(bg); m.bg = bg;
      const v = document.createElement('video'); v.className = 'phf-v'; v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.loop = !m.cuts; v.preload = 'none'; v.poster = m.poster; v.disablePictureInPicture = true; v.setAttribute('aria-label', m.title || 'Footage');
      if (m.cuts) v.addEventListener('timeupdate', () => { for (const c of m.cuts) if (v.currentTime >= c[0] && v.currentTime < c[1] - 0.05) { try { v.currentTime = c[1]; } catch (e) {} } });
      if (m.cuts) v.addEventListener('ended', () => { if (active === m && !paused) { try { v.currentTime = 0; } catch (e) {} v.play().catch(() => {}); } });
      v.addEventListener('playing', () => { if (active === m) root.classList.remove('phf-still'); });
      frame.insertBefore(v, playBtn); m.v = v;
    }
    return m;
  });

  let active = null, shown = null, paused = false, lastSeen = 0, capTimer = 0;
  const load = m => { if (!m.v || m.loaded) return; m.loaded = true; if (still) return; m.v.preload = 'auto'; m.v.src = m.src; m.v.load(); };
  const play = m => { if (!m.v) return; if (still || paused) { root.classList.add('phf-still'); return; }
    const go = n => { const pr = m.v.play(); if (pr && pr.catch) pr.catch(err => { if (active !== m) return; if (err && err.name === 'NotAllowedError') root.classList.add('phf-still'); else if (n < 4) setTimeout(() => go(n + 1), 250 * (n + 1)); }); }; go(0); };
  function setCaption(m) {   // the caption fades out, changes, and fades back in
    clearTimeout(capTimer); cap.classList.add('phf-out');
    capTimer = setTimeout(() => { tagEl.textContent = m && m.title ? 'On scene · ' + m.title : ''; eyeEl.textContent = m ? m.eyebrow || '' : ''; subEl.textContent = m ? m.sub || '' : ''; if (m) cap.classList.remove('phf-out'); }, shown ? 260 : 0);
    shown = m;
  }
  function swap(m) {
    if (active && active.v) { try { active.v.pause(); } catch (e) {} active.v.classList.remove('phf-cur'); active.bg.classList.remove('phf-cur'); }
    active = m; paused = false; root.classList.remove('phf-still');
    root.classList.toggle('phf-film', !!(m && m.v));
    if (m && m.v) { load(m); m.v.classList.add('phf-cur'); m.bg.classList.add('phf-cur'); try { if (m.v.currentTime > 0.1) m.v.currentTime = 0; } catch (e) {} play(m); }
    if (m !== shown) setCaption(m);
  }
  frame.addEventListener('click', () => { if (!active || !active.v) return; const v = active.v;
    if (v.paused) { paused = false; if (!v.src) { v.src = active.src; v.load(); } root.classList.remove('phf-still'); v.play().catch(() => {}); }
    else { paused = true; v.pause(); root.classList.add('phf-still'); } });

  function update(p) {
    lastSeen = performance.now(); root.classList.add('phf-on');
    let hit = null;
    for (const m of S) { if (p >= m.from - m.lead && p <= m.to) load(m); if (!hit && p >= m.from && p < m.to) hit = m; }
    if (hit !== active) swap(hit);
  }
  // the runtime stops calling update() once the beat is off screen: stop the footage then, and start afresh when the visitor comes back
  const watch = setInterval(() => { if (active && performance.now() - lastSeen > 1500) { swap(null); root.classList.remove('phf-on'); } }, 400);
  function destroy() { clearInterval(watch); clearTimeout(capTimer); swap(null); root.remove(); }
  return { update, destroy, root };
}
