/* _beats/noirmont-transit/beat.js — Chapter 1 scene 1, ported into the live site: pilot already aboard
   (boarded in the seaway-wake game, not here), the real-time sea continues past Noirmont Point into St Aubin's
   Bay, Elizabeth Castle off the bow, picking up the leading line for the Small Roads. Scroll-only — no hands-on
   mechanic, no door (Simon: "i think this scene can be a scrolled only segment").
   29 Sep 2026, Simon: brings Chapter 1 scene 1 (_beats/tools/proto/chapter1.html's own "transit" scene, already
   settled there) into the real site, continuing straight on from seaway-wake rather than a fresh crossing —
   same real sea (../_shared/sea-wake.js, extracted from seaway-wake/beat.js for this), same hull, same plotter
   geography. The yaw/turn-around camera move that used to end seaway-wake (matching berth-arrival's opening
   drone-footage frame) now happens at the END of THIS beat instead — seaway-wake hands off mid-crossing, this
   beat does the turn. Sandbox: demo.html. */
import * as THREE from 'three';
import { clamp01, lerp, smooth, cinematicSilk } from '../runtime/stage.js';
import { scoreAt } from '../_shared/zoom-score.js';
import { phoneFilm } from '../_shared/phone-film.js';   // 13 Nov 2026: the lighter journey for phones (see o.phone)
import { mountNavPlotter } from '../_shared/nav-plotter.js';
import { mountVideoMoment } from '../_shared/video-moment.js';
import { createWakeSimulation, makeOcean, WAKE_FRAG, BOUNDS, SHIP_LENGTH_WORLD, setWakeParams, PAGE_T0 } from '../_shared/sea-wake.js';
// GEO/CFG: the same real pilotage data seaway-wake's own beat.js and game.js already read, physically living in
// that beat's own folder — a cross-beat import of pure geography DATA (not code, not DOM), same low-risk pattern
// already used for the sea/wake extraction. Not duplicated here on purpose: one source of truth for the chart.
import { GEO } from '../seaway-wake/game/geography-data.js';
import { CFG } from '../seaway-wake/game/config.js';
import { createCoastPlate, placeCoastPlateNorthUp, SW_PLATE_FEATHER } from '../_shared/coast-plate.js';
import { mountTiltShift } from '../_shared/tilt-shift.js';
import { lightPhase } from '../_shared/nav-light.js';
import { registerSea } from '../_shared/sea-advect.js';
import { ROUTE, NOIRMONT_END } from '../_shared/st-helier-route.js';
import { SIGNAL_TIPS, createEntranceSignals, abeamPlatte } from '../_shared/entrance-signals.js';   // 4 Oct 2026: the route (and where this beat stops on it) now lives in _shared so st-helier-approach starts on exactly the same one

export const meta = { order: 4.5, title: "Noirmont transit — round to the Small Roads", site: "both",
  summary: "Pilot already aboard (from the seaway-wake game), the real-time sea continues past Noirmont Point into St Aubin's Bay, Elizabeth Castle off the bow, picking up the leading line for the Small Roads." };
export const needs = ['yachtScreen'];   // seaway-wake's own handoff — where she is, how big, which way she's pointing, when this beat opens
export const defaults = {
  // 26 Oct 2026, Simon: real footage in a viewport above the plotter, plays by itself (see _shared/video-moment.js and DOCS/PLAN-journey-video-moments.md). from/to are this beat's own p; `file` is in site/videos/journey/. Pass videoMoments:[] (or video:false) to switch it off.
  videoMoments: [
    { id:'bay-and-small-roads', file:'journey-2-bay-and-small-roads', title:'Small Roads', from:0.87, to:0.995, finish:true, hold:455 },   // hold: the window carries on 455 viewport heights past the end of this beat, into st-helier-approach, to just after the yacht has passed the No 4 channel marker (abeam at about 4480vh of the page; Simon, 31 Oct 2026); it loops inside the window and plays out when the window closes
  ],
  wakeIntensity: 0.55, wakeRun: 1.8, bob: 0.22, shipSpeed: 40, flow: 0.5, sunElevation: 55, wakeCenterY: 0,
  shipX: NOIRMONT_END.shipX,      // (values shared with st-helier-approach, which picks up from where this stops) continuing on, not crossing side to side like seaway-wake — stays roughly centred, drifting slightly so the final yaw has somewhere to pivot
  shipEase: NOIRMONT_END.shipEase,
  zoomEnd: 0.9,            // how close in she gets by p=1 — only reached over the final yawFrom→1 stretch now; she holds the wide opening framing through the whole real transit before that (see update())
  yaw: 191.8,              // 2 Oct 2026: was 177 — +14.8° to cancel the final leg now bearing 024° not 039° (see ROUTE[4]), so berth-arrival still receives the same final hull heading. Moved here from seaway-wake's own options (index.html) — see file header. Added ON TOP of her real accumulated course change at yawFrom, not a flat spin from zero — see update()
  yawFrom: 0.80,
  heading: 'east',
  // 3 Oct 2026, Simon: "lets end noirmont beat at the point where it is currently p80%, thats where we will transition into the next
  // beat, as the zoom in starts." endAt maps this beat's own 0..1 onto the old 0..endAt: the real route/pacing up to that point is
  // exactly what it was, but the beat now STOPS there — the cinematic yaw and the zoom-in (old p 0.8->1, = yawFrom) are no longer
  // part of it, and exit() hands the next beat the wide, un-zoomed pose. yaw/yawFrom/zoomEnd are therefore inert now (kept so a
  // longer endAt still behaves as before). index.html's track is cut from 1600vh to 1280vh (1600*0.8) so scroll speed is unchanged.
  endAt: NOIRMONT_END.endAt,
  // 13 Nov 2026: the lighter journey for phones (see seaway-wake and _shared/phone-film.js)
  phone: [
    { from: 0.00, to: 1.01, file: 'journey-2-bay-and-small-roads', title: 'Small Roads', eyebrow: 'The Small Roads', sub: 'up the Small Road between the Platte and the castle, then onto the leading line for the harbour.' },
  ],
  copyIn: [0.08, 0.20],
  // p-ranges each landmark label is visible over — see landmarkScreen() for how its on-screen position is worked out
  // 1 Oct 2026, Simon: "the current 'noirmont point' text on the plate moves with the vessel and is in the
  // wrong place... if we're renaming portelet ledge to noirmont point we can drop the existing incorrect label"
  // — dropped. The real Noirmont Point mark (now correctly named, see NAVAID_NAMES/seamarks.json above) replaces
  // it with a true 3D-projected position instead of this stylised bearing-offset text.
  landmarks: {
    // 29 Sep 2026: Elizabeth Castle had no charted position in this codebase, so it started as an approximate
    // guess ([49.1854,-2.1189] — which is actually up in the harbour). 2 Oct 2026: re-read off the new z18 imagery
    // — the main castle (Upper/Lower Ward, barracks and keep) is centred at 49.1762, -2.1256. Now projected from
    // that real position (see update()), so the visible window is just a fade; the on-screen test does the rest.
    castle: { at: [49.1762, -2.1256], show: [0.15, 1.5] },   // fades in only; the beat now ends (p=1 = old 0.8) with the castle still on screen
  },
  resolution: 384,         // as seaway-wake
  forceStatic: false,
  textures: null,          // {normal, sky} overrides; default = this beat's own assets/
  // 1 Oct 2026, Simon: "you cant see the coastline... no nav aids showing" — both ported from seaway-wake's own
  // already-proven technique (same real Esri plate, same shared coast-plate.js; the plate's own bounds cover
  // this whole route — checked directly against wide-plate.json, not assumed). coastScale:1 = true physical
  // scale, same reasoning as seaway-wake's own (see that beat's history for why not a by-feel compression).
  coast: true,
  coastScale: 1,
  navAids: true,
};
// 1 Oct 2026, Simon: "the route goes way too fast" — 94.3 was a flat, by-feel constant (the same kind of
// mismatch seaway-wake's own MAX_DISTANCE used to have before being fixed — see that beat's history). Computed
// properly now: CFG.open.visH/(2*tan(fov/2)) is game.js's own real wide-opening camera height, not a guess — and
// a camera that can actually reach the coastline's real distance is also a precondition for coast/navAids above
// ever coming into frame at all, not just a cosmetic change.
const MAX_DISTANCE = CFG.open.visH/(2*Math.tan(THREE.MathUtils.degToRad(CFG.fov/2)));
const M_PER_UNIT = 70*CFG.exaggerate/SHIP_LENGTH_WORLD, NM_PER_UNIT = M_PER_UNIT/1852;

