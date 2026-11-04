/* _beats/st-helier-approach/beat.js — the last stretch of the voyage, in the new style: the Small Roads, the harbour entrance
   and the berth at St Helier, as ONE continuous scene with three chapters (not three beats — the runtime only reads a beat's exit()
   once, at mount, so a chain of beats can't pass the real end pose on; one mounted scene keeps the hull, sea, wake and plates
   continuous). Plan: shimmying-seeking-goose.md (rewritten 4 Oct 2026).
   It picks up exactly where noirmont-transit stops (_shared/st-helier-route.js: ROUTE, NOIRMONT_END, noirmontEndPose) — same route,
   same hull heading, same wide hold, same on-screen position — and takes over the zoom-in and the yaw that noirmont no longer does.
   Everything here is derived from noirmont-transit/beat.js (which carries the long history of how each piece was got right): the real
   time sea (_shared/sea-wake.js), the streamed satellite plate tiers, the nav-aid marks, the plotter. What's new is the path (a
   hand-authored harbour stretch past the last charted point), the chapter structure (pace + zoom keyframes per chapter) and, later,
   the door seams for the minigames. Sandbox: demo.html. */
import * as THREE from 'three';
import { clamp01, lerp, smooth, cinematicSilk } from '../runtime/stage.js';
import { scoreAt } from '../_shared/zoom-score.js';
import { mountNavPlotter } from '../_shared/nav-plotter.js';
import { mountVideoMoment } from '../_shared/video-moment.js';
import { createWakeSimulation, makeOcean, BOUNDS, SHIP_LENGTH_WORLD, setWakeParams, PAGE_T0 } from '../_shared/sea-wake.js';
import { GEO } from '../seaway-wake/game/geography-data.js';
import { CFG } from '../seaway-wake/game/config.js';
import { createCoastPlate, placeCoastPlateNorthUp, SW_PLATE_FEATHER } from '../_shared/coast-plate.js';
import { mountTiltShift } from '../_shared/tilt-shift.js';
import { lightPhase } from '../_shared/nav-light.js';
import { registerSea } from '../_shared/sea-advect.js';
import { SIGNAL_TIPS, createEntranceSignals, abeamPlatte } from '../_shared/entrance-signals.js';
import { ROUTE, NOIRMONT_END, noirmontEndPose } from '../_shared/st-helier-route.js';
import { createFinale, CLOSE_R } from './finale.js';   // the way out: the closing line and the shrink into the home page (31 Oct 2026)
import { createQuayWork } from './quay-work.js';   // chapter 4, the quay at work (26 Oct 2026)
import { createHoldTheLine } from './hold-the-line.js';   // the hands-on stretch, flown in this scene (23 Oct 2026)
import { createBerthGame } from './berth-game-ui.js';   // the berthing game, flown in this scene (30 Oct 2026)
import { BERTH as BERTH_EN, HULL_OUTLINE, START as BERTH_START, en2ll as berthEn2ll } from './berth-geo.js';

export const meta = { order: 5.6, title: "St Helier approach — Small Roads, entrance and berth", site: "both",
  summary: "One continuous scene from where noirmont-transit stops: up the Small Road, between the pier heads and alongside at St Helier, on real satellite plates." };
export const needs = [];   // nothing handed over: the start pose is derived from the shared route, not read from a handoff
const HULL_M = 50;   // Kinship's length against the land, in metres (the berth prototype used 50 m too) — declared up here because defaults uses it
const CH = { x: 0.27, c1: 0.50 };   // p at the end of chapter 1 (Small Roads) and chapter 2 (the entrance); chapter 3 (the berth) runs to 1
let U_X = 0.61, U_C1 = 0.865;   // those joins as fractions of the path's length; recomputed from the real path below
export const defaults = {
  finaleTail: 0.11294,   // 31 Oct 2026 (scrolled film): 2400vh of the 21250vh track (was 0.0737, 1500vh of 20350vh); the quay is still 16850vh and chapters 1-3 2000vh. (Older note:)   // 31 Oct 2026, Simon: chapter 5, the way out (the yacht casts off and the camera lifts, the Savannah departure full screen, the closing line, the shrink into the home page): 1500vh of the 20350vh track (finale.js). 0 = no finale (the beat then ends on the quay).
  quayTail: 0.79294, // 16850vh of the 21250vh track (was 0.8280 of 20350vh)  (Older note:) // 31 Oct 2026 (finale added): the quay is still 16850vh, now of a 20350vh track. Before that: 0.8939 (31 Oct 2026 (latest), Simon: all the people and vehicles in the quay halved in speed (quay-work.js: SLOW) and the van brought earlier: the story is 2842 s, so the quay track is 16850vh at the same pace (track 18850vh, chapters 1-3 still 2000vh). Before: 0.8230 (31 Oct 2026 (later), Simon: the garbage runs start as tanker B arrives and the provisions man meets the second garbage man on the brow (quay-work.js): the story is 1565 s, so the quay track is 9300vh at the same pace (track 11300vh, chapters 1-3 still 2000vh). Before: 0.8347 (31 Oct 2026, Simon: all people except the garbage men 33% slower and the provisions van driving in a third slower (quay-work.js: PEOPLE, VIN_VAN) lengthen the story from 1308 s to 1702 s, so the quay track grows by the same factor (7750vh -> 10100vh, track 9750vh -> 12100vh, chapters 1-3 stay 2000vh) and the vehicles keep their pace on the scroll. Before that: 0.7949 (29 Oct 2026, last): one less garbage run (three, 0.6 m3) shortens the story to 1308 s, so the track follows to keep the same scroll per second: 0.8095 -> 0.7949, track 10500vh -> 9750vh (the quay is 7750vh). Before that, same day: the people were slowed to well under the vehicles' speed, which makes the story 1.43x longer (1005 s -> 1432 s); the track follows so the vehicles keep the same scroll per second (about 6 vh): 0.75 -> 0.8095, track 8000vh -> 10500vh (the quay is 8500vh). Earlier that day, Simon: "still moving WAY too fast, slow it down like x3": 0.50 -> 0.75, track 4000vh -> 8000vh, so the scroll per story second goes from about 2 vh to about 6 vh (chapters 1 to 3 keep exactly their 2000vh). Before that (same day): 0.42 -> 0.50 (3448vh -> 4000vh). Earlier: 26 Oct 2026, Simon: the next part of the beat, the quay at work (fuel tankers, provisions). Chapter 4 takes the last 42% of the beat's own p (27 Oct: 26% -> 34% -> 42% as the vehicles and crews were slowed and the sequence reordered, so the scroll per story second stays about 1.8vh); chapters 1 to 3 run over the first 58% exactly as before (so the track in index.html is 2000vh / 0.58 = 3448vh). 0 = no chapter 4.
  // 26 Oct 2026, Simon: real footage in a viewport above the plotter, plays by itself (see _shared/video-moment.js and DOCS/PLAN-journey-video-moments.md). from/to are this beat's own p; `file` is in site/videos/journey/. Pass videoMoments:[] (or video:false) to switch it off.
  videoMoments: [
    { id:'pier-heads', file:'journey-3-pier-heads', title:'Through the pier heads', from:0.30, to:0.47 },
    { id:'alongside', file:'journey-4-alongside', title:'Alongside', from:0.50, to:0.90 },
    { id:'quay-at-work', file:'journey-5-quay-at-work', title:'The quay at work', from:1.03, to:1.97 },
    { id:'departure', file:'journey-6-departure', title:'Leaving St Helier', full:true, scrub:[2.20, 2.62], from:2.20, to:3.2, lead:0.8 },   // 31 Oct 2026, Simon: the finale, full screen under the plotter (pz 2 + r through chapter 5, the way out); 22 s, plays once and holds on the roundel   // (the footage windows now run on past 1: 1 + the chapter-4 progress q)
  ],
  calm: 0.6, calmIn: [0.0, 0.10],   // 16 Oct 2026, Simon: "make the sea calmer in the small roads and harbour": 0 = the open-sea look noirmont ends on, 1 = glassy; eased in over the first 10% so there is no step at the seam
  wakeIntensity: 0.55, wakeFade: [0.95, 1.0], wakeRun: 1.8, bob: 0.22, shipSpeed: 40, flow: 0.5, sunElevation: 55, wakeCenterY: 0,
  heading: 'east',
  resolution: 384,
  forceStatic: false,
  // Zoom, as fractions of the way from the wide hold (0) to the hull's full on-screen length (1): [{p, f}] eased by _shared/zoom-score.js.
  zoom: [{ p: 0, f: 0 }, { p: 0.27, f: 0.14 }, { p: 0.50, f: 0.26 }, { p: 1, f: 0.40 }, { p: 1.05, f: 0.80 }, { p: 2.0, f: 0.80 }, { p: 2.19, f: 0.05, mult: 2 }],   // (past p = 1 is chapter 4: 1 + q, closing in on the quay work)   // 23 Oct 2026, Simon: start the zoom in sooner, from the start of the beat (it held until 6% before): she is already past East Rock and on the 024 degree leg there
  // Chapter pacing: where along the path (as a fraction of its length) she is at each p. Monotone-cubic through these, so her speed on
  // the scroll never steps. The keys sit on the chapter joins (see CHAPTERS below): the Small Road is quick, the entrance slower, the berth slowest.
  pace: null,   // null = [0 -> 0, ch1 end -> U_X, ch2 end -> U_C1, 1 -> 1] (see mount); or pass [{p,u}] to override
  // Hull-to-land scale: 1 = the game's own exaggerated hull (what the wide hold has always shown); CFG.exaggerate = true scale. A 70 m yacht drawn
  // at the game's 2.6x would be wider than the harbour entrance, so it comes down to true scale as the Small Road closes in.
  geoScale: [{ p: 0, k: 1 }, { p: 0.27, k: CFG.exaggerate }, { p: 1, k: CFG.exaggerate }],
  // The hull comes DOWN as we zoom in (4 Oct, Simon: "way too big in proportion to the land and harbour"): its length against the land goes from the game's exaggerated
  // size to hullM metres over shrinkAt (the land grows by the same factor, so the picture of the land doesn't change, only the yacht in it).
  hullM: HULL_M, shrinkAt: [0, 0.27],
  drift: 0.32,         // how far her bow leads the path into a turn (drift angle ≈ drift × her length × curvature, capped): see the turning dynamics note in update()
  // Chapter copy, faded in/out around each chapter (p).
  chapters: [
    { at: [0.02, 0.24], eyebrow: 'The Small Roads', sub: 'up the Small Road between the Platte and the castle, then onto the leading line for the harbour.' },
    { at: [0.30, 0.48], eyebrow: 'The entrance', sub: 'past the Albert Pier head, then to port between the piers.' },
    { at: [0.54, 0.97], eyebrow: 'The berth', sub: 'up the channel to the Albert Pier: port side to, bow north.' },
    { at: [1.04, 1.95], eyebrow: 'The quay at work', sub: 'fuel by road tanker, provisions down the pontoon, fresh water on, garbage off: everything alongside, on time.' },
  ],
  // The doors: optional detours into the hands-on pieces, both flown in this scene. show = the p-range each pill is up for.
  doors: {
    hold:  { show: [0.03, 0.14], title: 'Play Hold the Line' },   // 23 Oct 2026: flown in the scene from about 10% of the beat (the pill is up from 6% to 14%)
    berth: { show: [0.710, 0.901], title: 'Play the berthing' },   // 30 Oct 2026: flown in the scene (berth-game-ui.js); the door window is Simon's (picked on the scene: appears 119 m from the berth, goes 38 m from it; the game starts at p 0.675, 136 m out); the old prototype page is the fallback
  },
  // Speed over the ground shown on the plotter, as she slows for each chapter.
  speed: [{ p: 0, k: 12 }, { p: 0.27, k: 8 }, { p: 0.50, k: 6 }, { p: 0.85, k: 2.5 }, { p: 1, k: 0 }],   // 22 Oct 2026: 7 and 5 knots at the chapter joins are now 8 and 6, to go with the gentler slowing
  berthYaw: [0.86, 1.0],   // p over which she squares up to the berth heading (the last leg converges on the quay at an angle)
  copyIn: [0.03, 0.10],
  landmarks: { castle: { at: [49.1762, -2.1256], show: [-1, 2] } },   // already showing at p=0: noirmont's last frame has it
  coast: true,
  navAids: true,
  leads: true,          // the leading lights: marks, faint lead lines and the "what the master sees" panel (22 Oct 2026)
};

const MAX_DISTANCE = CFG.open.visH / (2 * Math.tan(THREE.MathUtils.degToRad(CFG.fov / 2)));   // the game's own wide camera: the "wide hold" noirmont ends on
const M_PER_UNIT = 70 * CFG.exaggerate / SHIP_LENGTH_WORLD, NM_PER_UNIT = M_PER_UNIT / 1852;

/* ---------- the path ----------
   Straight from where noirmont stops to the entrance point (ROUTE[4], between the pier heads: the end of everything charted), then the
   hand-authored harbour stretch. Hand-authored points are read off the satellite plates and recorded here as [lat, lng] with a note on
   what each one is. Corners are rounded with a quadratic Bézier (same fillet noirmont uses: tangent to both legs, can't loop). */
const START = noirmontEndPose();
/* Hand-authored from the satellite plates (tools/harbour-picker.html), 4 Oct 2026. How the harbour works, as read off the imagery and the chart:
   - ROUTE[4] (noirmont's last point, by light A1604) is in the mouth of ELIZABETH Harbour, the ferry basin to the west — NOT where she goes. The
     Small Road line (024°, ROUTE[3] -> ROUTE[4]) meets the Pier Head leading line (078°/258°, the A1609 lights east of the town; chart line through
     49.17667,-2.11369) about 0.38 nm on from where noirmont stops, at X. That's the point she turns to starboard onto the lead.
   - The lead runs ~15 m south of the Albert Pier head (tip: 49.176717,-2.114315). Just past it she turns to PORT, north, through the entrance gap (Albert
     Pier head to the Victoria marina breakwater, ~140 m) and up the central channel (centre line ≈ lng -2.1134).
   - The berth is on the Albert Pier's east face (the quay with the sheds), the stretch that runs NNE (033°): ALBERT_FACE below, read along the quay edge.
     She lies port side to the quay, bow north, on the southern of the two superyacht berths. */
