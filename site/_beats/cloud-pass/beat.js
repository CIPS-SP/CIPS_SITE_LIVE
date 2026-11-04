/* _beats/cloud-pass/beat.js — descend through a cloud layer: the transition from the globe (above) to the sea (below).
   Technique: unitedcarriers.com "why" section clouds (see reference/unitedcarriers/UC-wake-forensics.html) — seven oversized
   white cut-outs each scaled about its own origin with staggered cinematic eases, a tinted haze layer, two blurred "decor"
   clouds sliding sideways. UC climbs (clouds 8× → 1×, fading in); we descend, so the order is reversed:
     p 0 → inApex   clouds approach: scale 0.55 → 1, fade in, sky darkens into haze  (whiteout reached)
     p inApex → out hold: full cover, slow drift; sea colour fades in underneath
     p out → 1      clouds pass the camera: scale 1 → 7 (each with its own delay), fade out → sea revealed */
import { clamp01, lerp, smooth } from '../runtime/stage.js';
import { buildChannelChart, CHART, GATEWAY, frameAtZoom, screenFraction } from '../_shared/channel-chart.js';
const KINSHIP_APPROACH = { cx: 287, cy: 470 };   // her position on the chart — just clear of the Casquets TSS, altering course for Jersey; tuned to land left, ~40% up from the bottom, matching seaway-wake's ship start (fx 0.06, y 0.5)
const AIS_HEADING = Math.atan2(CHART.jersey.cx - KINSHIP_APPROACH.cx, KINSHIP_APPROACH.cy - CHART.jersey.cy) * 180 / Math.PI;   // bearing from her to Jersey, 0 = up — the course she's just altered onto

export const meta = { order: 3, title: "Chart & cloud — the gateway, then down through cloud", site: "both", summary: "Opens wide on the Channel chart (south coast, London, Cotentin, Brittany, the islands) under the Atlantic Gateway title, zooms to the islands, then clouds close over and we break through to the sea." };
// THE HANDOFF FRAME — tight on Jersey, tuned so screenFraction(CHART.jersey, HANDOFF, W, H) lands at the same screen
// fraction (~0.54, 0.48) where the globe settles the Channel Islands (measured against its current CI_OFFSET/START —
// re-tune this if either changes). The chart opens here (matching the globe exactly, no jump), then pulls back to
// GATEWAY as the clouds close — Jersey visibly slides down-frame as the wider gateway context reveals above it.
const HANDOFF = { cx: 399, cy: 458, vw: 220, offsetX: GATEWAY.offsetX };
export const defaults = {
  chart: true,             // open on the Channel Islands chart (teal islands, dark land) and keep diving while the clouds close
  chartFrom: HANDOFF,      // opening frame: tight on Jersey, aligned with where the globe just left her
  chartToFrame: GATEWAY,   // pulls back to the gateway view (Pendennis/Falmouth, London, the Dutch yards, St Malo) as the clouds close
  chartTo: 0.66,                              // unused while chartToFrame is set — kept as a fallback if chartToFrame is removed
  chartHold: 0.42,         // share of the slice given to the chart alone before the clouds start (the captain's geography lesson)
  title: null,   // the chart itself carries its own title (mid-channel, above Guernsey) — this top-left overlay duplicated it, so it's off
  chartOffsetX: GATEWAY.offsetX,   // chart units; negative moves the map right (shared with the globe's hand-off maths)
  yards: true,             // superyacht yards inside the frame (Feadship, Oceanco, Amels, Pendennis) — short names
  chartIn: 0.18,           // the chart fades in over this share of the slice (over the globe's last frame — no pop)
  inApex: 0.66,            // p at which cover is complete
  out: 0.76,               // p at which the clouds start passing the camera
  maxScale: 7,             // how big a cloud gets as it passes (UC 2–8)
  seaColour: '#02484b',    // what is revealed underneath (matches seaway-wake)
  hazeColour: '#cfe3ea',   // UC: #a686e0 at 30% lilac; ours a cool sea-mist
  copyIn: [0.62, 0.72],    // 'through the cloud' copy during the whiteout
  drift: 1.0,              // sideways drift multiplier during the hold
  dawn: null,              // [pFrom, pTo]: we go INTO the cloud at night and come out in daylight — a night tint over the
                           // clouds fades away across this range (CIPS: after channel-night). null = clouds are daylight throughout
  dawnColour: 'rgba(8,16,40,0.66)'
};
// per-cloud stagger for the break-through, after UC (<=0.2, 0.1, 0.15 … offsets on a 1.2–1.5 s timeline)
const DELAY = { c1: 0.10, c2: 0.00, c3: 0.14, c4: 0.22, c5: 0.06, c6: 0.18, c7: 0.03, c8: 0.26 };   // c8 = top-right, closes the gap where Europe showed
const ease = (t) => { t = clamp01(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }; // cinematicSilk
const smoothEase = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };                            // cinematicSmooth-ish