// 1 Oct 2026, Simon: "vessel passing straight through the raudiere and on wrong side of east rock" — right.
// GEO.pilotage.slice(3) (the old ROUTE) names its waypoints AFTER these buoys, but placed each one AT the
// buoy's own exact charted position — a course that literally passes through them, not safely to the side the
// syllabus actually specifies (Pilotage-directions-and-general-syllabus-and-information-for-Jersey.pdf,
// sections 4 "Western Passage" and 6 "Small Road Passage"). Rebuilt from the syllabus's own real bearings +
// clearing/beam distances, cross-checked against the real charted buoy positions (seamarks.json) before
// trusting them: Diamond/Ruaudière's real perpendicular separation on the 082° line works out to 0.396nm
// against the syllabus's own stated 0.3+0.1=0.4nm; Ruaudière-to-East-Rock real distance is 0.892nm against the
// syllabus's stated 0.9nm; the real bearing Noirmont Point -> Ruaudière Buoy is 100.6°, the reciprocal of the
// syllabus's own "Noirmont & Ruaudière in transit 280°T" (the Small Road's own stated starting transit) — all
// three independent checks landed within 1% of the syllabus's own numbers, so the reconstruction below is
// built on real, cross-validated geometry, not a guess:
//   - through the Diamond/Ruaudière gate — Diamond kept 0.3nm to port, Ruaudière 0.1nm to starboard, never
//     through either (route[1]). First pass also added a separate "merge onto the 082° line" waypoint right
//     after the handoff, computed as Start's own perpendicular projection onto that line — Start is genuinely
//     0.233nm south of it, but projecting onto it as a distinct waypoint sent her south first, then sharply
//     back north-east, a real zigzag, not a smooth merge. Dropped: a direct Start->gate leg already bears 88°
//     (vs the 082° target) without any artificial dogleg, and the syllabus's own text only asks for the
//     transit to be joined "before coming abeam of Noirmont Point" — gradually, not via a sharp intermediate
//     corner.
//   - through the East Rock gate — 0.05nm to starboard — on the Small Road's own 022°/202° line (route[2]).
//     2 Oct 2026, Simon: "theres a dog leg in the route there which I think could be an error" — right. First
//     pass also inserted an intermediate waypoint 0.15nm past Ruaudière along the real Noirmont/Ruaudière
//     100.6° transit bearing, reading "the Leading Marks can be opened slightly to the South" as a literal
//     course to steer — that point sits south of BOTH its neighbours (checked directly: its own latitude is
//     lower than the gate before it AND the gate after it), a real dip the plotter's own straight-line planned
//     track then drew as a visible dogleg, no amount of corner-rounding on the ship's own path removes a
//     waypoint genuinely out of line. Re-read: "opening" leading marks is standard terminology for drifting
//     slightly off the exact leading line (a cross-track position cue), not a course bearing of 100°+ to
//     steer — the real Noirmont/Ruaudière transit (still a solid, cross-checked fact) marks WHERE the Small
//     Road passage begins, not a leg to travel along. Goes directly from the Western Passage gate to the Small
//     Road gate now; the existing corner-rounding handles the one real ~60° turn between them as a single
//     smooth curve instead of two sharp ones either side of an out-of-line point.
//   - route[3]: 2 Oct 2026, Simon: "turn to 90deg and then head straight for the buoy, ending up on top of it" —
//     the old route[3] here ([49.1814,-2.1119]) was unverified GEO.pilotage tail, carried over as-is; checked
//     directly against the real Platte Beacon position identified earlier (see NAVAID_UNNAMED) and it sits
//     0.834nm away — nowhere near the real Small Road line at all. Replaced with the real Platte Beacon
//     projected onto that same 022° line (0.063nm off it — close, consistent with the syllabus repeatedly using
//     Platte Beacon itself as a leading-mark reference). This wasn't actually the full story, though — see
//     ROUND below for the other half of the fix.
//   - route[4]: 2 Oct 2026 — was the unverified GEO.pilotage tail [49.1824,-2.1044]. The new harbour imagery
//     (see the coast plates below) made it obvious that point is ~1 km inland, up at Fort Regent: the old final
//     leg ran straight across La Collette and the town. Replaced with a point just inside the St Helier harbour
//     entrance (between the two pier heads), read off the new z18 imagery and checked against the route: it
//     sits on bearing 024.0° from the Platte Beacon fix, i.e. right on the Small Road's own 022° line carried on
//     into the Pier Head, so the last leg is the same passage continued rather than a new course. Shorter leg
//     (~0.55 nm, was ~1.04), final heading 024° (was 039°) — `yaw` below is raised by the same 14.8° so the
//     hull's final pose handed to berth-arrival is unchanged.
// ROUTE itself: see _shared/st-helier-route.js (imported above) — the account of each waypoint stays here, beside the beat that first used it.
// 1 Oct 2026, Simon, second pass: "what you've called portelet ledge we can rename noirmont point (as per the
// plotter)" — right: GEO.marks (the small, hand-curated list) had this light labelled "Portelet Ledge", but the
// richer seamarks.json (the same real OSM seamark data the plotter's own chart already draws from — fetched
// below) names the identical lat/lng "Noirmont Point", light Fl(4)12s — that's the real name, GEO.marks' own
// label was simply wrong, not a style choice. Switched the nav-aid mark source to seamarks.json entirely: it
// also has Pignonet (missing before), Platte, and proper light-character/cardinal-category tags for all of
// them, which GEO.marks doesn't carry at all. Picked by name, not a blind radius, after checking every mark
// within this route's own real bounding box directly — a spread along the whole transit (not just the opening),
// so new ones keep appearing "as we get close" per Simon's own ask, without crowding the final St Helier
// approach (E1-E6/Fort Charles/the harbour cluster — left for a future, closer-in beat).
// 1 Oct 2026, Simon, second pass: "find oyster rocks and platte rk... make sure they are shown" — "Platte" above
// was the WRONG real mark: the syllabus names at least three distinct "Platte"-ish features in Jersey waters
// (Platte Beacon near the harbour approach, La Rousse Platte near St Aubin, Platte Houmet near St Brelade's
// Bay) and seamarks.json's only mark actually NAMED "Platte" is the St Aubin one (~1.5nm west of Elizabeth
// Castle — nowhere near the breakwater Simon's own chart snip shows). The real Platte Beacon and Oyster Beacon
// both exist in seamarks.json, just without name tags — identified by matching their own real characteristics
// against the syllabus, not guessed: an unlit search turned up nothing named, so NAVAID_UNNAMED below cross-
// checks position + light-character instead. See its own comment for the two independent distance checks that
// confirm this.
const NAVAID_NAMES=['Noirmont Point','Les Fours','Pignonet','Diamond','Ruaudière','East Rock',"Dog's Nest Rock",'No 2','No 4'];   // 22 Oct 2026, Simon: Dog's Nest Rock "appears randomly once we're in the small roads" — it was only in the next beat's list, so it popped in at the hand-over. It is charted 0.4 nm east of East Rock, so it now shows from here, as soon as it is in frame. No 2 and No 4 (the red port channel buoys on the Small Road, circled by Simon on the Admiralty chart) are in this beat's list too, so they do not pop in at the hand-over either
// unnamed-in-the-data marks identified by their own real position + characteristics: Platte Beacon's light
// (Fl.R.1.5s.6m.5M, syllabus 9.16-9.17) matches this exact unnamed light_minor entry's own tags precisely, and
// its distance to the real "No 2" buoy (0.238nm here) lands within 4% of the syllabus's own stated "Platte
// Beacon to No.2 Buoy: 0.23nm" — Oyster Beacon's own position (red/white beacon_special_purpose, syllabus
// 9.13-9.15) gives 0.113nm to this same Platte candidate against the syllabus's stated 0.15nm, a looser but
// still directionally consistent match.
const NAVAID_UNNAMED=[
  { match:[49.1693333,-2.1224333], as:'Platte Beacon' },
  { match:[49.1683014,-2.1248513], as:'Oyster Beacon' },
];
// 1 Oct 2026, Simon, second pass: "i dont like the look of the cardinal icons... make them thinner and make sure
// the cardinal is on top of them (similar to whats in the plotter)" — the first version was a wide disc with a
// soft glow behind it, nothing like the plotter's own actual symbol. Ported game.js's own drawSeamark() pillar
// construction directly instead (game.js:938-944: a narrow 4x7 banded rect with two topmark cones drawn ABOVE
// it, never a circle) — same proportions, scaled x3 for this icon's own larger size, so this genuinely matches
// "whats in the plotter" rather than a separate invention. Cones (the actual cardinal-direction symbol) are
// painted after the pillar in the same draw order the plotter uses, so they sit visually on top/above it, not
// merged into a disc.
function cardinalIcon(category){
  const up=category==='north', down=category==='south', base=category==='east';
  const bands=up?['#111','#f4c20d']:down?['#f4c20d','#111']:base?['#111','#f4c20d','#111']:['#f4c20d','#111','#f4c20d'];
  const x=24, y=32, bh=21/bands.length;
  const rects=bands.map((c,i)=>`<rect x="${x-6}" y="${(y-6+i*bh).toFixed(1)}" width="12" height="${bh.toFixed(1)}" fill="${c}"/>`).join('');
  // 3 Oct 2026, Simon: "make just the cones on top bigger, 25%" — cones scaled by CK about their own base line (pillar
  // untouched); the upper cone's offset grows by the same factor so the pair keeps its original spacing/relationship.
  const CK=1.25, ch=7.8*CK, cw=6.6*CK;
  const cone=(cy,upward)=> upward
    ? `<path d="M${x} ${(cy-ch).toFixed(1)} L${(x+cw).toFixed(1)} ${cy.toFixed(1)} L${(x-cw).toFixed(1)} ${cy.toFixed(1)} Z" fill="#111" stroke="#fff" stroke-width=".7"/>`
    : `<path d="M${x} ${cy.toFixed(1)} L${(x+cw).toFixed(1)} ${(cy-ch).toFixed(1)} L${(x-cw).toFixed(1)} ${(cy-ch).toFixed(1)} Z" fill="#111" stroke="#fff" stroke-width=".7"/>`;
  const c1=y-9, c2=y-9-9*CK;
  const cones = up ? cone(c1,true)+cone(c2,true) : down ? cone(c1,false)+cone(c2,false)
    : base ? cone(c2,true)+cone(c1,false) : cone(c1,true)+cone(c2,false);
  return `<svg viewBox="0 0 48 48" width="25.9" height="25.9">${rects}${cones}</svg>`;
}
// "Fl(4)12s" style label from the mark's own real light:character/group/period tags, same notation as Corbière's
// own "Iso WR 10s" label already uses.
function lightLabel(m){
  const ch=m['light:character']; if(!ch) return '';
  const grp=m['light:group'], per=m['light:period'];
  return ch+(grp&&grp!=='1'?'('+grp+')':'')+(per?per+'s':'');
}

