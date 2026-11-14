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
import { mountVideoMoment } from './video-moment.js';
const CSS_URL = new URL('./phone-sea.css', import.meta.url).href;
// 14 Nov 2026, Simon: the sea and the wake are both cut from the 3D scene: the open water of the harbour approach (seamless), and the main site's own wake
// (cut from a frame of the 3D scene: white with its own transparency, bow to the right, the hull's place in it below)
const SEA_URL = new URL('./phone-sea.jpg', import.meta.url).href, SEA_W = 540, SEA_H = 580, SEA_SCALE = 0.75;   // 14 Nov 2026, Simon: the harbour scene's sea everywhere (a seamless patch cut from a frame of it), at about its own size
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
  document.documentElement.classList.add('cips-phone-gl');   // the phone layout of the plotter and the footage (phone-sea.css, end)
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
  const root = document.createElement('div'); root.className = 'phs'; root.style.visibility = 'hidden'; css.then(() => { root.style.visibility = ''; });
  root.innerHTML = '<div class="phs-sea"></div><div class="phs-world"><div class="phs-boat"><img class="phs-wk" alt=""><img class="phs-bimg" alt=""></div>'
    + '<div class="phs-ship"><img class="phs-wk" alt=""><img class="phs-img" alt=""></div><img class="phs-man" alt=""></div>'
    + '<div class="phs-shade"></div><div class="phs-cap"><p class="phs-eye"></p><p class="phs-sub"></p></div>';
  stage.appendChild(root);
  const $ = s => root.querySelector(s);
  const sea = $('.phs-sea'), ship = $('.phs-ship'), boat = $('.phs-boat'), man = $('.phs-man'), cap = $('.phs-cap'), eye = $('.phs-eye'), sub = $('.phs-sub');
  sea.style.backgroundImage = `url("${SEA_URL}")`;
  root.querySelectorAll('.phs-wk').forEach(w => { w.src = WAKE_URL; });
  $('.phs-img').src = assets + 'ship-plan.png'; $('.phs-bimg').src = assets + 'pilot-boat.svg'; man.src = assets + 'pilot-man.svg';
  let capShown = null, lastSeen = 0, t0 = performance.now(), lastP = 0;
  // the chart plotter, bottom left, as on a computer (14 Nov 2026, Simon), and the footage above it in the same small window as on a computer, opening small with
  // its Enlarge button (14 Nov 2026, Simon: "the on scene previews should open small to start with and be expandable")
  const plotter = nav ? mountNavPlotter(stage, { GEO: nav.GEO, route: nav.route, markNames: nav.markNames, shipLatLng: () => nav.pos(lastP), headingDeg: () => nav.hdg(lastP), speedKts: () => nav.kn(lastP), compact: true, assetsBase: navAssets }) : null;
  const vm = (plan.clips || []).length ? mountVideoMoment(stage, { moments: plan.clips.map(c => Object.assign({ id: c.file, src: dir + c.file + '.mp4', poster: dir + c.file + '.jpg' }, c)), plotter, reduced }) : null;
  function setCaption(c) {
    if (c === capShown) return; capShown = c; cap.classList.add('phs-out');
    setTimeout(() => { if (capShown !== c) return; eye.textContent = c ? c.eyebrow || '' : ''; sub.textContent = c ? c.sub || '' : ''; if (c) cap.classList.remove('phs-out'); }, 240);
  }
  // the yacht's heading on screen, as the sprite's rotation (bow to the right at 0): 90 = bow down (south). The turn goes the seaman's way round, through east,
  // to -90 = bow up (north) (14 Nov 2026, Simon: no flip; she starts to turn as Special One rounds the breakwater and heads north by the end of the Small Roads)
  const rotAt = q => plan.turn ? 90 + ((plan.turnTo ?? -90) - 90) * ease(seg(plan.turn[0], plan.turn[1], q)) : 90;   // turnTo: where the turn ends (-68 = heading 022, the Small Road lead, as the harbour scene starts)
  // how far the sea has moved past her: the sum of her heading over the scroll so far, so it flows the right way at every point of the turn and never jumps
  function seaOffset(p) { const N = 64, dq = p / N; let x = 0, y = 0; for (let i = 0; i < N; i++) { const r = rotAt((i + 0.5) * dq) * Math.PI / 180; x -= Math.cos(r) * dq; y -= Math.sin(r) * dq; } return [x, y]; }

  let raf = 0;
  function draw() {
    raf = 0; const p = lastP, ts = (performance.now() - t0) / 1000;
    const W = root.clientWidth || innerWidth, H = root.clientHeight || innerHeight;
    const L = Math.min(H * 0.36, 300), B = L * 242 / 1189;   // the yacht's length and beam on screen (ship-plan.png is 1189 x 242, bow to the right); a little smaller since 14 Nov 2026, so the plotter fits bottom left
    const rot = rotAt(p), rr = rot * Math.PI / 180;
    const F = plan.flow || 2600, off = seaOffset(p), drift = reduced ? 0 : ts * 9;
    const tw = SEA_W * SEA_SCALE, th = SEA_H * SEA_SCALE; sea.style.backgroundSize = `${tw.toFixed(1)}px ${th.toFixed(1)}px`;
    sea.style.backgroundPosition = `${((off[0] * F - Math.cos(rr) * drift) % tw).toFixed(1)}px ${((off[1] * F - Math.sin(rr) * drift) % th).toFixed(1)}px`;
    const sway = reduced ? 0 : Math.sin(ts * 0.9) * 0.7, swayX = reduced ? 0 : Math.sin(ts * 0.37) * 3;
    const cx = W / 2 + swayX, cy = H * 0.46;
    const placeWake = (box, len) => { const w = box.querySelector('.phs-wk'), s = len / WAKE.len, bh = box.offsetHeight || len * 0.2; w.style.width = (WAKE.w * s) + 'px'; w.style.height = (WAKE.h * s) + 'px'; w.style.left = (-WAKE.x0 * s) + 'px'; w.style.top = (bh / 2 - WAKE.cy * s) + 'px'; };
    ship.style.width = L + 'px'; ship.style.height = B + 'px'; placeWake(ship, L);
    ship.style.transform = `translate(${(cx - L / 2).toFixed(1)}px,${(cy - B / 2).toFixed(1)}px) rotate(${(rot + sway).toFixed(2)}deg)`;
    // the pilot launch (bow to the right in its svg; it keeps station on the yacht's starboard side, which is screen-left of a southbound yacht)
    if (plan.pilot) {
      const u = seg(plan.pilot[0], plan.pilot[1], p), on = u > 0 && u < 1; boat.style.display = on ? '' : 'none'; man.style.display = on ? '' : 'none';
      if (on) {
        const bl = L * 0.2, bb = bl * 64 / 200, side = -(B / 2 + bb / 2 + 2);   // alongside, just clear of the hull
        const inU = ease(seg(0, 0.32, u)), outU = ease(seg(0.72, 1, u));
        const along = lerp(H * 0.55, L * 0.05, inU) + lerp(0, -H * 0.6, outU);   // comes up from astern (below), holds abreast amidships, then drops back and away
        const ofs = side + lerp(-W * 0.18, 0, inU) + lerp(0, -W * 0.25, outU);
        boat.style.width = bl + 'px'; boat.style.height = bb + 'px'; placeWake(boat, bl);
        boat.style.transform = `translate(${(cx + ofs - bl / 2).toFixed(1)}px,${(cy + along - bb / 2).toFixed(1)}px) rotate(${(90 + 8 * outU - 6 * (1 - inU)).toFixed(1)}deg)`;
        const cross = ease(seg(0.40, 0.58, u)), ms = Math.max(12, L * 0.045);   // the pilot crosses from the launch to the yacht's deck while they are together
        const mx = lerp(cx + ofs, cx - B * 0.15, cross), my = lerp(cy + along, cy + L * 0.05, cross);
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
    setCaption(c);
    if (vm) vm.update(p);
    if (!raf) raf = requestAnimationFrame(draw);
  }
  const watch = setInterval(() => { if (performance.now() - lastSeen > 1500) root.classList.remove('phs-on'); }, 400);
  function destroy() { clearInterval(watch); if (raf) cancelAnimationFrame(raf); vm?.destroy(); plotter?.destroy(); root.remove(); }
  return { update, destroy, root };
}