export async function mount(stage, o, ctx) {
  stage.querySelectorAll('img[data-src]').forEach(i => { i.src = ctx.base + i.dataset.src; });
  const clouds = [...stage.querySelectorAll('.c')], decor = [...stage.querySelectorAll('.d')];
  const sea = stage.querySelector('.sea'), haze = stage.querySelector('.haze'), copy = stage.querySelector('.copy'), sky = stage.querySelector('.sky');
  const layered = !!ctx.layer;   // inside a pinned group: the globe is underneath at p=0 and the real sea underneath at p=1, so our own backdrops must get out of the way
  if (layered) stage.classList.add('layered');
  sea.style.background = o.seaColour; haze.style.background = o.hazeColour;
  let dawnEl = null;
  if (o.dawn) { dawnEl = document.createElement('div'); dawnEl.className = 'dawn'; dawnEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:' + o.dawnColour; stage.insertBefore(dawnEl, copy || null); }
  const chartEl = stage.querySelector('.chart'); let chart = null; const titleEl = stage.querySelector('.title');
  const aisEl = stage.querySelector('.ais');
  const aisTriEl = stage.querySelector('.ais-tri');
  if (aisTriEl) aisTriEl.style.transform = `rotate(${AIS_HEADING.toFixed(1)}deg)`;
  // 4 Nov 2026, Simon: the tag carries the visitor's vessel name (js/vessel.js), Kinship unless they gave one
  const aisTag = stage.querySelector('.ais-tag'), setTag = v => { if (aisTag && v && v.title && aisTag.firstChild) aisTag.firstChild.textContent = v.title; };
  setTag(window.CIPS_VESSEL); window.addEventListener('cips:vessel', e => setTag(e.detail));
  if (titleEl) { if (o.title) { titleEl.querySelector('.beat-eyebrow').textContent = o.title.eyebrow; titleEl.querySelector('.beat-title').textContent = o.title.text; } else titleEl.remove(); }
  if (o.chart && chartEl) buildChannelChart(chartEl, { flights: true, tss: true, towns: true, yards: o.yards }).then(c => { chart = c; chart.offsetX = o.chartOffsetX; }).catch(e => console.warn('[cloud-pass] chart failed', e));
  const t0 = performance.now();
  function update(p) {
    const t = (performance.now() - t0) / 1000;
    const approach = ease((p - o.chartHold) / (o.inApex - o.chartHold)); // clouds only start after the chart has had its hold
    const through = clamp01((p - o.out) / (1 - o.out));                // 0→1 while we pass through
    // part 1: the chart keeps diving toward Jersey while the clouds close over it
    if (chart) { const z = smoothEase(p / (o.inApex * 0.92)); const to = o.chartToFrame || frameAtZoom(o.chartTo);
      const curFrame = { cx: lerp(o.chartFrom.cx, to.cx, z), cy: lerp(o.chartFrom.cy, to.cy, z), vw: lerp(o.chartFrom.vw, to.vw, z), offsetX: o.chartOffsetX };
      chart.frame(curFrame.cx, curFrame.cy, curFrame.vw);   // gateway → islands, finishing as the cover completes
      // fade IN over the globe's last frame (no pop), fade out under the whiteout
      const chartOp = smoothEase(p / o.chartIn) * (1 - smoothEase((p - o.inApex) / (o.out - o.inApex + 0.1)));
      chartEl.style.opacity = chartOp.toFixed(3);
      // AIS-style target: a moving box tracking her real chart position — visible only while the chart itself is,
      // fading out just before the clouds fully close (the real ship takes over visually in seaway-wake)
      if (aisEl) {
        const W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
        const f = screenFraction(KINSHIP_APPROACH, curFrame, W, H);
        aisEl.style.left = (f.x * 100).toFixed(2) + '%'; aisEl.style.top = (f.y * 100).toFixed(2) + '%';
        // hands off to the real ship a little before the clouds actually close, not lingering through the whole cover
        const aisOp = chartOp * (1 - smoothEase((p - o.chartHold * 0.7) / (o.chartHold * 1.15 - o.chartHold * 0.7)));
        aisEl.style.opacity = Math.max(0, aisOp).toFixed(3);
      }
    }
    // backdrop: sky → haze → sea
    // haze only tops up the last gaps at the apex (max .55) — the clouds themselves do the covering, so the chart stays visible through the gaps
    haze.style.opacity = (0.7 * smoothEase((p - o.inApex * 0.7) / (o.inApex * 0.35)) * (1 - smoothEase((through - 0.05) / 0.5))).toFixed(3);
    sea.style.opacity = (smoothEase((p - o.inApex) / (o.out - o.inApex + 0.25)) * (layered ? (1 - smoothEase((through - 0.05) / 0.4)) : 1)).toFixed(3);
    if (sky) sky.style.opacity = layered ? (smoothEase(p / o.chartIn) * (1 - smoothEase((p - o.inApex) / (o.out - o.inApex)))).toFixed(3) : '1';   // dark backdrop arrives with the chart (the globe is faded out by the runtime: fadePrev)
    if (titleEl) { const tIn = smoothEase(p / 0.12) * (1 - smoothEase((p - o.chartHold) / (o.inApex - o.chartHold) * 1.2)); titleEl.style.opacity = tIn.toFixed(3); }
    clouds.forEach((c, i) => {
      const k = 'c' + (i + 1), d = DELAY[k] || 0;
      const thr = ease((through - d) / (1 - d * 0.6));                // each cloud breaks through on its own delay
      const scale = lerp(0.5, 1.18, approach) * lerp(1, o.maxScale, thr);   // overshoot past 1 so the seven overlap into full cover
      const driftX = Math.sin(t * 0.12 + i) * 1.2 * o.drift, driftY = Math.cos(t * 0.09 + i * 1.7) * 0.8 * o.drift;
      c.style.transform = `translate(${driftX}%,${driftY}%) scale(${scale.toFixed(3)})`;
      c.style.opacity = (Math.pow(approach, 0.7) * (1 - smoothEase(thr))).toFixed(3);
    });
    decor.forEach((dcl, i) => {                                        // UC decor: slide in from the side, blur, then away
      const dir = i === 0 ? -1 : 1;
      const x = lerp(dir * 40, dir * -12, approach) + lerp(0, dir * 60, through);
      dcl.style.transform = `translateX(${x}vw) scale(${lerp(0.8, 1, approach)})`;
      dcl.style.opacity = (0.35 * approach * (1 - through)).toFixed(3);
    });
    if (copy) { const c = clamp01((p - o.copyIn[0]) / (o.copyIn[1] - o.copyIn[0])) * (1 - smoothEase((through - 0.3) / 0.4)); copy.style.opacity = c.toFixed(3); }
    if (dawnEl) dawnEl.style.opacity = (1 - smoothEase((p - o.dawn[0]) / (o.dawn[1] - o.dawn[0]))).toFixed(3);   // night → day inside the cloud
  }
  return { update, resize() {}, destroy() {}, exit() { return { seaColour: o.seaColour, altitude: 'low' }; } };
}