// 1 Oct 2026, Simon: "the movement of the vessel during transition from seaway into noirmont is not smooth" —
// two real, separate causes, both fixed here and in BASE_HEADING below. (1) There genuinely IS a real course
// change at the handoff waypoint (seaway-wake's own final leg runs ~110° true; this beat's own first leg runs
// ~91° true) that had no corner-rounding at all — a real, if modest, turn met head-on with a snap, same root
// issue seaway-wake's own turns had before that beat's own corner-rounding (ALL_PTS/posAtIdx, ported verbatim
// below) was added. (2) the displayed hull rotation was separately resetting to 0 at this beat's own p=0
// regardless of whatever rotation it had an instant before, at the end of seaway-wake — see BASE_HEADING, below.
// PREV_BRG/PREV_PT: a synthetic point one small step back along the REAL incoming bearing (GEO.route's own last
// leg, WP3->WP4 — the actual course she was on, not guessed), so the very first corner can round against a real
// prior direction even though p=0 must land exactly on the waypoint (no preamble budget to spare the way
// seaway-wake's own PRE_START has). That first corner's own window is asymmetric (full "incoming" weight right
// at p=0, easing to pure "outgoing" by idx=1+2*BOUND_ROUND) rather than centred like the internal ones, so
// headingAt(0) lands close to seaway-wake's own real ending heading from the first instant, not an average of
// the two.
const PREV_BRG=(()=>{ const a=GEO.route[GEO.route.length-2], b=GEO.route[GEO.route.length-1], cosLat=Math.cos(a[0]*Math.PI/180);
  return ((Math.atan2((b[1]-a[1])*cosLat,b[0]-a[0])*180/Math.PI)+360)%360; })();
const PREV_PT=(()=>{ const [lat,lng]=ROUTE[0], cosLat=Math.cos(lat*Math.PI/180), rel=(PREV_BRG+180)*Math.PI/180;
  return [lat+(0.3/60)*Math.cos(rel), lng+(0.3/60/cosLat)*Math.sin(rel)]; })();
const ALL_PTS=[PREV_PT, ...ROUTE];
const N_IDX=ALL_PTS.length-1;   // idx 1 = ROUTE[0] (p=0) ... idx N_IDX = ROUTE's own last point (p=1)
function idxCruise(pp){ return 1+clamp01(pp)*(N_IDX-1); }
// 1 Oct 2026: ROUND dropped from seaway-wake's own 0.3 — this beat's new, syllabus-derived legs are far less
// uniform in real length than seaway-wake's own, and a fixed idx-radius window overshoots on a short leg next
// to a long one. 2 Oct 2026, Simon again: "turn to 90deg and then head straight for the buoy" — a flat 0.12 was
// STILL overshooting (COG swung to 110° approaching route[4], a real 85°+ departure from either leg's own
// bearing). First fix tried: cap the idx-radius per corner so neither adjacent leg is extrapolated more than a
// fixed real distance (roundOf(), below this comment in history). That shrank the overshoot but didn't remove
// it — re-tested live against the gate022/Platte corner (a 0.843nm leg next to a 0.172nm leg, ~5x) and the COG
// still wrapped clean through north (341°/335° readings) for a few % of p. Root cause isn't the window SIZE at
// all: posAtIdx was blending two LINES that are each parametrized by the same idx, but idx is 1.0 per leg
// regardless of real length — so the incoming line (long leg) sweeps real distance per idx unit far faster than
// the outgoing line (short leg) does. Lerping between two lines moving at very different real speeds, weighted
// by a shared idx-based smoothstep, can geometrically loop back on itself near the corner (confirmed directly:
// the blended longitude reverses direction twice right at the corner, a genuine backtrack, not a heading-
// sampling artifact) — the more extreme the leg-length ratio, the worse the loop. No idx-radius choice fixes
// this; the blend technique itself was wrong for unevenly-spaced waypoints.
// Replaced with a standard quadratic-Bézier fillet: offset real-distance r back from the corner along the
// incoming leg (point A) and r forward along the outgoing leg (point B), then blend A -> corner -> B via a
// quadratic Bézier parametrized by its own local t in [0,1] — tangent to both straight legs at its ends, and
// (being a simple quadratic, not two lines moving at different idx-speeds) geometrically cannot loop. r is
// capped so neither adjacent leg is ever eaten by more than ROUND_FRAC of its own length, so a short leg next
// to a long one still gets a small, well-behaved fillet instead of needing retuning by feel.
const ROUND_CAP_NM=0.15, ROUND_FRAC=0.4, BOUND_ROUND=0.25;
function legNm(i){ const a=ALL_PTS[i], b=ALL_PTS[i+1], cosLat=Math.cos(a[0]*Math.PI/180);
  return Math.hypot((b[0]-a[0])*60,(b[1]-a[1])*60*cosLat); }