const LEAD_IN = [49.173886, -2.117909];    // 23 Oct 2026, Simon: the ship sat to starboard of the Small Road lead. Noirmont hands over 15 m east of the line (its 024 degree leg is not the 023 degree lead), and the straight run to X only closed that gap at the turn. This point is ON the lead, 420 m seaward of the front light (about 390 m on from the hand-over), so she is lined up well before the turn
const X_TURN = [49.176291, -2.116346];     // the Small Road lead meets the 078° lead: turns to starboard here. 22 Oct 2026: moved 33 m west / 8 m south to where the two charted leading lines actually cross (it was where noirmont's 024° line met the lead), so the ship now sits on the Small Road lead all the way up to the turn
// The entrance gap, read off the plates at 0.6 m/px (4 Oct): the Albert Pier head tip (north side) and the two northern tips of the SOUTHERN pier head
// (Victoria Pier). She goes through the middle of the gap (the 078° lead itself hugs the Albert head, 15 m off it — Simon: "too close to the northern pierhead").
const ALBERT_HEAD = [49.176699, -2.114350];
const SPIER_NW = [49.176167, -2.114750];   // south pier head, north-west tip (faces out to sea)
const SPIER_NE = [49.176210, -2.114212];   // south pier head, north-east tip (faces into the harbour)
const GAP_MID = [49.176496, -2.114504];    // the middle of the gap. 22 Oct 2026, Simon: "stay to the leading line": now 6 m south of the 078 line (the Albert head is 14 m north of it), was 12 m south
const K_TURN = [49.176769, -2.11295];      // (22 Oct 2026: moved 24 m north, onto the 078 line, so she stays on the lead until the turn) the corner where she turns to port, up the middle of the channel (the wall is at lng -2.1139, the east side ~-2.1118). Its arc is a big one (CORNER_NM) that starts after the pier heads
const CHAN_1 = [49.17770, -2.11295];        // channel centre line (between the Albert Pier wall and the east side)
const CHAN_2 = [49.17845, -2.11300];
/* The Albert Pier east face, kink to Q1 (south to north), read at 0.25 m/px (4 Oct). The wall runs due north south of the kink (49.179105) and then curves
   round to ~030° (NNE). s = metres along it from the kink; faceAt(s, out) gives the point `out` metres outboard (east) of the wall. */
const FACE = [[49.179105, -2.113923], [49.179307, -2.113841], [49.179582, -2.113640], [49.179777, -2.113477], [49.179912, -2.113360], [49.180071, -2.113217], [49.180264, -2.113051], [49.180438, -2.112898]];
const M_LAT = 111320, COS_F = Math.cos(49.18 * Math.PI / 180);
const FACE_EN = FACE.map(ll => [(ll[1] - FACE[0][1]) * M_LAT * COS_F, (ll[0] - FACE[0][0]) * M_LAT]);   // [east, north] metres from the kink
{ const a = FACE_EN[FACE_EN.length - 2], b = FACE_EN[FACE_EN.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]); FACE_EN.push([b[0] + (b[0] - a[0]) / d * 70, b[1] + (b[1] - a[1]) / d * 70]); }   // carried on 70 m past the last point
const FACE_CUM = [0]; for (let i = 1; i < FACE_EN.length; i++) FACE_CUM.push(FACE_CUM[i - 1] + Math.hypot(FACE_EN[i][0] - FACE_EN[i - 1][0], FACE_EN[i][1] - FACE_EN[i - 1][1]));
function faceAtEN(s) {   // position (metres from the kink), local bearing and the outboard (right-hand when heading north) unit vector
  s = Math.max(0, Math.min(FACE_CUM[FACE_CUM.length - 1], s)); let i = 1; while (i < FACE_CUM.length - 1 && FACE_CUM[i] < s) i++;
  const a = FACE_EN[i - 1], b = FACE_EN[i], L = FACE_CUM[i] - FACE_CUM[i - 1], t = L ? (s - FACE_CUM[i - 1]) / L : 0, te = (b[0] - a[0]) / L, tn = (b[1] - a[1]) / L;
  return { e: a[0] + (b[0] - a[0]) * t, n: a[1] + (b[1] - a[1]) * t, brg: ((Math.atan2(te, tn) * 180 / Math.PI) + 360) % 360, re: tn, rn: -te };
}
function faceAt(s, out = 0) { const f = faceAtEN(s); const e = f.e + out * f.re, n = f.n + out * f.rn; return [FACE[0][0] + n / M_LAT, FACE[0][1] + e / (M_LAT * COS_F)]; }
/* The pontoons along the Albert Pier east face, phase 1 (10 Oct): polygons in lat/lng (tools/plates-build/dock-layout.json), straight edges read off Simon's green outlines on the dock snip.
   S is the long narrow walkway against the quay (its east edge kinks once where it meets N), N the wider section stepped out from it up to the north end. The plate's own floating dock is cleared
   (tools/plates-build/edits.json) and the plate under these is cleared to sea, so only these show. */
const DOCK_PIECES = [   // each piece's planks run along its longest edge; N2 the end block, H the cross pontoon east of it, P the finger running south from H's east end (squared-up rectangles, 10 Oct)
  [[49.18009, -2.113319], [49.179173, -2.113985], [49.179169, -2.113953], [49.180022, -2.113331], [49.180079, -2.113282]],
  [[49.180022, -2.113331], [49.180489, -2.11294], [49.180479, -2.112877], [49.180004, -2.113272]],
  [[49.180457, -2.112848], [49.180639, -2.112702], [49.18067, -2.112792], [49.180488, -2.112938]],
  [[49.180635, -2.11282], [49.180668, -2.112793], [49.180563, -2.112487], [49.18053, -2.112514]],
  [[49.180393, -2.112558], [49.180546, -2.112435], [49.180563, -2.112487], [49.180411, -2.11261]]];
function offsetM(ll, eastM, northM) { const cosLat = Math.cos(ll[0] * Math.PI / 180); return [ll[0] + northM / 111320, ll[1] + eastM / (111320 * cosLat)]; }
/* The berth layout (Simon, 4 Oct, on screenshots): the pontoon runs from the kink (s = 0) to PONTOON_END_S; the yacht ahead drops back so its bow ends at NEIGH.bowS;
   Kinship's berth is right behind it. Lengths are in metres against the land, i.e. after the hull has been brought down to scale (see o.hullM). */
const PONTOON_END_S = 190;   // the dock's end block finishes here
// The two berths (Simon, 10 Oct: green boxes on the dock snip, tools/plates-build/berth-boxes.json). They are swapped from before: the yacht already berthed lies in the SOUTHERN slot with its bow facing
// south (180 degrees round), and the yacht we bring in (Kinship; in the game too) takes the NORTHERN slot. (s, out) are metres along / east of the wall line (faceAt); both sit centred in their boxes for now.
const NEIGH = { s: 71.1, out: 4.1, hdg: 205.0, lenM: 52 };   // the yacht already berthed (south box, bow south)
const KIN_S = 138.5, KIN_HDG = 27.0;                            // Kinship's berth centre along the wall and her final heading (north box long axis)
const NEIGH_OFFSET_M = NEIGH.out;
const BERTH_OFFSET_M = 5.2;                  // her centre off the wall line: the dock's east edge is at about -0.3 m here and her half beam ~5.1 m, so ~0.4 m of water between (the same gap as the yacht in the south box: NEIGH.out 4.1 against the walkway edge at -1.6; 10 Oct: gaps halved)
// the camera at the end looks at the middle of the pair of berths (so both hulls show), not at Kinship alone
const PAIR_MID = faceAt((KIN_S + NEIGH.s) / 2, (BERTH_OFFSET_M + NEIGH.out) / 2);
const BERTH = (() => { const c = faceAt(KIN_S, BERTH_OFFSET_M); return { lat: c[0], lng: c[1], headingDeg: KIN_HDG, lenM: HULL_M }; })();
const APPROACH_1 = faceAt(KIN_S - 62, 40), APPROACH_2 = faceAt(KIN_S - 24, 17);   // up the middle of the channel, then converging on the wall
const NNQ = [[49.179473, -2.111945], [49.179702, -2.111748], [49.179972, -2.111548], [49.180183, -2.111330]];
const NNQ_CRANE = [49.179428, -2.111859];     // the blue crane on the quay: the NNQ yacht's mid-point sits abeam it (Simon, 4 Oct)
const NNQ_BEAM = 1.12, NNQ_OFF = 15.7;   // 9 Oct (Simon): the yacht slightly wider at the same length, and a little closer to the quay (was 17 m off the quay line)
const NNQ_LEN_M = 90;   // New North Quay west edge, south to north (the yacht across the channel)
const HARBOUR = [LEAD_IN, X_TURN, GAP_MID, K_TURN, CHAN_1, CHAN_2, APPROACH_1, APPROACH_2, [BERTH.lat, BERTH.lng]];
const CORNER_CAP_NM = 0.06, CORNER_FRAC = 0.45;
// Turn radii that are bigger than the default rounding (Simon, 4 Oct: the turn to port "like a car going round a corner" — a yacht's turning circle is several hull lengths across):
// node index in NODES -> fillet distance (nm) each side of the corner. X = onto the lead (starboard), K = into the channel (to port). ~80 m, so a ~160 m turning circle.
const CORNER_NM = new Map([[2, 0.022], [4, 0.044]]);   // 22 Oct 2026, Simon: "we come off the line too much" at the end of the Small Roads. X was 0.044 nm (81 m each side, cutting the corner by about 18 m); now 0.022 (41 m, a cut of about 9 m, a turning circle of about 160 m, still a ship's turn). K stays big: the pair rule below trims it to fit
const NODES = [[START.lat, START.lng], ...HARBOUR];
// what the plotter calls each waypoint as she runs for it (index = waypoint: start, X, K, channel x2, berth approach, berth)
const PLOT_NAMES = ["Small Road", "Small Road", "Pier Head lead", "Harbour entrance", "Harbour entrance", "Albert Pier channel", "Albert Pier channel", "Albert Pier berth", "Albert Pier berth", "Albert Pier berth"];
function nmBetween(a, b) { const cosLat = Math.cos(a[0] * Math.PI / 180); return Math.hypot((b[0] - a[0]) * 60, (b[1] - a[1]) * 60 * cosLat); }
const DENSE = (() => {   // the path as a dense polyline with its corners filleted, plus cumulative distance in nm
  const n = NODES.length, rad = new Array(n).fill(0), brg = (p, q) => Math.atan2((q[1] - p[1]) * Math.cos(p[0] * Math.PI / 180), q[0] - p[0]);
  for (let k = 1; k < n - 1; k++) {   // the radius each corner wants (nm); near-straight corners are left alone
    const a = NODES[k - 1], c = NODES[k], b = NODES[k + 1]; if (Math.abs(((brg(c, b) - brg(a, c)) * 180 / Math.PI + 540) % 360 - 180) < 3) continue;
    const big = CORNER_NM.get(k); rad[k] = big != null ? big : Math.min(CORNER_CAP_NM, CORNER_FRAC * nmBetween(a, c), CORNER_FRAC * nmBetween(c, b));
  }
  // Two neighbouring corners must not eat more of the leg between them than it has: if their arcs overlapped the path would run BACKWARDS along that leg (a switchback, the heading
  // flipping ~180 degrees: the bug of 5 Oct 2026). Scale each pair down until they fit with a little straight left between.
  for (let pass = 0; pass < 6; pass++) for (let k = 0; k < n - 1; k++) { const L = nmBetween(NODES[k], NODES[k + 1]), sum = rad[k] + rad[k + 1]; if (sum > 0.94 * L) { const s = 0.94 * L / sum; rad[k] *= s; rad[k + 1] *= s; } }
  const pts = [NODES[0]];
  for (let k = 1; k < n; k++) {
    if (k === n - 1 || rad[k] <= 0) { pts.push(NODES[k]); continue; }
    const a = NODES[k - 1], c = NODES[k], b = NODES[k + 1], ta = rad[k] / nmBetween(a, c), tb = rad[k] / nmBetween(c, b);
    const A = [lerp(c[0], a[0], ta), lerp(c[1], a[1], ta)], B = [lerp(c[0], b[0], tb), lerp(c[1], b[1], tb)];
    pts.push(A);
    for (let i = 1; i < 24; i++) { const t = i / 24, om = 1 - t; pts.push([om * om * A[0] + 2 * om * t * c[0] + t * t * B[0], om * om * A[1] + 2 * om * t * c[1] + t * t * B[1]]); }
    pts.push(B);
  }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + nmBetween(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1], rad };
})();
{ // where the chapter joins fall along the dense path (the nearest filleted point to each node)
  const nearest = ll => { let best = 0, bd = Infinity; DENSE.pts.forEach((p, i) => { const d = nmBetween(p, ll); if (d < bd) { bd = d; best = i; } }); return DENSE.cum[best] / DENSE.total; };
  U_X = nearest(X_TURN); U_C1 = nearest(CHAN_1);
}
function posAtU(u) {   // u: 0..1 of the path's length
  const d = clamp01(u) * DENSE.total, c = DENSE.cum; let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
  const t = c[hi] > c[lo] ? (d - c[lo]) / (c[hi] - c[lo]) : 0;
  return [lerp(DENSE.pts[lo][0], DENSE.pts[hi][0], t), lerp(DENSE.pts[lo][1], DENSE.pts[hi][1], t)];
}
const H_STEP_NM = 0.01;   // heading is measured over this much path (about 18 m): small enough to be accurate, big enough to be stable
function headingAtU(u) {
  const du = H_STEP_NM / DENSE.total, back = u > 1 - du, a = posAtU(back ? u - du : u), b = posAtU(back ? u : u + du), cosLat = Math.cos(a[0] * Math.PI / 180);
  return ((Math.atan2((b[1] - a[1]) * cosLat, b[0] - a[0]) * 180 / Math.PI) + 360) % 360;
}
// a monotone cubic (Fritsch–Carlson) through the pace keyframes: u rises smoothly with p and never overshoots
function makePace(keys) {
  const n = keys.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h.push(keys[i + 1].p - keys[i].p); d.push((keys[i + 1].u - keys[i].u) / h[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]);
  return p => {
    if (p <= keys[0].p) return keys[0].u; if (p >= keys[n - 1].p) return keys[n - 1].u;
    let i = 0; while (i < n - 2 && p > keys[i + 1].p) i++;
    const t = (p - keys[i].p) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * keys[i].u + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * keys[i + 1].u + (t3 - t2) * h[i] * m[i + 1];
  };
}

/* ---------- nav-aid marks ----------
   Real charted marks from seamarks.json, picked by name (or, for the two unnamed Platte/Oyster beacons, by position + light character:
   identified against the Jersey pilotage syllabus in noirmont-transit, see its comments). Cardinal icons and the light-sequence label follow
   noirmont's look exactly. */
