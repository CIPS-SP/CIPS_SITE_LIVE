/* _beats/_shared/phone-sea.js — the lighter scrolled journey for phones, at sea (13 Nov 2026, Simon's storyboard).
 *
 * On a small touch screen seaway-wake and noirmont-transit use their static fallback (no 3D); this lays a light, flat scene over it:
 * the yacht's plan sprite sailing DOWN the page (north to south: a phone is tall), the sea flowing up past it with a wake behind the stern,
 * the pilot launch coming alongside and the pilot stepping across, the journey's film clips sliding in at the key points while the
 * yacht carries on underneath, and a turn of 180 degrees that leaves the yacht bow UP, ready for the harbour (st-helier-approach,
 * which runs its real scene on phones too, lighter and shorter).
 *
 *   const ps = mountPhoneSea(stage, { assets, dir, plan: o.phone, reduced });
 *   ps.update(p); ps.destroy();
 * plan = { captions: [{ from, to, eyebrow, sub }], clips: [{ from, to, file, title }], pilot: [from, to] | null, turn: [from, to] | null }
 * Everything is a pure function of p (scrolling back is exact) plus a gentle running drift so the sea is alive while the visitor reads.
 */
import { mountNavPlotter } from './nav-plotter.js';
const CSS_URL = new URL('./phone-sea.css', import.meta.url).href;
// 14 Nov 2026, Simon: the photo sea (a seamless patch of open water cut from seaway-wake's sea.jpg, which has a yacht in the middle) and the main site's own wake
// (cut from a frame of the 3D scene: white with its own transparency, bow to the right, the hull's place in it below)
const SEA_URL = new URL('./phone-sea.jpg', import.meta.url).href, SEA_W = 1600, SEA_H = 280, SEA_YACHT = 1170;   // the tile's size, and the yacht's length in the photo it came from (sets the scale)
const WAKE_URL = new URL('./phone-wake.png', import.meta.url).href, WAKE = { w: 1200, h: 440, x0: 700, len: 404, cy: 218 };   // where the hull lies in the wake picture
let cssReady = null;
function loadCss() {
  if (cssReady) return cssReady;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS_URL;
  cssReady = new Promise(res => { l.onload = res; l.onerror = res; }); document.head.appendChild(l); return cssReady;
}
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const seg = (a, b, x) => clamp01((x - a) / (b - a));
const ease = u => u * u * (3 - 2 * u);
const lerp = (a, b, t) => a + (b - a) * t;

// what a beat's staticCtrl calls: nothing unless the beat has a `phone` plan; the fallback's own yacht, sea and caption are hidden
export function phoneSea(stage, o, ctx, copyEl, shipEl, seawayBase, nav) {
  if (!o || !o.phone) return null;
  if (copyEl) copyEl.style.display = 'none';
  if (shipEl) shipEl.style.display = 'none';
  return mountPhoneSea(stage, { assets: seawayBase + 'assets/', dir: ctx.base + '../../videos/journey/', plan: o.phone, reduced: !!ctx.reduced, nav, navAssets: seawayBase });
}

// the plotter's feed for a stretch with no 3D route of its own: straight along a list of waypoints, p 0..1 from the first to the last, at kn(p) knots
export function routeNav(GEO, route, kn = () => 12) {
  const cosL = Math.cos(route[0][0] * Math.PI / 180), seg = [], acc = [0];
  for (let i = 1; i < route.length; i++) { const d = Math.hypot(route[i][0] - route[i - 1][0], (route[i][1] - route[i - 1][1]) * cosL); seg.push(d); acc.push(acc[i - 1] + d); }
  const at = p => { const d = Math.max(0, Math.min(1, p)) * acc[acc.length - 1]; let i = 1; while (i < acc.length - 1 && acc[i] < d) i++; const t = seg[i - 1] ? (d - acc[i - 1]) / seg[i - 1] : 0; return { i, t }; };
  return { GEO, route,
    pos: p => { const { i, t } = at(p), a = route[i - 1], b = route[i]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; },
    hdg: p => { const { i } = at(p), a = route[i - 1], b = route[i]; return ((Math.atan2((b[1] - a[1]) * cosL, b[0] - a[0]) * 180 / Math.PI) + 360) % 360; },
    kn };
}