function radiusAt(k){ return Math.min(ROUND_CAP_NM, ROUND_FRAC*legNm(k-1), ROUND_FRAC*legNm(k)); }
function lineAt(i,idx){ const t=idx-i; return [lerp(ALL_PTS[i][0],ALL_PTS[i+1][0],t), lerp(ALL_PTS[i][1],ALL_PTS[i+1][1],t)]; }
function posAtIdx(idx){
  const c=Math.max(1,Math.min(N_IDX,idx));
  if(c<1+2*BOUND_ROUND){   // the boundary corner: asymmetric, see comment above — tested separately, no loop-back (short fixed 0.3nm leg, not this bug's shape)
    const pin=lineAt(0,c), pout=lineAt(1,c), w=smooth(1,1+2*BOUND_ROUND,c);
    return [lerp(pin[0],pout[0],w), lerp(pin[1],pout[1],w)];
  }
  for(let k=2;k<N_IDX;k++){   // internal corners: quadratic-Bézier fillet, real-distance-offset either side
    const r=radiusAt(k), rIdxIn=r/legNm(k-1), rIdxOut=r/legNm(k);
    if(c>k-rIdxIn && c<k+rIdxOut){
      // A/B via lineAt (fraction-along-leg) rather than hand-rolled direction vectors — lineAt already carries
      // the right lat/lng units from ALL_PTS itself, no separate cosLat/NM conversion to get wrong.
      const corner=ALL_PTS[k], A=lineAt(k-1, k-rIdxIn), B=lineAt(k, k+rIdxOut);
      const t=smooth(k-rIdxIn, k+rIdxOut, c), omt=1-t;
      return [omt*omt*A[0]+2*omt*t*corner[0]+t*t*B[0], omt*omt*A[1]+2*omt*t*corner[1]+t*t*B[1]];
    }
  }
  const i=Math.min(N_IDX-1,Math.floor(c)), t=c-i;
  return [lerp(ALL_PTS[i][0],ALL_PTS[i+1][0],t), lerp(ALL_PTS[i][1],ALL_PTS[i+1][1],t)];
}
function shipLatLngAt(pp){ return posAtIdx(idxCruise(pp)); }
// 1 Oct 2026: same fix as seaway-wake's own headingAt — at pp exactly 1, clamping the forward sample to
// Math.min(1,pp+H_STEP) made both samples the same point (a zero vector), reading a bogus 000 heading for that
// one instant. Steps backward instead once the forward sample would've clamped.
// 2 Oct 2026, Simon: "the turn [[at the handoff from seaway-wake]] is 'blocky' not swept and smooth" — found
// live: headingAt(0) itself (not just the wake/rotation-snap fixes already made today) was reading ~17.4°
// against BASE_HEADING, not seaway-wake's own true ending ~19.96° — a real ~2.6° jump right at the boundary.
// Root cause: the forward-difference step (0.01 of this beat's own p) is a LARGE fraction of the boundary
// corner's own blend window (idx [1, 1+2*BOUND_ROUND] = p [0, 0.125] — the corner's own smoothstep blend has
// zero slope exactly at its start, so the TRUE tangent at p=0 is the pure incoming bearing, but a step that
// large already samples real curvature a little way into the blend, undershooting it. Numerically confirmed:
// shrinking the step converges cleanly on the true ~19.96° (0.01 step -> 17.37°, 0.001 step -> 19.93°). Smaller
// step, more accurate everywhere this is used (COG display, landmark bearings, realTurn) — H_STEP=0.001 trades
// a little floating-point margin (still ~8m real-world separation between samples, nowhere near precision
// limits) for a materially closer match at the one spot it was visibly off.
const H_STEP=0.001;
function headingAt(pp){
  const back=pp>1-H_STEP, a=shipLatLngAt(back?pp-H_STEP:pp), b=shipLatLngAt(back?pp:pp+H_STEP), cosLat=Math.cos(a[0]*Math.PI/180);
  return ((Math.atan2((b[1]-a[1])*cosLat,b[0]-a[0])*180/Math.PI)+360)%360;
}
// bearing + NM distance from the ship's own position at pp to a real lat/lng — flat-earth is fine at these ranges
function bearingDistTo(pp, latlng){
  const a=shipLatLngAt(pp), cosLat=Math.cos(a[0]*Math.PI/180);
  const dLat=(latlng[0]-a[0])*60, dLng=(latlng[1]-a[1])*60*cosLat;   // NM north, NM east
  return { brg:((Math.atan2(dLng,dLat)*180/Math.PI)+360)%360, nm:Math.hypot(dLat,dLng) };
}