const NAVAID_NAMES = ['East Rock', "Dog's Nest Rock", 'No 2', 'No 4'];   // 4 Oct 2026, Simon: No 2, No 4 and Fort Charles North/East come off the plate in the Small Roads (they stay in the plotter's chart). 22 Oct 2026, Simon, circling them on the Admiralty chart: No 2 and No 4 (the red port channel buoys, Q R) go back on
const NAVAID_UNNAMED = [
  { match: [49.1693333, -2.1224333], as: 'Platte Beacon' },
  { match: [49.1683014, -2.1248513], as: 'Oyster Beacon' },
];
/* ---------- the leading lights ----------
   Ports of Jersey, Pilotage Directions Rev 17 (10 Jul 2025): section 6.3, "Red and Green Leading Lights in transit 022/202" (the Small Road: front Occ G 10 m 11 M, rear Occ R 18 m 12 M, synchronised, A 1604 / A 1604.1),
   and 6.8, after the Platte Beacon the lead "can be opened slightly to the West to shape the vessel up for the Pier Head approach (Pier Head lead, fixed Green lights 078/258)" (A 1609 / A 1609.1). The light positions are the
   charted ones in seamarks.json (checked: front-to-rear bearings come out at 023.0 and 077.9 degrees; X_TURN lies on the 078 line within 1 m). First pass, 22 Oct 2026: drawn as marks, as faint lead lines on the water, and as a small
   "what the master sees" panel where the two lights stack when she is on the line. Open: check the positions against an Admiralty chart before Hold the Line scores anything against them. */
const LEADS = [
  { id: 'small', title: 'Small Road lead', deg: '022', front: { at: [49.1773583, -2.1156513], as: 'Small Road lead, front', col: '#3dff7a', chr: 'Oc.G.5s 10m 11M (sync)' }, rear: { at: [49.1792572, -2.1144165], as: 'Small Road lead, rear', col: '#ff5a4d', chr: 'Oc.R.5s 18m 12M (sync)' }, tailNm: 1.3 },
  { id: 'pier', title: 'Pier Head lead', deg: '078', front: { at: [49.177036, -2.1110494], as: 'Pier Head lead, front', col: '#3dff7a', chr: 'F.G' }, rear: { at: [49.1771905, -2.1099515], as: 'Pier Head lead, rear', col: '#3dff7a', chr: 'F.G' }, tailNm: 0.5 },
];
function cardinalIcon(category) {
  const up = category === 'north', down = category === 'south', base = category === 'east';
  const bands = up ? ['#111', '#f4c20d'] : down ? ['#f4c20d', '#111'] : base ? ['#111', '#f4c20d', '#111'] : ['#f4c20d', '#111', '#f4c20d'];
  const x = 24, y = 32, bh = 21 / bands.length;
  const rects = bands.map((c, i) => `<rect x="${x - 6}" y="${(y - 6 + i * bh).toFixed(1)}" width="12" height="${bh.toFixed(1)}" fill="${c}"/>`).join('');
  const CK = 1.25, ch = 7.8 * CK, cw = 6.6 * CK;
  const cone = (cy, upward) => upward
    ? `<path d="M${x} ${(cy - ch).toFixed(1)} L${(x + cw).toFixed(1)} ${cy.toFixed(1)} L${(x - cw).toFixed(1)} ${cy.toFixed(1)} Z" fill="#111" stroke="#fff" stroke-width=".7"/>`
    : `<path d="M${x} ${cy.toFixed(1)} L${(x + cw).toFixed(1)} ${(cy - ch).toFixed(1)} L${(x - cw).toFixed(1)} ${(cy - ch).toFixed(1)} Z" fill="#111" stroke="#fff" stroke-width=".7"/>`;
  const c1 = y - 9, c2 = y - 9 - 9 * CK;
  const cones = up ? cone(c1, true) + cone(c2, true) : down ? cone(c1, false) + cone(c2, false) : base ? cone(c2, true) + cone(c1, false) : cone(c1, true) + cone(c2, false);
  return `<svg viewBox="0 0 48 48" width="25.9" height="25.9">${rects}${cones}</svg>`;
}
function lightLabel(m) {
  const ch = m['light:character']; if (!ch) return '';
  const grp = m['light:group'], per = m['light:period'];
  return ch + (grp && grp !== '1' ? '(' + grp + ')' : '') + (per ? per + 's' : '');
}