export function mountPhoneSea(stage, { assets, dir, plan = {}, reduced = false, nav = null, navAssets = '' } = {}) {
  const css = loadCss();
  const conn = navigator.connection || {};
  const stillClips = !!(reduced || conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') || conn.effectiveType === '3g');
  const root = document.createElement('div'); root.className = 'phs'; root.style.visibility = 'hidden'; css.then(() => { root.style.visibility = ''; });
  root.innerHTML = '<div class="phs-sea"></div><div class="phs-world"><div class="phs-boat"><img class="phs-wk" alt=""><img class="phs-bimg" alt=""></div>'
    + '<div class="phs-ship"><img class="phs-wk" alt=""><img class="phs-img" alt=""></div><img class="phs-man" alt=""></div>'
    + '<div class="phs-shade"></div><div class="phs-cap"><p class="phs-eye"></p><p class="phs-sub"></p></div>'
    + '<div class="phs-clip"><p class="phs-tag"></p><div class="phs-frame"><button type="button" class="phs-play" aria-label="Play the footage"><i></i></button></div></div>';
  stage.appendChild(root);
  const $ = s => root.querySelector(s);
  const sea = $('.phs-sea'), world = $('.phs-world'), ship = $('.phs-ship'), boat = $('.phs-boat'), man = $('.phs-man');
  const cap = $('.phs-cap'), eye = $('.phs-eye'), sub = $('.phs-sub'), clipBox = $('.phs-clip'), tag = $('.phs-tag'), frame = $('.phs-frame'), playBtn = $('.phs-play');
  sea.style.backgroundImage = `url("${SEA_URL}")`;
  root.querySelectorAll('.phs-wk').forEach(w => { w.src = WAKE_URL; });
  // the chart plotter, bottom left, as on a computer (14 Nov 2026, Simon): the scene says where she is and which way she heads
  const plotter = nav ? mountNavPlotter(stage, { GEO: nav.GEO, route: nav.route, markNames: nav.markNames, shipLatLng: () => nav.pos(lastP), headingDeg: () => nav.hdg(lastP), speedKts: () => nav.kn(lastP), compact: true, assetsBase: navAssets }) : null;
  $('.phs-img').src = assets + 'ship-plan.png'; $('.phs-bimg').src = assets + 'pilot-boat.svg'; man.src = assets + 'pilot-man.svg';

  const clips = (plan.clips || []).map(c => {
    const m = Object.assign({ lead: 0.12 }, c, { src: dir + c.file + '.mp4', poster: dir + c.file + '.jpg' });
    const v = document.createElement('video'); v.className = 'phs-v'; v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', '');
    v.loop = true; v.preload = 'none'; v.poster = m.poster; v.disablePictureInPicture = true; v.setAttribute('aria-label', m.title || 'Footage');
    v.addEventListener('playing', () => { if (active === m) clipBox.classList.remove('phs-still'); });
    frame.insertBefore(v, playBtn); m.v = v; return m;
  });
  let active = null, paused = false, capShown = null, lastSeen = 0, t0 = performance.now(), lastP = 0;
  const load = m => { if (m.loaded) return; m.loaded = true; if (stillClips) return; m.v.preload = 'auto'; m.v.src = m.src; m.v.load(); };
  function setClip(m) {
    if (active) { try { active.v.pause(); } catch (e) {} active.v.classList.remove('phs-cur'); }
    active = m; paused = false; clipBox.classList.toggle('phs-on', !!m); root.classList.toggle('phs-film', !!m);
    if (!m) return;
    tag.textContent = 'On scene · ' + (m.title || ''); m.v.classList.add('phs-cur'); load(m);
    if (stillClips) { clipBox.classList.add('phs-still'); return; }
    clipBox.classList.remove('phs-still');
    const go = n => { const pr = m.v.play(); if (pr && pr.catch) pr.catch(err => { if (active !== m) return; if (err && err.name === 'NotAllowedError') clipBox.classList.add('phs-still'); else if (n < 4) setTimeout(() => go(n + 1), 250 * (n + 1)); }); }; go(0);
  }
  frame.addEventListener('click', () => { if (!active) return; const v = active.v;
    if (v.paused) { paused = false; if (!v.src) { v.src = active.src; v.load(); } clipBox.classList.remove('phs-still'); v.play().catch(() => {}); }
    else { paused = true; v.pause(); clipBox.classList.add('phs-still'); } });
  function setCaption(c) {
    if (c === capShown) return; capShown = c; cap.classList.add('phs-out');
    setTimeout(() => { if (capShown !== c) return; eye.textContent = c ? c.eyebrow || '' : ''; sub.textContent = c ? c.sub || '' : ''; if (c) cap.classList.remove('phs-out'); }, 240);
  }

  let raf = 0;
  function draw() {
    raf = 0; const p = lastP, now = performance.now(), ts = (now - t0) / 1000;
    const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight;
    const L = Math.min(H * 0.36, 300), B = L * 242 / 1189;   // (14 Nov 2026: a little smaller, so the plotter fits bottom left)   // the yacht's length and beam on screen (ship-plan.png is 1189 x 242, bow to the right)
    // the turn: 90 degrees = bow down (south); 270 = bow up (north). The sea flows up past a southbound yacht, down past a northbound one.
    const tu = plan.turn ? ease(seg(plan.turn[0], plan.turn[1], p)) : 0, rot = 90 + 180 * tu, dir = Math.cos(tu * Math.PI);   // +1 sea flows up, -1 down
    // how far the sea has flowed: up while southbound, still while she turns, down once northbound (so it never jumps)
    const a = plan.turn ? plan.turn[0] : 2, b = plan.turn ? plan.turn[1] : 2, s = p <= a ? p : p <= b ? a : a - (p - b);
    const flow = (plan.flow || 2600) * s + (reduced ? 0 : ts * 9 * Math.sign(dir || 1));
    const k = L / SEA_YACHT; sea.style.backgroundSize = `${(SEA_W * k).toFixed(1)}px ${(SEA_H * k).toFixed(1)}px`;   // the photo's own scale against the yacht
    sea.style.backgroundPosition = `center ${(-(flow * k * 2.4) % (SEA_H * k)).toFixed(1)}px`;
    const sway = reduced ? 0 : Math.sin(ts * 0.9) * 0.7, swayX = reduced ? 0 : Math.sin(ts * 0.37) * 3;
    const cx = W / 2 + swayX, cy = H * (root.classList.contains('phs-film') ? 0.58 : 0.46);
    const placeWake = (box, len) => { const w = box.querySelector('.phs-wk'), s = len / WAKE.len, bh = box.offsetHeight || len * 0.2; w.style.width = (WAKE.w * s) + 'px'; w.style.height = (WAKE.h * s) + 'px'; w.style.left = (-WAKE.x0 * s) + 'px'; w.style.top = (bh / 2 - WAKE.cy * s) + 'px'; };
    ship.style.width = L + 'px'; ship.style.height = B + 'px'; placeWake(ship, L);
    ship.style.transform = `translate(${(cx - L / 2).toFixed(1)}px,${(cy - B / 2).toFixed(1)}px) rotate(${(rot + sway).toFixed(2)}deg)`;
    root.style.setProperty('--wake', (0.55 + 0.45 * Math.abs(dir)).toFixed(2));
    // the pilot launch (bow to the right in its svg; it keeps station on the yacht's starboard side, which is screen-left of a southbound yacht)
    if (plan.pilot) {
      const u = seg(plan.pilot[0], plan.pilot[1], p), on = u > 0 && u < 1; boat.style.display = on ? '' : 'none'; man.style.display = on ? '' : 'none';
      if (on) {
        const bl = L * 0.2, bb = bl * 64 / 200, side = -(B / 2 + bb / 2 + 2);   // alongside, just clear of the hull
        const inU = ease(seg(0, 0.32, u)), outU = ease(seg(0.72, 1, u));
        const along = lerp(H * 0.55, L * 0.05, inU) + lerp(0, -H * 0.6, outU);   // comes up from astern (below), holds abreast amidships, then drops back and away
        const off = side + lerp(-W * 0.18, 0, inU) + lerp(0, -W * 0.25, outU);
        boat.style.width = bl + 'px'; boat.style.height = bb + 'px'; placeWake(boat, bl);
        boat.style.transform = `translate(${(cx + off - bl / 2).toFixed(1)}px,${(cy + along - bb / 2).toFixed(1)}px) rotate(${(90 + 8 * outU - 6 * (1 - inU)).toFixed(1)}deg)`;
        // the pilot crosses from the launch to the yacht's deck while they are together
        const cross = ease(seg(0.40, 0.58, u)), ms = Math.max(12, L * 0.045);
        const mx = lerp(cx + off, cx - B * 0.15, cross), my = lerp(cy + along, cy + L * 0.05, cross);
        man.style.width = ms + 'px'; man.style.opacity = u < 0.36 ? 0 : cross >= 1 ? 1 - seg(0.62, 0.7, u) : 1;
        man.style.transform = `translate(${(mx - ms / 2).toFixed(1)}px,${(my - ms / 2).toFixed(1)}px) rotate(${cross < 1 ? 90 : 180}deg)`;
      }
    }
    if (plotter) plotter.update();
    if (performance.now() - lastSeen < 1500) raf = requestAnimationFrame(draw);
  }
  function update(p) {
    lastP = p; lastSeen = performance.now(); root.classList.add('phs-on');
    let c = null; for (const k of plan.captions || []) if (p >= k.from && p < k.to) { c = k; break; }
    let m = null; for (const k of clips) { if (p >= k.from - k.lead && p <= k.to) load(k); if (!m && p >= k.from && p < k.to) m = k; }
    if (m !== active) setClip(m);
    setCaption(m ? null : c);
    if (!raf) raf = requestAnimationFrame(draw);
  }
  const watch = setInterval(() => { if (performance.now() - lastSeen > 1500) { if (active) setClip(null); root.classList.remove('phs-on'); } }, 400);
  function destroy() { clearInterval(watch); if (raf) cancelAnimationFrame(raf); setClip(null); plotter?.destroy(); root.remove(); }
  return { update, destroy, root };
}