export async function mount(stage, o, ctx){
  setWakeParams(o.wakeRun, o.wakeIntensity);
  const canvas=stage.querySelector('canvas.socean'), shipEl=stage.querySelector('.sship'), shipImg=shipEl.querySelector('img'), copyEl=stage.querySelector('.scopy');
  // 29 Oct 2026 (performance): the canvas size is read once when it changes (and in resize()), not from the DOM every time it is needed in a frame: those reads forced the browser to recalculate the page layout each time.
  const CS = { w: 0, h: 0 }; { const csRead = () => { CS.w = canvas.clientWidth; CS.h = canvas.clientHeight; }; csRead(); new ResizeObserver(csRead).observe(canvas); }
  const landmarkEls={}; stage.querySelectorAll('[data-landmark]').forEach(el=>{ landmarkEls[el.dataset.landmark]=el; });
  const assets=o.textures||{normal:ctx.base+'assets/water-normal.png', sky:ctx.base+'assets/sky-env.png'};
  if(!shipImg.getAttribute('src')) shipImg.src=ctx.base+'assets/ship-plan.png';
  const EAST=o.heading==='east'; shipImg.style.transform=EAST?'none':'rotate(90deg)'; stage.classList.toggle('east',EAST);
  stage.querySelector('.sfallback')?.style.setProperty('background-image',`url(${ctx.base}assets/sea.jpg)`);
  // picks up seaway-wake's own on-screen hull size exactly — no jump-cut at the handoff
  const hs=ctx.handoff.yachtScreen;
  if(ctx.handoff.yachtScreenPx) shipEl.style.width=ctx.handoff.yachtScreenPx+'px'; else shipEl.style.width='48.7rem';
  const coarse=matchMedia('(pointer: coarse)').matches;
  const smallPhone = coarse && Math.min(innerWidth, innerHeight) <= 480;
  const mobile = smallPhone || o.forceStatic === true;
  if(mobile){ console.warn('[noirmont-transit] static fallback: viewport ≤767px'); stage.classList.add('nogl'); return staticCtrl(stage,shipEl,copyEl,o,ctx); }
  if(ctx.reduced){ o=Object.assign({},o,{bob:0, flow:Math.min(o.flow,0.3)}); }

  let renderer; try{ renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'}); if(!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required for the wake simulation'); }
  catch(e){ console.warn('[noirmont-transit] static fallback: WebGL unavailable —', e && e.message); stage.classList.add('nogl'); return staticCtrl(stage,shipEl,copyEl,o,ctx); }
  renderer.setPixelRatio(1); renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.setClearColor(0x02484b,1);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(35,1,0.1,5000); camera.up.set(EAST?1:0, EAST?0:1, 0);
  scene.add(new THREE.AmbientLight(0xffffff,.9));
  const SUN_EL=THREE.MathUtils.degToRad(o.sunElevation), SUN_DIST=60;
  const sun=new THREE.DirectionalLight(0xfff4e0,5.5); sun.position.set(-Math.cos(SUN_EL)*SUN_DIST,Math.sin(SUN_EL)*SUN_DIST,0); scene.add(sun);
  const RES = (coarse || innerWidth <= 900) ? 192 : o.resolution;
  const wake=createWakeSimulation(renderer,{resolution:RES,bounds:BOUNDS,shipWidth:2.2/BOUNDS,shipLength:SHIP_LENGTH_WORLD/BOUNDS,shipSpeed:o.shipSpeed,wakeIntensity:o.wakeIntensity});
  const loader=new THREE.TextureLoader();
  const [normalMap,skyTex]=await Promise.all([loader.loadAsync(assets.normal),loader.loadAsync(assets.sky)]);
  normalMap.wrapS=normalMap.wrapT=THREE.RepeatWrapping; normalMap.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy()); normalMap.generateMipmaps=true; normalMap.minFilter=THREE.LinearMipmapLinearFilter;
  skyTex.mapping=THREE.EquirectangularReflectionMapping; skyTex.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer); const envMap=pmrem.fromEquirectangular(skyTex).texture; pmrem.dispose(); scene.environment=envMap;
  const {mat,uni}=makeOcean(wake,normalMap,envMap,RES);
  uni.uFlow.value=o.flow;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000,150,150),mat); plane.rotation.x=-Math.PI/2; scene.add(plane);

  // coastline (1 Oct 2026) — same real Esri plate + shared coast-plate.js technique as seaway-wake, same
  // north-up convention (worldOffsetTo ported verbatim: north=world +X=screen up, east=world +Z=screen right,
  // matching this camera's own EAST-heading setup). wide-plate.webp's own bounds (checked directly against
  // wide-plate.json) cover this whole route already — no new imagery needed.
  function worldOffsetTo(pp, latlng){
    const {brg,nm}=bearingDistTo(pp,latlng), rel=brg*Math.PI/180;
    const d=(nm/NM_PER_UNIT)*o.coastScale;
    return [ Math.cos(rel)*d, Math.sin(rel)*d ];
  }
  const coastMeshes=[];
  function addCoastPlate(src, wPx, hPx, mPerPx, bounds, order, feather){
    const plate=createCoastPlate(scene, renderer, {src, wPx, hPx, mPerPx, mPerUnit:M_PER_UNIT, bounds, order, scale:o.coastScale, feather});
    plate.m.rotation.set(-Math.PI/2, -Math.PI/2, 0, 'YXZ');
    coastMeshes.push(plate); return plate.m;
  }
  // 2 Oct 2026, Simon, on a screenshot of the harbour approach: "the satelite image of this section needs work...
  // extend the visible area to the east and... sharpen the whole image, with much more detail of the harbour and
  // castle." Three real causes, all in the imagery rather than the code: (1) this beat only ever drew the wide
  // plate (z15, ~6 m/px, hard-cut at lon -2.087) — never the sharper sw-plate seaway-wake itself uses, so the
  // handoff also swapped sharp land for blurry; (2) nothing covered the harbour at the zoom the camera ends on
  // (~0.26 m/px by p=1); (3) the live Esri service has cloud over the harbour at z17+, which is also the white
  // patch visible in the old wide plate. Rebuilt offline from Esri's Wayback archive (release 64001, 2026-02-26,
  // cloud-free) into two tiers of 1024px chunks — bay-z16 (~1.6 m/px, eastward to lon -2.05) and harbour-z18
  // (~0.4 m/px, the closing-in approach) — water cut out by the OSM water mask exactly like the existing plates.
  // ~9 MB / 52 chunks on disk, but only the few near the camera are ever loaded as GPU textures (updatePlates
  // below streams them in/out by distance), since all of them resident would be ~275 MB. Wherever the new chunks
  // take over, the old wide plate is erased at load time (wideWithout) so its blur/cloud can't show through the
  // transparent water of the sharper plates.
  let streamAlive=true; const streamed=[];
  const mercY=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  async function wideWithout(url, mt, rects){
    const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    const cv=document.createElement('canvas'); cv.width=mt.w; cv.height=mt.h; const g=cv.getContext('2d'); g.drawImage(img,0,0,mt.w,mt.h);
    const b=mt.bounds, y0=mercY(b.north), y1=mercY(b.south), X=l=>(l-b.west)/(b.east-b.west)*mt.w, Y=l=>(y0-mercY(l))/(y0-y1)*mt.h;
    for(const r of rects){ const x=X(r.west), y=Y(r.north); g.clearRect(x,y,X(r.east)-x,Y(r.south)-y); }
    return URL.createObjectURL(await new Promise(res=>cv.toBlob(res,'image/png')));
  }
  if(o.coast){
    const seaway=ctx.base+'../seaway-wake/', game=seaway+'assets/game/';
    const jget=u=>fetch(u).then(r=>{ if(!r.ok) throw new Error(u+' '+r.status); return r.json(); });
    jget(ctx.base+'assets/plates/plates.json').catch(e=>{ console.warn('[noirmont-transit] bay plates unavailable — wide plate only',e); return null; }).then(async pl=>{
      const mt=await jget(game+'wide-plate.json'); let src=game+mt.file;
      if(pl){ try{ src=await wideWithout(src,mt,pl.coverage); }catch(e){ console.warn('[noirmont-transit] wide-plate erase failed',e); } }
      if(!streamAlive) return;
      addCoastPlate(src, mt.w, mt.h, mt.mPerPx, mt.bounds, 1);
      const sw=await jget(game+'sw-plate.json'); if(!streamAlive) return;
      addCoastPlate(seaway+GEO.plate.src, sw.w, sw.h, sw.mPerPx, sw.bounds, 2, SW_PLATE_FEATHER);   // same plate seaway-wake itself ends on: no sharp->blurry swap at the handoff
      if(pl) for(const t of pl.tiers) for(const m of t.chunks) streamed.push({ m, order:t.order, tier:t.name, plate:null, centre:[(m.bounds.north+m.bounds.south)/2,(m.bounds.west+m.bounds.east)/2], half:Math.hypot(m.w,m.h)/2*m.mPerPx });
    }).catch(e=>console.warn('[noirmont-transit] coast plates failed',e));
  }
  function drawCoast(pp){ for(const c of coastMeshes) placeCoastPlateNorthUp(c, pp, worldOffsetTo); }
  // stream the chunked plates: load what the camera is near (plus a margin so they're ready before they scroll
  // in), drop what it's well clear of. The finer tiers only wake once the view is close enough to show their
  // detail — [load below, keep below] in metres of ground per screen pixel: z18 (0.39 m/px) from ~2.2, z19
  // (0.2 m/px, just the last few hundred metres into the harbour mouth) from ~0.55; at the wide framing they
  // would add nothing the z16 tier doesn't already show.
  const TIER_MPP={ 'harbour-z18':[2.2,3.5], 'harbour-z19':[0.55,0.9] };
  function updatePlates(pp, visH_u, off_u){
    if(!streamed.length) return;
    const unitM=M_PER_UNIT/o.coastScale, H=CS.h||innerHeight, visH=visH_u*unitM, visW=visH*camera.aspect, mpp=visH/H;
    const radius=Math.hypot(visW,visH)/2+Math.abs(off_u)*unitM;
    let loading=0; for(const s of streamed) if(s.plate && !s.plate.m.visible) loading++;
    for(const s of streamed){
      const dist=bearingDistTo(pp,s.centre).nm*1852, [loadBelow,keepBelow]=TIER_MPP[s.tier]||[Infinity,Infinity];
      if(!s.plate){
        if(loading<3 && mpp<loadBelow && dist<radius+s.half+250){
          const plate=createCoastPlate(scene, renderer, {src:ctx.base+'assets/plates/'+s.m.file, wPx:s.m.w, hPx:s.m.h, mPerPx:s.m.mPerPx, mPerUnit:M_PER_UNIT, bounds:s.m.bounds, order:s.order, scale:o.coastScale, feather:s.m.feather});
          plate.m.rotation.set(-Math.PI/2, -Math.PI/2, 0, 'YXZ'); plate.m.visible=false; plate.m.material.opacity=0.97; s.plate=plate; loading++;
        }
      } else if(dist>radius+s.half+900 || mpp>keepBelow){
        scene.remove(s.plate.m); s.plate.m.geometry.dispose(); s.plate.m.material.map?.dispose(); s.plate.m.material.dispose(); s.plate=null; continue;
      }
      if(s.plate){ placeCoastPlateNorthUp(s.plate, pp, worldOffsetTo); if(!s.plate.m.visible && s.plate.m.material.map?.image) s.plate.m.visible=true; }
    }
  }

  // nav-aid marks (1 Oct 2026) — real charted marks from seamarks.json (NAVAID_NAMES, above), positioned in the
  // actual 3D scene the same way seaway-wake places Corbière/the pilot station (worldOffsetTo + camera.project),
  // not the stylised bearing-offset text landmarks (slandmark) already here. Built once the fetch resolves
  // (same async pattern as the coast plates above); markEls starts empty, so nothing shows until it does, which
  // for a small local JSON is well before she's scrolled anywhere near the first one.
  let markEls=[];
  fetch(ctx.base+'../seaway-wake/assets/game/seamarks.json').then(r=>r.json()).then(j=>{
    const all=j.marks||[];
    const named=all.filter(m=>NAVAID_NAMES.includes(m.name));
    const unnamed=NAVAID_UNNAMED.map(u=>{
      const found=all.find(m=>!m.name && Math.abs(m.lat-u.match[0])<0.0005 && Math.abs(m.lon-u.match[1])<0.0005);
      return found ? Object.assign({},found,{name:u.as}) : null;
    }).filter(Boolean);
    const marks=[...named, ...unnamed];
    markEls=marks.map(m=>{
      const el=document.createElement('div'); el.className='snavaid'+(m.name==='Noirmont Point'?' lab-left':'')+(/^buoy_lateral/.test(m.type||'')?' chan':'');   // channel markers (lateral buoys): smaller and dimmer, 22 Oct 2026
      const category=m['buoy_cardinal:category']||m['beacon_cardinal:category'];
      // 1 Oct 2026, Simon: "include a little icon of noirmont point tower there (like we did with corbiere)" —
      // first pass reused Corbière's own tower.svg, which Simon flagged as not resembling the real structure.
      // Redrawn from his own reference photo instead (noirmont-tower.svg): a short black-white-black banded
      // cylinder standing directly on bare rock (no masonry plinth/building, unlike Corbière), an open steel
      // lattice day-mark platform on top (no glazed lantern dome), and a small lean-to shed at its foot.
      const iconHtml = category ? cardinalIcon(category) : m.name==='Noirmont Point' ? `<img class="tower" alt="" src="${ctx.base}../seaway-wake/assets/game/noirmont-tower.svg">` : '';
      // 1 Oct 2026, Simon, third pass: "move the light to be on top as well" — the light sits physically on TOP
      // of the real structure (the topmark/tower), so the dot now comes first in a column stack above the icon,
      // not beside it in the previous row layout (see .snavaid .mark-visual in beat.css).
      // Oyster Beacon (NAVAID_UNNAMED, above) is genuinely unlit in the real data (no light:character at all) —
      // without a cardinal category or the Noirmont tower either, it would render with no visual marker at all,
      // just a floating label. plainHtml is a small static (non-blinking) marker for exactly that case.
      // 3 Oct 2026, Simon: "make the green beacons flash brighter" — the light colour was passed straight through as the CSS
      // keyword, and CSS `green` is a dark #008000 that barely shows on a teal sea; lit greens now use a vivid green and an
      // extra-strong glow (.dot.g in beat.css). Other colours are unchanged.
      const lcol=(m['light:colour']||'white').replace(/[^a-z]/g,'');
      const dotHtml = m['light:character'] ? `<i class="dot${lcol==='green'?' g':''}" style="--lc:${lcol==='green'?'#3dff7a':lcol}"></i>` : '';
      const plainHtml = (!dotHtml && !iconHtml) ? `<i class="plain"></i>` : '';
      const lbl=lightLabel(m);
      el.innerHTML=`<span class="mark-visual">${dotHtml}${iconHtml}${plainHtml}</span><p class="name">${m.name}${lbl?` <span class="chr">${lbl}</span>`:''}</p>`;
      stage.appendChild(el);
      return { m, at:[m.lat,m.lon], el, dotEl:el.querySelector('.dot'), visEl:el.querySelector('.mark-visual'), vec:new THREE.Vector3(), solid:/^beacon/.test(m.type||'') };
    });
  }).catch(e=>console.warn('[noirmont-transit] seamarks fetch failed',e));
  // the harbour entrance signals (4 Oct 2026, Simon): on the southern pier head from the moment it is in view — 2 green over 1 white, 3 red once she is abeam of Platte Beacon
  const signals=createEntranceSignals(stage), sigVec=new THREE.Vector3();
  function placeSignals(pp, pxPerM){
    const W=CS.w||innerWidth, H=CS.h||innerHeight;
    signals.place(SIGNAL_TIPS.map(at=>{ const [x,z]=worldOffsetTo(pp, at); sigVec.set(x,0.4,z).project(camera);
      return { x:(sigVec.x*0.5+0.5)*W, y:(1-(sigVec.y*0.5+0.5))*H, on:sigVec.z<1 && Math.abs(sigVec.x)<1.1 && Math.abs(sigVec.y)<1.1 }; }), abeamPlatte(shipLatLngAt(pp), headingAt(pp)), pxPerM);
  }
  const lmVec=new THREE.Vector3();
  function placeNavAids(pp,t){
    const W=CS.w||innerWidth, H=CS.h||innerHeight;
    for(const mk of markEls){
      const [x,z]=worldOffsetTo(pp, mk.at); mk.vec.set(x,0.3,z).project(camera);
      const onScreen=mk.vec.z<1 && Math.abs(mk.vec.x)<1.15 && Math.abs(mk.vec.y)<1.15;
      if(!onScreen){ mk.el.style.opacity='0'; continue; }
      mk.el.style.left=((mk.vec.x*0.5+0.5)*W).toFixed(1)+'px'; mk.el.style.top=((1-(mk.vec.y*0.5+0.5))*H).toFixed(1)+'px'; mk.el.style.opacity='1';
      if(!mk.sized){ const w=mk.visEl.offsetWidth; if(w){ mk.el.style.setProperty('--half',(w/2)+'px'); mk.sized=true; } }   // label clears the icon's real width
      if(mk.dotEl){
        const ph=lightPhase(t,mk.m);
        // 22 Oct 2026, Simon: "lets have all lights kept visible (outlined but dim) between flashes" — every light keeps its marker with a dark rim all the time; the flash only brightens it and lights its glow (.dot.solid / .lit in beat.css)
        mk.dotEl.style.opacity='1'; mk.dotEl.classList.add('solid'); mk.dotEl.classList.toggle('lit',ph>0.5);
      }
    }
  }

  const SPEED_KTS=12;
  // route:ROUTE (1 Oct 2026) — this beat's own real course, not nav-plotter.js's GEO.route default (that's
  // seaway-wake's own 4-point route; using it here made XTE grow into the kilometres once she passed its last
  // waypoint — see nav-plotter.js's own comment on the `route` param for the full story).
  const tilt = o.tilt !== false ? mountTiltShift(stage) : null;   // the miniature look: top and bottom of the frame softly blurred (see _shared/tilt-shift.js)
  const plotter=o.nav!==false ? mountNavPlotter(stage,{GEO,route:ROUTE,shipLatLng:()=>shipLatLngAt(curP),headingDeg:()=>headingAt(curP),speedKts:()=>SPEED_KTS,compact:coarse,assetsBase:ctx.base+'../seaway-wake/',markNames:NAVAID_UNNAMED}) : null;
  const vm=(o.video!==false && o.videoMoments && o.videoMoments.length) ? mountVideoMoment(stage,{ moments:o.videoMoments.map(m=>Object.assign({src:ctx.base+'../../videos/journey/'+m.file+'.mp4',poster:ctx.base+'../../videos/journey/'+m.file+'.jpg'},m)), plotter, reduced:ctx.reduced }) : null;

  let MIN_DISTANCE=8, END_SCALE=0.2;
  function calibrate(){
    const H=CS.h||innerHeight, W=CS.w||innerWidth, aspect=W/H, comp=aspect>1?(1920/1080)/aspect:1;
    const lenPx=shipEl.offsetWidth||1, beamPx=shipImg.naturalWidth? lenPx*shipImg.naturalHeight/shipImg.naturalWidth : lenPx*0.2;
    MIN_DISTANCE=SHIP_LENGTH_WORLD*H/(lenPx*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*comp);
    END_SCALE=MIN_DISTANCE/MAX_DISTANCE;
    wake.uniforms.uShipSize.value.set(SHIP_LENGTH_WORLD*beamPx/lenPx/BOUNDS,SHIP_LENGTH_WORLD/BOUNDS);
  }
  function resize(){ const w = canvas.clientWidth, h = canvas.clientHeight; if(!w||!h) return; CS.w = w; CS.h = h; renderer.setPixelRatio(window.__renderScale || 1); renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); calibrate(); }
  if(shipImg.complete) resize(); else shipImg.addEventListener('load',resize,{once:true}); resize();
  addEventListener('cips:renderscale', resize);   // the page's adaptive render scale (runtime/stage.js)

  const STEP=1/60; let acc=0,simT=0,last=performance.now(); let bob={x:0,y:0,force:0};
  // 2 Oct 2026, Simon: "that turn at the end of seaway wake (110 onto 87) is still jerky... why its not smooth
  // and swept" — found live: uShipRot (the ocean shader's OWN absolute-heading sampling transform, separate from
  // uShipRotDelta which only re-registers the stored heightmap incrementally — see sea-wake.js's own comments)
  // defaults to 0 and was never set before this warmup loop ran its 120 steps, so the warmed-up wake was built as
  // if she'd been heading dead-ahead (BASE_HEADING) the whole time. The very first real update(p=0) call then
  // sets uShipRot to her REAL entering heading (~17° off BASE_HEADING here, carried over from seaway-wake's own
  // ending) in one instant — a sudden jump in the sampling transform, even though the underlying heightmap data
  // itself was undisturbed, reading as exactly this kind of snap right where seaway-wake hands off. Pre-set both
  // copies of uShipRot to her real p=0 heading before warming up, so the warmed field and the first real frame
  // already agree — no jump to begin with.
  const BASE_HEADING=o.heading==='east'?90:180;
  const initRotRad=(headingAt(0)-BASE_HEADING)*Math.PI/180;
  wake.uniforms.uShipRot.value=initRotRad; uni.uShipRot.value=initRotRad;
  for(let i=0;i<120;i++){ simT+=STEP; wake.update(new THREE.Vector3(0,0,o.wakeCenterY),STEP,simT); } uni.uHeightmap.value=wake.texture();
  // 29 Sep 2026, Simon: "more zoomed out... like when you first see the yacht from above off Corbiere" — she
  // was easing further in across the WHOLE beat, so by mid-transit the coastline/nav marks were already lost.
  // Now she holds the wide opening framing (END_SCALE, same wide shot seaway-wake itself opens on) all through
  // the real transit, and only zooms in over the final yawFrom→1 stretch for the berth-arrival match-cut.
  // Simon: "the ship should change heading linked to what the pilot notes say and what its doing on the
  // plotter" — realTurn tracks her ACTUAL course changes along GEO.pilotage (the same headingAt() already
  // driving the plotter's own ship icon) right up to yawFrom, then the cinematic yaw is added ON TOP of
  // wherever that real turning has actually left her, not a flat scripted spin from zero — so the hull visibly
  // rounds each real leg (Western Passage / Small Road) as she goes.
  // 1 Oct 2026: this used to measure realTurn against hdg0 (headingAt(0), THIS beat's own first-leg bearing) —
  // a self-referential baseline that always reads exactly 0 at p=0 no matter what, so the displayed hull
  // rotation reset to 0 at this beat's own start regardless of whatever rotation it actually had an instant
  // before, at the end of seaway-wake (~20deg there, by the time she hands off — see that beat's own BASE_HEADING).
  // Same fixed convention now (90 for the ship-plan.png artwork's own due-east baseline), so realTurn continues
  // from wherever seaway-wake's own hull rotation actually left off instead of snapping to 0.
  // (BASE_HEADING declared above, before the wake warmup — same value, needed earlier now.)
  const sea=registerSea('noirmont-transit',{ after:'seaway-wake', pMax:o.endAt, posAt:pp=>shipLatLngAt(pp), perMetreAt:()=>o.coastScale/M_PER_UNIT });   // the sea pattern travels with the ground (see _shared/sea-advect.js)
  let curP=0, alive=true, yawNow=0, prevShipRotRad=initRotRad;
  let scaleNow=END_SCALE, fxNow=0.5;
  function update(pRaw, st){
    if(!alive) return; const p=pRaw*o.endAt; curP=p;
    const now=performance.now(); const dt=Math.min((now-last)/1000,.05); last=now; acc+=dt; const t=(now-PAGE_T0)/1000;
    const e=cinematicSilk(p);
    // consolidated onto _shared/zoom-score.js (29 Sep 2026) — same wide-then-in curve, declared as keyframes
    const scale=scoreAt(p, [{p:o.yawFrom, scale:END_SCALE}, {p:1, scale:lerp(END_SCALE,1,o.zoomEnd)}]);
    const a=Math.sin(t/4.8*Math.PI), b=Math.sin(t/5.4*Math.PI+1.3);
    bob.x=.6*a*o.bob; bob.y=(-1.2*a+(b>0?2*b:0)*.5)*o.bob; bob.force=Math.max(0,b)*.6*o.bob;
    // turning dynamics (4 Oct 2026, Simon: turns "like a car going round a corner", "on rails"): in a turn a ship's bow leads her track (the drift angle, ~ drift x length x curvature), as in
    // st-helier-approach — the hull is rotated a little INTO each turn rather than exactly along the path
    const pH=Math.min(p,o.yawFrom), dp=0.004, hA=headingAt(Math.max(0,pH-dp)), hB=headingAt(Math.min(1,pH+dp)), dTh=((hB-hA+540)%360)-180, pA=shipLatLngAt(Math.max(0,pH-dp)), pB=shipLatLngAt(Math.min(1,pH+dp));
    const dm=Math.hypot((pB[0]-pA[0])*111320,(pB[1]-pA[1])*111320*Math.cos(pA[0]*Math.PI/180))||1, beta=Math.max(-0.2,Math.min(0.2,0.2*(SHIP_LENGTH_WORLD*M_PER_UNIT/o.coastScale)*(dTh*Math.PI/180)/dm));
    const realTurn=headingAt(pH)+beta*180/Math.PI-BASE_HEADING;
    const yk=smooth(o.yawFrom,1,p); yawNow=lerp(realTurn, realTurn+(o.yaw||0), yk);
    shipEl.style.transform=EAST?`translate(calc(-50% + ${bob.y*0.2}%),calc(-50% + ${bob.x}%)) rotate(${yawNow.toFixed(2)}deg) scale(${scale})`:`translate(calc(-50% + ${bob.x}%),calc(-50% + ${bob.y}%)) rotate(${yawNow.toFixed(2)}deg) scale(${scale})`;
    const comp=camera.aspect>1?(1920/1080)/camera.aspect:1;
    const camH=Math.min(MAX_DISTANCE,MIN_DISTANCE/scale)*comp;
    const fx=lerp(o.shipX[0],o.shipX[1],lerp(p,e,o.shipEase));
    const visW=2*camH*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect; const off=(0.5-fx)*visW;
    if(EAST){ camera.position.set(0.01,camH,off); camera.lookAt(0,0,off); { const sa=sea.at(p); uni.uPan.value.set(-sa[0],off-sa[1]); } } else { camera.position.set(-off,camH,0.01); camera.lookAt(-off,0,0); uni.uPan.value.set(-off,0); }
    shipEl.style.left=(fx*100).toFixed(2)+'%'; scaleNow=scale; fxNow=fx;
    if(o.coast){ drawCoast(p); for(const c of coastMeshes){ c.m.material.opacity=0.97; c.m.visible=true; } updatePlates(p, 2*camH*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)), off); }
    if(o.navAids) placeNavAids(p,t);
    placeSignals(p, (CS.h||innerHeight)/(2*camH*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*M_PER_UNIT));
    if(plotter) plotter.update();
    if(vm) vm.update(pRaw,{ carry:(st&&st.carry)||0 });
    if(copyEl){ const c=clamp01((pRaw-o.copyIn[0])/(o.copyIn[1]-o.copyIn[0]))*(1-smooth(0.85,0.98,pRaw)); copyEl.style.opacity=c.toFixed(3); copyEl.style.transform=`translateY(${(18*(1-c)).toFixed(1)}px)`; }
    // landmarks: 2 Oct 2026, Simon: "Elizabeth castle label is in the wrong place, it should be on the main
    // castle" — this used to be a stylised offset to one side of the hull (bearing picked the side, not the real
    // spot), so it floated wherever the screen happened to put it. Now projected from its real lat/lng exactly like
    // the nav-aid marks above, so it stays on the castle as the camera moves.
    const W=CS.w||innerWidth, H=CS.h||innerHeight;
    for(const key in o.landmarks){
      const L=o.landmarks[key], el=landmarkEls[key]; if(!el) continue;
      const [s0,s1]=L.show, k=Math.min(smooth(s0,s0+0.23,p), 1-smooth(s1-0.23,s1,p));   // fixed 0.23-wide fades (was 30% of the window) so a wide window doesn't slow the fade-in
      const [lx,lz]=worldOffsetTo(p, L.at); lmVec.set(lx,0.3,lz).project(camera);
      if(k<=0.002 || !(lmVec.z<1 && Math.abs(lmVec.x)<1.15 && Math.abs(lmVec.y)<1.15)){ el.style.opacity='0'; continue; }
      el.style.left=((lmVec.x*0.5+0.5)*W).toFixed(1)+'px'; el.style.top=((1-(lmVec.y*0.5+0.5))*H).toFixed(1)+'px';
      el.style.opacity=k.toFixed(3);
    }
    // 2 Oct 2026, Simon: "we still have the ghost ship outline problem... on heading change" — real cause, found
    // live: this update() never called wake.update() at all. The sim only ever ran its own 120-step warmup once,
    // at mount() — acc/simT were computed every frame but never consumed, so the whole wake texture was a single
    // frozen snapshot from mount time for the entire beat, never advecting, never picking up a new crest at her
    // current position, and — since it was also never told her heading at all — never rotating with her real
    // turns either (uShipRot/uShipRotDelta weren't wired up here, unlike seaway-wake's own beat.js). Ported that
    // beat's own per-frame block whole: the real uniform updates (height/cam/time), the realTurn->radians
    // rotation (both the wake sim's own uniform and the ocean material's separate one), and the sub-step-count-
    // aware uShipRotDelta split that beat's own history already found was needed (see sea-wake.js and that
    // beat's own comments) — splitting evenly across however many sub-steps actually run this call, not reusing
    // one delta across all of them, which is exactly what produces a rotated, not-yet-decayed hull imprint.
    uni.uHeightScale.value=2.5-0.8*scale; uni.uCamHeight.value=camera.position.y; uni.uWakeOffsetY.value=o.wakeCenterY; uni.uTime.value=t;
    const shipRotRad=realTurn*Math.PI/180;
    wake.uniforms.uShipRot.value=shipRotRad;
    uni.uShipRot.value=shipRotRad;
    const shipRotDeltaFull=prevShipRotRad==null?0:shipRotRad-prevShipRotRad;
    prevShipRotRad=shipRotRad;
    wake.uniforms.uWakeIntensity.value=o.wakeIntensity+bob.force*.045; uni.uWakeIntensity.value=wake.uniforms.uWakeIntensity.value;
    const willRun=Math.min(3,Math.floor(acc/STEP));
    wake.uniforms.uShipRotDelta.value=willRun>0?shipRotDeltaFull/willRun:0;
    let n=0; while(acc>=STEP&&n<3){ simT+=STEP; wake.update(new THREE.Vector3(0,0,o.wakeCenterY),STEP,simT); acc-=STEP; n++; }
    if(n===3) acc=Math.min(acc,STEP); if(n>0) uni.uHeightmap.value=wake.texture();
    renderer.render(scene,camera);
  }
  let yachtHeadingDeg=(EAST?0:90);
  return {
    update, resize,
    // 31 Oct 2026: see seaway-wake (keepAlive was only on the phone fallback, where `vm` does not exist)
    keepAlive(){ return !!(vm&&vm.isActive&&vm.isActive()); }, footage(p,st){ if(vm) vm.update(p,{ carry:(st&&st.carry)||0 }); }, 
    exit(){ const sEnd=scaleNow;   // wide framing now (no zoom-in in this beat) — see endAt
      return { yachtScreenPx: shipEl.offsetWidth*sEnd,
               yachtScreen:{ x:fxNow, y:0.5, lenPx: shipEl.offsetWidth*sEnd, headingDeg: yachtHeadingDeg+yawNow },
               seaColour:'#02484b' }; },
    destroy(){ vm?.destroy(); alive=false; streamAlive=false; for(const s of streamed){ if(s.plate){ s.plate.m.geometry.dispose(); s.plate.m.material.map?.dispose(); s.plate.m.material.dispose(); s.plate=null; } } wake.dispose(); plane.geometry.dispose(); mat.dispose(); normalMap.dispose(); skyTex.dispose(); renderer.dispose(); plotter?.destroy(); tilt?.destroy();
      for(const c of coastMeshes){ c.m.geometry.dispose(); c.m.material.map?.dispose(); c.m.material.dispose(); }
      for(const {el} of markEls){ el.remove(); } signals.destroy(); }
  };
}
function staticCtrl(stage,shipEl,copyEl,o,ctx){
  const pf=phoneFilm(stage,o,ctx,copyEl);   // 13 Nov 2026: the lighter journey for phones
  return { update(p){ if(pf) pf.update(p); const e=cinematicSilk(p); shipEl.style.transform=`translate(-50%,-50%) scale(${lerp(0.6,0.9,e)})`;
      if(copyEl){ const c=clamp01((p-o.copyIn[0])/(o.copyIn[1]-o.copyIn[0])); copyEl.style.opacity=c.toFixed(3);} },
    resize(){}, destroy(){ if(pf) pf.destroy(); }, exit(){ return {yachtScreenPx: shipEl.offsetWidth*0.9}; } };
}