export async function mount(stage, o, ctx) {
  setWakeParams(o.wakeRun, o.wakeIntensity);
  const canvas = stage.querySelector('canvas.socean'), shipEl = stage.querySelector('.sship'), shipImg = shipEl.querySelector('img'), copyEl = stage.querySelector('.scopy');
  // 29 Oct 2026 (performance): the canvas size is read once when it changes (and in resize()), not from the DOM every time it is needed in a frame: those reads forced the browser to recalculate the page layout each time.
  const CS = { w: 0, h: 0 }; { const csRead = () => { CS.w = canvas.clientWidth; CS.h = canvas.clientHeight; }; csRead(); new ResizeObserver(csRead).observe(canvas); }
  const eyebrowEl = stage.querySelector('[data-g="eyebrow"]'), subEl = stage.querySelector('[data-g="sub"]');
  // The doors: a pill that opens the game flown in this scene (hold-the-line.js, berth-game-ui.js); scrolling on carries the story either way (the non-play equivalent).
  const doorEls = [...stage.querySelectorAll('[data-door]')].map(el => ({ el, key: el.dataset.door })).filter(d => o.doors && o.doors[d.key]);
  let holdGame = null, berthGame = null;
  for (const d of doorEls) {
    d.el.hidden = false;
    d.el.addEventListener('click', () => { const gme = d.key === 'berth' ? berthGame : holdGame; if (gme) gme.open(); });
  }
  // Holding the page still while Hold the Line is on. NOT an overflow:hidden on html/body: the home page already sets overflow on body, so adding one on html turns body into its own scroller and the sticky stage lets go of the
  // viewport (the scene slides off the top: 23 Oct 2026). Instead the wheel, touch and scroll keys are swallowed and the scrollbar is pinned.
  let lockY = 0, locked = false;
  const swallow = e => { e.preventDefault(); e.stopImmediatePropagation(); }, pinY = () => { if (Math.abs(scrollY - lockY) > 0.5) scrollTo({ top: lockY, behavior: 'instant' }); };
  const SCROLL_KEYS = [' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'], swallowKey = e => { if (SCROLL_KEYS.includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault(); };
  function lockPage() { if (locked) return; locked = true; lockY = scrollY; addEventListener('wheel', swallow, { passive: false, capture: true }); addEventListener('touchmove', swallow, { passive: false, capture: true }); addEventListener('keydown', swallowKey); addEventListener('scroll', pinY); }
  function unlockPage() { if (!locked) return; locked = false; removeEventListener('wheel', swallow, { capture: true }); removeEventListener('touchmove', swallow, { capture: true }); removeEventListener('keydown', swallowKey); removeEventListener('scroll', pinY); }
  const landmarkEls = {}; stage.querySelectorAll('[data-landmark]').forEach(el => { landmarkEls[el.dataset.landmark] = el; });
  const nm = ctx.base + '../noirmont-transit/', seaway = ctx.base + '../seaway-wake/', game = seaway + 'assets/game/';   // shared assets are used in place, not copied
  const assets = { normal: nm + 'assets/water-normal.png', sky: nm + 'assets/sky-env.png' };
  if (!shipImg.getAttribute('src')) shipImg.src = nm + 'assets/ship-plan.png';
  const EAST = o.heading === 'east'; shipImg.style.transform = EAST ? 'none' : 'rotate(90deg)'; stage.classList.toggle('east', EAST);
  stage.querySelector('.sfallback')?.style.setProperty('background-image', `url(${nm}assets/sea.jpg)`);
  shipEl.style.width = '48.7rem';   // the hull's on-screen length at the wide hold doesn't depend on this (see calibrate()): same as noirmont
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = (coarse && Math.min(innerWidth, innerHeight) <= 480) || o.forceStatic === true;
  if (mobile) { console.warn('[st-helier-approach] static fallback: small touch viewport'); stage.classList.add('nogl'); return staticCtrl(stage, shipEl, copyEl, o); }
  if (ctx.reduced) o = Object.assign({}, o, { bob: 0, flow: Math.min(o.flow, 0.3) });

  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required for the wake simulation'); }
  catch (e) { console.warn('[st-helier-approach] static fallback: WebGL unavailable —', e && e.message); stage.classList.add('nogl'); return staticCtrl(stage, shipEl, copyEl, o); }
  renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x02484b, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000); camera.up.set(EAST ? 1 : 0, EAST ? 0 : 1, 0);
  scene.add(new THREE.AmbientLight(0xffffff, .9));
  const SUN_EL = THREE.MathUtils.degToRad(o.sunElevation), SUN_DIST = 60;
  const sun = new THREE.DirectionalLight(0xfff4e0, 5.5); sun.position.set(-Math.cos(SUN_EL) * SUN_DIST, Math.sin(SUN_EL) * SUN_DIST, 0); scene.add(sun);
  const RES = (coarse || innerWidth <= 900) ? 192 : o.resolution;
  const wake = createWakeSimulation(renderer, { resolution: RES, bounds: BOUNDS, shipWidth: 2.2 / BOUNDS, shipLength: SHIP_LENGTH_WORLD / BOUNDS, shipSpeed: o.shipSpeed, wakeIntensity: o.wakeIntensity });
  const loader = new THREE.TextureLoader();
  const [normalMap, skyTex] = await Promise.all([loader.loadAsync(assets.normal), loader.loadAsync(assets.sky)]);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping; normalMap.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy()); normalMap.generateMipmaps = true; normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  skyTex.mapping = THREE.EquirectangularReflectionMapping; skyTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); const envMap = pmrem.fromEquirectangular(skyTex).texture; pmrem.dispose(); scene.environment = envMap;
  const { mat, uni } = makeOcean(wake, normalMap, envMap, RES);
  uni.uFlow.value = o.flow;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 150, 150), mat); plane.rotation.x = -Math.PI / 2; scene.add(plane);

  // where she is right now (set at the top of update()), and the maths that places everything else relative to her
  let curU = 0, curPos = posAtU(0), geoK = 1, curHdg = headingAtU(0), lastPlateView = null, pNow = 0;
  function bearingDistTo(latlng) {
    const a = curPos, cosLat = Math.cos(a[0] * Math.PI / 180), dLat = (latlng[0] - a[0]) * 60, dLng = (latlng[1] - a[1]) * 60 * cosLat;
    return { brg: ((Math.atan2(dLng, dLat) * 180 / Math.PI) + 360) % 360, nm: Math.hypot(dLat, dLng) };
  }
  // north = world +X = screen up, east = world +Z = screen right (this camera's east-heading convention). geoK scales the land/plates relative
  // to the hull (1 = the game's own exaggerated hull; the harbour chapters can bring it to true scale).
  function worldOffsetTo(_pp, latlng) { const { brg, nm: d } = bearingDistTo(latlng), rel = brg * Math.PI / 180, r = (d / NM_PER_UNIT) * geoK; return [Math.cos(rel) * r, Math.sin(rel) * r]; }

  // ---- the plates: three streamed tiers (noirmont's bay-z16 / harbour-z18 / harbour-z19) plus this beat's own sharper marina tier when it exists ----
  const coastMeshes = []; let streamAlive = true; const streamed = []; let fallbackWide = null;   // fallbackWide: the whole wide plate, harbour included, lying under the erased one and shown only while sharper tiles that the view needs have not arrived (31 Oct 2026: otherwise the erased hole shows bare sea, the land missing, until they load)
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  async function wideWithout(url, mt, rects) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const cv = document.createElement('canvas'); cv.width = mt.w; cv.height = mt.h; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, mt.w, mt.h);
    const b = mt.bounds, y0 = mercY(b.north), y1 = mercY(b.south), X = l => (l - b.west) / (b.east - b.west) * mt.w, Y = l => (y0 - mercY(l)) / (y0 - y1) * mt.h;
    for (const r of rects) { const x = X(r.west), y = Y(r.north); g.clearRect(x, y, X(r.east) - x, Y(r.south) - y); }
    return URL.createObjectURL(await new Promise(res => cv.toBlob(res, 'image/png')));
  }
  function addCoastPlate(src, wPx, hPx, mPerPx, bounds, order, feather) {
    const plate = createCoastPlate(scene, renderer, { src, wPx, hPx, mPerPx, mPerUnit: M_PER_UNIT, bounds, order, scale: 1, feather });
    plate.m.rotation.set(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ'); coastMeshes.push(plate); return plate.m;
  }
  if (o.coast) {
    const jget = u => fetch(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });   // 26 Oct 2026: always recheck the plate lists: the browser had been keeping an old plates.json (and so the old chunk version stamps) for days after a plate fix
    const manifests = [nm + 'assets/plates/', ctx.base + 'assets/plates/'];   // noirmont's tiers, then ours (optional: absent until the marina tier is built)
    Promise.all(manifests.map(base => jget(base + 'plates.json').then(pl => ({ base, pl })).catch(() => null))).then(async lists => {
      const have = lists.filter(Boolean), coverage = have.flatMap(h => h.pl.coverage || []);
      const mt = await jget(game + 'wide-plate.json'); let src = game + mt.file;
      if (coverage.length) { try { src = await wideWithout(src, mt, coverage); } catch (e) { console.warn('[st-helier-approach] wide-plate erase failed', e); } }
      if (!streamAlive) return;
      addCoastPlate(src, mt.w, mt.h, mt.mPerPx, mt.bounds, 1);
      if (src !== game + mt.file) fallbackWide = addCoastPlate(game + mt.file, mt.w, mt.h, mt.mPerPx, mt.bounds, 0.5);
      const sw = await jget(game + 'sw-plate.json'); if (!streamAlive) return;
      addCoastPlate(seaway + GEO.plate.src, sw.w, sw.h, sw.mPerPx, sw.bounds, 2, SW_PLATE_FEATHER);
      const drop = new Set(have.flatMap(h => h.pl.replaces || []));   // chunks this beat patched (tools/plates-build/patch-blobs.js): use the patched copy, not noirmont's original
      for (const { base, pl } of have) for (const t of pl.tiers) for (const m of t.chunks) if (!drop.has(m.file)) streamed.push({ m, base, ver: pl.v || "", order: t.order, tier: t.name, plate: null, centre: [(m.bounds.north + m.bounds.south) / 2, (m.bounds.west + m.bounds.east) / 2], half: Math.hypot(m.w, m.h) / 2 * m.mPerPx });
      primePlates();
    }).catch(e => console.warn('[st-helier-approach] coast plates failed', e));
  }
  function drawCoast() { for (const c of coastMeshes) { placeCoastPlateNorthUp(c, 0, worldOffsetTo); c.m.scale.set(geoK, geoK, 1); } }   // the plates grow with geoK about their own centres, as their positions do
  // finer tiers only wake once the view is close enough to show their detail: [load below, keep below] in metres of ground per screen pixel
  const TIER_MPP = { 'harbour-z18': [2.2, 3.5], 'harbour-z19': [0.55, 0.9], 'marina-z19': [0.55, 0.9] };
  function makeStreamPlate(s) {
    const plate = createCoastPlate(scene, renderer, { src: s.base + s.m.file + (s.ver ? "?v=" + s.ver : ""), wPx: s.m.w, hPx: s.m.h, mPerPx: s.m.mPerPx, mPerUnit: M_PER_UNIT, bounds: s.m.bounds, order: s.order, scale: 1, feather: s.m.feather });
    plate.m.rotation.set(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ'); plate.m.visible = false; plate.m.material.opacity = 0.97; s.plate = plate;
  }
  // This beat becomes active only when the scroll reaches it, so its plates would otherwise start loading at that very moment (a hitch at the seam with
  // noirmont-transit, which has them resident already). So at mount: build the wide-hold tier now (textures upload as the images arrive, before any frame needs
  // them), and warm the HTTP cache with the sharper chunks the zoom-in will want, a few at a time while the page is idle.
  function primePlates() {
    for (const s of streamed) if (s.tier === 'bay-z16' && !s.plate && bearingDistTo(s.centre).nm * 1852 < 4200) makeStreamPlate(s);
    const nearPath = ll => { for (let i = 0; i < DENSE.pts.length; i += 6) if (nmBetween(DENSE.pts[i], ll) < 0.3) return true; return nmBetween(DENSE.pts[DENSE.pts.length - 1], ll) < 0.3; };
    const urls = streamed.filter(s => s.tier !== 'bay-z16' && nearPath(s.centre)).map(s => s.base + s.m.file);
    let i = 0; const next = () => { if (!streamAlive || i >= urls.length) return; fetch(urls[i++], { priority: 'low' }).catch(() => {}).finally(() => setTimeout(next, 80)); };
    setTimeout(next, 2000);
  }
  function updatePlates(visH_u, off_u) {
    if (!streamed.length) return;
    const unitM = M_PER_UNIT / geoK, H = CS.h || innerHeight, visH = visH_u * unitM, visW = visH * camera.aspect, mpp = visH / H;
    const radius = Math.hypot(visW, visH) / 2 + Math.abs(off_u) * unitM; lastPlateView = { mpp, radius, visH, geoK };
    let loading = 0; for (const s of streamed) if (s.plate && !s.plate.m.visible) loading++;
    for (const s of streamed) {
      const dist = bearingDistTo(s.centre).nm * 1852, [loadBelow, keepBelow] = TIER_MPP[s.tier] || [Infinity, Infinity];
      if (!s.plate) {
        if (loading < 3 && mpp < loadBelow && dist < radius + s.half + 250) { makeStreamPlate(s); loading++; }
      } else if (dist > radius + s.half + 900 || mpp > keepBelow) {
        scene.remove(s.plate.m); s.plate.m.geometry.dispose(); s.plate.m.material.map?.dispose(); s.plate.m.material.dispose(); s.plate = null; continue;
      }
      if (s.plate) { placeCoastPlateNorthUp(s.plate, 0, worldOffsetTo); s.plate.m.scale.set(geoK, geoK, 1); if (!s.plate.m.visible && s.plate.m.material.map?.image) s.plate.m.visible = true; }
    }
    if (fallbackWide) { let pending = 0; for (const s of streamed) { const lb = (TIER_MPP[s.tier] || [Infinity])[0]; if (mpp < lb && bearingDistTo(s.centre).nm * 1852 < radius + s.half && !(s.plate && s.plate.m.visible)) pending++; } fallbackWide.visible = pending > 0; }
  }

  // ---- nav-aid marks ----
  let markEls = [];
  fetch(game + 'seamarks.json').then(r => r.json()).then(j => {
    const all = j.marks || [];
    const named = all.filter(m => NAVAID_NAMES.includes(m.name));
    const unnamed = NAVAID_UNNAMED.map(u => { const f = all.find(m => !m.name && Math.abs(m.lat - u.match[0]) < 0.0005 && Math.abs(m.lon - u.match[1]) < 0.0005); return f ? Object.assign({}, f, { name: u.as }) : null; }).filter(Boolean);
    const leadLights = LEADS.flatMap(L => [L.front, L.rear]).map(d => { const f = all.find(m => Math.abs(m.lat - d.at[0]) < 0.00005 && Math.abs(m.lon - d.at[1]) < 0.00005 && m['light:character']); return f ? Object.assign({}, f, { name: d.as, chr: d.chr }) : null; }).filter(Boolean);
    markEls = [...named, ...unnamed, ...leadLights].map(m => {
      const el = document.createElement('div'); el.className = 'snavaid' + (/^buoy_lateral/.test(m.type || '') ? ' chan' : '');   // channel markers (lateral buoys): smaller and dimmer, 22 Oct 2026
      const category = m['buoy_cardinal:category'] || m['beacon_cardinal:category'];
      const iconHtml = category ? cardinalIcon(category) : '';
      const lcol = (m['light:colour'] || 'white').replace(/[^a-z]/g, '');
      const dotHtml = m['light:character'] ? `<i class="dot${lcol === 'green' ? ' g' : ''}" style="--lc:${lcol === 'green' ? '#3dff7a' : lcol}"></i>` : '';
      const plainHtml = (!dotHtml && !iconHtml) ? `<i class="plain"></i>` : '';
      const lbl = m.chr || lightLabel(m);
      el.innerHTML = `<span class="mark-visual">${dotHtml}${iconHtml}${plainHtml}</span><p class="name">${m.name}${lbl ? ` <span class="chr">${lbl}</span>` : ''}</p>`;
      stage.appendChild(el);
      return { m, at: [m.lat, m.lon], el, dotEl: el.querySelector('.dot'), visEl: el.querySelector('.mark-visual'), vec: new THREE.Vector3(), small: /^Small Road lead/.test(m.name || '') };
    });
  }).catch(e => console.warn('[st-helier-approach] seamarks fetch failed', e));
  const lmVec = new THREE.Vector3();
  function placeNavAids(t) {
    const W = CS.w || innerWidth, H = CS.h || innerHeight;
    for (const mk of markEls) {
      const [x, z] = worldOffsetTo(0, mk.at); mk.vec.set(x, 0.3, z).project(camera);
      const onScreen = mk.vec.z < 1 && Math.abs(mk.vec.x) < 1.15 && Math.abs(mk.vec.y) < 1.15;
      const gone = mk.small ? smooth(U_GAP, U_GAP + 0.05, curU) : 0;   // 22 Oct 2026, Simon: the Small Road lead is not shown once she is inside the harbour (it fades out over the pier heads)
      if (!onScreen || gone > 0.995) { mk.el.style.opacity = '0'; continue; }
      mk.el.style.left = ((mk.vec.x * 0.5 + 0.5) * W).toFixed(1) + 'px'; mk.el.style.top = ((1 - (mk.vec.y * 0.5 + 0.5)) * H).toFixed(1) + 'px'; mk.el.style.opacity = (1 - gone).toFixed(2);
      if (!mk.sized) { const w = mk.visEl.offsetWidth; if (w) { mk.el.style.setProperty('--half', (w / 2) + 'px'); mk.sized = true; } }
      if (mk.dotEl) {
        const ph = lightPhase(t, mk.m);
        // 22 Oct 2026, Simon: "lets have all lights kept visible (outlined but dim) between flashes". Every light keeps its marker with a dark rim all the time; the flash only brightens it and lights its glow (.dot.solid / .lit in beat.css).
        // (It started as Dog's Nest Rock "appearing randomly": a slow flash, dark for most of three seconds, drawn at 25% opacity on the satellite imagery.)
        mk.dotEl.style.opacity = '1'; mk.dotEl.classList.add('solid'); mk.dotEl.classList.toggle('lit', ph > 0.5);
      }
    }
  }

  // ---- the leading lines and the "what the master sees" panel ----
  const SVGNS = 'http://www.w3.org/2000/svg';
  const leadSvg = document.createElementNS(SVGNS, 'svg'); leadSvg.setAttribute('class', 'slead-lines'); stage.appendChild(leadSvg);
  const leadEls = LEADS.map(L => {
    // 31 Oct 2026 (performance): each lead is two thin strips (a dark one under a light one, both dashed by a gradient) moved with a transform, not an SVG line with a drop-shadow filter. The SVG line was redrawn over a
    // box as big as the screen (or much bigger: the line runs out to sea for miles) every frame, which held the Small Roads at 14-27 fps on a 1920x960 window; a transform only moves a ready-made layer (60 fps).
    const sh = document.createElement('div'), ln = document.createElement('div'); sh.className = 'lead-strip lead-sh'; ln.className = 'lead-strip lead-ln'; stage.appendChild(sh); stage.appendChild(ln);
    return Object.assign(L, { strips: [sh, ln], w: 0 });
  });
  const hud = document.createElement('div'); hud.className = 'slead-hud'; hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<p class="lh-title"></p><svg viewBox="0 0 160 120" width="160" height="120"><line x1="80" y1="6" x2="80" y2="112" class="lh-axis"/>' +
    '<circle class="lh-rear" cx="80" cy="30" r="5.5"/><circle class="lh-front" cx="80" cy="86" r="8"/></svg><p class="lh-state"></p>';
  stage.appendChild(hud);
  const hudEls = { title: hud.querySelector('.lh-title'), state: hud.querySelector('.lh-state'), rear: hud.querySelector('.lh-rear'), front: hud.querySelector('.lh-front') };
  const U_GAP = (() => { let best = 0, bd = Infinity; DENSE.pts.forEach((pt, i) => { const d = nmBetween(pt, GAP_MID); if (d < bd) { bd = d; best = i; } }); return DENSE.cum[best] / DENSE.total; })();
  const leadVec = new THREE.Vector3();
  function leadXY(ll, W, H) { const [x, z] = worldOffsetTo(0, ll); leadVec.set(x, 0, z).project(camera); return [(leadVec.x * 0.5 + 0.5) * W, (1 - (leadVec.y * 0.5 + 0.5)) * H]; }
  function leadGeom(L) {   // metres east / north of the front light: the unit vector front -> rear (the line runs out to sea behind the front light), and the ship's position
    const k = Math.cos(L.front.at[0] * Math.PI / 180), e = ll => [(ll[1] - L.front.at[1]) * 111320 * k, (ll[0] - L.front.at[0]) * 111320];
    const r = e(L.rear.at), len = Math.hypot(r[0], r[1]), d = [r[0] / len, r[1] / len], s = e(curPos);
    const along = -(s[0] * d[0] + s[1] * d[1]);                    // metres from the front light back along the line to the ship (positive = on the sea side, approaching)
    const xte = d[0] * s[1] - d[1] * s[0];                         // positive = ship is to the left of the line, looking in toward the lights
    return { len, d, along, xte };
  }
  function placeLeads(t, p) {
    const W = CS.w || innerWidth, H = CS.h || innerHeight;
    leadSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const swap = smooth(U_X - 0.035, U_X + 0.025, curU), wSmall = 1 - swap, wPier = swap * (1 - smooth(U_GAP, U_GAP + 0.05, curU));   // the lead changes over the turn itself (the turn is about 41 m each side of X, a path fraction of about 0.03)
    for (const L of leadEls) {
      L.w = L.id === 'small' ? wSmall : wPier;
      const g = leadGeom(L), k = Math.cos(L.front.at[0] * Math.PI / 180), nmM = 1852;
      const seaward = [L.front.at[0] - g.d[1] * L.tailNm * nmM / 111320, L.front.at[1] - g.d[0] * L.tailNm * nmM / (111320 * k)];
      const a = leadXY(seaward, W, H), b = leadXY(L.rear.at, W, H);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.min(8000, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx) * 180 / Math.PI, op = ((0.14 + 0.5 * L.w) * (1 - smooth(U_GAP, U_GAP + 0.05, curU))).toFixed(2);   // both lines fade out as she passes the pier heads
      for (const e of L.strips) { e.style.width = len.toFixed(1) + 'px'; e.style.transformOrigin = len.toFixed(1) + 'px 50%'; e.style.transform = 'translate(' + (b[0] - len).toFixed(1) + 'px,' + b[1].toFixed(1) + 'px) rotate(' + ang.toFixed(3) + 'deg)'; e.style.opacity = op; }   // (the strip ends at the rear light, b, and runs back out to sea; its dashes start from that end)
    }
    const act = wSmall >= wPier ? leadEls[0] : leadEls[1], g = leadGeom(act), dF = Math.max(8, g.along), dR = dF + g.len;
    const sepDeg = (Math.atan(g.xte / dF) - Math.atan(g.xte / dR)) * 180 / Math.PI, off = Math.max(-58, Math.min(58, sepDeg * 34));   // the front light shows to the right of the rear one when she is left of the line
    hudEls.rear.setAttribute('cx', (80 - off / 2).toFixed(1)); hudEls.front.setAttribute('cx', (80 + off / 2).toFixed(1));
    const lf = lightPhase(t, markEls.find(m => m.m.name === act.front.as)?.m || { 'light:character': 'F' }), lr = lightPhase(t, markEls.find(m => m.m.name === act.rear.as)?.m || { 'light:character': 'F' });
    hudEls.front.style.setProperty('--lc', act.front.col); hudEls.rear.style.setProperty('--lc', act.rear.col);
    hudEls.front.classList.toggle('lit', lf > 0.5); hudEls.rear.classList.toggle('lit', lr > 0.5);
    hudEls.title.textContent = act.title + ' ' + act.deg + '\u00b0';
    const m = Math.abs(g.xte); hudEls.state.textContent = m < 6 ? 'on the line' : m.toFixed(0) + ' m ' + (g.xte > 0 ? 'left' : 'right') + ' of the line'; hud.classList.toggle('on-line', m < 6);
    hud.style.opacity = (Math.max(wSmall, wPier) * smooth(0.02, 0.07, p)).toFixed(3);
  }

  // ---- berth dressing: the superyacht pontoon along the Albert Pier wall, the yacht ahead, and the yacht across the channel on the New North Quay ----
  // The satellite imagery predates the pontoon (and shows the berths empty), so they are drawn here as flat things in the scene, placed from real lat/lng exactly
  // like the plates (so they grow with geoK and stay on the quay). The pontoon is a ribbon that follows the curved wall. The second hull is the plan-view yacht,
  // greyer; the New North Quay yacht is a sprite cut from a photograph (tools/plates-build/sprite-cutout.js). Placeholders in the plain sense: real artwork can replace them.
  const dress = [];
  function addFlat(wM, hM, material, at, hdgDeg, fade) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM / M_PER_UNIT, hM / M_PER_UNIT), material); mesh.rotation.set(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ'); mesh.renderOrder = 20;
    const group = new THREE.Group(); group.add(mesh); group.visible = false; scene.add(group); dress.push({ group, mesh, material, at, hdg: hdgDeg, rotate: true, fade });
  }
  {
    // a 3 m x 3 m tile of teak decking (so nothing stretches whatever the piece's width): planks 0.12 m wide along x, seams, staggered butt joints every 1.5 m, a little grain
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 192; const g = cv.getContext('2d'), PW = 192 / 25;
    for (let r = 0; r < 25; r++) { const k = 0.9 + 0.2 * ((r * 37 % 11) / 10); g.fillStyle = 'rgb(' + Math.round(174 * k) + ',' + Math.round(114 * k) + ',' + Math.round(72 * k) + ')'; g.fillRect(0, r * PW, 192, PW + 1);
      g.fillStyle = 'rgba(52,30,16,.55)'; g.fillRect(0, r * PW, 192, 1); const off = (r * 61) % 96; for (const x of [off, off + 96]) g.fillRect(x, r * PW, 1, PW); }
    for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(' + (i % 2 ? '255,225,190' : '40,22,10') + ',' + (0.04 + (i * 7 % 10) / 160) + ')'; g.fillRect((i * 53) % 192, (i * 97) % 192, 3, 1); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    const pm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, side: THREE.DoubleSide });
    // the pieces (DOCK_PIECES) as flat polygons in world units relative to the kink (north = +x, east = +z); texture coordinates are metres on the ground / 3, along and across each piece's longest edge
    const pos = [], uv = [], idx = [], toEN = ll => [(ll[1] - FACE[0][1]) * M_LAT * COS_F, (ll[0] - FACE[0][0]) * M_LAT];
    for (const poly of DOCK_PIECES) {
      const c = poly.map(toEN), base = pos.length / 3; let ax = [1, 0], best = 0;
      for (let i = 0; i < c.length; i++) { const p = c[i], q = c[(i + 1) % c.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > best) { best = l; ax = [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; } }
      const vd = [-ax[1], ax[0]];
      c.forEach(p => { pos.push(p[1] / M_PER_UNIT, 0, p[0] / M_PER_UNIT); uv.push((p[0] * ax[0] + p[1] * ax[1]) / 3, (p[0] * vd[0] + p[1] * vd[1]) / 3); });
      for (const t of THREE.ShapeUtils.triangulateShape(c.map(p => new THREE.Vector2(p[0], p[1])), [])) idx.push(base + t[0], base + t[1], base + t[2]);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, pm); mesh.renderOrder = 20; mesh.frustumCulled = false;
    const group = new THREE.Group(); group.add(mesh); group.visible = false; scene.add(group); dress.push({ group, mesh, material: pm, at: FACE[0], hdg: 0, rotate: false, fade: [0.50, 0.66] });
  }
  new THREE.TextureLoader().load(nm + 'assets/ship-plan.png', t => {
    t.colorSpace = THREE.SRGBColorSpace; const asp = t.image ? t.image.naturalHeight / t.image.naturalWidth : 0.2;
    // the yacht already berthed (south box, bow south): a greyer hull so it isn't a twin of the one under way
    const s = NEIGH.s;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, opacity: 0, color: 0xcfd6dc });
    addFlat(NEIGH.lenM, NEIGH.lenM * asp, m, faceAt(s, NEIGH_OFFSET_M), NEIGH.hdg, [0.50, 0.66]);
  });
  new THREE.TextureLoader().load(ctx.base + 'assets/nnq-yacht.png', t => {
    t.colorSpace = THREE.SRGBColorSpace; const asp = t.image ? t.image.naturalHeight / t.image.naturalWidth : 0.18, lenM = NNQ_LEN_M;
    // across the channel on the New North Quay, bow north-north-east like the others, 10 m off the quay edge (its west side), mid-point abeam the blue crane
    const a = NNQ[0], cosLat = Math.cos(a[0] * Math.PI / 180), q = ll => [(ll[1] - a[1]) * 111320 * cosLat, (ll[0] - a[0]) * 111320];   // [east, north] metres from the quay's south end
    const e1 = q(NNQ[3]), L = Math.hypot(e1[0], e1[1]), u = [e1[0] / L, e1[1] / L], cr = q(NNQ_CRANE), s = cr[0] * u[0] + cr[1] * u[1];   // s: how far along the quay the crane is
    const mid = offsetM(a, u[0] * s, u[1] * s);
    const brg = (Math.atan2(u[0], u[1]) * 180 / Math.PI + 360) % 360, west = (brg - 90) * Math.PI / 180;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
    addFlat(lenM, lenM * asp * NNQ_BEAM, m, offsetM(mid, NNQ_OFF * Math.sin(west), NNQ_OFF * Math.cos(west)), brg, [0.46, 0.62]);   // NNQ_OFF m off the quay line: her side (half beam ~9 m) clear of the edge, as Kinship's is of the pontoon
  });
  {
    // 29 Oct 2026, Simon (from the Admiralty chart): the Small Road lead's front light (Oc.G.5s) stands on a dolphin, a small round platform of piles out in the water west of the Albert Pier root. The satellite plate
    // shows only sea there (the water mask takes anything standing in the water), so it is drawn here as a small round island of concrete, placed from the light's own lat/lng like the plates (about 7 m across, big enough to read at the plate's scale).
    const PXM_D = 64, cv = document.createElement('canvas'); cv.width = cv.height = 6 * PXM_D; const g = cv.getContext('2d'); g.translate(3 * PXM_D, 3 * PXM_D); g.scale(PXM_D, PXM_D);
    g.save(); g.shadowColor = 'rgba(0,25,35,.55)'; g.shadowBlur = 0.35; g.shadowOffsetX = 0.12; g.shadowOffsetY = 0.18; g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, 2.15, 0, 7); g.fill(); g.restore();   // a soft shadow on the water
    g.fillStyle = '#e9efe9'; g.beginPath(); g.arc(0, 0, 2.3, 0, 7); g.fill();                                     // a pale wet rim of foam where the sea meets the piles
    const gr = g.createRadialGradient(-0.5, -0.5, 0.2, 0, 0, 2.15); gr.addColorStop(0, '#b9bec0'); gr.addColorStop(.75, '#9aa1a4'); gr.addColorStop(1, '#6f777b'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 2.15, 0, 7); g.fill();   // the concrete deck
    g.strokeStyle = 'rgba(55,62,66,.55)'; g.lineWidth = 0.07; g.beginPath(); g.arc(0, 0, 1.55, 0, 7); g.stroke();   // the edge of the deck slab
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = 2.02; g.fillStyle = '#4d5459'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.17, 0, 7); g.fill(); }   // the ring of piles
    g.fillStyle = '#3f464a'; g.beginPath(); g.arc(0, 0, 0.42, 0, 7); g.fill(); g.fillStyle = '#7f898d'; g.beginPath(); g.arc(-0.06, -0.06, 0.26, 0, 7); g.fill();   // the light's pole and its base
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    addFlat(9.6, 9.6, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, side: THREE.DoubleSide }), LEADS[0].front.at, 0, [-1, -0.5]);   // (always on: the plate has the sea there from the first frame)
  }
  function placeDressing(p) {
    for (const d of dress) {
      const k = smooth(d.fade[0], d.fade[1], p); d.group.visible = k > 0.002; if (!d.group.visible) continue;
      const [x, z] = worldOffsetTo(0, d.at); d.group.position.set(x, 0.35, z); d.group.scale.set(geoK, geoK, geoK); if (d.rotate) d.group.rotation.y = -(d.hdg - 90) * Math.PI / 180; d.material.opacity = k;
    }
  }

  const quay = o.quayTail > 0 ? createQuayWork({ scene, stage, faceAt, worldOffsetTo, M_PER_UNIT, KIN_S, project: ll => leadXY(ll, CS.w || innerWidth, CS.h || innerHeight) }) : null, QF = quay ? quay.focus() : null;

  // ---- the entrance signals (an easter egg), shared with noirmont-transit: 2 green over 1 white until she is abeam of Platte Beacon, then 3 red (see _shared/entrance-signals.js) ----
  const signals = createEntranceSignals(stage), sigVec = new THREE.Vector3();
  let pxPerM = 1;
  function placeSignals() {
    const W = CS.w || innerWidth, H = CS.h || innerHeight;
    signals.place(SIGNAL_TIPS.map(at => { const [x, z] = worldOffsetTo(0, at); sigVec.set(x, 0.4, z).project(camera);
      return { x: (sigVec.x * 0.5 + 0.5) * W, y: (1 - (sigVec.y * 0.5 + 0.5)) * H, on: sigVec.z < 1 && Math.abs(sigVec.x) < 1.1 && Math.abs(sigVec.y) < 1.1 }; }), abeamPlatte(curPos, curHdg), pxPerM);
  }

  // ---- plotter: measured against THIS path (so cross-track error stays meaningful past the last charted point) ----
  let plotZoom = 0;
  let curSpeed = 12;   // noirmont's figure at the start; follows o.speed
  let exitFix = null;   // chapter 5: where the plotter says the yacht is while the "Leaving St Helier" film plays ({ pos, hdg, kn }), null the rest of the time
  const tilt = o.tilt !== false ? mountTiltShift(stage) : null;   // the miniature look: top and bottom of the frame softly blurred (see _shared/tilt-shift.js)
// The plotter's grey dashed lines here are the real transits, not Howard's old pilotage tail: GEO.pilotage past East Rock (index 5) was an unverified straight line to the harbour that contradicts the leading lights (23 Oct 2026, Simon),
  // so it is cut at East Rock, and the Small Road lead and the Pier Head lead are drawn dashed instead, from out at sea (tailNm) to the rear light.
  const leadLines = LEADS.map(L => { const k = Math.cos(L.front.at[0] * Math.PI / 180), r = [(L.rear.at[1] - L.front.at[1]) * 111320 * k, (L.rear.at[0] - L.front.at[0]) * 111320], len = Math.hypot(r[0], r[1]), d = [r[0] / len, r[1] / len], t = L.tailNm * 1852;
    return [[L.front.at[0] - d[1] * t / 111320, L.front.at[1] - d[0] * t / (111320 * k)], L.rear.at]; });
  // The planned track keeps its tail (23 Oct 2026, Simon: "our solid line drops away from behind us"): the plotter's route starts back at the old Noirmont route, so the line she has come along stays drawn behind her as she zooms in.
  const plotRoute = [ROUTE[0], ROUTE[1], ROUTE[2], ...NODES], plotNames = ['Western Passage', 'East Rock', ...PLOT_NAMES];   // (the beat now starts on the leg after ROUTE[2], East Rock gate)
  const plotGEO = Object.assign({}, GEO, { names: plotNames, pilotage: GEO.pilotage.slice(0, 6), leadLines });
  // ---- chapter 5, the way out (4 Nov 2026, Simon: "make sure the plotter updates and tracks relative to the vessel positions on the video clips of the yacht leaving the harbour and small roads") ----
  // The film (videos/journey/journey-6-departure.mp4, 15.4 s) is scrubbed by the scroll over pz 2.20 to 2.62 (videoMoments, above) and leaves the berth, goes up the channel, out between the pier heads and
  // along the Small Roads to open water. While it plays, the plotter's ship goes the same way: back along the arrival path, then on back along the arrival route (EXIT), at the film's own time.
  // FILM_KEYS: [seconds into the film, nm along EXIT, knots], read off the film's frames (0 to 3.5 s the berth and the basin, 4.5 to 7.5 s the aerials of the harbour and the pier heads, 9 to 12 s overhead on the water in the
  // Small Roads, 13.5 s on far out). Tune them here if the ship on the plotter ever runs ahead of, or behind, the yacht in the picture.
  const EXIT = (() => {
    const pts = DENSE.pts.slice().reverse().concat([ROUTE[2], ROUTE[1], ROUTE[0]]), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + nmBetween(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    const dOf = ll => { let best = 0, bd = Infinity; pts.forEach((q, i) => { const d = nmBetween(q, ll); if (d < bd) { bd = d; best = i; } }); return cum[best]; };
    const pos = d => { d = Math.max(0, Math.min(total, d)); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
      const t = cum[hi] > cum[lo] ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0; return [lerp(pts[lo][0], pts[hi][0], t), lerp(pts[lo][1], pts[hi][1], t)]; };
    const hdg = d => { const a = pos(d - 0.012), b = pos(d + 0.012), cosLat = Math.cos(a[0] * Math.PI / 180); return ((Math.atan2((b[1] - a[1]) * cosLat, b[0] - a[0]) * 180 / Math.PI) + 360) % 360; };
    return { pos, hdg, dOf, total, dStart: DENSE.total };
  })();
  const FILM_S = 15.35, FILM_PZ = [2.20, 2.62];   // the film's length (less the 0.05 s the scrub keeps clear of the end) and the pz window it is scrubbed over: keep in step with videoMoments 'departure'
  const FILM_KEYS = (() => { const dK = EXIT.dOf(K_TURN), dGap = EXIT.dOf(GAP_MID), dX = EXIT.dOf(X_TURN), dS = EXIT.dStart;
    return [[0, 0, 0.3], [1.5, 0.03, 1.5], [3.5, 0.5 * dK, 3.5], [4.5, 0.85 * dK, 4.5], [6.0, dK, 5], [7.5, dGap, 5], [9.0, dX, 6.5], [12.0, dS, 10.5], [13.5, dS + 0.5, 12], [15.4, Math.min(EXIT.total, dS + 1.4), 13]]; })();
  function exitAt(pz, hdg0) {   // the plotter's ship at this point of the scroll: null until the film starts
    if (pz <= FILM_PZ[0]) return null;
    const tf = clamp01((pz - FILM_PZ[0]) / (FILM_PZ[1] - FILM_PZ[0])) * FILM_S;
    let i = 0; while (i < FILM_KEYS.length - 2 && tf > FILM_KEYS[i + 1][0]) i++;
    const a = FILM_KEYS[i], b = FILM_KEYS[i + 1], k = clamp01((tf - a[0]) / (b[0] - a[0])), d = lerp(a[1], b[1], k), out = EXIT.hdg(d);
    return { pos: EXIT.pos(d), hdg: hdg0 + (((out - hdg0 + 540) % 360) - 180) * smooth(0, 3, tf), kn: lerp(a[2], b[2], k) };   // she starts on the berth's heading and swings onto the way out over the first three seconds
  }
  const plotter = o.nav !== false ? mountNavPlotter(stage, { GEO: plotGEO, route: plotRoute, shipLatLng: () => exitFix ? exitFix.pos : curPos, headingDeg: () => exitFix ? exitFix.hdg : curHdg, speedKts: () => exitFix ? exitFix.kn : curSpeed, zoomTarget: () => plotZoom, hiChart: [{ src: ctx.base + 'assets/chart-mid.webp', meta: ctx.base + 'assets/chart-mid.json', from: 0.25, span: 0.10 }, { src: ctx.base + 'assets/chart-hi.webp', meta: ctx.base + 'assets/chart-hi.json', from: 0.8, span: 0.4 }]   /* the wide z16 chart over the whole approach from a quarter of the main chart's scale, the sharp z18 harbour chart over it for the closest zooms (23 Oct 2026, Simon: the sharp chart showed as a rectangle) */, compact: coarse, assetsBase: seaway, markNames: NAVAID_UNNAMED }) : null;
  const vm = (o.video !== false && o.videoMoments && o.videoMoments.length) ? mountVideoMoment(stage, { moments: o.videoMoments.map(m => Object.assign({ src: ctx.base + '../../videos/journey/' + m.file + '.mp4', poster: ctx.base + '../../videos/journey/' + m.file + '.jpg' }, m)), plotter, reduced: ctx.reduced }) : null;
  let cardClosed = false;
  const finHost = ctx && ctx.layer ? ctx.layer.parentElement : null, fin = (o.finaleTail > 0 && finHost) ? createFinale({ stage, host: finHost, reduced: ctx.reduced, tail: o.finaleTail }) : null;   // the closing line and the shrink into the home page (finale.js); only in the pinned page, not in a stand-alone demo

  // ---- hull sizing: identical to noirmont, so the wide hold looks exactly the same ----
  let MIN_DISTANCE = 8, END_SCALE = 0.2;
  function calibrate() {
    const H = CS.h || innerHeight, W = CS.w || innerWidth, aspect = W / H, comp = aspect > 1 ? (1920 / 1080) / aspect : 1;
    const lenPx = shipEl.offsetWidth || 1, beamPx = shipImg.naturalWidth ? lenPx * shipImg.naturalHeight / shipImg.naturalWidth : lenPx * 0.2;
    MIN_DISTANCE = SHIP_LENGTH_WORLD * H / (lenPx * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * comp);
    END_SCALE = MIN_DISTANCE / MAX_DISTANCE;
    wake.uniforms.uShipSize.value.set(SHIP_LENGTH_WORLD * beamPx / lenPx / BOUNDS, SHIP_LENGTH_WORLD / BOUNDS);
  }
  function resize(){ const w = canvas.clientWidth, h = canvas.clientHeight; if(!w||!h) return; CS.w = w; CS.h = h; renderer.setPixelRatio(window.__renderScale || 1); renderer.setSize(w,h,false); camera.aspect = w / h; camera.updateProjectionMatrix(); calibrate(); }
  if (shipImg.complete) resize(); else shipImg.addEventListener('load', resize, { once: true }); resize();
  addEventListener('cips:renderscale', resize);   // the page's adaptive render scale (runtime/stage.js)

  // ---- the opening pose, matched to the last frame of noirmont-transit ----
  // noirmont puts her at x = lerp(shipX0, shipX1, lerp(p, silk(p), shipEase)) with p = endAt at its last frame.
  const FX0 = lerp(NOIRMONT_END.shipX[0], NOIRMONT_END.shipX[1], lerp(NOIRMONT_END.endAt, cinematicSilk(NOIRMONT_END.endAt), NOIRMONT_END.shipEase));
  const BASE_HEADING = EAST ? 90 : 180;
  // 22 Oct 2026, Simon: "we're slowing too much as we round the breakwater and head down the roads, can we reduce that slow effect a bit". With only the three chapter joins as keys the pace fell steeply through the entrance (the screen
  // speed, ground speed times the zoom, dropped by about a third between p 0.42 and 0.50). The same three joins are kept, but the path between them is now shaped (chapter 2 and 3 as fractions of their own stretch, so they follow the real path
  // if it moves): chapter 2 carries a little more of the way early on and eases down gently, and the entrance reaches the channel mark (CHAN_1) at p 0.47 instead of 0.50 so the berth chapter, the slowest, starts a little sooner.
  // Chapter 1 is the old curve unchanged. Pass o.pace to override all of this.
  const OLD_PACE = makePace([{ p: 0, u: 0 }, { p: CH.x, u: U_X }, { p: CH.c1, u: U_C1 }, { p: 1, u: 1 }]), P_C1 = 0.47;
  const SHAPED_KEYS = [0.045, 0.09, 0.135, 0.18, 0.225].map(p => ({ p, u: OLD_PACE(p) })).concat([{ p: CH.x, u: U_X }],
    [[0.28, 0.059], [0.32, 0.295], [0.36, 0.518], [0.40, 0.717], [0.44, 0.889]].map(([p, w]) => ({ p, u: U_X + w * (U_C1 - U_X) })), [{ p: P_C1, u: U_C1 }],
    [[0.48, 0.034], [0.52, 0.159], [0.56, 0.268], [0.60, 0.363], [0.64, 0.446], [0.68, 0.521], [0.72, 0.590], [0.76, 0.655], [0.80, 0.717], [0.84, 0.776], [0.88, 0.833], [0.92, 0.890], [0.96, 0.946]].map(([p, w]) => ({ p, u: U_C1 + w * (1 - U_C1) })));
  const paceFn = makePace(o.pace || [{ p: 0, u: 0 }, ...SHAPED_KEYS, { p: 1, u: 1 }]);
  const initRotRad = (headingAtU(0) - BASE_HEADING) * Math.PI / 180;
  wake.uniforms.uShipRot.value = initRotRad; uni.uShipRot.value = initRotRad;
  const STEP = 1 / 60; let acc = 0, simT = 0, last = performance.now(); const bob = { x: 0, y: 0, force: 0 };
  for (let i = 0; i < 120; i++) { simT += STEP; wake.update(new THREE.Vector3(0, 0, o.wakeCenterY), STEP, simT); } uni.uHeightmap.value = wake.texture();
  let alive = true, prevShipRotRad = initRotRad, scaleNow = END_SCALE, calmHeight = 1;
  const zoomKeys = () => o.zoom.map(k => ({ p: k.p, scale: lerp(END_SCALE, 1, k.f) * (k.mult || 1) }));   // (mult: the finale's pull-back stops at half the camera height of the widest view, i.e. double the scale)
  // the shared scoreAt eases with clamp01(p), which only works up to p = 1; the finale (pz 2 to 2.3) is eased here with the real p, so the pull-back is a smooth slow lift and not a step
  const zoomHi = (pz, ks) => { const n = ks.length; if (pz >= ks[n - 1].p) return ks[n - 1].scale; let i = 0; while (i < n - 2 && pz > ks[i + 1].p) i++; const a = ks[i], b = ks[i + 1]; return lerp(a.scale, b.scale, smooth(a.p, b.p, pz)); };   // 31 Oct 2026: used past p = 1 (the quay and the finale): the same ease as scoreAt, with the real p, so the zoom-in over the first 5% of the quay (1 to 1.05) is a smooth ease and not a step

  // the sea pattern travels with the ground (see _shared/sea-advect.js): where the ship is, and the scale the ground is drawn at, as functions of p alone
  const geoKAt = p => scoreAt(p, o.geoScale.map(g => ({ p: g.p, scale: g.k }))) / lerp(1, o.hullM / (SHIP_LENGTH_WORLD * M_PER_UNIT / CFG.exaggerate), smooth(o.shrinkAt[0], o.shrinkAt[1], p));
  const sea = registerSea('st-helier-approach', { after: 'noirmont-transit', posAt: pp => posAtU(paceFn(pp)), perMetreAt: pp => geoKAt(pp) / M_PER_UNIT });

  // ---- Hold the Line: the player flies the run from about 10% of the beat, along the Small Road lead, onto the Pier Head lead, through the pier heads and round to port into the channel ----
  // While it runs the scroll is locked and the ship's place on the path comes from the game (how far along, how far off, which way the bow points) instead of from p. Everything else in update() keeps
  // working from a "virtual p": the p at which the scroll story would have the ship at that point of the path, so the zoom, the marks, the leads and the plotter all carry on as they do when scrolling.
  const K_GM = HULL_M / 24, NM_GM = K_GM / 1852;                  // real metres per game metre (the hull is 24 game metres long) and nautical miles per game metre
  const G = { startU: 0, startP: 0, beginP: 0, startY: 0, pxPerP: 20 * innerHeight, rawP: 0, rawY: 0, lastT: 0, curKappa: 0 };
  const uAt = sg => G.startU + sg * NM_GM / DENSE.total;
  const pOfU = u => { let lo = 0, hi = 1; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (paceFn(m) < u) lo = m; else hi = m; } return (lo + hi) / 2; };
  const uOfPoint = ll => {   // u of the nearest point ON the path (projected onto the segments; snapping to the nearest vertex put points on a long straight leg at its ends: the far side of the tanker berth landed on the lead-in point, 23 Oct 2026)
    let best = Infinity, bu = 0;
    for (let i = 1; i < DENSE.pts.length; i++) { const a = DENSE.pts[i - 1], b = DENSE.pts[i], cl = Math.cos(a[0] * Math.PI / 180), bx = (b[1] - a[1]) * cl, by = b[0] - a[0], px = (ll[1] - a[1]) * cl, py = ll[0] - a[0], L2 = bx * bx + by * by || 1e-18;
      const t = Math.max(0, Math.min(1, (px * bx + py * by) / L2)), dx = px - t * bx, dy = py - t * by, d = dx * dx + dy * dy; if (d < best) { best = d; bu = (DENSE.cum[i - 1] + t * (DENSE.cum[i] - DENSE.cum[i - 1])) / DENSE.total; } }
    return bu; };
  const U_K = uOfPoint(K_TURN), U_END = Math.min(0.99, U_K + (DENSE.rad[3] * 0.85 + 0.014) / DENSE.total);   // the run ends just after the turn to port is made
  /* The five knot check (23 Oct 2026, Simon: "at less than five knots by the time the bow reaches the other side of the tanker berth, at the latest"). The Pilotage Directions (6.6) give East Rock buoy to the Tanker Berth as 0.45 nm; the basin
     entrance is about 0.07 nm across, so the far side is 0.52 nm on from East Rock along the Small Road lead (found by projecting the buoy onto the lead). The game checks the speed when the BOW is there (see bowGm in hold-the-line.js). */
  const EAST_ROCK = [49.1659777, -2.1214074], TANKER_FAR_M = 0.52 * 1852;   // East Rock buoy as charted in seamarks.json
  const U_ZONE = (() => {
    const L = LEADS[0], k = Math.cos(L.front.at[0] * Math.PI / 180), e = ll => [(ll[1] - L.front.at[1]) * 111320 * k, (ll[0] - L.front.at[0]) * 111320];
    const r = e(L.rear.at), len = Math.hypot(r[0], r[1]), d = [r[0] / len, r[1] / len], s0 = e(EAST_ROCK), along = -(s0[0] * d[0] + s0[1] * d[1]) - TANKER_FAR_M;   // metres seaward of the front light
    return uOfPoint(offsetM(L.front.at, -along * d[0], -along * d[1]));
  })();
  const U_LEAD_IN = uOfPoint(LEAD_IN);
  const leadFix = u => {   // metres to starboard to move the path's centre onto the Small Road lead (the path meets the lead at LEAD_IN; before that it is a little to the east of it)
    if (u >= U_LEAD_IN) return 0; const L = LEADS[0], k = Math.cos(L.front.at[0] * Math.PI / 180), e = ll => [(ll[1] - L.front.at[1]) * 111320 * k, (ll[0] - L.front.at[0]) * 111320];
    const r = e(L.rear.at), len = Math.hypot(r[0], r[1]), d = [r[0] / len, r[1] / len], sp = e(posAtU(u)); return d[0] * sp[1] - d[1] * sp[0];   // (positive xte = the path is to the left of the lead: shift it right by that much)
  };
  /* The run always starts at the same place on the Small Road lead: 720 m seaward of the front light, about 0.55 nm before the tanker berth's far side check (it started at p 0.045 when the beat itself began 0.3 nm later). Entered later,
     the ship moves back to it as the question card comes up. The door's pill is up from a little before it to a good way after, whatever p that is on the scroll. */
  const START_ALONG_M = 600;   // (was 720: Simon, "a bit too long, start it a bit later")
  const U_START = (() => { const L = LEADS[0], k = Math.cos(L.front.at[0] * Math.PI / 180), r = [(L.rear.at[1] - L.front.at[1]) * 111320 * k, (L.rear.at[0] - L.front.at[0]) * 111320], len = Math.hypot(r[0], r[1]), d = [r[0] / len, r[1] / len];
    return uOfPoint(offsetM(L.front.at, -START_ALONG_M * d[0], -START_ALONG_M * d[1])); })();
  { const pS = pOfU(U_START); o.doors.hold.show = [Math.max(0, pS - 0.04), pS + 0.09]; }   // La Collette Yacht Basin abeam: the five knot limit starts
  const kappaAtU = u => { const du = 5 * NM_GM / DENSE.total, a = headingAtU(Math.max(0, u - du)), b = headingAtU(Math.min(1, u + du)); return (((b - a + 540) % 360) - 180) * Math.PI / 180 / (10 * 1); };   // rad per game metre, + = the path turns to starboard
  function makeHoldPath() {
    const length = (U_END - G.startU) * DENSE.total / NM_GM, cfgL = { start: 12, gap: 7, end: 9 };
    const sOf = u => (u - G.startU) * DENSE.total / NM_GM, gapS = sOf(U_GAP), turnS = sOf(U_X);
    return { length, zoneS: Math.max(20, sOf(U_ZONE)), gapS, turnS, curv: sg => kappaAtU(uAt(sg)), hdgAt: sg => headingAtU(uAt(sg)),   // (the tide and wind work from the path's heading)
      laneAt: sg => sg < gapS ? lerp(cfgL.start, cfgL.gap, smooth(0, gapS, sg)) : lerp(cfgL.gap, cfgL.end, smooth(gapS, length, sg)) };
  }
  holdGame = createHoldTheLine({ stage, makePath: makeHoldPath, faceSrc: seaway + 'assets/arrival/harbour-portrait.webp',
    lockScroll: lockPage, unlockScroll: unlockPage,
    onStart() { G.startU = Math.min(curU, U_START); G.beginP = pOfU(G.startU); G.startP = G.rawP; G.startY = G.rawY; G.lastT = performance.now(); },
    onRestart() { G.lastT = performance.now(); },
    onEnd() {},
    onExit(carryOn) {   // back to scrolling: from where the ship has got to (or exactly where it was, if the run never began)
      const st = holdGame.model && holdGame.phase !== 'choice' ? holdGame.model.st : null;
      const pT = st && st.s > 0 ? pOfU(Math.min(U_END + 0.02, uAt(st.s))) : G.startP;
      window.scrollTo({ top: G.startY + (pT - G.startP) * G.pxPerP, behavior: 'instant' });
    } });
  /* The berthing game (30 Oct 2026): flown from a fixed start (Simon's mark: p 0.675, 136 m south of the berth). While it runs, `update()` takes the ship's place from the game's own pose (metres from the kink in the pier face,
     berth-geo.js) and a virtual p that runs from the start's p to the berth's as she nears it, so the zoom, the dressing, the marks and the plotter carry on as they do when scrolling. */
  const P_BERTH0 = 0.675, P_BERTH1 = 0.90, BERTH_D0 = Math.hypot(BERTH_EN.e - BERTH_START.e, BERTH_EN.n - BERTH_START.n);
  berthGame = createBerthGame({ stage, faceSrc: seaway + 'assets/arrival/harbour-portrait.webp', lockScroll: lockPage, unlockScroll: unlockPage,
    onStart() { G.startP = G.rawP; G.startY = G.rawY; G.lastT = performance.now(); },
    onRestart() { G.lastT = performance.now(); },
    onExit(carryOn, finished) {   // back to scrolling: with the yacht alongside if she got there and the player carries on, otherwise the story as it was
      const pT = carryOn && finished ? 0.998 : G.startP; window.scrollTo({ top: G.startY + (pT - G.startP) * G.pxPerP, behavior: 'instant' });
    } });
  const ghostP = document.createElementNS(SVGNS, 'path'); ghostP.setAttribute('class', 'berth-ghost'); leadSvg.insertBefore(ghostP, leadSvg.firstChild);
  function drawGhost(on) {   // the ghost berth: a faint outline of where she should finish
    if (!on) { ghostP.style.opacity = '0'; return; }
    const W = CS.w || innerWidth, H = CS.h || innerHeight, h = BERTH_EN.hdg * Math.PI / 180, sn = Math.sin(h), cs = Math.cos(h);
    const pts = HULL_OUTLINE.map(([x, y]) => leadXY(berthEn2ll([BERTH_EN.e + x * sn + y * cs, BERTH_EN.n + x * cs - y * sn]), W, H));
    ghostP.setAttribute('d', pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('') + 'Z'); ghostP.style.opacity = '1';
  }
  // the lane the player is keeping to: the path with a margin each side, drawn on the water (amber on the side the ship is drifting towards)
  const laneFill = document.createElementNS(SVGNS, 'path'), laneL = document.createElementNS(SVGNS, 'path'), laneR = document.createElementNS(SVGNS, 'path');
  laneFill.setAttribute('class', 'lane-fill'); laneL.setAttribute('class', 'lane-edge'); laneR.setAttribute('class', 'lane-edge'); leadSvg.insertBefore(laneFill, leadSvg.firstChild); leadSvg.appendChild(laneL); leadSvg.appendChild(laneR);
  function drawLane(gm) {
    if (!gm) { laneFill.style.opacity = laneL.style.opacity = laneR.style.opacity = '0'; return; }
    const W = CS.w || innerWidth, H = CS.h || innerHeight, path = holdGame.path, L = [], R = [];
    for (let sg = Math.max(0, gm.s - 30); sg <= Math.min(path.length + 8, gm.s + 150); sg += 4) {
      const u = uAt(sg), h = headingAtU(u) * Math.PI / 180, lane = path.laneAt(sg) * K_GM, e = Math.cos(h), n = -Math.sin(h), fx = leadFix(u), pt = offsetM(posAtU(u), e * fx, n * fx);   // (e, n): the unit vector to starboard of the path
      L.push(leadXY(offsetM(pt, -e * lane, -n * lane), W, H)); R.push(leadXY(offsetM(pt, e * lane, n * lane), W, H));
    }
    const pl = a => a.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
    laneL.setAttribute('d', pl(L)); laneR.setAttribute('d', pl(R)); laneFill.setAttribute('d', pl(L) + 'L' + R.slice().reverse().map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z');
    const lane0 = path.laneAt(gm.s), near = Math.max(0, Math.min(1, (Math.abs(gm.x) + 2.5 - lane0 * 0.55) / (lane0 * 0.45)));
    laneL.classList.toggle('hot', gm.x < 0 && near > 0.5); laneR.classList.toggle('hot', gm.x > 0 && near > 0.5);
    laneFill.style.opacity = '1'; laneL.style.opacity = laneR.style.opacity = '1';
  }
  // the tide's set, drawn on the water at the ship: dashed streaks flowing past her from upstream, longer and faster for a stronger set (0.4 knots here), with its speed written at the upstream end
  const curG = document.createElementNS(SVGNS, 'g'); curG.setAttribute('class', 'cur-g'); leadSvg.insertBefore(curG, leadSvg.firstChild);
  const curLines = [0, 1, 2, 3, 4].map(() => { const l = document.createElementNS(SVGNS, 'line'), h = document.createElementNS(SVGNS, 'path'); l.setAttribute('class', 'cur-line'); h.setAttribute('class', 'cur-head'); curG.appendChild(l); curG.appendChild(h); return { l, h }; });
  const curTxt = document.createElementNS(SVGNS, 'text'); curTxt.setAttribute('class', 'cur-txt'); curTxt.setAttribute('text-anchor', 'middle'); curG.appendChild(curTxt);
  function drawCurrent(gm, t, dirDeg) {
    if (!gm) { curG.style.opacity = '0'; return; }
    const W = CS.w || innerWidth, H = CS.h || innerHeight, b = (dirDeg != null ? dirDeg : holdGame.model.cfg.setDirDeg) * Math.PI / 180, kn = gm.setKn || 0;
    const p0 = leadXY(curPos, W, H), p1 = leadXY(offsetM(curPos, Math.sin(b) * 100, Math.cos(b) * 100), W, H);   // which way "towards the set" points on the screen
    let fx = p1[0] - p0[0], fy = p1[1] - p0[1]; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl; const nx = -fy, ny = fx;
    const len = 36 + 120 * kn, R = 30, gap = 36, flow = ((t * kn * 26) % 15).toFixed(1);
    curLines.forEach((c, i) => {
      const o = (i - 2) * gap, ex = p0[0] + nx * o - fx * R, ey = p0[1] + ny * o - fy * R, sx = ex - fx * len, sy = ey - fy * len, k = 1 - Math.abs(i - 2) * 0.22;
      c.l.setAttribute('x1', sx.toFixed(1)); c.l.setAttribute('y1', sy.toFixed(1)); c.l.setAttribute('x2', ex.toFixed(1)); c.l.setAttribute('y2', ey.toFixed(1)); c.l.style.strokeDashoffset = '-' + flow; c.l.style.opacity = k.toFixed(2);
      c.h.setAttribute('d', 'M' + (ex - fx * 8 + nx * 5).toFixed(1) + ' ' + (ey - fy * 8 + ny * 5).toFixed(1) + 'L' + ex.toFixed(1) + ' ' + ey.toFixed(1) + 'L' + (ex - fx * 8 - nx * 5).toFixed(1) + ' ' + (ey - fy * 8 - ny * 5).toFixed(1)); c.h.style.opacity = k.toFixed(2);
    });
    curTxt.setAttribute('x', (p0[0] - fx * (R + len + 4) - nx * 0).toFixed(1)); curTxt.setAttribute('y', (p0[1] - fy * (R + len + 4) + 14 - 0).toFixed(1)); curTxt.textContent = 'Set ' + kn.toFixed(1) + ' kn';
    curG.style.opacity = '1';
  }
  function update(pRaw0) {
    if (!alive) return;
    const KB = 1 - o.quayTail - o.finaleTail, pRaw = Math.min(1, pRaw0 / KB), q = o.quayTail > 0 ? clamp01((pRaw0 - KB) / o.quayTail) : 0, r = o.finaleTail > 0 ? clamp01((pRaw0 - KB - o.quayTail) / o.finaleTail) : 0;   // (r: chapter 5, the way out, the last finaleTail of the track)   // chapter 4 (the quay at work) takes the last quayTail of the track; chapters 1 to 3 see the same 0..1 as before
    let p = pRaw, gm = null, bgs = null;
    if (berthGame.active) {   // the berthing game: its own pose and a virtual p
      const nowG = performance.now(), dtG = Math.min(0.1, (nowG - G.lastT) / 1000); G.lastT = nowG; berthGame.advance(dtG); bgs = berthGame.model;
      p = berthGame.phase === 'choice' ? P_BERTH0 : lerp(P_BERTH0, P_BERTH1, clamp01(1 - Math.hypot(BERTH_EN.e - bgs.st.h.x, BERTH_EN.n - bgs.st.h.y) / BERTH_D0));
    } else if (!holdGame.active) {   // how many pixels of scroll one unit of p costs, measured as she is scrolled: over at least 400 px of scroll (a few pixels' difference between two frames gave wild values, and "Back to the journey" landed at the foot of the page, 23 Oct 2026) and kept to a sane range (the beat's track is 20 screens)
      if (G.calY == null) { G.calP = pRaw; G.calY = window.scrollY; }
      else if (Math.abs(window.scrollY - G.calY) >= 400 && Math.abs(pRaw - G.calP) > 1e-4) { const d = (window.scrollY - G.calY) / (pRaw - G.calP); if (d > 8 * innerHeight && d < 32 * innerHeight) G.pxPerP = d; G.calP = pRaw; G.calY = window.scrollY; }
      G.rawP = pRaw; G.rawY = window.scrollY;
    }
    else {
      const nowG = performance.now(), dtG = Math.min(0.1, (nowG - G.lastT) / 1000); G.lastT = nowG;
      if (holdGame.phase === 'play' || holdGame.phase === 'end') holdGame.advance(dtG);
      if (holdGame.phase === 'choice') p = G.beginP; else { gm = holdGame.model.st; p = pOfU(Math.min(U_END + 0.02, uAt(gm.s))); }
    }
    pNow = p; curU = gm ? Math.min(U_END + 0.02, uAt(gm.s)) : paceFn(p); curPos = bgs ? berthEn2ll([bgs.st.h.x, bgs.st.h.y]) : posAtU(curU); geoK = scoreAt(p, o.geoScale.map(g => ({ p: g.p, scale: g.k })));
    const now = performance.now(); const dt = Math.min((now - last) / 1000, .05); last = now; acc += dt; const t = (now - PAGE_T0) / 1000;
    const shrink = lerp(1, o.hullM / (SHIP_LENGTH_WORLD * M_PER_UNIT / CFG.exaggerate), smooth(o.shrinkAt[0], o.shrinkAt[1], p));   // 1 at the wide hold, hullM against the land by the entrance
    geoK = geoK / shrink;
    const pz = p + q + r, scale = (pz > 1 ? zoomHi(pz, zoomKeys()) : scoreAt(pz, zoomKeys())) * shrink;   // pz: 0..1 through the berth, then 1 + q through the quay work
    const a = Math.sin(t / 4.8 * Math.PI), b = Math.sin(t / 5.4 * Math.PI + 1.3);
    bob.x = .6 * a * o.bob; bob.y = (-1.2 * a + (b > 0 ? 2 * b : 0) * .5) * o.bob; bob.force = Math.max(0, b) * .6 * o.bob;
    /* Turning dynamics (4 Oct 2026, Simon: the turn "like a car going round a corner" / "on rails"). From above, a ship in a turn does not point along her track: her bow swings
       INTO the turn ahead of the direction she is actually travelling (the drift angle, a few degrees for a yacht at harbour speed, ~ pivot distance x turn rate / speed), and since she pivots
       about a point about a third of the way back from the bow, her stern swings OUT. Both are added to the path: the heading leads the path tangent by drift x hullLength x curvature
       (capped), and her centre is moved back from the pivot by the same swing. The path itself is a bigger arc (CORNER_NM), with curvature rising and falling smoothly. */
    const pathHdg = headingAtU(curU), dU = 0.012 / DENSE.total, dTh = ((headingAtU(Math.min(1, curU + dU)) - headingAtU(Math.max(0, curU - dU)) + 540) % 360) - 180;   // heading change over ~44 m of path
    const hullLandM = SHIP_LENGTH_WORLD * M_PER_UNIT / geoK, kappa = (dTh * Math.PI / 180) / 44.5;   // signed curvature, 1/m (positive = to starboard)
    const beta = gm || bgs ? 0 : Math.max(-0.26, Math.min(0.26, o.drift * hullLandM * kappa)), hdgPath = bgs ? bgs.st.h.psi * 180 / Math.PI : gm ? pathHdg + gm.psi * 180 / Math.PI : pathHdg + beta * 180 / Math.PI;   // her bow leads the track into the turn (when flown by the player, the heading is the game's)
    if (gm) { const a0 = pathHdg * Math.PI / 180, xr = gm.x * K_GM + leadFix(curU); curPos = offsetM(curPos, Math.cos(a0) * xr, -Math.sin(a0) * xr); }   // flown: off the path to starboard by x
    else if (!bgs) { const xp = 0.28 * hullLandM, a0 = pathHdg * Math.PI / 180, a1 = hdgPath * Math.PI / 180; curPos = offsetM(curPos, -xp * (Math.sin(a1) - Math.sin(a0)), -xp * (Math.cos(a1) - Math.cos(a0))); }   // pivot about her fore part: the stern swings out
    const hdgYaw = ((BERTH.headingDeg - hdgPath + 540) % 360) - 180;   // shortest way round to the berth heading
    let hdg = bgs ? hdgPath : hdgPath + hdgYaw * smooth(o.berthYaw[0], o.berthYaw[1], p);
    curHdg = hdg; curSpeed = bgs ? bgs.groundKn() : gm ? gm.u : scoreAt(p, o.speed.map(s => ({ p: s.p, scale: s.k })));
    // chapter 5, the way out (31 Oct 2026, Simon): the yacht swings off the berth and goes back down the channel the way she came (the arrival path in reverse, out to just beyond the entrance) while the camera lifts and follows her
    exitFix = (r > 0 && !gm && !bgs && o.exitSync !== false) ? exitAt(pz, curHdg) : null;   // (the plotter only: the picture behind it is the film)
    let finDisp = null;   // her displacement from the berth, metres north and east: the sea moves past by the same amount
    if (false && r > 0 && !gm && !bgs) {   // 31 Oct 2026, Simon: no yacht coming off the berth, just zoom out and cut straight to the film (switched off, not deleted)
      const mv = smooth(0.05, 0.30, r), u2 = lerp(1, Math.max(0, U_X - 0.04), mv), bp = posAtU(1);
      curPos = posAtU(u2);
      const tgt = (headingAtU(u2) + 180) % 360, h0 = BERTH.headingDeg, dh = ((tgt - h0 + 540) % 360) - 180;   // the bow swings round from the berth heading to the way out
      hdg = h0 + dh * smooth(0.0, 0.14, r); curHdg = hdg; curSpeed = 7 * smooth(0.04, 0.16, r);
      finDisp = [(curPos[0] - bp[0]) * 111320, (curPos[1] - bp[1]) * 111320 * Math.cos(bp[0] * Math.PI / 180)];
    }
    const turn = hdg - BASE_HEADING;
    shipEl.style.transform = EAST ? `translate(calc(-50% + ${bob.y * 0.2}%),calc(-50% + ${bob.x}%)) rotate(${turn.toFixed(2)}deg) scale(${scale})` : `translate(calc(-50% + ${bob.x}%),calc(-50% + ${bob.y}%)) rotate(${turn.toFixed(2)}deg) scale(${scale})`;
    const comp = camera.aspect > 1 ? (1920 / 1080) / camera.aspect : 1;
    const camH = Math.min(MAX_DISTANCE, MIN_DISTANCE / scale) * comp;
    const fx = FX0;   // (chapter framing moves come later)
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), visW = 2 * camH * tanH * camera.aspect, visHw = 2 * camH * tanH; let off = (0.5 - fx) * visW;
    /* the end frame (10 Oct, Simon: show both vessels from above, plotter out of the way): over the last stretch the camera drifts from Kinship to the middle of the two berths and a touch east and north, so all three yachts (the two berths and the NNQ yacht across the channel) show, clear of the plotter */
    const wq = smooth(0.0, 0.17, q), FOCUS = quay ? [lerp(PAIR_MID[0], QF[0], wq), lerp(PAIR_MID[1], QF[1], wq)] : PAIR_MID;   // chapter 4: the camera settles on the quay abeam Kinship
    const FOCUSF = (false && r > 0) ? [lerp(FOCUS[0], curPos[0], smooth(0.0, 0.10, r)), lerp(FOCUS[1], curPos[1], smooth(0.0, 0.10, r))] : FOCUS;   // chapter 5: the camera leaves the quay and follows the yacht out
    const endK = smooth(0.80, 1.0, p), unitM2 = M_PER_UNIT / geoK, panN = endK * (((FOCUSF[0] - curPos[0]) * 111320) / unitM2 + 0.05 * visHw), panE = endK * (((FOCUSF[1] - curPos[1]) * 111320 * Math.cos(curPos[0] * Math.PI / 180)) / unitM2 - 0.05 * visW);
    off += panE;
    if (EAST) { camera.position.set(0.01 + panN, camH, off); camera.lookAt(panN, 0, off); const sa = sea.at(p), kS = geoK / M_PER_UNIT, sx = sa[0] + (finDisp ? finDisp[0] * kS : 0), sz = sa[1] + (finDisp ? finDisp[1] * kS : 0); uni.uPan.value.set(panN - sx, off - sz); } else { camera.position.set(-off, camH, 0.01); camera.lookAt(-off, 0, 0); uni.uPan.value.set(-off, 0); }
    shipEl.style.left = ((fx - panE / visW) * 100).toFixed(2) + '%'; shipEl.style.top = ((0.5 + panN / visHw) * 100).toFixed(2) + '%'; scaleNow = scale;
    { const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), visWm = 2 * camH * t * camera.aspect * (M_PER_UNIT / geoK), visWwide = 2 * MAX_DISTANCE * comp * t * camera.aspect * M_PER_UNIT; plotZoom = 62 * visWwide / visWm; pxPerM = (CS.h || innerHeight) / (2 * camH * t * (M_PER_UNIT / geoK)); }   // the plotter chart zooms with the scene (62 px/NM is what it starts at)
    if (o.coast) { drawCoast(); for (const c of coastMeshes) c.m.visible = true; updatePlates(2 * camH * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), off); }
    if (o.navAids) placeNavAids(t);
    if (o.leads) placeLeads(t, p);
    drawLane(gm && holdGame.phase !== 'choice' ? gm : null);
    drawCurrent(gm && holdGame.phase === 'play' ? gm : bgs && berthGame.phase !== 'choice' ? { setKn: bgs.st.now.setKn || 0 } : null, t, bgs ? bgs.cfg.setDirDeg : undefined);
    drawGhost(!!bgs && berthGame.phase !== 'end');
    placeDressing(p); placeSignals();
    if (r > CLOSE_R) cardClosed = true; else if (r < CLOSE_R * 0.25) cardClosed = false;   // 1 Nov 2026: once it has started to close it stays closing until the visitor is back at the very end of the quay (a wobble of the scroll round CLOSE_R used to flip it open and shut every frame: the message flickered)
    if (quay) quay.update(q, geoK, t, smooth(0.50, 0.66, p), cardClosed ? 0 : 1);   // (the brow comes in with the pontoon, as soon as the berth can be seen)
    if (plotter) plotter.update();
    if (fin) fin.update(r);
    if (vm) vm.update(pz, { blocked: holdGame.active || berthGame.active });
    if (copyEl) {
      let ch = null, c = 0;
      for (const k of o.chapters) { const [a, b] = k.at, e = Math.min(smooth(a, a + 0.05, pz), 1 - smooth(b - 0.05, b, pz)); if (e > c) { c = e; ch = k; } }
      if (ch && eyebrowEl && eyebrowEl.textContent !== ch.eyebrow) { eyebrowEl.textContent = ch.eyebrow; if (subEl) subEl.textContent = ch.sub; }
      if (bgs) c = 0;   // no chapter caption over the berthing game
      copyEl.style.opacity = c.toFixed(3); copyEl.style.transform = `translateY(${(18 * (1 - c)).toFixed(1)}px)`;
    }
    for (const d of doorEls) { const [a, b] = o.doors[d.key].show; d.el.classList.toggle('on', p >= a && p <= b && !holdGame.active && !berthGame.active); }
    const W = CS.w || innerWidth, H = CS.h || innerHeight;
    for (const key in o.landmarks) {
      const L = o.landmarks[key], el = landmarkEls[key]; if (!el) continue;
      const [s0, s1] = L.show, k = Math.min(smooth(s0, s0 + 0.23, p), 1 - smooth(s1 - 0.23, s1, p));
      const [lx, lz] = worldOffsetTo(0, L.at); lmVec.set(lx, 0.3, lz).project(camera);
      if (k <= 0.002 || !(lmVec.z < 1 && Math.abs(lmVec.x) < 1.15 && Math.abs(lmVec.y) < 1.15)) { el.style.opacity = '0'; continue; }
      el.style.left = ((lmVec.x * 0.5 + 0.5) * W).toFixed(1) + 'px'; el.style.top = ((1 - (lmVec.y * 0.5 + 0.5)) * H).toFixed(1) + 'px';
      el.style.opacity = Math.max(k, 0.0).toFixed(3);
    }
    // the wake: same per-frame block as noirmont (uniforms, rotation delta split across the sub-steps that actually run)
    { const cK = o.calm * smooth(o.calmIn[0], o.calmIn[1], p);
      uni.uOceanSpeed.value = lerp(0.9, 0.38, cK); uni.uFoamIntensity.value = lerp(0.26, 0.09, cK); uni.uFoamThreshold.value = lerp(0.83, 0.93, cK); uni.uFlow.value = lerp(o.flow, o.flow * 0.5, cK);
      mat.normalScale.set(lerp(0.7, 0.34, cK), lerp(0.7, 0.34, cK)); calmHeight = lerp(1, 0.6, cK); }   // slower, shallower swell, far fewer white flecks, softer ripples
    uni.uWakeFade.value = Math.max(1 - smooth(o.wakeFade[0], o.wakeFade[1], p), smooth(0.05, 0.22, r));   // 21 Oct 2026, Simon: once she is alongside there is no wake beside or behind her (the foam arms, prop wash, calm channel and ripple parting all go)
    uni.uHeightScale.value = (2.5 - 0.8 * scale) * calmHeight; uni.uCamHeight.value = camera.position.y; uni.uWakeOffsetY.value = o.wakeCenterY; uni.uTime.value = t;
    const shipRotRad = turn * Math.PI / 180;
    wake.uniforms.uShipRot.value = shipRotRad; uni.uShipRot.value = shipRotRad;
    const shipRotDeltaFull = prevShipRotRad == null ? 0 : shipRotRad - prevShipRotRad; prevShipRotRad = shipRotRad;
    wake.uniforms.uWakeIntensity.value = (o.wakeIntensity + bob.force * .045) * (gm ? Math.max(0.45, Math.min(1.25, gm.u / 7)) : bgs ? Math.max(0.15, Math.min(1.25, bgs.groundKn() / 7)) : 1); uni.uWakeIntensity.value = wake.uniforms.uWakeIntensity.value;   // flown: the wake follows her speed
    const willRun = Math.min(3, Math.floor(acc / STEP)); wake.uniforms.uShipRotDelta.value = willRun > 0 ? shipRotDeltaFull / willRun : 0;
    let n = 0; while (acc >= STEP && n < 3) { simT += STEP; wake.update(new THREE.Vector3(0, 0, o.wakeCenterY), STEP, simT); acc -= STEP; n++; }
    if (n === 3) acc = Math.min(acc, STEP); if (n > 0) uni.uHeightmap.value = wake.texture();
    renderer.render(scene, camera);
  }
  const api = {
    update, resize,
    keepAlive() { return !!(vm && vm.isActive && vm.isActive()); },   // (31 Oct 2026: the 29 Oct fix had put this on the phone fallback only)
    // The real end pose (the berth) will be exported here once chapter 3 exists; nothing reads it yet.
    exit() { return { place: 'st-helier-albert-pier', berthGeo: BERTH }; },   // the real-world berth pose (lat, lng, heading, LOA) — for bunkers-road / provisions-quay when they are rebuilt on these plates
    hold: () => holdGame, berth: () => berthGame,   // dev aids
    doors: o.doors,   // dev aid (tools/site-directions/berth-door-picker.html changes a door's `show` window live)
    pickInfo: () => ({ p: pNow, speed: curSpeed, pxPerP: G.pxPerP, holdStartP: pOfU(U_START), holdEndP: pOfU(U_END), toBerthM: Math.hypot((curPos[0] - BERTH.lat) * 111320, (curPos[1] - BERTH.lng) * 111320 * Math.cos(BERTH.lat * Math.PI / 180)) }),   // dev aid (the door picker): where the scene is, how far the ship is from the berth in a straight line
    tools: { faceAt, faceAtEN, posAtU, headingAtU, FACE, NEIGH, KIN_S, DENSE },   // dev aids (plate clean-up georeferencing)
    plotInfo: () => ({ target: plotZoom, now: plotter && plotter.view ? plotter.view.pxPerNm : null, lock: plotter && plotter.view ? plotter.view.zoomLock : null, scenePxPerM: pxPerM, scenePxWide: CS.w, uStart: U_START, pStart: pOfU(U_START), uX: U_X, uC1: U_C1, uLeadIn: U_LEAD_IN, total: DENSE.total, curU, uZone: U_ZONE, pZone: pOfU(U_ZONE) }),
    debug: () => ({ hull: curHdg, maxStep: (() => { let m = 0; for (let i = 2; i < DENSE.pts.length; i++) { const h1 = Math.atan2((DENSE.pts[i - 1][1] - DENSE.pts[i - 2][1]), DENSE.pts[i - 1][0] - DENSE.pts[i - 2][0]), h2 = Math.atan2((DENSE.pts[i][1] - DENSE.pts[i - 1][1]), DENSE.pts[i][0] - DENSE.pts[i - 1][0]); const dd = Math.abs(((h2 - h1) * 180 / Math.PI + 540) % 360 - 180); if (dd > m) m = dd; } return m; })(), radii: DENSE.rad, plateView: lastPlateView, plates: streamed.filter(s => s.plate).map(s => s.tier + ":" + s.m.file + (s.plate.m.visible ? "+" : "-")), nStreamed: streamed.length, curU, curPos, heading: headingAtU(curU), FX0, END_SCALE, scale: scaleNow, total: DENSE.total, start: START, geoK, berth: BERTH, approach: APPROACH_2, U_X, U_C1 }),
    destroy() {
      alive = false; streamAlive = false; for (const d of dress) { d.mesh.geometry.dispose(); d.material.map?.dispose(); d.material.dispose(); scene.remove(d.group); } vm?.destroy(); quay?.dispose();
      for (const s of streamed) if (s.plate) { s.plate.m.geometry.dispose(); s.plate.m.material.map?.dispose(); s.plate.m.material.dispose(); s.plate = null; }
      wake.dispose(); plane.geometry.dispose(); mat.dispose(); normalMap.dispose(); skyTex.dispose(); renderer.dispose(); plotter?.destroy(); tilt?.destroy();
      for (const c of coastMeshes) { c.m.geometry.dispose(); c.m.material.map?.dispose(); c.m.material.dispose(); }
      for (const { el } of markEls) el.remove();
      fin?.destroy(); leadSvg.remove(); for (const L of leadEls) for (const e of L.strips) e.remove(); hud.remove(); holdGame.destroy(); berthGame.destroy(); unlockPage();
      signals.destroy();
    }
  };
  globalThis.__stHelier = api;   // dev aid: __stHelier.debug() in the console (plate streaming, pose, berth)
  return api;
}
function staticCtrl(stage, shipEl, copyEl, o) {
  return { update(p) { const e = cinematicSilk(p); shipEl.style.transform = `translate(-50%,-50%) scale(${lerp(0.6, 0.9, e)})`;
      if (copyEl) { const c = clamp01((p - o.copyIn[0]) / (o.copyIn[1] - o.copyIn[0])); copyEl.style.opacity = c.toFixed(3); } },
    resize() {}, destroy() {}, exit() { return {}; } };
}
