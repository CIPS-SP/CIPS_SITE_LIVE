/* _beats/seaway-wake/game.js — THE CROSSING: a small steering game on the seaway sea (HLC Globe Lab, 16 Sep 2026).
   The same three.js sea and GPGPU wake as the beat (imported from beat.js — nothing there changes for the sequence), seen from
   above with the bow up. The yacht sits at the sim's origin as always; steering moves the CAMERA sideways (the sea pattern is
   locked to it, as in the beat's crossing) and everything else lives in world units relative to the hull, so the yacht appears
   to move and the traffic stays in its lanes. Obstacles are plan-view SVGs positioned over the canvas:
     · dolphins — a pod crosses ahead, each one surfacing and leaping in turn: it grows as it rises, its shadow slides off across
       the water, spray flies at the exit and a real splash ring goes into the wake simulation at the re-entry
     · tuna boats trolling with their lines astern · pot buoys in pairs · the DFDS ferry (partner) and the Islands Unlimited
       fast cat (San Pawl, 50 kn) · the Water Taxi CI RIB (partner) in a hurry · BA and easyJet passing high overhead (no hazard)
     · the Ports of Jersey pilot launch, flying the H flag, comes alongside now and then and the traffic gives way — CIPS's help
     · REAL GEOGRAPHY (Howard, 16 Sep, from the chart): the run starts off Corbière on the pilotage line (110°), the pilot boards
       at the pilot station "Plt S. Helier West" (25 Sep, Simon: the arrival climax now — a hands-on transfer, tap in the green),
       and the planned track carries on to Le Fret Point, on the way to the leading lines in to St Helier (the grey pilotage line
       past the boarding waypoint — the ship's own command ends on station, the rest is a training picture for the plotter). The
       coast is the satellite plate (assets/game/sw-plate.webp, water masked) drawn on a canvas under the traffic, rotated so the
       leg's bearing is up; the screen world stays a straight corridor and the plotter carries the navigation — the marks, the
       pilotage route, the planned track and the course to steer from where she is now. The captain throttles with the wheel / ↑↓
       and holds course and speed for the pilot. Then the water taxi comes out with the crew change, the owner and the bread.
   Score = time + penalty seconds per hit. Keys ← → / A D steer, ↑ ↓ or wheel throttle, Space to time the pilot transfer.
   World frame: bow = +Z (screen up), screen right = −X, 1 unit ≈ 6.4 m (the 70 m yacht is 11 units). Logos are the partners'
   own files in assets/game/logos/ (never drawn here); a missing file falls back to the operator's name in text. */
import * as THREE from 'three';
import { createWakeSimulation, makeOcean, WAKE_FRAG, BOUNDS, SHIP_LENGTH_WORLD, setWakeParams } from './beat.js';
import { createCoastPlate, placeCoastPlateBowUp, SW_PLATE_FEATHER } from '../_shared/coast-plate.js';
import { sectorGradient, sectorAt, isoPhase } from '../_shared/corbiere-light.js';
import { createBridgeConsole } from '../_shared/bridge-console.js';
import { CFG } from './game/config.js';
import { GEO } from './game/geography-data.js';
import { ROUTES, SCHED } from './game/routes.js';
import { createReplayRandom, createStreams } from './game/random.js';
import { createReplayPolicy, FIRST_SEED } from './game/replay.js';
import { extendConfig, exportPreset, applyPreset, readDirectorPreset, guardedStorage } from './game/settings.js';
import { buildSchedule } from './game/schedule.js';
import { createFixedClock } from './game/clock.js';
import { safetyMargin, mayDisplaceTarget } from './game/safety.js';
import { createSafetyGuard } from './game/safety-runtime.js';
import { mountDirector } from './game/director.js';
import {mountArrivalUI} from './game/arrival-ui.js';
import {ARRIVAL_LIMITS,arrivalChecklist,validateOrder,orderAcknowledgement} from './game/arrival-rules.js';
import {sceneScore,MAX_TASK_SCORE} from './game/scoring.js';
let arrivalUi=null, uiPaused=false;const pausedLiveFixes=new Map();
import { installWaterFrame } from './game/water-frame.js';
import {createBoardingState,advanceBoarding,boardingSpeedSafe,boardingHeadingSafe,BOARDING_ZONE_UNITS,BOARDING_TARGET_KNOTS,attemptBoarding,armAutoBoard,pacePosition,inSafeZone,BOARDING_SAFE_FRAC,BOARDING_MISS_PENALTY_S,BOARDING_MISSES_FOR_AUTO,BOARDING_TRANSFER_S,BOARDING_CLOSE_S} from './game/pilot-boarding.js';
import {createFerryDirector,isFerryKind} from './game/ferry-director.js';
import {formatMessage,createCommsFilter} from './game/comms-catalog.js';
import {createRadioVoice} from './game/comms-voice.js';

const PARAMS = new URLSearchParams(location.search);
const DIRECTOR = PARAMS.has('director');
const DEBUG = PARAMS.has('debug');
if (PARAMS.has('fps')) { const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483000;font:600 11px/1 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 6px;border-radius:4px;pointer-events:none'; document.body.appendChild(el); let n = 0, t0 = performance.now(), worst = 0, last = t0; const f = t => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 >= 1000) { el.textContent = Math.round(n * 1000 / (t - t0)) + ' fps · worst ' + Math.round(worst) + ' ms'; n = 0; worst = 0; t0 = t; } requestAnimationFrame(f); }; requestAnimationFrame(f); }   // ?fps: a frame-rate readout for measuring a slow machine
extendConfig(CFG);
CFG.comms.voice=false;
const baselinePreset = exportPreset(CFG, 'ARRIVAL_INTERFACE_03_DEFAULTS');
const directorStorage = guardedStorage('localStorage');
const loadedPreset = readDirectorPreset(CFG, location.search, directorStorage);
const replayPolicy = createReplayPolicy({storage:guardedStorage('sessionStorage')});
let activeSchedule = SCHED, trafficRun={...CFG.traffic};
const ferryDirector=createFerryDirector();
// 21 Oct 2026, Simon: "another collision with the DFDS ferry that came from behind... remove all the ferries for now": no ferry of any kind (scripted or live AIS) appears in the arrival game. Set false to bring them back.
const NO_FERRIES=true;
let runTime=0, testRender=true;
const fixedClock=createFixedClock();
const $ = (s, r = document) => r.querySelector(s);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
let streams=createStreams(FIRST_SEED), gameRandom=streams.gameplay, fxRandom=streams.fx, audioRandom=streams.audio, decorRandom=streams.decor;
const rnd=(a,b)=>gameRandom.range(a,b);
const fxRnd=(a,b)=>fxRandom.range(a,b);
const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

if (/[?&]view=3d/.test(location.search)) CFG.view3d.on = true; if (/[?&]view=plan/.test(location.search)) CFG.view3d.on = false;   // ?view=3d / ?view=plan
if (CFG.view3d.on) { CFG.fov = CFG.view3d.fov; CFG.visH = CFG.view3d.visH; CFG.hullY = CFG.view3d.hullY; CFG.open.visH = CFG.view3d.openVisH; CFG.open.hullY = 0.86; CFG.approach.visH = CFG.view3d.approachVisH; CFG.shipX = 0.5; }   // 3D: the chase camera sits straight astern of her
CFG.comms.voice=false; // Interface 03 deliberately has no spoken VHF.
const M_PER_UNIT = 70 * CFG.exaggerate / SHIP_LENGTH_WORLD;   // 16.5 m with exaggerate 2.6 (6.36 m true)
const DEG = Math.PI / 180, NM_PER_UNIT = M_PER_UNIT / 1852;

/* ─────────────────────────── 0. GEOGRAPHY (digitised from the chart Howard sent, 16 Sep) ─────────────────────────── */
const COSL = Math.cos(49.172 * DEG);
const gDist = (a, b) => Math.hypot((b[0] - a[0]) * 60, (b[1] - a[1]) * 60 * COSL);                                   // nm
const gBearing = (a, b) => ((Math.atan2((b[1] - a[1]) * COSL, b[0] - a[0]) / DEG) + 360) % 360;                         // ° true
const gMove = (a, brg, nm) => [a[0] + nm * Math.cos(brg * DEG) / 60, a[1] + nm * Math.sin(brg * DEG) / 60 / COSL];
const LEGS = GEO.route.slice(1).map((b, i) => { const a = GEO.route[i]; const nm = gDist(a, b); return { a, b, nm, units: nm / NM_PER_UNIT, brg: gBearing(a, b) }; });
LEGS.reduce((acc, L) => { L.start = acc; return acc + L.units; }, 0);
CFG.distance = LEGS.reduce((a, L) => a + L.units, 0); CFG.nm = CFG.distance * NM_PER_UNIT;
function alongTrack(d) {   // d units from the start → { at:[lat,lon], brg, leg }
  let L = LEGS[LEGS.length - 1]; for (const x of LEGS) if (d <= x.start + x.units) { L = x; break; }
  const k = clamp((d - L.start) / L.units, 0, 1.5); return { at: gMove(L.a, L.brg, k * L.nm), brg: L.brg, leg: L };
}
/* (the old screenBearing(d) — the leg bearing blended through the turn — is gone: 'up' is her heading now) *//* THE MOVEMENT MODEL (Howard, 17 Sep: "a simple anchorage challenge — the ship, if not steered, will go off course; it can be
   steered to a greater angle; it must be stopped exactly on the circle, the bow in the centre"). She has a heading and a rate of
   turn: the helm sets a rudder, the rudder a rate of turn, the heading integrates, she goes where she is pointing; the tide sets
   her sideways the whole time. Her position is a true geographic track. Progress along the route is the projection of that
   position onto the route's legs (for the HUD, the plotter's XTE and the commentary); nothing rides a rail any more. */
function shipGeo() { return S.pos; }
function screenBearing() { return S.hdg; }
/* a geo point → the sim frame (bow-up, hull at the origin, +Z ahead, starboard = −X), in units */
function geoToSim(g) { const r = gDist(S.pos, g) / NM_PER_UNIT, rel = (gBearing(S.pos, g) - S.hdg) * DEG; return [-Math.sin(rel) * r, Math.cos(rel) * r]; }
/* a sim-frame point → geo (for spawning things relative to her) */
function simToGeo(x, z) { const r = Math.hypot(x, z), rel = Math.atan2(-x, z) / DEG; return gMove(S.pos, S.hdg + rel, r * NM_PER_UNIT); }
/* where she is along the route: nearest point on the legs → along-track (units), the leg, the cross-track (units, + = starboard of the line) */
function routeFix(g, minLeg = 0) {   // minLeg: the leg she is known to have reached — a passage never goes back a leg, whatever the geometry says
  let best = null;
  const fixOn = L => { const e0 = (g[1] - L.a[1]) * 60 * COSL, n0 = (g[0] - L.a[0]) * 60;   // nm east/north of the leg's start
    const ux = Math.sin(L.brg * DEG), uy = Math.cos(L.brg * DEG); const along = clamp(e0 * ux + n0 * uy, 0, L.nm); const cross = e0 * uy - n0 * ux;   // + = to the right of the leg's direction
    const px = along * ux, py = along * uy; return { d: Math.hypot(e0 - px, n0 - py), leg: L, along: L.start + along / NM_PER_UNIT, xte: cross / NM_PER_UNIT, end: along >= L.nm - 0.02 }; };
  for (let i = minLeg; i < LEGS.length; i++) { const f = fixOn(LEGS[i]); if (!best || f.d < best.d - 0.02) best = f; }   // the next leg must be clearly nearer to take over
  return best;
}
/* the land 'a little artistic while accurate' (Howard, 17 Sep): the same plates run through _beats/tools/land_art.py — an
   edge-preserving wash, a gentle grade, a pale rim at the shore, a whisper of grain; the alpha (the coastline) untouched.
   ?land=photo shows the untreated imagery for comparison. */
const LAND_ART = !/[?&]land=photo\b/.test(location.search), artOf = f => LAND_ART ? f.replace(/\.webp$/, '-art.webp') : f;
const P = GEO.plate, MERC = lat => Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG)); P.src = artOf(P.src);
const geoToPlate = g => [(g[1] - P.bounds.west) / (P.bounds.east - P.bounds.west) * P.w, (MERC(P.bounds.north) - MERC(g[0])) / (MERC(P.bounds.north) - MERC(P.bounds.south)) * P.h];

/* ─────────────────────────── 1. SEA (from the beat) ─────────────────────────── */
const game = $('#game'), seaCanvas = $('canvas.sea'), world = $('.world'), fxCanvas = $('canvas.fx'), fx = fxCanvas.getContext('2d'), planEl = $('.plan');
setWakeParams(CFG.sea.wakeRun, CFG.sea.wakeStrength);
let renderer; try { renderer = new THREE.WebGLRenderer({ canvas: seaCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2'); }
catch (e) { $('[data-card="intro"] .lead').textContent = 'This browser cannot run the sea (WebGL2 is needed). Try Chrome, Edge or Safari on a laptop.'; $('[data-act="start"]').disabled = true; throw e; }
renderer.setPixelRatio(1); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x02484b, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.1, 5000); camera.up.set(0, 0, 1);     // bow (+Z) up the screen
scene.add(new THREE.AmbientLight(0xffffff, .9));
const SUN_EL = THREE.MathUtils.degToRad(55), sun = new THREE.DirectionalLight(0xfff4e0, 4.6); sun.position.set(-Math.cos(SUN_EL) * 60, Math.sin(SUN_EL) * 60, 0); scene.add(sun);   // a touch less glare than the beat at this height
// the wake sim, with one addition: up to 8 splash impulses a frame (dolphins re-entering, things we hit, the anchor)
const NDROP = 8;
const frag = WAKE_FRAG
  .replace('uniform float uTime, uDelta, uShipSpeed, uSmoothing;', 'uniform float uTime, uDelta, uShipSpeed, uSmoothing; uniform vec4 uDrops[8];')
  .replace('  // (d) PROPELLER WASH', '  for(int i=0;i<8;i++){ if(uDrops[i].w!=0.0){ float dd=distance(uv,uDrops[i].xy); if(dd<uDrops[i].z){ float k=1.0-dd/uDrops[i].z; h+=uDrops[i].w*k*k; } } }\n  // (d) PROPELLER WASH');
const drops = { value: Array.from({ length: NDROP }, () => new THREE.Vector4(0, 0, 0, 0)) };
const RES = (matchMedia('(pointer: coarse)').matches || innerWidth <= 900) ? 192 : 384;
const wake = createWakeSimulation(renderer, { resolution: RES, bounds: BOUNDS, shipWidth: 2.2 / BOUNDS, shipLength: SHIP_LENGTH_WORLD / BOUNDS, shipSpeed: 40, wakeIntensity: 0.6, frag, extraUniforms: { uDrops: drops } });
const loader = new THREE.TextureLoader();
const [normalMap, skyTex] = await Promise.all([loader.loadAsync('assets/water-normal.png'), loader.loadAsync('assets/sky-env.png')]);
normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping; normalMap.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy()); normalMap.generateMipmaps = true; normalMap.minFilter = THREE.LinearMipmapLinearFilter;
skyTex.mapping = THREE.EquirectangularReflectionMapping; skyTex.colorSpace = THREE.SRGBColorSpace;
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromEquirectangular(skyTex).texture; pmrem.dispose();
const { mat, uni } = makeOcean(wake, normalMap, scene.environment, RES);
// The fixed reference matches the original opening orientation. Camera stays north-up.
// Background water uses geographic position + heading, independently of the local wake.
const waterFrame=installWaterFrame(mat,{referenceHeading:LEGS[0].brg,sun,
  grid:PARAMS.has('water-grid'),frozen:PARAMS.has('water-freeze')});
const plane = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 150, 150), mat); plane.rotation.x = -Math.PI / 2; scene.add(plane);
uni.uWakeOffsetY.value = 0; uni.uHeightScale.value = 1.9;
/* TWILIGHT (Howard, 20 Sep: 'the whole feeling of the game in twilight, so the light from the lighthouse is more appropriate,
   dolphins glisten a little, and the sea just a little deeper colour'). Game only: the sea-wake beat keeps its daylight.
   The sea a shade deeper and a little less sky in it; the dusk itself is game.css (.game.twilight). ?day turns it off. */
const TWILIGHT = !PARAMS.has('day');
if (TWILIGHT) { try { uni.uTopColor.value.set?.('#0b706d'); uni.uBottomColor.value.set?.('#024047'); mat.color?.set?.('#096161'); mat.envMapIntensity = 0.4; } catch (_) {} document.querySelector?.('.game')?.classList?.add('twilight'); }

/* ─────────────────────────── 2. SCREEN GEOMETRY ─────────────────────────── */
const NORTH_UP = !CFG.view3d.on; let ROT = 0, upBrg = 0;   // the 3D chase view is bow-up by nature; the plan view is north-up   // north-up (see below): ROT = degrees clockwise the screen is turned from bow-up; upBrg = the true bearing that is 'up' on screen
let W = 1, H = 1, ppu = 10, camH = 80, aheadZ = 0, visW = 80, visH = CFG.open.visH;
function setView(v) {   // the view height in world units: everything on screen is placed from ppu/aheadZ, so this can change per frame (the pull-back into the bay)
  visH = v; const tanF = Math.tan(THREE.MathUtils.degToRad(CFG.fov / 2));
  camH = visH / (2 * tanF); ppu = H / visH; visW = visH * camera.aspect;
  const hullY = lerp(CFG.hullY, CFG.open.hullY, clamp((visH - CFG.visH) / (CFG.open.visH - CFG.visH), 0, 1));   // pulled right back (the opening) the hull sits lower still, so Corbière is in the frame ahead
  if (!NORTH_UP) aheadZ = (hullY - 0.5) * visH;      // camera aims this far ahead of the hull so the hull sits low on screen (north-up: set per frame from CFG.hullPos)
  uni.uCamHeight.value = camH; uni.uHeightScale.value = lerp(1.9, 1.2, clamp((visH - 50) / 80, 0, 1))*CFG.sea.swell;
  hullEl.style.width = (SHIP_LENGTH_WORLD * ppu).toFixed(1) + 'px';
  if (station) { const r = stationVisualRadiusUnits() * ppu; station.ring.style.width = station.ring.style.height = (2 * r).toFixed(1) + 'px'; }
}
function resize() {
  W = game.clientWidth || innerWidth; H = game.clientHeight || innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = CFG.fov; camera.updateProjectionMatrix();
  fxCanvas.width = Math.round(W * PLAN * FXK); fxCanvas.height = Math.round(H * PLAN * FXK); fx.setTransform(FXK, 0, 0, FXK, 0, 0); setView(visH);   // (setting the size resets the transform)
  $('.scene').style.perspective = (H / (2 * Math.tan(CFG.fov / 2 * DEG))).toFixed(1) + 'px';   // the camera's focal length in px: the CSS eye where the sea camera is
  if (typeof plotSize === 'function' && game.classList.contains('plotfull')) plotSize();
}
// world → screen (points on the water; the camera looks straight down, so this is exact)
let viewD = 0;   // world units the camera aim is shifted to starboard of the hull (so the coast has room on the port side)
/* NORTH UP (Howard, 16 Sep: "the map must be around true north, so the ship approaches on 110° as the chart and the pilotage
   directions show"). The simulation keeps its bow-up world frame (+Z ahead); the SCREEN is turned so that north is up: every
   world → screen mapping is rotated clockwise by ROT = the leg's bearing about the centre, the sea camera's up-vector turns with
   it, and every sprite's heading gets ROT added. The hull sits behind the centre along her heading, so the water ahead of her —
   down-right on the 110° leg — has the room. Set NORTH_UP false for the old bow-up view. */
const FXK = 0.5;   // the spray layer's pixels per plan pixel: it is only white dots and rings, and at full resolution it was ~9 screens of pixels cleared every frame
const PLAN = 3;   // the plan layer is PLAN screens wide and high (the tilted view reaches far beyond the screen at the top)
const toScreen = (x, z, lat) => { const vx = (lat + viewD - x) * ppu, vy = (aheadZ - z) * ppu, c = Math.cos(ROT * DEG), sn = Math.sin(ROT * DEG); return [W * PLAN / 2 + vx * c - vy * sn, H * PLAN / 2 + vx * sn + vy * c]; };
const toUV = (x, z) => [0.5 + x / BOUNDS, 0.5 - z / BOUNDS];
const place = (el, sx, sy, deg, extra = '') => { el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%) rotate(${(deg + ROT).toFixed(1)}deg) ${extra}`; };   // headings are in the bow-up frame: the screen's turn is added here
const placeAbs = (el, sx, sy, deg) => { el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%) rotate(${deg.toFixed(1)}deg)`; };

/* ─────────────────────────── 3. THINGS ON THE WATER ─────────────────────────── */
const hullEl = document.createElement('div'); hullEl.className = 'hull'; hullEl.innerHTML = '<img alt="" src="assets/ship-plan.png">'; world.appendChild(hullEl);
// sprites: file, viewBox, and where the operator's logo sits on it (percent of the box), sized as a fraction of the sprite's width
const SPRITES = {
  dolphin: { src: 'assets/game/dolphin.svg', vb: [44, 100] },
  tuna: { src: 'assets/game/tuna-boat.svg', vb: [150, 200] },
  pots: { src: 'assets/game/pot-buoy.svg', vb: [60, 44] },
  dfds: { src: 'assets/game/ferry-dfds.svg', vb: [90, 300], logo: { file: 'dfds.png', name: 'DFDS', x: 50, y: 60, w: 0.72 } },   // the partner's logo, big enough to read at the passage view (Howard, 16 Sep)
  iu: { src: 'assets/game/ferry-iu.svg', vb: [90, 260], logo: { file: 'islands-unlimited.png', name: 'Islands Unlimited', x: 50, y: 64, w: 0.5 } },
  taxi: { src: 'assets/game/water-taxi.svg', vb: [48, 100], logo: { file: 'water-taxi-ci.png', name: 'Water Taxi CI', x: 50, y: 74, w: 0.55 } },
  pilot: { src: 'assets/pilot-boat.svg', vb: [200, 64], bowRight: true, logo: { file: 'ports-of-jersey.png', name: 'Ports of Jersey', x: 62, y: 50, w: 0.16 } },
  plane: { src: 'assets/game/airliner-v2.svg', vb: [120, 120] },   // 24 Oct 2026: the redrawn airliner (A320-family planform, engines under the wing, nav lights)
  // the live AIS vessels (all original drawings): a ferry without a brand, a coaster, a motor yacht, a sailing yacht
  // the traffic on the line (GAME-POLISH.md, 18 Sep): all original drawings; the marks are the owners' files, on the boat, within her length
  ropax: { src: 'assets/game/ferry-ropax.svg', vb: [110, 320], logo: { file: 'dfds.png', name: 'DFDS', x: 50, y: 56, w: 0.6 } },
  lifeboat: { src: 'assets/game/lifeboat.svg', vb: [60, 180], logo: { file: 'rnli.svg', name: 'RNLI', x: 50, y: 50, w: 0.4 } },
  cgrib: { src: 'assets/game/rib-coastguard.svg', vb: [48, 100], logo: { file: 'coastguard.svg', name: 'Jersey Coastguard', x: 50, y: 72, w: 0.6 } },
  cruise: { src: 'assets/game/cruise-ship.svg', vb: [120, 520] },
  superyacht: { src: 'assets/game/superyacht.svg', vb: [60, 300] },
  trawler: { src: 'assets/game/trawler.svg', vb: [70, 190] },
  openboat: { src: 'assets/game/open-boat.svg', vb: [30, 70] },
  racer: { src: 'assets/game/racer.svg', vb: [120, 170], logo: { file: 'shyc.jpg', name: 'St Helier Yacht Club', x: 50, y: 32, w: 0.62 } },
  dinghy: { src: 'assets/game/dinghy.svg', vb: [44, 60], logo: { file: 'rciyc.webp', name: 'RCIYC', x: 32, y: 60, w: 0.55 } },
  kayak: { src: 'assets/game/kayak.svg', vb: [24, 60] },
  gull: { src: 'assets/game/gull.svg', vb: [40, 24] }, shoal: { src: 'assets/game/shoal.svg', vb: [120, 80] },
  ferry: { src: 'assets/game/ferry-dfds.svg', vb: [90, 300] }, cargo: { src: 'assets/game/ship-cargo.svg', vb: [64, 240] }, yacht: { src: 'assets/game/motor-yacht.svg', vb: [40, 120] }, sail: { src: 'assets/game/yacht-sail.svg', vb: [40, 100] }
};
const KIND_NAME = { dolphin: 'Dolphin', tuna: 'Tuna boat, trolling', pots: 'Pot buoy — a string of lobster pots', dfds: 'DFDS fast ferry', iu: "Islands Unlimited's San Pawl", taxi: 'Water Taxi CI', pilot: 'Ports of Jersey pilot launch', ropax: 'DFDS ferry', lifeboat: 'The St Helier lifeboat (RNLI)', cgrib: 'Jersey Coastguard rescue boat', cruise: 'Cruise ship at anchor', superyacht: 'Superyacht outbound', trawler: 'Trawler, towing', openboat: 'Fisherman with rods', racer: 'SHYC racing yacht', dinghy: 'RCIYC racing dinghy', kayak: 'Kayaker — keeps no rules', gull: 'Herring gull', shoal: 'A shoal of surface fish', tender: "The cruise ship's tender", potter: 'Potter, working her string', ferry: 'Passenger ship (AIS)', cargo: 'Cargo ship (AIS)', yacht: 'Yacht (AIS)', sail: 'Sailing yacht (AIS)', plane: 'The crew\'s flight, on final for runway 08' };
const obs = [];                                     // { kind, lane, z, heading, len, w, swim, el, circles:[{dz, r}], hit, … }
function logoEl(spec) {
  if (!spec) return null;
  const d = document.createElement('div'); d.className = 'brand'; d.style.left = spec.x + '%'; d.style.top = spec.y + '%';
  d.innerHTML = `<img alt="${spec.name}" src="assets/game/logos/${spec.file}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><b hidden>${spec.name}</b>`;
  d.dataset.w = spec.w; return d;
}
function spawnEl(kind, cls = '') {
  const sp = SPRITES[kind]; const d = document.createElement('div'); d.className = 'ob ' + kind + ' ' + cls; d.innerHTML = `<img alt="" src="${sp.src}">`;
  const b = logoEl(sp.logo); if (b) d.appendChild(b); world.appendChild(d); return d;
}
function addObstacle(o) { if (o.el) o.el.title = o.name ? `${o.name} · ${KIND_NAME[o.kind] || o.kind}` : (o.potter ? KIND_NAME.potter : KIND_NAME[o.kind] || o.kind); if (!o.g) { o.g = simToGeo(-o.lane, o.z); o.hdg = ((S.hdg + o.heading) % 360 + 360) % 360; } obs.push(o); return o; }   // spawned relative to her, then it lives in the world: a geo position and a true heading
function removeObstacle(o) { o.el?.remove(); o.shadow?.remove(); o.wakeEl?.remove(); const i = obs.indexOf(o); if (i >= 0) obs.splice(i, 1); }
function wakeLine(before) { const wk = document.createElement('div'); wk.className = 'wakeline'; world.insertBefore(wk, before); return wk; }

/* a pod of dolphins crossing ahead, each surfacing and leaping in turn */
function spawnPod(z) {
  const n = 2 + Math.floor(gameRandom.next() * 2), fromLeft = gameRandom.next() < 0.5, lane0 = fromLeft ? -visW * 0.55 : visW * 0.55;
  const heading = fromLeft ? rnd(55, 80) : -rnd(55, 80);           // degrees from up (+ = to screen right)
  for (let i = 0; i < n; i++) {
    const el = spawnEl('dolphin', 'under'); const sh = document.createElement('div'); sh.className = 'shadow'; world.insertBefore(sh, el);
    addObstacle({ kind: 'dolphin', lane: lane0 + (fromLeft ? -1 : 1) * i * 3.6, z: z + i * 1.6 + rnd(-0.6, 0.6), heading, len: 4.4, w: 1.9, swim: 8.5,
      circles: [{ dz: 0, r: 1.0 }], el, shadow: sh, phase: -i * 0.9 - rnd(0, 0.6), leapT: 1.15, underT: 2.0, air: 0, sprayed: 0, splashed: 0 });
  }
}
function spawnTuna(z) {
  const lane = rnd(-visW * 0.42, visW * 0.42), heading = rnd(-12, 12); const el = spawnEl('tuna', 'boat');
  addObstacle({ kind: 'tuna', lane, z, heading, len: 12, w: 9, swim: 5, circles: [{ dz: 3, r: 1.5 }, { dz: 0, r: 1.7 }, { dz: -3, r: 1.5 }, { dz: -7.5, r: 1.2 }], el });   // last circle: the lines astern
}
function spawnPots(z) {
  const n = 1 + Math.floor(gameRandom.next() * 3), lane = rnd(-visW * 0.45, visW * 0.45);
  for (let i = 0; i < n; i++) { const el = spawnEl('pots'); addObstacle({ kind: 'pots', lane: lane + rnd(-5, 5), z: z + i * 4 + rnd(-2, 2), heading: rnd(0, 360), len: 2.2, w: 3, swim: 0, circles: [{ dz: 0, r: 1.1 }], el }); }
}
/* the DFDS ferry: either crossing from the side, or bound for St Helier and overtaking us from astern */
function spawnDfds(z) {
  const el = spawnEl('dfds', 'boat'); const wk = wakeLine(el); const cross = gameRandom.next() < 0.55, fromLeft = gameRandom.next() < 0.5;
  const o = cross ? { lane: fromLeft ? -visW * 0.8 : visW * 0.8, z, heading: fromLeft ? 90 : -90, swim: 16 }
                  : { lane: rnd(-visW * 0.3, visW * 0.3), z: -visH * 0.5 - 30, heading: rnd(-4, 4), swim: 27 };   // overtaking: comes up from below, faster than us
  addObstacle(Object.assign({ kind: 'dfds', len: 24, w: 7.4, circles: [{ dz: 9, r: 2.4 }, { dz: 4, r: 3.4 }, { dz: -2, r: 3.6 }, { dz: -8, r: 3.2 }], el, wakeEl: wk }, o));
  toast(cross ? 'DFDS ferry crossing ahead' : 'DFDS ferry coming up astern', '');
}
/* Islands Unlimited's San Pawl: 35 m, 50 knots, Guernsey ↔ Jersey — crosses fast */
function spawnIu(z) {
  const el = spawnEl('iu', 'boat'); const wk = wakeLine(el); const fromLeft = gameRandom.next() < 0.5;
  addObstacle({ kind: 'iu', lane: fromLeft ? -visW * 0.8 : visW * 0.8, z, heading: fromLeft ? rnd(78, 96) : -rnd(78, 96), len: 6, w: 1.9, swim: 30, circles: [{ dz: 2, r: 1.0 }, { dz: -1, r: 1.0 }], el, wakeEl: wk });
  toast('Islands Unlimited — 50 knots', '');
}
/* Water Taxi CI: a 12 m RIB in a hurry, weaving */
function spawnTaxi(z) {
  const el = spawnEl('taxi', 'boat'); const wk = wakeLine(el); const fromLeft = gameRandom.next() < 0.5;
  addObstacle({ kind: 'taxi', lane: fromLeft ? -visW * 0.7 : visW * 0.7, z: z - rnd(0, 12), heading: fromLeft ? 70 : -70, len: 8.5, w: 3.6, swim: 24, weave: rnd(0.8, 1.4), circles: [{ dz: 1.8, r: 1.4 }, { dz: -1.5, r: 1.5 }], el, wakeEl: wk });
}
/* THE TRAFFIC ON ITS REAL ROUTES, BY THE RULES (Howard, 17 Sep: "the dolphins, pot fishermen, tuna, ferries all need to abide by
   the rules of navigation — we're just bringing the screen to life"). Nothing criss-crosses. The ferries run the Western Passage
   leading line (082°/262°) and the North West Passage; Islands Unlimited comes down from Guernsey past Corbière and joins it; the
   potters work their strings along the coast, slowly, inshore; the tuna boats work offshore to the south; the water taxi runs
   inshore between Ouaisné and St Helier; a pod of dolphins crosses once, on its way somewhere. And they behave: head-on, both
   alter to starboard and pass port to port; a vessel with the yacht on her starboard side gives way — alters to starboard early
   and passes astern; the overtaker keeps clear. When the YACHT is the give-way vessel the captain is told, and the pilot's five
   short blasts are the price of ignoring it. The routes are geo waypoint lists; each vessel follows hers at her own speed. */
/* what each of the new kinds is on the water: length and beam (units, for recognition — not scale), her collision circles, sail (we keep clear) */
const TRAFFIC = {
  cruise: { standOn: true, len: 34, w: 8, circles: [{ dz: 13, r: 3.6 }, { dz: 5, r: 4 }, { dz: -4, r: 4 }, { dz: -12, r: 3.6 }] },
  ropax: { standOn: true, len: 26, w: 9, circles: [{ dz: 9, r: 3 }, { dz: 2, r: 4.2 }, { dz: -6, r: 4.2 }, { dz: -11, r: 3 }] },
  superyacht: { standOn: true, len: 20, w: 4, circles: [{ dz: 4.5, r: 1.3 }, { dz: 0, r: 1.4 }, { dz: -4.5, r: 1.3 }] },
  lifeboat: { len: 11, w: 3.7, circles: [{ dz: 2, r: 1.2 }, { dz: -2, r: 1.2 }] },
  cgrib: { len: 8, w: 3.4, circles: [{ dz: 1.2, r: 1.1 }, { dz: -1.2, r: 1.1 }] },
  tender: { sprite: 'taxi', len: 8, w: 3.4, circles: [{ dz: 1.2, r: 1.1 }, { dz: -1.2, r: 1.1 }] },
  trawler: { len: 13, w: 5, circles: [{ dz: 2.6, r: 1.6 }, { dz: -2.6, r: 1.6 }] },
  openboat: { len: 5.5, w: 2.4, circles: [{ dz: 0, r: 1 }] },
  racer: { len: 11, w: 7.8, circles: [{ dz: 1.5, r: 1.6 }, { dz: -2, r: 1.2 }], sail: true },
  dinghy: { len: 5.5, w: 4, circles: [{ dz: 0, r: 1.2 }], sail: true },
  kayak: { len: 4.2, w: 1.7, circles: [{ dz: 0, r: 0.8 }], sail: true, lawless: true }
};
const FLEETS = { shyc: { kind: 'racer', n: 6, gap: 11, stagger: 9 }, rciyc: { kind: 'dinghy', n: 7, gap: 8, stagger: 6 } };
const KITES = [0, 40, 95, 150, 205, 260, 300];
/* gulls: a few wheeling over a boat or the shoal (the potter has them, the shoal is mobbed) — no rules, no collisions, just the sky */
function spawnGulls(over, n) { for (let i = 0; i < n; i++) { const el = spawnEl('gull', 'air'); el.style.zIndex = 6;
  addObstacle({ kind: 'gull', g: over.g.slice(), hdg: 0, swim: 0, lane: 0, z: 0, heading: 0, len: 1.6, w: 1, circles: [], hit: true, el, orbit: { over, r: decorRandom.range(2.5, 6), a: decorRandom.range(0, 6.28), w: decorRandom.range(0.5, 1.1) * (decorRandom.next() < 0.5 ? 1 : -1) } }); } }
/* the dolphins earned (GAME-POLISH.md ★): a steady course and speed bring the pod to the bow; keep it steady and they move to the
   wake — the star. Hard helm sends them off. They ride with the ship: no collisions, no rules. */
function spawnRidePod() { S.podCame = true; S.rideT = 0; const n = CFG.dolphins.podSize; for (let i = 0; i < n; i++) { const el = spawnEl('dolphin', 'under');
  const sh = document.createElement('div'); sh.className = 'shadow'; world.insertBefore(sh, el);
  addObstacle({ kind: 'dolphin', shadow: sh, g: S.pos.slice(), hdg: S.hdg, swim: 0, lane: 0, z: 0, heading: 0, len: 4.6, w: 2, circles: [{ dz: 0, r: 1 }], hit: true, el, ride: { x: (i - (n-1)/2) * 2.2 + rnd(-0.4, 0.4), z: 7.5 + rnd(0, 1.5) }, phase: -i * 0.8, leapT: 1.15, underT: 1.6, air: 0, sprayed: 0, splashed: 0 }); }
  toast('Dolphins on the bow — hold her steady and they will come to the wake', 'good'); comms('Bridge', 'Dolphins on the bow, Captain — three of them. Steady as she goes.'); }
function spawnOnRoute(item) {
  if (item.kind === 'shoal') { const el = spawnEl('shoal', 'under'); const o = addObstacle({ kind: 'shoal', g: item.fixed.slice(), hdg: rnd(0, 360), swim: 0.15, fixed: true, lane: 0, z: 0, heading: 0, len: 9, w: 6, circles: [], hit: true, el }); spawnGulls(o, 5); return; }
  if (item.fixed) { const T = TRAFFIC[item.kind]; const el = spawnEl(item.kind, 'boat'); addObstacle({ kind: item.kind, g: item.fixed.slice(), hdg: item.hdg || 0, swim: 0, fixed: true, lane: 0, z: 0, heading: 0, el, ...T }); return; }   // at anchor, where she is
  const R = ROUTES[item.route], g0 = R[0], hdg0 = gBearing(R[0], R[1]);
  if (FLEETS[item.kind]) { const F = FLEETS[item.kind], T = TRAFFIC[F.kind];   // a racing fleet: spread across and along the course, each her own colour, each a shade faster or slower
    for (let i = 0; i < F.n; i++) { const el = spawnEl(F.kind, 'boat sail'); el.querySelector('img').style.filter = `hue-rotate(${KITES[i % KITES.length]}deg)`; const wk = wakeLine(el);
      const g = gMove(gMove(g0, hdg0 + 90, (i - (F.n - 1) / 2) * F.gap * NM_PER_UNIT), hdg0, -(i % 3) * F.stagger * NM_PER_UNIT);
      addObstacle({ kind: F.kind, off: (i - (F.n - 1) / 2) * F.gap, g, hdg: hdg0, route: R, wp: 1, loop: item.loop, swim: item.speed * (0.92 + 0.16 * gameRandom.next()), lane: 0, z: 0, heading: 0, el, wakeEl: wk, ...T }); }
    comms('Bridge', item.kind === 'shyc' ? 'St Helier Yacht Club racing off St Aubin — spinnakers up. Sail has right of way over us: we keep clear.' : 'RCIYC dinghies racing in St Aubin\'s Bay — we keep well clear of the fleet.'); return; }
  if (TRAFFIC[item.kind]) { const T = TRAFFIC[item.kind]; const sp = T.sprite || item.kind; const el = spawnEl(sp, 'boat' + (T.sail ? ' sail' : '')); const wk = wakeLine(el);
    addObstacle({ kind: item.kind, spriteKind: sp, off: (T.len || 4) * 0.45, g: g0.slice(), hdg: hdg0, route: R, wp: 1, loop: item.loop, swim: item.speed, lane: 0, z: 0, heading: 0, el, wakeEl: wk, ...T });
    const say = { lifeboat: 'The St Helier lifeboat is out on exercise, bound west past Noirmont.', cgrib: 'Jersey Coastguard\'s rescue boat on patrol inshore.', ropax: 'DFDS conventional ferry inbound on the line — big and slow; she stands on.', superyacht: 'A superyacht outbound from St Helier on the line — port to port.', tender: 'The cruise ship at anchor off St Helier is running her tenders.', trawler: 'A trawler towing offshore south of the line — give her a wide berth, she cannot alter.', kayak: 'A kayaker inshore off Portelet — he keeps no rules; watch him.' }[item.kind]; if(item.kind==='ropax')transmit('traffic.passing',{target:'DFDS conventional ferry'});else if(say)comms('Bridge',say);return; }
  const mk = (kind, extra) => { const el = spawnEl(kind, kind === 'dolphin' ? 'under' : kind === 'pots' ? '' : 'boat'); const o = { kind, g: g0.slice(), hdg: hdg0, route: R, wp: 1, swim: item.speed, lane: 0, z: 0, heading: 0, el, off: kind === 'taxi' ? 3.5 : 0, ...extra }; if (kind !== 'dolphin' && kind !== 'pots') o.wakeEl = wakeLine(el); if (kind === 'dolphin') { const sh = document.createElement('div'); sh.className = 'shadow'; world.insertBefore(sh, el); o.shadow = sh; } return addObstacle(o); };
  if (item.kind === 'dfds') { mk('dfds', { standOn: true, len: 24, w: 7.4, circles: [{ dz: 9, r: 2.4 }, { dz: 4, r: 3.4 }, { dz: -2, r: 3.6 }, { dz: -8, r: 3.2 }] }); transmit('traffic.passing',{target:item.route==='ferryOut'?'DFDS ferry outbound':'DFDS ferry inbound'},{key:'ferry-'+item.id}); }
  else if (item.kind === 'iu') { mk('iu', { standOn: true, len: 7.5, w: 2.4, circles: [{ dz: 2, r: 1.0 }, { dz: -1, r: 1.0 }] }); transmit('traffic.passing',{target:'Islands Unlimited from Guernsey'},{key:'ferry-'+item.id}); }
  else if (item.kind === 'taxi') mk('taxi', { len: 8.5, w: 3.6, circles: [{ dz: 1.8, r: 1.4 }, { dz: -1.5, r: 1.5 }] });   // drawn big enough to be recognised (GAME-POLISH.md)
  else if (item.kind === 'tuna') mk('tuna', { len: 12, w: 9, circles: [{ dz: 3, r: 1.5 }, { dz: 0, r: 1.7 }, { dz: -3, r: 1.5 }, { dz: -7.5, r: 1.2 }] });
  else if (item.kind === 'potter') { const potter = mk('tuna', { len: 12, w: 9, potter: true, circles: [{ dz: 3, r: 1.5 }, { dz: 0, r: 1.7 }, { dz: -3, r: 1.5 }] }); spawnGulls(potter, 3);   // the potting boat (the tuna-boat drawing works for her) with her string of pots laid along the route
    for (let i = 1; i < R.length - 1; i++) for (let k = 0; k < 3; k++) { const g = gMove(gMove(R[i], gBearing(R[i], R[i + 1]), k * 0.06 + 0.02), gBearing(R[i], R[i + 1]) + 90, rnd(-0.03, 0.03)); const el = spawnEl('pots'); addObstacle({ kind: 'pots', g, hdg: rnd(0, 360), swim: 0, lane: 0, z: 0, heading: 0, len: 2.2, w: 3, circles: [{ dz: 0, r: 1.1 }], el, fixed: true }); } }
  else if (item.kind === 'pod') { const n = 3; for (let i = 0; i < n; i++) { const o = mk('dolphin', { len: 4.6, w: 2, circles: [{ dz: 0, r: 1.0 }], phase: -i * 0.9 - rnd(0, 0.6), leapT: 1.15, underT: 2.0, air: 0, sprayed: 0, splashed: 0 }); o.g = gMove(gMove(o.g, hdg0 + 90, (i - 1) * 3.6 * NM_PER_UNIT), hdg0, -i * 1.6 * NM_PER_UNIT); } comms('Bridge', 'Dolphins — a pod crossing from the south-west, going about their business.'); }
}
/* route following: steer for the next waypoint; at the end of the route, off she goes */
function followRoute(o, dt) {
  if (!o.route) return;
  const wp0 = o.route[o.wp]; const wp = o.off ? gMove(wp0, gBearing(o.route[o.wp - 1] || o.g, wp0) + 90, o.off * NM_PER_UNIT) : wp0; const want = gBearing(o.g, wp); let d = ((want - o.hdg) + 540) % 360 - 180;
  const rate = o.kind === 'dolphin' ? 60 : /taxi|tender|cgrib|kayak|dinghy/.test(o.kind) ? 45 : /iu|lifeboat|racer|openboat/.test(o.kind) ? 25 : 12;   // °/s she can turn
  o.hdg = ((o.hdg + clamp(d, -rate * dt, rate * dt)) % 360 + 360) % 360;
  if (gDist(o.g, wp) / NM_PER_UNIT < 4) { o.wp++; if (o.wp >= o.route.length) { if (o.loop) o.wp = 0; else o.route = null; } }
}
/* the rules of the road, between the yacht (at the origin, heading up, speed S.speed) and a vessel o (sim frame) */
function rules(o, dt) {
  if (!o.swim || o.kind === 'pots' || o.kind === 'dolphin' || o.kind === 'potter') return;
  // 28 Sep 2026, Simon: "watched that ferry collide again" — S.speed alone is the yacht's true kn figure, but her
  // actual ground-covering rate is damped by S.timeScale (CFG.pace everywhere, more again in the pilot zone —
  // see the comment above where it's set, in tick()) while traffic keeps moving at its own real rate. Every
  // relative-velocity calc below needs that same damping on our side, or a closest-approach point gets predicted
  // against a yacht that's really still sitting there when the math assumed she'd have moved on.
  const ourV = S.speed * (S.timeScale ?? 1);
  if (o.sail) {   // sail (and the kayaker): they stand on, we keep clear — the captain is told once per encounter
    const hr0 = o.heading * DEG; const vx0 = -Math.sin(hr0) * o.swim, vz0 = Math.cos(hr0) * o.swim - ourV; const v20 = vx0 * vx0 + vz0 * vz0; if (v20 < 1e-6) return;
    const tc = -(o.x * vx0 + o.z * vz0) / v20; if (tc < 0 || tc > 40) return; const cp = Math.hypot(o.x + vx0 * tc, o.z + vz0 * tc); if (cp > 16) return;
    if (!o.warned) { o.warned = true; const who = o.lawless ? 'The kayaker' : o.kind === 'dinghy' ? 'The dinghy fleet' : 'The racing yacht'; toast(`${who} ahead — ${o.lawless ? 'he keeps no rules: go round him' : 'sail stands on: we keep clear'}`, 'bad'); comms('Pilot', o.lawless ? 'Kayaker ahead, and he is not watching us. Go round him, wide.' : `${who} crossing — sail has right of way. Come round and go astern of ${o.kind === 'dinghy' ? 'them' : 'her'}.`); } return; }
  // 26 Sep 2026, Simon: "pilots would have scheduled this not to occur... it should come on a transit that puts it
  // port to port with the approaching vessel rather than the Kinship becoming constrained or having to dodge it" —
  // near the pilot station the approach should read as arranged, not improvised: any standing-on ferry or ship
  // gives way instead of holding the channel, and any crossing encounter resolves with HER altering, never us.
  const clearForPilot = S.phase === 'pilotzone' && !S.pilotBoarded;
  if (o.standOn && !clearForPilot) {   // the ferries and the big ships hold the channel and their course (Howard, 18 Sep): they stand on, we keep clear
    const hr1 = o.heading * DEG; const vx1 = -Math.sin(hr1) * o.swim, vz1 = Math.cos(hr1) * o.swim - ourV; const v21 = vx1 * vx1 + vz1 * vz1; if (v21 < 1e-6) return; const tc1 = -(o.x * vx1 + o.z * vz1) / v21; if (tc1 < 0 || tc1 > 40) return; const cp1 = Math.hypot(o.x + vx1 * tc1, o.z + vz1 * tc1); if (cp1 > 18) return;
    const who1 = { dfds: 'The DFDS ferry', ropax: 'The ferry', iu: 'Islands Unlimited', cruise: 'The cruise ship', superyacht: 'The superyacht' }[o.kind] || 'She';
    if (!o.warned) { o.warned = true; o.warnedAt = S.t; toast(`${who1} holds the channel — she stands on: keep clear of her`, 'bad'); comms('Pilot', `${who1} is standing on in the channel. She will not alter for us — keep clear, and pass astern if she is crossing.`); }
    // 30 Sep 2026, Simon: watched the DFDS ferry visually overlap the yacht in a preview — "what was the reason
    // for this?" Traced it: mayDisplaceTarget() (safety.js) correctly never moves a stand-on vessel, but nothing
    // ever moved US for her either — short of avoided()'s emergency, contact-triggered pilotHelm nudge, which
    // only fires once the hull safety-circles are already touching (game.js ~1437), too late for a fast-closing
    // ferry to visibly clear in time. This is the same gap the crossing-traffic branch below already closes with
    // its own grace-period fallback ("After a grace window with no resolution she alters herself, so it can
    // never end as a silent near miss") — just applied to OUR OWN heading here instead of hers, since a
    // stand-on vessel is the one case that can never be the one to move. Same 2.5s grace window, same
    // unconditional trigger (no attempt to detect whether the player already responded — the existing pattern
    // doesn't either, and a harmless extra nudge if they did beats a missed one if they didn't).
    if (!o.helmed && S.t - o.warnedAt > 2.5) { o.helmed = true; S.pilotHelm = { dir: 1, t: CFG.avoid.time * 1.6 };
      comms('Pilot', `${who1} isn't answering, Captain — coming to starboard now, in good time.`); }
    return; }
  if (o.giveWay) { o.giveWay.t += dt; const k = Math.min(1, o.giveWay.t / 2.5); o.hdg = o.giveWay.hdg0 + 28 * k; return; }   // an alteration, once begun, is held — no dithering
  const hr = o.heading * DEG; const vx = -Math.sin(hr) * o.swim, vz = Math.cos(hr) * o.swim - ourV;   // her velocity relative to the yacht (sim frame: +Z ahead, −X starboard)
  const rx = o.x, rz = o.z; const v2 = vx * vx + vz * vz; if (v2 < 1e-6) return;
  const tcpa = -(rx * vx + rz * vz) / v2; if (tcpa < 0 || tcpa > 45) return;
  // 26 Sep 2026, Simon: "double check the collision avoidance" — full ahead is up to 12kn now (was 8), so any
  // encounter closes ~50% faster than these fixed distance thresholds were tuned for, leaving proportionally
  // less real time for a give-way turn (o.giveWay's own 2.5s) to actually complete before the closest point.
  // Widened to match (14→18, clearForPilot's already-wider 20 near the pilot station unchanged) — earlier
  // detection, not a faster turn, since a faster turn would read as more alarming, not less. Several long
  // scripted stress runs, before and after this, never produced an actual hit or safetyGuard reposition either
  // way — the real, confirmed gap this round was the missing give-way fallback just below, not this threshold —
  // but it's a genuine proportionality issue regardless, worth the small margin while speeds are higher.
  const cpa = Math.hypot(rx + vx * tcpa, rz + vz * tcpa); if (cpa > (clearForPilot ? 20 : 18)) return;
  const relBrg = ((Math.atan2(-rx, rz) / DEG) + 360) % 360;                       // her bearing from the yacht, relative (0 = ahead, 90 = starboard)
  const relHdg = ((o.heading % 360) + 360) % 360;                                  // her heading relative to ours
  const headOn = relHdg > 170 && relHdg < 190 && (relBrg < 12 || relBrg > 348);
  const sheOvertakes = relHdg < 30 || relHdg > 330; const weOvertake = false;
  const yachtOnHerStarboard = (() => { const b = ((Math.atan2(rx, -rz) / DEG - o.heading) + 720) % 360; return b > 5 && b < 112.5; })();   // the yacht's bearing from her, relative to her heading
  if (o.live) {   // a real vessel: she will not alter for a game — the captain is told what to do
    if (headOn && !o.warned) { o.warned = true; toast(`${o.name} ahead, meeting head-on — come to starboard, pass port to port`, 'bad'); comms('Pilot', `${o.name} is meeting us head-on, and she is real. Come to starboard now and pass her port to port.`); }
    else if (!headOn && !sheOvertakes && relBrg > 5 && relBrg < 112.5 && !o.warned) { o.warned = true; S.giveWayDue = { o, t: S.t }; toast(`${o.name} crossing on your starboard bow — you are the give-way vessel. Alter to starboard, pass astern of her.`, 'bad'); comms('Pilot', `${o.name} crossing from starboard — she stands on. Come to starboard and go under her stern.`); }
    return; }
  if (headOn || sheOvertakes || yachtOnHerStarboard || clearForPilot) { const say = !o.saidAt || S.t - o.saidAt > 40; o.saidAt = S.t; o.giveWay = { t: 0, hdg0: o.hdg }; if (say) { if (headOn) comms('Bridge', `${o.kind === 'dfds' ? 'The ferry' : o.kind === 'iu' ? 'Islands Unlimited' : 'The water taxi'} — meeting head-on: she alters to starboard, we hold; port to port.`); else if (!sheOvertakes) comms('Bridge', clearForPilot ? `${o.kind === 'dfds' ? 'The ferry' : o.kind === 'iu' ? 'Islands Unlimited' : 'The water taxi'} has been told to keep clear of the pilot station — she is altering to pass port to port.` : `${o.kind === 'dfds' ? 'The ferry' : o.kind === 'iu' ? 'Islands Unlimited' : 'The water taxi'} has us on her starboard side — she is the give-way vessel and is altering to pass astern of us.`); } }
  else if (relBrg > 5 && relBrg < 112.5) {   // SHE is on OUR starboard side: we are the give-way vessel, in principle
    if (!o.warned) { o.warned = true; o.warnedAt = S.t; S.giveWayDue = { o, t: S.t };
      toast('Crossing vessel on your starboard bow — you are the give-way vessel. Alter to starboard, pass astern of her.', 'bad'); comms('Pilot', 'Crossing from starboard — she stands on. Come to starboard and go under her stern.'); }
    // 26 Sep 2026, Simon: "double check the collision avoidance... the other vessels should always be altering to
    // pass port to port" — matches the file's own established rule a little above (CFG.avoid's comment: "if the
    // player doesn't see it, by the game: ...the other vessel...alters") but S.giveWayDue was only ever tracked
    // here, never enforced — a real crossing encounter could reach its closest point with neither vessel having
    // turned, leaning on the hard safety net alone (a sudden stop/revert if it came to that, not a clean pass).
    // After a grace window with no resolution she alters herself, so it can never end as a silent near miss.
    else if (!o.giveWay && S.t - o.warnedAt > 2.5) { o.giveWay = { t: 0, hdg0: o.hdg }; comms('Pilot', "She's not holding for you, Captain — altering her now, to be sure of it."); }   // 2.5s, not the original 4 — full ahead is faster now, so she needs to decide sooner to leave her own 2.5s turn room to actually finish before the closest point
  }
}
const flights = [];
/* THE NEW CREW COMING IN (Howard, 17 Sep): not a random overflight — the flight on final for Jersey's runway 08, whose approach comes in
   from the west-south-west over the sea, gear down, descending, big and close, its shadow racing over the water, to land at La Moye
   beside the game. Real runway geometry: threshold 08 near 49°12'.4N 002°12'.7W, runway 078°; she starts 2.2 M out on the extended
   centreline (258° from the threshold) at 2,000 ft and comes down to the ground. Real airlines only, our own drawing. */
const RUNWAY = { thr08: [49.2005, -2.2110], hdg: 78 };   // the threshold nudged 0.35 M south of true so the approach reads over the sea beside the game (representative, not accurate — as the whole picture is)
function spawnOverflight(opt = {}) {
  if (!S.flightN) { S.flightN = 1; flyPass({ name: 'easyJet', color: '#ff6a13', dir: RUNWAY.hdg, size: 0.6, y: 0.5, dur: 5.5, onGone: () => { if (!S.landedSaid) { S.landedSaid = true; transmit('ambient.airport'); } } }); return; }   // the crew's easyJet, MUCH larger, across the screen (Howard, 20 Sep)
  const iata = opt.iata || (S.flightN ? 'BA' : 'U2'), name = iata === 'BA' ? 'British Airways' : 'easyJet'; S.flightN = (S.flightN || 0) + 1;
  const el = document.createElement('div'); el.className = 'ob plane'; el.innerHTML = `<img alt="" src="${SPRITES.plane.src}">`;
  const tag = document.createElement('div'); tag.className = 'brand air';
  tag.innerHTML = `<b style="color:${iata === 'BA' ? '#1d3a6e' : '#ff6a13'};text-transform:${iata === 'BA' ? 'uppercase' : 'none'}">${name}</b>`; tag.dataset.k = iata === 'BA' ? 0.034 : 0.055;   // the name painted along the fuselage (Howard, 18 Sep: no banners) — no logo files, no CDN
  el.appendChild(tag); const sh = document.createElement('div'); sh.className = 'shadow air'; world.appendChild(sh); world.appendChild(el);
  const start = gMove(RUNWAY.thr08, RUNWAY.hdg + 180, 2.2);
  // the jet is heard when she comes into view, panned with her across the screen (Howard, 20 Sep: 'sync the sound of a jet with it')
  flights.push({ g: start, hdg: RUNWAY.hdg, speed: 13, len: iata === 'BA' ? 96 : 190, alt: 1, el, tag, shadow: sh, total: 2.2 });   // easyJet drawn MUCH larger across the screen (Howard, 20 Sep; was 76)   // drawn big: she is low and far nearer the camera than the water — the livery reads across the fuselage
}
/* the Ports of Jersey pilot launch — CIPS's help: comes up from astern, alongside to starboard, and the traffic gives way */
let pilot = null;
function spawnPilot() {
  const el = spawnEl('pilot', 'boat launch'); const flag = document.createElement('div'); flag.className = 'hflag'; el.appendChild(flag); const wk = wakeLine(el);
  // 26 Sep 2026, Simon: "make sure the pilot moving and boarding is visible (and the glowing green area midships in the
  // pilot boat like our prototype)" — the prototype's gunwale glow + pacing figure (proto/pilot-boarding.html), ported
  // onto the launch sprite itself: a soft rail on her near side, hot when the tap-bar's own safe zone is; a small
  // figure that paces along it in step with the same pacePosition() the tap bar already reads. Both only shown while
  // pilot.phase==='boarding' (drawPilotBoatGlow(), by drawPilotXfer() below).
  const glowEl = document.createElement('div'); glowEl.className = 'pilotglow'; glowEl.hidden = true; world.insertBefore(glowEl, el);
  const personEl = document.createElement('div'); personEl.className = 'pilotperson'; personEl.hidden = true; world.appendChild(personEl);
  pilot = { el, wakeEl: wk, glowEl, personEl, ...createBoardingState(), lane: S.lat + 16, z: -visH * 0.5 - 12, heading: -20, len: 12 / 70 * SHIP_LENGTH_WORLD * 1.35, w: 0.7 };   // drawn a little over scale so she reads
  if(boardingOk())transmit('pilot.ready',{}, {valid:()=>!S.pilotBoarded&&boardingOk()});else transmit('pilot.hold',{}, {key:'pilot-speed',valid:()=>!S.pilotBoarded&&!boardingOk()});
}
function boardingOk() { return boardingSpeedSafe(S.speed) && boardingHeadingSafe(S.hdg); }   // both the speed band and the heading window
/* the pilot station mark: a dashed circle over the real boarding waypoint (25 Sep 2026, Simon: was the anchorage ring, now
   moved here) — the camera zooms in on it (see tick()) a little ahead of the launch itself appearing, so there's time to line up. */
let station = null;
// 26 Sep 2026, Simon: "the zone smaller when zoomed out (it extends too much towards the coast); when zoomed in
// it can grow again so the vessel is still in a bigger space like it is now" — the ring's real BOARDING_ZONE_UNITS
// radius (the actual gameplay gate, withinStation etc.) is untouched; only how big it's DRAWN scales with the
// camera, from half size at the wide passage view up to full size once she's zoomed right in on station, so it
// doesn't visually reach toward the coast while it's only ever a distant reference point.
function stationVisualRadiusUnits() {
  const k = clamp((CFG.visH - visH) / (CFG.visH - CFG.approach.visH), 0, 1);
  return lerp(BOARDING_ZONE_UNITS * 0.5, BOARDING_ZONE_UNITS, k);
}
function spawnStationMark() {
  const ring = document.createElement('div'); ring.className = 'stationring'; const r = stationVisualRadiusUnits() * ppu; ring.style.width = ring.style.height = (2 * r).toFixed(1) + 'px';
  ring.innerHTML = '<span>Pilot station</span>'; world.insertBefore(ring, hullEl);
  station = { ring, g: GEO.route[GEO.route.length - 2], z: 0, lane: 0 };
}
/* the coast: the satellite plate drawn on its own canvas under the traffic, rotated so the leg's bearing is up, the ship's own
   geo position pinned to the hull — so Corbière, Point La Moye, the bay and the beach are where they really are */
const coastCanvas = $('canvas.coast'), cc = coastCanvas.getContext('2d'); const plateImg = new Image(); plateImg.src = P.src;
/* the wide plate (Howard, 16 Sep: the south coast from Corbière, seen from the start): the whole south-west corner from St Ouen's
   Bay to Noirmont at 6 m/px, water cut out by the chart's own land mask — drawn first, the 1.56 m/px plate over it */
const P2 = { img: new Image(), meta: null };
const geoToPlate2 = g => { const b = P2.meta.bounds; return [(g[1] - b.west) / (b.east - b.west) * P2.meta.w, (MERC(b.north) - MERC(g[0])) / (MERC(b.north) - MERC(b.south)) * P2.meta.h]; };
/* the coast in the scene: each plate is a textured plane (its own alpha cuts the water out) lying just above the sea, sized in
   world units from its metres-per-pixel and placed every frame from her geo position — the wide plate under, the fine one on
   top. Being in the 3D scene, the tilt, the perspective and the sea's lighting horizon are all free. */
const coastMeshes = [];
// 30 Sep 2026: mesh construction moved to _shared/coast-plate.js (createCoastPlate) — was byte-for-byte
// duplicated in seaway-wake/beat.js as addCoastPlate(), a second copy that could silently drift from this one;
// now there's exactly one. Placement (drawCoast, below) stays here — game.js's own bow-up convention (the plate
// rotates too, as her leg bearing changes) is genuinely different from the beat's fixed north-up one, not drift.
coastMeshes.push(createCoastPlate(scene, renderer, { src: P.src, wPx: P.w, hPx: P.h, mPerPx: P.mPerPx, mPerUnit: M_PER_UNIT, bounds: P.bounds, order: 2, feather: SW_PLATE_FEATHER }));
fetch('assets/game/wide-plate.json').then(r => r.json()).then(mt => { P2.meta = mt; coastMeshes.push(createCoastPlate(scene, renderer, { src: 'assets/game/' + artOf(mt.file), wPx: mt.w, hPx: mt.h, mPerPx: mt.mPerPx, mPerUnit: M_PER_UNIT, bounds: mt.bounds, order: 1 })); }).catch(() => {});
function drawCoast(brg) {   // brg: the leg bearing, which is the bow-up frame's 'ahead'
  const me = shipGeo(), geo = { gDist, gBearing, DEG, nmPerUnit: NM_PER_UNIT };
  for (const c of coastMeshes) placeCoastPlateBowUp(c, me, brg, geo);
}
/* La Corbière (Howard, 16 Sep: the pass is a set piece). The light stands where it really is; it shows Iso 10s — five seconds on,
   five off — in the colour of the sector the ship is in (W 247°–294°, R 294°–328°, W 328°–148°, R 148°–247°, bearings FROM the
   light); a halo on the water round the tower and a beam laid across the sea toward her. When the tower is off the screen a soft
   glow at the edge marks her true direction. The pilotage line crosses the southern red sector: the reader sees the light turn
   red as she passes the point and white again as she clears it, which is exactly what a captain sees from the bridge. */
const LH = { sector: '', abeam: false, said: false, vhf: false };
const lightEl = document.createElement('div'); lightEl.className = 'lighthouse'; lightEl.innerHTML = '<i class="sectors"></i><i class="mine"></i><i class="beam"></i><i class="halo"></i><i class="tower"></i><img class="tower3d" alt="" src="assets/game/corbiere-tower.svg"><b>La Corbière<br><span>Iso WR 10s · 18 M</span></b>'; world.appendChild(lightEl);
/* the sectors on the water (Howard, 17 Sep: "a blend — fixed sectors, but slightly brighter as it hits the ship: the flash"). The
   four arcs, fixed on the compass, laid on the sea in their colours and fading with distance; the whole set breathes with the
   isophase, and the arc she is in flares with it. Bearings FROM the light, true; north-up on screen, so a conic gradient from
   the top is the compass. */
let sectCache = '';
const glowEl = document.createElement('div'); glowEl.className = 'lightglow'; game.appendChild(glowEl);
function rPxGuard() { return 1.3 / NM_PER_UNIT * ppu; }
function placeCorbiere(brg) {
  const me = shipGeo(), L = GEO.corbiere.at; const nm = gDist(me, L); const brgTo = gBearing(me, L); const rel = (brgTo - upBrg) * DEG;   // direction on screen (0 = up)
  const [hx, hy] = toScreen(0, 0, S.lat); const dx = Math.sin(rel), dy = -Math.cos(rel); const px = nm / NM_PER_UNIT * ppu;
  const lx = hx + dx * px, ly = hy + dy * px; const onScreen = lx > -80 && lx < W + 80 && ly > -80 && ly < H + 80;
  const { index: mineIdx, colour: sector } = sectorAt(GEO.corbiere.sectors, (brgTo + 180) % 360);   // the sector she is in, seen from the light
  const iso = isoPhase(S.t, GEO.corbiere.period);
  const col = sector === 'R' ? '255,70,60' : '255,246,215';
  lightEl.style.setProperty('--c', col); lightEl.style.setProperty('--iso', iso.toFixed(3)); lightEl.style.setProperty('--k', (ppu / 6).toFixed(3));
  // the sectors: a disc of 1.3 M radius at the game's scale, faded to nothing at the rim; the set breathes, her own sector flares
  { const rPx = 1.3 / NM_PER_UNIT * ppu; lightEl.style.setProperty('--r', rPx.toFixed(0) + 'px'); lightEl.style.setProperty('--rot', (-upBrg).toFixed(1) + 'deg');
    const key = mineIdx + ':' + (iso > 0.5 ? 1 : 0); if (key !== sectCache) { sectCache = key; const sEl = lightEl.querySelector('.sectors'), mEl = lightEl.querySelector('.mine');
      sEl.style.background = sectorGradient(GEO.corbiere.sectors, 0.30, 0.34); mEl.style.background = sectorGradient(GEO.corbiere.sectors, 0.38, 0.42, mineIdx); } }
  const sectOn = onScreen || (lx > -rPxGuard() && lx < W * PLAN + rPxGuard() && ly > -rPxGuard() && ly < H * PLAN + rPxGuard());
  lightEl.style.display = sectOn ? '' : 'none';
  if (sectOn) { placeAbs(lightEl, lx, ly, 0); const beam = lightEl.querySelector('.beam'); beam.style.transform = `rotate(${(Math.atan2(-(hx - lx), hy - ly) / DEG).toFixed(1)}deg)`; beam.style.height = Math.min(px, H * 1.2).toFixed(0) + 'px'; }
  if (onScreen || nm > 3) glowEl.style.opacity = '0';
  else { const tEdge = Math.min(dx > 0 ? (W - hx) / dx : dx < 0 ? -hx / dx : 1e9, dy > 0 ? (H - hy) / dy : dy < 0 ? -hy / dy : 1e9);
    glowEl.style.left = (hx + dx * tEdge).toFixed(0) + 'px'; glowEl.style.top = (hy + dy * tEdge).toFixed(0) + 'px'; glowEl.style.setProperty('--c', col); glowEl.style.opacity = (0.9 * iso * (1 - nm / 3)).toFixed(2); }
  // the commentary: what the pilot would say
  if (S.playing && !S.done) {
    if (!LH.said && S.t > 1.2) { LH.said = true; LH.sector = sector; later(6, () => transmit('ambient.corbiere')); toast(`Corbière in transit with her fixed red light, 079° — steer 110° · Iso WR 10s, 18 M, ${sector === 'W' ? 'white' : 'red'} sector`, 'good'); }
    else if (!LH.vhf && S.t > 7) { LH.vhf = true; transmit('nav.report'); }
    else if (LH.said && sector !== LH.sector) { LH.sector = sector; toast(sector === 'R' ? 'Corbière shows RED — her sector over the rocks south of the point. Hold the line.' : 'Corbière shows white again — the point is cleared', sector === 'R' ? 'bad' : 'good'); }
    const relDeg = ((brgTo - brg) + 360) % 360; if (!LH.abeam && relDeg > 265 && relDeg < 275 && nm < 1.2) { LH.abeam = true; toast(`La Corbière abeam to port · ${nm.toFixed(1)} M`, ''); }
  }
}

/* ─────────────────────────── 4. PARTICLES (spray, splash rings) ─────────────────────────── */
const parts = [], rings = [];
function spray(sx, sy, n, power, dirDeg) {
  dirDeg += ROT; n=Math.round(n*CFG.sea.spray);
  for (let i = 0; i < n; i++) { const a = (dirDeg + fxRnd(-70, 70)) * Math.PI / 180, v = fxRnd(0.3, 1) * power; parts.push({ x: sx + fxRnd(-3, 3), y: sy + fxRnd(-3, 3), vx: Math.sin(a) * v, vy: -Math.cos(a) * v, life: fxRnd(0.45, 0.9), t: 0, r: fxRnd(1.2, 2.8) }); }
}
function ring(sx, sy, r0, r1, life) { rings.push({ x: sx, y: sy, r0, r1, life, t: 0 }); }
function drawFx(dt, speedPx) {
  fx.clearRect(0, 0, fxCanvas.width / FXK, fxCanvas.height / FXK);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += dt; if (p.t > p.life) { parts.splice(i, 1); continue; }
    p.x += (p.vx - Math.sin(ROT * DEG) * speedPx / 60) * dt * 60; p.y += (p.vy + Math.cos(ROT * DEG) * speedPx / 60) * dt * 60; p.vx *= 0.96; p.vy *= 0.96; const k = 1 - p.t / p.life;
    fx.globalAlpha = 0.85 * k; fx.fillStyle = '#fff'; fx.beginPath(); fx.arc(p.x, p.y, p.r * (0.6 + 0.4 * k), 0, 6.283); fx.fill(); }
  for (let i = rings.length - 1; i >= 0; i--) { const g = rings[i]; g.t += dt; if (g.t > g.life) { rings.splice(i, 1); continue; }
    const k = g.t / g.life; g.x -= Math.sin(ROT * DEG) * speedPx * dt; g.y += Math.cos(ROT * DEG) * speedPx * dt; fx.globalAlpha = 0.55 * (1 - k); fx.strokeStyle = '#eaf7ff'; fx.lineWidth = 2.2 * (1 - k) + 0.6; fx.beginPath(); fx.ellipse(g.x, g.y, lerp(g.r0, g.r1, k), lerp(g.r0, g.r1, k) * 0.7, 0, 0, 6.283); fx.stroke(); }
  fx.globalAlpha = 1;
}
let dropN = 0;
function splash(x, z, radiusUnits, strength) { if (dropN >= NDROP || Math.abs(x) > BOUNDS * 0.45 || Math.abs(z) > BOUNDS * 0.45) return; const [u, v] = toUV(x, z); drops.value[dropN++].set(u, v, radiusUnits / BOUNDS, strength); }

/* ─────────────────────────── 5. GAME STATE ─────────────────────────── */
const S = { playing: false, phase: 'sea', t: 0, travelled: 0, path: 0, pos: GEO.route[0].slice(), hdg: 0, rot: 0, rudder: 0, lat: 0, latV: 0, input: 0, speed: CFG.speedDefault, slowK: 1, slowT: 0, hits: 0, penalty: 0, nextSpawn: 20, pilotDone: false, nextFlight: 0, done: false, onStation: false, dragX: null, dragLat: 0, throttle: CFG.throttle0, drift: 0, xte: 0, legIdx: 0 };
S.hdg = LEGS[0].brg;
const hud = { clock: $('[data-hud="clock"]'), nm: $('[data-hud="nm"]'), bar: $('[data-hud="bar"]'), hits: $('[data-hud="hits"]'), toast: $('[data-hud="toast"]'), tele: $('[data-hud="telegraph"]'), teleBar: $('[data-hud="telebar"]') };
const TELE = ['Stop', 'Dead slow', 'Slow', 'Half', 'Full'];
/* 23 Oct 2026, Simon: the twin-engine model. thP / thS are what each lever asks for (throttle units, -0.5 astern .. 1 full ahead), nP / nS where each propeller actually is (they follow the levers with a lag).
   Linked, one lever drives both. S.throttle stays the mean of the two demands, so the readouts and the joystick, keys and wheel keep working as they did. */
const ENG = { linked: true, thP: CFG.throttle0, thS: CFG.throttle0, nP: CFG.throttle0, nS: CFG.throttle0, last: 0 };
function setThrottle(v) { v = clamp(v, -0.5, 1); const d = v - S.throttle; if (ENG.linked) ENG.thP = ENG.thS = v; else { ENG.thP = clamp(ENG.thP + d, -0.5, 1); ENG.thS = clamp(ENG.thS + d, -0.5, 1); } showThrottle(); }
function engLink(on) { if (on && !ENG.linked) { const th = ENG.last === 1 ? ENG.thS : ENG.thP; ENG.thP = ENG.thS = th; } ENG.linked = on; showThrottle(); syncKnobFromThrottle(S.throttle); }   // linking again: both follow the lever moved last
function showThrottle() { S.throttle = (ENG.thP + ENG.thS) / 2; const a = Math.abs(S.throttle); const i = a <= 0.04 ? 0 : a < 0.3 ? 1 : a < 0.55 ? 2 : a < 0.85 ? 3 : 4; hud.tele.textContent = TELE[i] + (i ? (S.throttle < 0 ? ' astern' : ' ahead') : ''); hud.teleBar.style.setProperty('--k', (Math.abs(S.throttle) * 100).toFixed(0) + '%'); const l = $('[data-stick] .thr span'); if (l) l.textContent = hud.tele.textContent; }
let toastTimer = 0, toastPriority=0, toastUntil=0;
function toast(msg, cls, options={}) {
  const priority=options.priority||0;if(priority<toastPriority&&S.t<toastUntil)return;toastPriority=priority;toastUntil=S.t+(options.seconds||1.9); hud.toast.textContent = msg; hud.toast.className = 'toast ' + cls; hud.toast.hidden = false; hud.toast.style.animation = 'none'; void hud.toast.offsetWidth; hud.toast.style.animation = ''; clearTimeout(toastTimer); toastTimer = setTimeout(() => { hud.toast.hidden = true; }, (options.seconds||1.9)*1000); }
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/* ─────────────────────────── 5a. THE COMMS (Howard, 17 Sep) ───────────────────────────
   A VHF/DSC handset beside the plotter. Everything that happens to the ship arrives here as traffic, in the order and the words a
   captain would hear — Jersey Coastguard on 82, St Helier VTS on 14, the pilot, the airport, CIPS — so the log reads like the
   passage. Two calls are the captain's to make, and best practice is the score: the hour's notice to Jersey Coastguard (the
   pilotage directions: Ch 82 or 25, at least an hour before arrival), then the report to St Helier VTS on 14 inside the reporting
   line; and CIPS — Simon — for the pilot, the water taxi, the crew change, fuel, and the stores (with the Captain's Hamper). */
const CM = { log: $('[data-comms="log"]'), ch: $('[data-comms="ch"]'), menu: $('[data-comms="menu"]'), stores: $('[data-comms="stores"]'), storesHead: $('[data-comms="storeshead"]'), vtsBtn: $('[data-act="vts"]'), vtsLabel: $('[data-comms="vtslabel"]') };
const YACHT = { name: 'Kinship', len: 70, draught: 3.8, pob: 12, from: 'St Malo' };
const commsFilter=createCommsFilter();
let voiceStatus='Sound is off. VHF text is always available.';
const radioVoice=createRadioVoice({config:CFG.comms,getTime:()=>S.t,
 onSpeaking:speaking=>{if(SND.ctx&&SND.gain)SND.gain.gain.setTargetAtTime(SND.on?(speaking ? .3 : 1):0,SND.ctx.currentTime,.12);},
 onStatus:message=>{voiceStatus=message;}
});
function transmit(id,values={},options={}) {
  const m={...formatMessage(id,{vessel:YACHT.name,...values},CFG.comms.messages),...options};
  return comms(m.from,m.text,'',m.channel,m);
}
function comms(from,text,cls='',ch=null,options={}) {
  const own=cls==='me',service=from.includes('CIPS')||from==='Water Taxi CI';
  const pilotCall=from==='Pilot'||from==='Pilots';
  const m={from,text,group:pilotCall?'pilot':service||own?'services':from==='Bridge'?'traffic':'ambience',essential:pilotCall||service||own,
    priority:pilotCall?2:1,repeat:pilotCall, ...options};
  if(!commsFilter.accept(m,S.t,CFG.comms))return false;
  // No radio chatter or acknowledgement sound in the compact text interface.
  if (!game.classList.contains('comms-open') && getComputedStyle($('.vhfbtn')).display !== 'none') {
    S.unread=(S.unread||0)+1;const u=$('[data-hud="unread"]');if(u){u.textContent=String(S.unread);u.hidden=false;}
  }
  const li=document.createElement('li'),time=document.createElement('time'),who=document.createElement('b'),body=document.createElement('span');
  if(cls)li.className=cls;time.textContent=fmt(S.t);who.textContent=from;body.textContent=text;li.append(time,who,body);CM.log.appendChild(li);
  while(CM.log.children.length>60)CM.log.children[0].remove();CM.log.scrollTop=CM.log.scrollHeight;
  if(ch)CM.ch.textContent='CH '+ch;
  if(S.commsLog){S.commsLog.push([S.t,from,text]);if(S.commsLog.length>300)S.commsLog.shift();}
  if(m.essential&&!own&&m.priority>=2)toast(text,'',{priority:m.priority,seconds:CFG.comms.holdSeconds});
  arrivalUi?.present(m); // Essential text only; neither sound nor old presets enable speech.
  return true;
}
const LATER = []; const later = (sec, fn) => LATER.push({ at: S.t + sec, fn });   // replies on the game's clock, not the wall clock
const CALLS = { coastguard: false, vts: false, pilot: false, taxi: false, crew: false, fuel: false, stores: null, hamper: null };
function callVts() {
  if (!S.playing || S.done) return;
  if (!CALLS.coastguard) { CALLS.coastguard = true; S.noticeAt=S.t; star('notice'); CM.ch.textContent = 'CH 82';
    comms('You', `Jersey Coastguard, ${YACHT.name}. One hour's notice, inbound for pilotage.`, 'me', 82);
    later(2.5, () => comms('Jersey Coastguard', `${YACHT.name}, Coastguard. Notice received. Report to VTS on channel one four.`, '',82,{essential:true,priority:2}));
    CM.vtsLabel.textContent = 'Report inside the line · Ch 14'; return; }
  if (!CALLS.vts) { CALLS.vts = true; S.vtsAt=S.t; CM.ch.textContent = 'CH 14';
    const me = shipGeo(); const nm = gDist(me, GEO.corbiere.at).toFixed(1); const brg = Math.round(gBearing(GEO.corbiere.at, me));
    comms('You', `St Helier VTS, ${YACHT.name}. Approaching the pilot station.`, 'me', 14);
    later(2.5, () => comms('St Helier VTS', `${YACHT.name}, VTS. Report received. Pilots will call when ready for boarding.`, '',14,{essential:true,priority:2}));
    CM.vtsBtn.disabled = true; CM.vtsLabel.textContent = 'Reported · Ch 14'; return; }
}
function askSimon(what) {
  CM.menu.hidden = true;
  if (what === 'stores') { CM.storesHead.hidden = false; CM.stores.hidden = false; CM.storesHead.classList.add('open'); return; }
  const said = { pilot: ['You', 'Simon, can you confirm the pilot for us?', 'CIPS · Simon', `Pilot confirmed, Captain. Hold ${BOARDING_TARGET_KNOTS} knots and your course when the launch calls.`],
    taxi: ['You', 'Simon, water taxi for the crew and stores, please.', 'CIPS · Simon', 'Water Taxi CI will meet you alongside at St Helier.'],
    crew: ['You', 'Simon, the crew change — where are they?', 'CIPS · Simon', 'Your crew transfer is arranged, Captain. We will bring them out to the berth at St Helier.'],
    fuel: ['You', 'Simon, bunkers?', 'CIPS · Simon', 'Bunkers arranged, Captain. The tanker will meet you alongside at St Helier.'] }[what];
  if (!said) return; CALLS[what] = true; comms(said[0], said[1], 'me'); later(2.2, () => comms(said[2], said[3]));
}
CM.vtsBtn.addEventListener('click', callVts);
$('[data-act="simon"]').addEventListener('click', () => { if (!S.playing || S.done) return; CM.stores.hidden = true; CM.menu.hidden = !CM.menu.hidden; });
CM.menu.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => askSimon(b.dataset.ask)));
CM.storesHead.addEventListener('click', () => { CM.stores.hidden = !CM.stores.hidden; CM.storesHead.classList.toggle('open', !CM.stores.hidden); });   // the list collapses and expands
function placeGameOrder(input) {
  if(!S.playing||S.done)return false;
  const order=validateOrder(input);
  CALLS.stores=order.stores;CALLS.fuel=order.fuel;CALLS.hamper=order.hamper;
  S.orderAckPending=true;
  // Simulated order only: no fetch, mail, contact link or external message.
  later(1.2,()=>{S.orderAckPending=false;comms('CIPS · Simon',orderAcknowledgement(CALLS),'',null,{essential:true,group:'services'});star('stores');arrivalUi?.refresh(true);});
  arrivalUi?.refresh(true);return true;
}
CM.stores.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(CM.stores);placeGameOrder({stores:f.getAll('s'),fuel:!!CALLS.fuel,hamper:f.get('h')});CM.stores.hidden=true;});
// keyboard and pointer traffic inside the handset must not steer the ship
$('[data-comms]').addEventListener('pointerdown', e => e.stopPropagation()); $('[data-comms]').addEventListener('wheel', e => e.stopPropagation());
function reset(options={}) {
  if(!LANDM.a){$('[data-card="intro"] .lead').textContent='The coast is still loading. Please try Start again in a moment.';return false;}
  if(!options || options.type) options={}; // event callbacks are not replay descriptors
  const initial=loadedPreset?.replay;
  const seed=options.seed ?? ((DEBUG||DIRECTOR)?PARAMS.get('seed')||initial?.seed:undefined);
  const replay=replayPolicy.next({policy:CFG.replay,seed,variation:options.variation??initial?.variation,preview:DIRECTOR||DEBUG});
  S.replay=replay;streams=createStreams(replay.seed,replay.variation);gameRandom=streams.gameplay;fxRandom=streams.fx;audioRandom=streams.audio;decorRandom=streams.decor;
  activeSchedule=buildSchedule(SCHED,CFG.traffic,replay,CFG.dolphins.enabled);trafficRun={...CFG.traffic};ferryDirector.reset();commsFilter.reset();radioVoice.cancel();radioVoice.setEnabled(false);toastPriority=0;toastUntil=0;
  fixedClock.reset(); runTime=0; keys.clear(); safetyGuard.reset();if(game.classList.contains('plotfull'))plotFull(false);
  setUiPaused(false);Object.assign(S,{onStation:false,groundSpeed:CFG.speedDefault,orderAckPending:false,boardedAt:null,noticeAt:null,vtsAt:null});
  Object.assign(S,{pilotBoarded:false,pilotBoardingLog:[],pilotReminderAt:-Infinity,pilotHelm:null,giveWayDue:null,slowPod:0,safetyError:null,repositioned:0,credits:0,unread:0,enteredStationAt:null});
  SND.lastGull=0;

  for (const o of obs.slice()) { if (o.live) { o.hit = false; o.warned = false; } else removeObstacle(o); } for (const f of flights.splice(0)) { f.el.remove(); f.shadow.remove(); }   // the real vessels stay: they are not the game's to reset
  if (pilot) { pilot.el.remove(); pilot.wakeEl.remove(); pilot.glowEl.remove(); pilot.personEl.remove(); pilot = null; }
  if (station) { station.ring.remove(); station = null; }
  spawnStationMark();   // 26 Sep 2026, Simon: "visible as soon as it would be in frame, not appearing after a certain trigger" — exists from the start now; .game's own overflow:hidden is what actually keeps it off-screen until she's close enough for it to be in frame, same as everything else drawn in world space
  parts.length = 0; rings.length = 0; plotView.follow = true; setView(CFG.open.visH); LH.sector = ''; LH.abeam = false; LH.said = false; LH.vhf = false;
  Object.assign(S, { playing: true, phase: 'sea', t: 0, travelled: 0, path: 0, pos: GEO.route[0].slice(), hdg: LEGS[0].brg, rot: 0, rudder: 0, lat: 0, latV: 0, input: 0, speed: CFG.speedDefault, slowK: 1, slowT: 0, hits: 0, penalty: 0, nextSpawn: 20, pilotDone: false, nextFlight: CFG.overflight.first, done: false, dragX: null, graceT: 0, graceKind: '', drift: (S.drift || 0) + S.path, legIdx: 0, xte: 0, sched: 0 }); stickSet(0, CFG.throttle0);   // the sea keeps its place across a Go again: what was run becomes drift
  LATER.length = 0; game.classList.remove('done'); S.flightSaid = false; S.landedSaid = false; S.noticeChased = false; S.noticeAuto = false; S.reportChased = false; S.pilotAdvised = false; ENG.linked = true; ENG.thP = ENG.thS = ENG.nP = ENG.nS = S.throttle;
  LIVE.said = false; S.starred = {}; S.flightN = 0; S.lightRead = false; S.lightWatch = 0; S.wakeDolphins = false; S.podCame = false; S.steadyT = 0; S.rideT = 0; Object.assign(CALLS, { coastguard: false, vts: false, pilot: false, taxi: false, crew: false, fuel: false, stores: null, hamper: null }); S.commsLog = []; CM.log.innerHTML = ''; CM.menu.hidden = true; CM.stores.hidden = true; CM.storesHead.hidden = true; CM.storesHead.classList.remove('open'); CM.storesHead.querySelector('span').textContent = 'Provisions'; CM.vtsBtn.disabled = false; CM.vtsLabel.textContent = "1 hour's notice · Ch 82"; CM.ch.textContent = 'CH 16';
  comms('Bridge', `Under way from ${YACHT.from}. Listening watch on 16 and 14. Jersey Coastguard wants an hour's notice on 82 — the handset is yours.`);
  hud.hits.textContent = '0'; game.classList.add('playing');
  $('[data-card="intro"]').hidden = true; $('[data-card="done"]').hidden = true;
  arrivalUi?.reset();arrivalUi?.refresh(true);return true;   // 26 Sep 2026, Simon: the 1 hr notice is the player's to give again — was auto-sent here, free
}
/* Interface 03: checklist, stars and the result share the same event predicates. */
function arrivalNotes(){return arrivalChecklist(S,CALLS,CFG);}
const STARS=arrivalNotes().map(note=>[note.id,note.label,()=>arrivalNotes().find(n=>n.id===note.id).done,note.criterion]);
function starCount() { return STARS.filter(x => x[2]()).length; }
function star(k) { const x = STARS.find(x => x[0] === k); if (!x || !x[2]() || S.starred?.[k]) return; (S.starred ||= {})[k] = true; later(0.6, () => { toast(`★ ${x[1]} — ${starCount()} of 5`, 'good'); sndBlip('star'); }); }
// Exit back to the scrolled story: from the start card (any time), and, when the game is the whole page (not inside the beat's overlay, which has its own pill), a pill in the top-left. Inside the overlay: tell the parent; on its own: the site.
const leaveGame = () => { if (window.parent !== window) { try { window.parent.postMessage('crossing:close', '*'); return; } catch (_) {} } location.href = '/'; };
$('[data-act="exit"]').addEventListener('click', leaveGame);
if (window.parent === window) { const pill = document.createElement('button'); pill.type = 'button'; pill.className = 'exitpill'; pill.textContent = 'Back to the journey ×'; pill.addEventListener('click', leaveGame); document.body.appendChild(pill); }
$('[data-act="handover"]').addEventListener('click', () => { if (window.parent !== window) { try { window.parent.postMessage('crossing:close', '*'); return; } catch (_) {} } location.href = '/'; });   // back to the journey off Corbière; the pilot takes her in
function finish() {
  if(S.done||!S.pilotBoarded)return false;
  radioVoice.cancel();S.playing=false;S.done=true;game.classList.remove('playing');replayPolicy.complete(S.replay);
  // 25 Sep 2026, Simon: the score card moves off the end card — achievements live in the arrival notes panel
  // (already current throughout, via arrivalUi.refresh()) instead of being restated here as a "X of 5" headline.
  S.credits=0;const total=S.t+S.penalty;
  $('[data-hud="result"]').textContent='Pilot aboard.';
  S.headline=`${fmt(total)} passage time${S.penalty?` (including ${S.penalty} seconds of assistance)`:''}`;
  $('[data-hud="verdict"]').textContent=`Welcome to Jersey, Captain. Pilot aboard and bringing the ship in. ${S.headline}.`;
  $('[data-hud="comms"]').textContent=`Boarded at ${(pilot?.boardingSpeed??S.speed).toFixed(1)} kts, course held. ${S.hits} Pilot assistance${S.hits===1?'':'s'}.`;
  // 26 Sep 2026, Simon: "the finishing card... just the total for that scene" (not a running total — that's the
  // arrival notes' job, see arrival-ui.js) — the skill score behind the same five tasks, not the stars themselves.
  // 28 Sep 2026, Simon: "should show the logic or criteria for how the points were calculated and what they were
  // out of" — each row now carries its own "/ 1000" alongside the label, and scoring.js's own `criteria` string
  // (already written when each task's scoring was worked out) underneath, instead of a bare number.
  { const {tasks,total:scoreTotal,max}=sceneScore(S,CALLS,CFG); const box=$('[data-hud="scene-score"]');
    box.innerHTML=`<p class="score-total">${scoreTotal} <small>of ${max} pts</small></p>`+tasks.map(t=>`<div class="score-row"><div class="score-row-head"><span>${t.label}</span><b>${t.score} <small>/ ${MAX_TASK_SCORE}</small></b></div><p class="score-criteria">${t.criteria}</p></div>`).join(''); }
  const hamper=$('[data-hud="hamper"]');hamper.textContent=starCount()===5?"All five approach notes completed. Captain's Hamper achievement earned in the game. Contact Simon separately about a real visit.":'Your approach notes show what to try on the next passage.';hamper.hidden=false;
  // the finale (Howard, 20 Sep): a British Airways jet crosses the screen before the end card; the result is already settled
  const showDone=()=>{if(showDone.shown)return;showDone.shown=true;game.classList.add('done');$('[data-card="done"]').hidden=false;arrivalUi?.refresh(true);};
  try{flyFinale(showDone);}catch(_){showDone();}
  setTimeout(showDone,7000);   // never wait longer than this
  return true;
}
/* the pilot steps in: nobody is ever hit. The other party gets clear, the pilot eases her and puts the helm over — from the bridge once
   he is aboard, by VHF from the station before that — and the points go. */
function avoided(o) {
  const A = CFG.avoid, dir = Math.sign(o.lane - S.lat || 1);            // which way the other one goes: away from us
  o.evade = mayDisplaceTarget(o) ? { dir, t: A.time, hdg0: o.hdg } : null;   // real vessels, stand-on traffic and fixed fishing gear are never moved by the game
  if (o.live || o.standOn || o.kind === 'pots') S.pilotHelm = { dir: -dir, t: A.time * 1.6 };
  const [sx, sy] = toScreen(o.x, o.z, S.lat);
  if (S.graceT > 0 && S.graceKind === o.kind) {
    if(o.kind==='dolphin'){o.safeSubmerged=true;o.air=0;o.el.classList.add('under');}
    return; // one consequence for the same encounter, no false 'extra penalty' message
  }
  S.graceT = A.grace; S.graceKind = o.kind; S.hits++; S.penalty += CFG.penalties[o.live ? 'live' : o.kind] ?? 6; hud.hits.textContent = String(S.hits);
  S.slowK = 0.6; S.slowT = 1.4; S.latV = clamp(S.latV - dir * A.nudge, -CFG.steer.max, CFG.steer.max);   // the pilot takes the wheel: helm away, engine eased
  const aboard = S.pilotBoarded; const who = aboard ? 'The pilot took the wheel' : 'The pilot called her off on VHF';
  if (o.kind === 'pots') { ring(sx,sy,4,28,.9);toast(`Pilot assistance: pots cleared safely. +${CFG.penalties.pots} s`,'');comms('Pilot','Captain, I have the helm. Keeping the pots clear.','',14,{essential:true,priority:4,key:'safety-pots',repeat:true}); }
  else if (o.kind === 'dolphin') { o.safeSubmerged=true; o.air = 0; o.phase = 0; o.sprayed = 0; o.splashed = 0; o.el.classList.add('under'); spray(sx, sy, 22, 5, o.heading + 180); ring(sx, sy, 4, 30, 1); splash(o.x, o.z, 1.6, -0.7);
    toast(`The dolphin dived clear — ${aboard ? 'the pilot saw her, you didn\'t' : 'you never saw her'} · +${CFG.penalties.dolphin} s`, 'bad'); }
  else if (o.live) { ring(sx, sy, 5, 44, 1.2); splash(o.x, o.z, 1.4, -0.5); toast(`Pilot assistance: keeping clear of ${o.name}. +${CFG.penalties.live} s`, ''); comms('Pilot', `Captain, keeping clear of ${o.name}.`,'',14,{essential:true,priority:4,key:'safety-live-'+o.name,repeat:true}); }
  else { ring(sx, sy, 5, 44, 1.2); ring(sx, sy, 5, 44, 1.2); splash(o.x, o.z, 1.4, -0.5);
    toast(`${{ tuna: 'Five short blasts — the tuna boat', dfds: 'Five short blasts — the DFDS ferry', iu: 'Five short blasts — Islands Unlimited', taxi: 'Five short blasts — the water taxi', ropax: 'Five short blasts — the ferry', lifeboat: 'The lifeboat', cgrib: 'The Coastguard', superyacht: 'The superyacht', tender: 'The tender', trawler: 'The trawler', openboat: 'The fisherman', racer: 'The racing yacht', dinghy: 'The dinghy', kayak: 'The kayaker', cruise: 'The cruise ship' }[o.kind] || 'Five short blasts — she'} altered for you. ${who} · +${CFG.penalties[o.kind]} s`, 'bad'); }
  if(o.kind!=='pots'&&!o.live)transmit('pilot.assist');
  game.classList.remove('nudge'); void game.offsetWidth; game.classList.add('nudge');
}
/* input */
const keys = new Set();
addEventListener('keydown', e => { if(uiPaused||e.target?.closest?.('.game-director,[data-arrival-ui],dialog,input,textarea,select,button,a'))return; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'A', 'D', 'W', 'S', ' '].includes(e.key)) e.preventDefault(); keys.add(e.key.toLowerCase()); if (S.playing && bridge && (e.key === 'x' || e.key === 'X')) stickSet(0, STICK.y); if (S.playing && bridge && (e.key === 'l' || e.key === 'L')) engLink(!ENG.linked);
  if (S.playing && (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W')) stickSet(STICK.x, STICK.y + 0.125); if (S.playing && (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S')) stickSet(STICK.x, STICK.y - 0.125);
  if ((e.key === ' ' || e.key === 'Enter') && !S.playing) reset();
  else if (e.key === ' ' && S.playing) pilotAttempt();
  if (e.key === 'Escape' && window.parent !== window) { try { window.parent.postMessage('crossing:close', '*'); } catch (_) {} } });   // inside the beat's overlay: Esc goes back to the journey
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
game.addEventListener('pointerdown', e => { if(uiPaused||e.target.closest('button, .card, label, input, [data-comms], .bridge, .plotter-box, [data-stick], [data-pilotxfer], [data-arrival-ui], dialog, .game-director')) return; S.dragX = e.clientX; S.dragLat = S.lat; game.setPointerCapture?.(e.pointerId); });
game.addEventListener('pointermove', e => { if (uiPaused||S.dragX == null) return; S.dragTarget = clamp((e.clientX - S.dragX) / (W * 0.18), -1, 1); });   // a drag is the wheel: how far you have pulled it over
addEventListener('pointerup', () => { S.dragX = null; S.dragTarget = Math.abs(STICK.x) >= 0.06 ? STICK.x : null; });   // a drag on the water ends (the joystick itself springs back to centre when released)
/* the joystick (Howard, 18 Sep): absolute — the knob stays where you leave it. Left/right is the rudder; up is ahead, the
   centre line is engines stopped, down is astern. Full ahead with the helm hard over turns her quickest; astern the stern walks.
   25 Sep 2026, Simon: the rudder/thrust indicator bars beside it are now sliders too — either one moves the knob, and the knob
   moves them (see syncKnobFromThrottle() and stickSet() below); released, the rudder self-centres as before but the throttle
   now holds where you left it, matching the telegraph/keyboard behaviour it already had. */
const STICK = { x: 0, y: 0, R: 40, el: null, knob: null };
function positionKnob() { if (STICK.knob) STICK.knob.style.transform = `translate(${(STICK.x * STICK.R).toFixed(1)}px,${(-STICK.y * STICK.R).toFixed(1)}px)`; }
function stickSet(x, y, fromKeys) { STICK.x = clamp(x, -1, 1); STICK.y = clamp(y, -1, 1); positionKnob();
  S.dragTarget = Math.abs(STICK.x) < 0.06 ? null : STICK.x; setThrottle(STICK.y >= 0 ? STICK.y : STICK.y * 0.5); }
// the throttle bar sets S.throttle directly (its own full -0.5..1 range, not the joystick's compressed one) — this keeps the
// knob's Y in step regardless of which control moved it, inverting stickSet's own ahead/astern scale.
function syncKnobFromThrottle(th) { STICK.y = clamp(th >= 0 ? th : th * 2, -1, 1); positionKnob(); }
/* The bridge console (Simon, 23 Oct 2026: one console for every screen). The arrival has ONE throttle, so the engines are linked and UNLINK is greyed; the thrusters and HOLD POSITION are not for use at sea. The lever is stretched so the pilot boarding speed (7 knots)
   sits 40% of the way up the ahead stretch while full ahead stays what it was: below the mark the lever is 7/12 of the throttle over 40% of the throw, above it the rest. The rudder bar stays where it is set (it sets the same STICK.x the joystick did, and nothing lets it go). */
const LEV_MARK = 0.4, T_MARK = BOARDING_TARGET_KNOTS / CFG.speed;
const throttleOfLever = v => v < 0 ? v * 0.5 : v <= LEV_MARK ? T_MARK * v / LEV_MARK : T_MARK + (1 - T_MARK) * (v - LEV_MARK) / (1 - LEV_MARK);
const leverOfThrottle = t => t < 0 ? t / 0.5 : t <= T_MARK ? LEV_MARK * t / T_MARK : LEV_MARK + (1 - LEV_MARK) * (t - T_MARK) / (1 - T_MARK);
const bridgeHost = $('[data-bridge]'), bridge = bridgeHost ? createBridgeConsole(bridgeHost, {
  onLever(i, v) { if (uiPaused || !S.playing) return; const th = throttleOfLever(v); ENG.last = i; if (ENG.linked) setThrottle(th); else { if (i === 0) ENG.thP = th; else ENG.thS = th; showThrottle(); } syncKnobFromThrottle(S.throttle); },
  onLink(on) { if (uiPaused || !S.playing) return; engLink(on); },
  onRudder(deg) { if (uiPaused || !S.playing) return; stickSet(deg / 35, STICK.y); },
  onMidships() { if (uiPaused || !S.playing) return; stickSet(0, STICK.y); },
}) : null;
function bridgeUpdate() {
  if (!bridge) return;   // the indicator lines are where the propellers actually are
  bridge.update({ lev: [leverOfThrottle(ENG.thP), leverOfThrottle(ENG.thS)], act: [leverOfThrottle(ENG.nP), leverOfThrottle(ENG.nS)], linked: ENG.linked, canUnlink: true, rudder: STICK.x * 35, rudderAct: S.rudder * 35, thr: [0, 0], thLocked: true, lockNote: ['THRUSTERS', 'NOT FOR USE AT SEA'], holdAvail: false, holding: false, mark: LEV_MARK, markLabel: BOARDING_TARGET_KNOTS + ' KN' });
}
{ const st = $('[data-stick]'); if (st) { const pad = st.querySelector('.pad'), knob = st.querySelector('.knob'); STICK.el = st; STICK.knob = knob; let held = false;
  const at = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - (r.left + r.width / 2)) / STICK.R, -(e.clientY - (r.top + r.height / 2)) / STICK.R]; };
  pad.addEventListener('pointerdown', e => { if(uiPaused)return;e.stopPropagation(); held = true; pad.setPointerCapture?.(e.pointerId); st.classList.add('held'); const [x, y] = at(e); stickSet(x, y); });
  pad.addEventListener('pointermove', e => { if (uiPaused||!held) return; e.stopPropagation(); const [x, y] = at(e); stickSet(x, y); });
  /* released (Howard, 20 Sep; Simon, 25 Sep: thrust now holds): the rudder springs back to amidships — she carries her way and
     comes to rest under a steady throttle, same as letting go of a real wheel. The throttle itself no longer resets: it stays
     exactly where it was left, like the telegraph always did. Every way a touch can end is caught, including the browser
     losing the pointer, so the stick can never be left 'held'. */
  const up = () => { if (!held) return; held = false; st.classList.remove('held'); stickSet(0, STICK.y); }; STICK.release = up;
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('lostpointercapture', up); addEventListener('pointerup', up); addEventListener('blur', up);
  pad.addEventListener('dblclick', () => stickSet(0, 0));   // a double tap centres everything: engines stopped, rudder amidships — a deliberate full stop, unlike a plain release
  st.addEventListener('wheel', e => e.stopPropagation()); } }
/* the rudder/thrust bars, now draggable sliders in their own right (Simon, 25 Sep) — linked to the joystick both ways: dragging
   a bar moves the knob (above), and moving the knob or the keyboard moves the bars (drawStick() reads live state every frame,
   so nothing extra is needed there). Rudder release self-centres like the joystick; the thrust bar holds like a telegraph. */
function barDrag(el, onMove, onUp) {
  if (!el) return; let dragging = false;
  el.addEventListener('pointerdown', e => { if (uiPaused || !S.playing) return; dragging = true; try { el.setPointerCapture?.(e.pointerId); } catch (_) {} e.stopPropagation(); onMove(e); });
  el.addEventListener('pointermove', e => { if (!dragging) return; e.stopPropagation(); onMove(e); });
  const end = e => { if (!dragging) return; dragging = false; onUp?.(e); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
}
{ const rudEl = $('[data-hud="rud"]'), thrEl = $('[data-hud="thr"]'), thrTgtEl = $('[data-hud="thrtgt"]');
  barDrag(rudEl, e => { const r = rudEl.getBoundingClientRect(); const v = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1); stickSet(v, STICK.y); }, () => stickSet(0, STICK.y));
  // 28 Sep 2026, Simon: "the target speed indicator can fade to disappear when user releases the speed slider" —
  // shown only while actually dragging the throttle bar (CSS transition on .show does the fade either way);
  // holds the throttle itself on release, same as ever, just the readout that goes.
  barDrag(thrEl, e => { const r = thrEl.getBoundingClientRect(); const v = clamp(-((e.clientY - (r.top + r.height / 2)) / (r.height / 2)), -1, 1); const th = v >= 0 ? v : v * 0.5; setThrottle(th); syncKnobFromThrottle(th); thrTgtEl?.classList.add('show'); }, () => thrTgtEl?.classList.remove('show'));
  // thrust intentionally does nothing on release — it holds, same as the joystick and the telegraph
}
function drawStick() { bridgeUpdate(); const r = $('[data-hud="rud"]'), t = $('[data-hud="thr"]'); if (!r) return; const k = S.rudder; r.style.setProperty('--c', k < 0 ? '#e0242b' : '#2fbf5a');
  // 28 Sep 2026, Simon: "the throttle slider shift/jumps a bit when you slide it up to full power" — the grips
  // were positioned by simple percentage (0%..100% of the bar), but the grip itself has real width/height, so at
  // the very ends its own body poked past the track's edge — looked like a jump right at full power. --hxf/--tyf
  // are now plain 0..100 numbers (not %), and the CSS insets the travel by the grip's own size (calc()) so the
  // grip's edges never leave the track, at any bar length across the responsive breakpoints.
  r.style.setProperty('--hxf', (50 + clamp(k, -1, 1) * 50).toFixed(2));   // the rudder grip's own position, port..starboard across the bar
  const ZERO = 100 / 3;   // where 0 throttle sits on the bar: the -0.5..1 range's zero point, as a % up from the bottom
  t.style.setProperty('--zero', ZERO.toFixed(2) + '%'); const th = S.throttle;
  let bot, fill;
  if (th >= 0) { bot = ZERO; fill = th * (100 - ZERO); } else { const h = -th / 0.5 * ZERO; bot = ZERO - h; fill = h; }
  t.style.setProperty('--bot', bot.toFixed(2) + '%'); t.style.setProperty('--k', fill.toFixed(2) + '%');
  t.style.setProperty('--tc', th < 0 ? '#e0242b' : '#f2b64a');
  const tyf = 100 - bot - fill;
  t.style.setProperty('--tyf', tyf.toFixed(2));   // the throttle grip rides the fill's leading edge — the actual lever position
  // 28 Sep 2026, Simon: "add a little indicator next to the throttle slider that shows what target speed you
  // have selected" — a knots readout that rides alongside the grip. Computed in px off the bar's own live
  // offsetHeight (not the CSS calc() the grip itself uses) since this sits outside the bar as a sibling, not a
  // child of it, so it can't inherit the bar's own %-based positioning context.
  const thrTgt = $('[data-hud="thrtgt"]');
  if (thrTgt) { const bh = t.offsetHeight || 150, gripPx = 13; thrTgt.style.top = ((bh - gripPx) * (tyf / 100) + gripPx / 2).toFixed(1) + 'px'; thrTgt.textContent = Math.abs(CFG.speed * th).toFixed(1) + 'kn'; } }
$('[data-act="start"]').addEventListener('click', () => { reset(); });   /* Cast off = the hour's notice goes out as she gets under way (Howard, 18 Sep) */
$('[data-act="again"]').addEventListener('click', reset);
// the telegraph: wheel forward = more way on, back = less (over the plotter the wheel zooms the chart instead)
addEventListener('wheel', e => { if (uiPaused||e.target.closest('.plotter-box, .game-director, [data-arrival-ui], dialog')) return; if (!S.playing) return; e.preventDefault(); stickSet(STICK.x, STICK.y - Math.sign(e.deltaY) * 0.06); }, { passive: false });
$('[data-act="ahead"]').addEventListener('click', () => setThrottle(S.throttle + 0.125)); $('[data-act="astern"]').addEventListener('click', () => setThrottle(S.throttle - 0.125));
/* 25 Sep 2026, Simon (Phase 2): the pilot transfer — tap (or Space) when the marker's in the green. Ported from
   the Chapter 1 prototype; pilot-boarding.js drives the actual timing/state, this just reads and draws it. */
function pilotAttempt() {
  if (!pilot || pilot.phase !== 'boarding') return;
  const result = attemptBoarding(pilot);
  if (result === 'hit') { toast('Good timing — the pilot’s coming across.', 'good'); sndBlip('star'); }
  else if (result === 'miss') {
    S.penalty += BOARDING_MISS_PENALTY_S; hud.clock.textContent = fmt(S.t + S.penalty);
    toast(`Not yet — wait for the roll. +${BOARDING_MISS_PENALTY_S}s`, 'bad');
    if (pilot.misses === BOARDING_MISSES_FOR_AUTO) toast('Three misses — the pilot will judge the next safe moment themselves.', '');
  }
}
// 28 Sep 2026, Simon: "only the slider is clickable, can you make the whole grey box that houses the slider
// clickable too please" — the tap target was just the 64px-wide bar itself; now the whole .pilotxfer panel
// takes the tap, excluding its own "let the pilot judge it" button so that still does its own separate thing.
$('[data-pilotxfer]').addEventListener('pointerdown', e => { if(uiPaused||e.target.closest('.pskip'))return; e.preventDefault(); e.stopPropagation(); pilotAttempt(); });
$('[data-act="pilot-skip"]').addEventListener('click', e => { e.stopPropagation(); if (uiPaused||!pilot || pilot.phase !== 'boarding') return; pilot.freezePos = pacePosition(pilot); armAutoBoard(pilot); toast('The pilot will judge the moment.', ''); });
function drawPilotXfer() {
  const box = $('[data-pilotxfer]'); if (!box) return;
  // 28 Sep 2026, Simon: "should only appear AFTER the pilot boat is alongside" — phase flips to 'boarding' the
  // moment she's closing the gap (see the pilot.t lerp above), not once she's actually made it; BOARDING_CLOSE_S
  // is the same span pilot-boarding.js now waits out before the tap game itself starts pacing.
  const on = !!pilot && pilot.phase === 'boarding' && pilot.t >= BOARDING_CLOSE_S;
  // 28 Sep 2026, Simon: "the vts and Simon dialogue boxes now obscure the pilot boarding slider" — both are
  // bottom-centre, so stacking them would eat a lot of vertical space for something that only overlaps for the
  // few seconds the tap window is actually up. Simpler: the VTS/Simon cards aren't needed during that exact
  // window (the transfer widget has its own label), so they step aside for it instead of fighting it for room.
  $('.arrival-contacts')?.classList.toggle('boarding-clear', on);
  box.hidden = !on; if (!on) return;
  box.style.setProperty('--half', (BOARDING_SAFE_FRAC * 50).toFixed(2) + '%');   // half-width of the safe zone, as % of the bar's full ±1 swing
  const xfer = !!pilot.boardedPending, judged = !xfer && !!pilot.autoArmed;   // 24 Oct 2026, Simon: the slider stops and the panel fades, with a message, once the pilot is crossing or has taken it over
  box.classList.toggle('xfer', xfer); box.classList.toggle('judged', judged);
  const msg = $('[data-hud="pmsg"]'); msg.hidden = !(xfer || judged); msg.textContent = xfer ? (pilot.boardedBy === 'auto' ? 'Pilot judged it · transferring' : 'Transferring pilot…') : 'Pilot judging it themselves';
  const pos = (xfer || judged) ? pilot.freezePos : pacePosition(pilot);   // -1 (aft) .. 1 (fwd); frozen where it stopped
  $('[data-hud="pmk"]').style.top = ((0.5 - pos / 2) * 100).toFixed(1) + '%';
  $('[data-hud="pbar"]').classList.toggle('safe', !xfer && !judged && inSafeZone(pos));
}
// 26 Sep 2026, Simon: the HUD bar above times the transfer, but the transfer itself should read on the water too —
// a glowing rail on the launch's near gunwale (hot when the tap bar's own safe zone is) and a small figure pacing
// it, ported from proto/pilot-boarding.html's own gunwale glow + walking pilot. World-space, not screen-fixed, so
// it moves and rotates with the launch exactly as the sprite itself does.
// 28 Sep 2026, Simon: "when the pilot actually goes on board can we change his route so he walks on the wooden
// decked area, across the front of the upper deck then disappears into the yacht through what's likely a door
// on the port wing" — first cut was measured off the raw ship-plan.png by eye and landed nowhere near right
// ("looks like the pilot has gone overboard"), forward of the ship's own beam at that point. Simon then marked
// four exact dots on the plan (yellow=boarding point, then blue, red, green=the door) — these are those four
// points converted from image pixels to the same sim-frame (lane, z) units pilot.z/lane already use elsewhere
// (uniform scale: image width == SHIP_LENGTH_WORLD, image x -> z, image y -> lane, both confirmed against
// pilot.z's own known aft-of-centre value and gapLane's positive-is-starboard convention). A short, mostly
// lateral crossing just aft of amidships, not a long walk forward — the earlier guess was wrong on both counts.
const DECK_PATH = [
  { lane: 0.77, z: -1.04 },   // yellow: the boarding point (matches pilot.z's own ~-1.5 when alongside)
  { lane: 0.58, z: -0.49 },   // blue
  { lane: -0.72, z: -0.51 },  // red
  { lane: -0.79, z: -1.11 },  // green: the door, port side (negative lane — starboard boarding, port door)
];
const DECK_SEG_LEN = DECK_PATH.slice(1).map((p, i) => Math.hypot(p.lane - DECK_PATH[i].lane, p.z - DECK_PATH[i].z));
const DECK_TOTAL_LEN = DECK_SEG_LEN.reduce((a, b) => a + b, 0);
const DECK_WALK_S = 3;   // constant walking speed along DECK_PATH, tuned to feel like the same pace as the gunwale-to-rail leg below
function deckWalkPoint(f) {   // f: 0..1 progress along the whole path
  let d = clamp(f, 0, 1) * DECK_TOTAL_LEN;
  for (let i = 0; i < DECK_SEG_LEN.length; i++) {
    if (d <= DECK_SEG_LEN[i] || i === DECK_SEG_LEN.length - 1) {
      const segF = DECK_SEG_LEN[i] ? clamp(d / DECK_SEG_LEN[i], 0, 1) : 0;
      return { lane: lerp(DECK_PATH[i].lane, DECK_PATH[i + 1].lane, segF), z: lerp(DECK_PATH[i].z, DECK_PATH[i + 1].z, segF) };
    }
    d -= DECK_SEG_LEN[i];
  }
}
function drawPilotBoatGlow() {
  const boardingLeg = !!pilot && pilot.phase === 'boarding' && pilot.t >= BOARDING_CLOSE_S;
  const deckLeg = !!pilot && pilot.phase === 'alongside' && pilot.t < DECK_WALK_S;
  const on = boardingLeg || deckLeg;
  if (pilot) { pilot.glowEl.hidden = !boardingLeg; pilot.personEl.hidden = !on; }
  if (!on) return;
  pilot.personEl.style.width = pilot.personEl.style.height = (pilot.w * 0.38 * ppu).toFixed(1) + 'px';   // 26 Sep 2026, Simon: "slightly smaller" (was 0.55) — the tighter approach.visH already makes her read big
  if (deckLeg) {   // the walk to the door — see comment above
    const { lane, z } = deckWalkPoint(pilot.t / DECK_WALK_S);
    const [px, py] = toScreen(S.lat - lane, z, S.lat);
    place(pilot.personEl, px, py, 0);
    return;
  }
  const fullHalf = pilot.len * 0.32, safeHalf = fullHalf * BOARDING_SAFE_FRAC, nearLane = pilot.lane - pilot.w * 0.55;
  const [gx, gy] = toScreen(S.lat - nearLane, pilot.z, S.lat);
  pilot.glowEl.style.width = (pilot.w * 0.5 * ppu).toFixed(1) + 'px'; pilot.glowEl.style.height = (safeHalf * 2 * ppu).toFixed(1) + 'px';
  place(pilot.glowEl, gx, gy, pilot.heading);
  // 26 Sep 2026, Simon: "a bit slower — I couldn't actually see him transfer" — an actual gunwale-to-deck walk now
  // (was freeze-then-resume-pacing, never visibly crossing), timed against the same BOARDING_TRANSFER_S the game
  // logic already waits out; freezePos is the fixed point he set off from (pilot-boarding.js), so this reads the
  // same regardless of whether a timed tap or the 3-miss auto-board started it.
  if (pilot.boardedPending) {
    pilot.glowEl.classList.remove('hot');
    const f = clamp(pilot.pendingT / BOARDING_TRANSFER_S, 0, 1);
    const startZ = pilot.z + pilot.freezePos * fullHalf;
    // 28 Sep 2026, Simon: lands exactly on DECK_PATH[0] (his own "yellow" boarding-point dot) rather than the
    // ship's bare centreline, so the deck-walk leg below picks up with no jump between the two.
    const lane = lerp(nearLane, DECK_PATH[0].lane, f), z = lerp(startZ, DECK_PATH[0].z, f);
    const [px, py] = toScreen(S.lat - lane, z, S.lat);
    place(pilot.personEl, px, py, 0);
  } else {
    pilot.glowEl.classList.toggle('hot', inSafeZone(pacePosition(pilot)));
    const [px, py] = toScreen(S.lat - nearLane, pilot.z + pacePosition(pilot) * fullHalf, S.lat);
    place(pilot.personEl, px, py, 0);
  }
}

/* ─────────────────────────── 5b. THE CHARTPLOTTER ───────────────────────────
   Bottom-left, north-up, generic plotter styling. Real geography: the coast, Corbière, the pilot station, Anchorage No 4, the
   cardinal marks, the moorings; the pilotage route on to St Helier in grey; our planned track in magenta with its waypoints; the
   course to steer from where she is now, dashed; AIS-style targets; our own ship. Drag to look around, wheel to zoom, it follows
   her again after a few seconds (or tap ⌖). Readouts: SOG, COG, XTE with the arrow to steer, distance to the next waypoint. */
const plot = $('canvas.plotter'), pc = plot.getContext('2d'), pro = { sog: $('[data-plot="sog"]'), cog: $('[data-plot="cog"]'), xte: $('[data-plot="xte"]'), dtw: $('[data-plot="dtw"]'), wpt: $('[data-plot="wpt"]') };
let PW = 250, PH = 250, PS = 1; const PX = 2; plot.width = PW * PX; plot.height = PH * PX;
/* full screen (Howard, 17 Sep: 'a full screen icon to make the chart full screen'): the plotter box takes the window, the canvas takes
   the box, and the drawing is scaled by PS so the symbols and the labels grow a little while the chart shows far more sea — the
   logical picture stays PW × PH units, whatever the box measures. Esc or the same icon brings it back. */
function plotSize() {
  const full = game.classList.contains('plotfull'); PS = full ? 1.6 : 1; const r = plot.getBoundingClientRect();
  PW = Math.max(100, Math.round(r.width / PS)); PH = Math.max(100, Math.round(r.height / PS)); plot.width = Math.round(PW * PS * PX); plot.height = Math.round(PH * PS * PX);
}
function plotFull(on = !game.classList.contains('plotfull')) { const was = game.classList.contains('plotfull'); game.classList.toggle('plotfull', on); const now = game.classList.contains('plotfull'); $('[data-act="plotfull"]').textContent = now ? '⤡' : '⛶'; plotSize();
  if (now !== was) plotView.pxPerNm = clamp(plotView.pxPerNm * (now ? 1.3 : 1 / 1.3), 25, 400);$('[data-act="arrival-map"]').setAttribute('aria-pressed',String(now));setUiPaused(now||!!arrivalUi?.activePanel); }   // a touch closer in full screen, so the plate fills the window at the usual size
const plotView = { follow: true, centre: [49.172, -2.232], pxPerNm: 62, idle: 0 };
const plotBox = $('.plotter-box'); let pDrag = null;
/* the chart itself (Howard, 16 Sep: the captain must see real sea and land): a raster built from open data by _beats/tools/chart.html —
   land and water from OpenStreetMap, depth contours from EMODnet Bathymetry — in Web Mercator, drawn under everything; and the
   marks as DATA from OpenStreetMap's seamark tags (every buoy, beacon and light with its colour, topmark and light character),
   drawn here as chart symbols. No ferry routes, cables or other lines that are not for navigation. NOT FOR NAVIGATION — a training
   picture, © OpenStreetMap contributors (ODbL), EMODnet Bathymetry. */
const chart = { img: new Image(), meta: null, marks: [] };
/* the charted depth under the ship (EMODnet Bathymetry mean, a 240×130 grid of the game's box — assets/game/depth-game.json;
   negative = below datum, positive = land; NOT FOR NAVIGATION) — bilinear at her position, for the instruments */
/* the LAND itself (18 Sep): the wide plate's alpha is the OpenStreetMap water mask — the true coastline, drying sand and all —
   sampled at quarter resolution for 'is this point on land?'. The depth grid stays for the instruments only. */
const LANDM = { a: null, w: 0, h: 0, b: null };
fetch('assets/game/wide-plate.json').then(r => r.json()).then(mt => { const im = new Image(); im.onload = () => { const w = mt.w >> 2, h = mt.h >> 2; const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); LANDM.a = x.getImageData(0, 0, w, h).data; LANDM.w = w; LANDM.h = h; LANDM.b = mt.bounds; }; im.src = 'assets/game/' + mt.file; }).catch(() => {});
function landAt(g) { const L = LANDM; if (!L.a) return false; const b = L.b; const mN = MERC(b.north), mS = MERC(b.south); const px = Math.floor((g[1] - b.west) / (b.east - b.west) * L.w), py = Math.floor((mN - MERC(g[0])) / (mN - mS) * L.h); if (px < 0 || py < 0 || px >= L.w || py >= L.h) return false; return L.a[(py * L.w + px) * 4 + 3] > 100; }
const DEPTH = { g: null }; fetch('assets/game/depth-game.json').then(r => r.json()).then(j => { DEPTH.g = j; }).catch(() => {});
function depthAt(g) { const D = DEPTH.g; if (!D) return null; const b = D.bounds; const fx = (g[1] - b.west) / (b.east - b.west) * (D.w - 1), fy = (b.north - g[0]) / (b.north - b.south) * (D.h - 1);
  if (fx < 0 || fy < 0 || fx > D.w - 1 || fy > D.h - 1) return null; const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(D.w - 1, x0 + 1), y1 = Math.min(D.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
  const v = (x, y) => D.rows[y][x]; const q = [v(x0, y0), v(x1, y0), v(x0, y1), v(x1, y1)]; if (q.some(z => z === 999)) return null;
  return (q[0] * (1 - tx) + q[1] * tx) * (1 - ty) + (q[2] * (1 - tx) + q[3] * tx) * ty; }
/* the compass ribbon: a heading tape, north-up numbers, the lug in the middle; and the instruments beside it */
const RIB = { c: $('[data-hud="ribbon"]'), hdg: $('[data-hud="ihdg"]'), sog: $('[data-hud="isog"]'), depth: $('[data-hud="idepth"]'), ukc: $('[data-hud="iukc"]'), rot: $('[data-hud="irot"]'), rotmk: $('[data-hud="rotmk"]') };
// 28 Sep 2026, Simon: "can't see rudder indicator" — his reference screenshot's ROT (rate of turn) dial, added
// back with the game's own S.rot (deg/s, already tracked for the helm) converted to the real instrument's
// deg/min. The marker rides the same quadratic curve the gauge is drawn with in game.html (P0/P1/P2 below must
// match that path's own points), so its position is exact rather than approximated against a straight line.
const ROT_P0 = [24, 35], ROT_P1 = [60, 2], ROT_P2 = [96, 35];
function rotGaugePoint(t) { const mt = 1 - t; return [mt * mt * ROT_P0[0] + 2 * mt * t * ROT_P1[0] + t * t * ROT_P2[0], mt * mt * ROT_P0[1] + 2 * mt * t * ROT_P1[1] + t * t * ROT_P2[1]]; }
function drawRibbon() {
  const c = RIB.c; if (!c) return; const ctx = c.getContext('2d'); const W2 = c.width, H2 = c.height; ctx.clearRect(0, 0, W2, H2);
  const ppd = W2 / 90;   // 90° across the tape
  ctx.font = '600 22px Jost, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let d = Math.floor(S.hdg - 50); d <= S.hdg + 50; d++) { const dd = ((d % 360) + 360) % 360; const x = W2 / 2 + (d - S.hdg) * ppd; if (dd % 5) continue;
    const big = dd % 30 === 0; ctx.fillStyle = big ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.45)'; ctx.fillRect(x - 1, H2 - (big ? 26 : dd % 10 === 0 ? 18 : 10), 2, big ? 26 : dd % 10 === 0 ? 18 : 10);
    if (big) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd).padStart(3, '0'), x, 8); } }
  ctx.fillStyle = '#f2b64a'; ctx.beginPath(); ctx.moveTo(W2 / 2, H2 - 30); ctx.lineTo(W2 / 2 - 9, H2); ctx.lineTo(W2 / 2 + 9, H2); ctx.closePath(); ctx.fill();
  if (S.leg) { const x = W2 / 2 + (((S.leg.brg - S.hdg) + 540) % 360 - 180) * ppd; if (x > 0 && x < W2) { ctx.fillStyle = '#e01ea0'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 7, 0); ctx.lineTo(x, 12); ctx.lineTo(x + 7, 0); ctx.closePath(); ctx.fill(); } }   // the course to steer, magenta
  RIB.hdg.textContent = String(Math.round(((S.hdg % 360) + 360) % 360)).padStart(3, '0'); RIB.sog.textContent = Math.abs(S.speed).toFixed(1);
  const d = depthAt(S.pos); if (d == null || d >= 0) { RIB.depth.textContent = '—'; RIB.ukc.textContent = '—'; } else { RIB.depth.textContent = (-d).toFixed(1); const u = -d - YACHT.draught; RIB.ukc.textContent = u.toFixed(1); RIB.ukc.parentElement.classList.toggle('low', u < 2); }
  if (RIB.rot && RIB.rotmk) { const rotPerMin = S.rot * 60, full = CFG.helm.rot * 60; RIB.rot.textContent = (rotPerMin > 0 ? '+' : '') + Math.round(rotPerMin);
    const [rx, ry] = rotGaugePoint(clamp((rotPerMin + full) / (2 * full), 0, 1)); RIB.rotmk.setAttribute('transform', `translate(${rx.toFixed(1)},${ry.toFixed(1)})`); }
}
fetch(GEO.chart.meta).then(r => r.json()).then(m => { chart.meta = m; chart.img.src = GEO.chart.src; }).catch(() => {});
fetch(GEO.chart.marks).then(r => r.json()).then(j => { chart.marks = (j.marks || []).filter(m => m.type !== 'landmark' && m.type !== 'anchorage'); }).catch(() => {});
const lightChr = m => { const g = k => m['light:' + k] ?? m['light:1:' + k]; const ch = g('character'); if (!ch) return ''; const grp = g('group'), col = g('colour'), per = g('period');
  return ch + (grp ? '(' + grp + ')' : '') + (col ? { white: 'W', red: 'R', green: 'G', yellow: 'Y' }[col] || '' : '') + (per ? ' ' + per + 's' : ''); };
function drawSeamark(c, m, x, y) {
  const t = m.type, top = (m['topmark:shape'] || ''), tc = m['topmark:colour'];
  const label = (m.name ? m.name + ' ' : '') + lightChr(m);
  const flare = () => { c.fillStyle = 'rgba(224,30,160,.85)'; c.beginPath(); c.moveTo(x + 1, y - 1); c.lineTo(x + 7, y - 6); c.lineTo(x + 4, y - 1.5); c.closePath(); c.fill(); };   // the magenta light flare
  if (t === 'light_major' || t === 'light_minor') { c.fillStyle = '#111'; c.beginPath(); c.arc(x, y, t === 'light_major' ? 2.4 : 1.6, 0, 6.283); c.fill(); flare(); }
  else if (t === 'buoy_lateral' || t === 'beacon_lateral') { const port = m.category === 'port' || m.colour === 'red' || tc === 'red' || /can/.test(m.shape || ''); c.fillStyle = port ? '#d32f2f' : '#2e9e44'; c.beginPath();
    if (port) c.rect(x - 2.5, y - 4, 5, 5); else { c.moveTo(x, y - 5); c.lineTo(x + 3, y + 1); c.lineTo(x - 3, y + 1); c.closePath(); } c.fill(); if (t === 'beacon_lateral') { c.strokeStyle = '#111'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x, y + 5); c.stroke(); } if (m['light:character']) flare(); }
  else if (t === 'buoy_cardinal' || t === 'beacon_cardinal') { const up = /2 cones up/.test(top), down = /2 cones down/.test(top), base = /base together/.test(top), pt = /point together/.test(top);
    // the pillar: black/yellow bands as the cardinal quadrant — N black over yellow, S yellow over black, E black-yellow-black, W yellow-black-yellow
    const bands = up ? ['#111', '#f4c20d'] : down ? ['#f4c20d', '#111'] : base ? ['#111', '#f4c20d', '#111'] : ['#f4c20d', '#111', '#f4c20d'];
    const h = 7, bh = h / bands.length; bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(x - 2, y - 2 + i * bh, 4, bh); });
    c.fillStyle = '#111'; const cone = (cy, upward) => { c.beginPath(); if (upward) { c.moveTo(x, cy - 2.6); c.lineTo(x + 2.2, cy); c.lineTo(x - 2.2, cy); } else { c.moveTo(x, cy); c.lineTo(x + 2.2, cy - 2.6); c.lineTo(x - 2.2, cy - 2.6); } c.closePath(); c.fill(); };
    if (up) { cone(y - 3, true); cone(y - 6, true); } else if (down) { cone(y - 3, false); cone(y - 6, false); } else if (base) { cone(y - 6, true); cone(y - 3, false); } else { cone(y - 3, true); cone(y - 6, false); }
    if (m['light:character']) flare(); }
  else if (t === 'beacon_isolated_danger' || t === 'buoy_isolated_danger') { c.fillStyle = '#111'; c.fillRect(x - 2, y - 2, 4, 3); c.fillStyle = '#d32f2f'; c.fillRect(x - 2, y + 1, 4, 3); c.fillStyle = '#111'; c.beginPath(); c.arc(x, y - 4, 1.4, 0, 6.283); c.arc(x, y - 7.2, 1.4, 0, 6.283); c.fill(); if (m['light:character']) flare(); }
  else if (t === 'buoy_special_purpose' || t === 'beacon_special_purpose') { c.fillStyle = '#f4c20d'; c.beginPath(); c.arc(x, y, 2.2, 0, 6.283); c.fill(); c.strokeStyle = '#8a6d00'; c.lineWidth = 0.8; c.stroke(); if (/x-shape/.test(top)) { c.strokeStyle = '#111'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 2, y - 6); c.lineTo(x + 2, y - 2.5); c.moveTo(x + 2, y - 6); c.lineTo(x - 2, y - 2.5); c.stroke(); } if (m['light:character']) flare(); }
  else if (t === 'pilot_boarding') { c.fillStyle = '#e01ea0'; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y); c.lineTo(x, y + 5); c.lineTo(x - 4, y); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.font = '700 6px Jost, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('P', x, y + 2.2); }
  else if (t === 'rock') { c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke(); c.fillStyle = '#333'; [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a, y + b, 0.7, 0, 6.283); c.fill(); }); }
  else if (t === 'wreck') { c.strokeStyle = '#333'; c.lineWidth = 1; c.setLineDash([1.5, 1.5]); c.beginPath(); c.arc(x, y, 5, 0, 6.283); c.stroke(); c.setLineDash([]); }
  else return;
  if (label) { c.fillStyle = '#334'; c.font = '600 6.5px Jost, system-ui, sans-serif'; c.textAlign = 'left'; c.fillText(label, x + 6, y + 3); }
}
plotBox.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; pDrag = { x: e.clientX, y: e.clientY, c: plotView.centre.slice() }; plotBox.setPointerCapture?.(e.pointerId); e.stopPropagation(); });
plotBox.addEventListener('pointermove', e => { if (!pDrag) return; const r = plotBox.querySelector('canvas').getBoundingClientRect(); const sx = PW / r.width; const dx = (e.clientX - pDrag.x) * sx, dy = (e.clientY - pDrag.y) * sx;
  plotView.centre = [pDrag.c[0] + dy / plotView.pxPerNm / 60, pDrag.c[1] - dx / plotView.pxPerNm / 60 / COSL]; plotView.follow = false; plotView.idle = 0; e.stopPropagation(); });
addEventListener('pointerup', () => { pDrag = null; });
plotBox.addEventListener('wheel', e => { e.preventDefault(); plotView.pxPerNm = clamp(plotView.pxPerNm * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 25, 400); plotView.follow = false; plotView.idle = 0; }, { passive: false });
$('[data-act="follow"]').addEventListener('click', () => { plotView.follow = true; });
$('[data-act="plotfull"]').addEventListener('click', () => plotFull());
/* the handset on a phone: a bottom sheet behind the VHF button; unread traffic counted on the button (Howard, 18 Sep) */
const commsOpen = on => { game.classList.toggle('comms-open', on); if (game.classList.contains('comms-open')) { S.unread = 0; const u = $('[data-hud="unread"]'); if (u) { u.hidden = true; } } };
$('[data-act="commsToggle"]').addEventListener('click', () => commsOpen()); $('[data-act="commsClose"]').addEventListener('click', () => commsOpen(false));
const plotZoom = k => { plotView.pxPerNm = clamp(plotView.pxPerNm * k, 25, 400); plotView.idle = 0; };   // + / − on the plotter (Howard, 17 Sep); following is untouched
$('[data-act="zin"]').addEventListener('click', () => plotZoom(1.3)); $('[data-act="zout"]').addEventListener('click', () => plotZoom(1 / 1.3));
addEventListener('keydown', e => { if(e.target?.closest?.('.game-director'))return; if (e.key === 'Escape' && game.classList.contains('plotfull')) plotFull(false); });
game.addEventListener('scroll', () => { game.scrollTop = 0; game.scrollLeft = 0; });   // overflow is hidden, but focusing a button can still scroll the box — never let the picture slide
function drawPlotter(remaining, bank, brgNow, dt) {
  const c = pc; c.setTransform(PX * PS, 0, 0, PX * PS, 0, 0); c.clearRect(0, 0, PW, PH);
  const me = shipGeo();
  if (!plotView.follow) { plotView.idle += dt; if (plotView.idle > 7) plotView.follow = true; }
  if (plotView.follow) plotView.centre = [lerp(plotView.centre[0], me[0], 0.2), lerp(plotView.centre[1], me[1], 0.2)];
  const K = plotView.pxPerNm, C = plotView.centre;
  const X = g => PW / 2 + (g[1] - C[1]) * 60 * COSL * K, Y = g => PH / 2 - (g[0] - C[0]) * 60 * K;
  c.fillStyle = '#d6e9f3'; c.fillRect(0, 0, PW, PH);
  const rasterOn = chart.meta && chart.img.complete && chart.img.naturalWidth;
  if (rasterOn) {   // the real chart: Mercator plate → this equirectangular window (locally the same shape; the difference over 5 M is under a pixel)
    const b = chart.meta.bounds, iw = chart.img.naturalWidth, ih = chart.img.naturalHeight; const mN = MERC(b.north), mS = MERC(b.south);
    const px = g => [(g[1] - b.west) / (b.east - b.west) * iw, (mN - MERC(g[0])) / (mN - mS) * ih];
    const tl = [C[0] + (PH / 2) / K / 60, C[1] - (PW / 2) / K / 60 / COSL], br = [C[0] - (PH / 2) / K / 60, C[1] + (PW / 2) / K / 60 / COSL];
    const [sx0, sy0] = px(tl), [sx1, sy1] = px(br); c.drawImage(chart.img, sx0, sy0, sx1 - sx0, sy1 - sy0, 0, 0, PW, PH);
  }
  // graticule every 0.01°
  c.strokeStyle = 'rgba(0,60,90,.08)'; c.lineWidth = 1; for (let lon = -2.30; lon <= -2.12; lon += 0.01) { const x = X([0, lon]); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, PH); c.stroke(); } for (let lat = 49.14; lat <= 49.21; lat += 0.01) { const y = Y([lat, 0]); c.beginPath(); c.moveTo(0, y); c.lineTo(PW, y); c.stroke(); }
  // the land: the coast polyline closed away to the north
  if (!rasterOn) { c.fillStyle = '#e9dcb6'; c.strokeStyle = '#b39b62'; c.lineWidth = 1.2; c.beginPath();
  GEO.coast.forEach((g, i) => i ? c.lineTo(X(g), Y(g)) : c.moveTo(X(g), Y(g))); const last = GEO.coast[GEO.coast.length - 1]; c.lineTo(X([49.30, last[1]]), Y([49.30, last[1]])); c.lineTo(X([49.30, GEO.coast[0][1]]), Y([49.30, GEO.coast[0][1]])); c.closePath(); c.fill(); c.stroke(); }
  // the pilotage route on to St Helier (education: this is the line the pilots use)
  c.strokeStyle = 'rgba(60,70,80,.55)'; c.lineWidth = 1; c.setLineDash([6, 3]); c.beginPath(); GEO.pilotage.forEach((g, i) => i ? c.lineTo(X(g), Y(g)) : c.moveTo(X(g), Y(g))); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(60,70,80,.75)'; c.font = '500 7px Jost, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('110°', X([49.1667, -2.205]), Y([49.1667, -2.205]) - 3); c.fillText('082°', X([49.1632, -2.157]), Y([49.1632, -2.157]) - 3);
  // the planned track, magenta, with the waypoints
  c.strokeStyle = '#e01ea0'; c.lineWidth = 1.7; c.beginPath(); GEO.route.forEach((g, i) => i ? c.lineTo(X(g), Y(g)) : c.moveTo(X(g), Y(g))); c.stroke();
  GEO.route.forEach((g, i) => { c.beginPath(); c.arc(X(g), Y(g), 3, 0, 6.283); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#e01ea0'; c.lineWidth = 1.4; c.stroke(); });
  // the course to steer from where she is now: dashed, to the next waypoint
  const legNow = S.leg || LEGS[0]; const nextWp = legNow.b;
  c.strokeStyle = '#e01ea0'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(me), Y(me)); c.lineTo(X(nextWp), Y(nextWp)); c.stroke(); c.setLineDash([]);
  // marks: the charted seamarks (data) where we have them — then our own labels, the moorings and the anchorage from the hand-placed set
  if (chart.marks.length) { for (const m of chart.marks) { const x = X([m.lat, m.lon]), y = Y([m.lat, m.lon]); if (x < -20 || x > PW + 20 || y < -20 || y > PH + 20) continue; drawSeamark(c, m, x, y); }
    // Corbière's sectors: the arcs a chart shows, red where she shows red — the pilotage line crosses the southern one
    { const L = GEO.corbiere.at, x = X(L), y = Y(L), r = 22; for (const [a, b, col] of GEO.corbiere.sectors) { c.strokeStyle = col === 'R' ? 'rgba(211,47,47,.8)' : 'rgba(40,40,40,.5)'; c.lineWidth = col === 'R' ? 2 : 1; c.beginPath(); c.arc(x, y, r, (a - 90) * DEG, (b - 90) * DEG); c.stroke(); } } }
  c.font = '600 7px Jost, system-ui, sans-serif';
  for (const m of GEO.marks) { const x = X(m.at), y = Y(m.at); if (x < -20 || x > PW + 20 || y < -20 || y > PH + 20) continue;
    if (chart.marks.length && !/^(anch|moor|label)$/.test(m.k)) continue;   // the data has the rest
    if (m.k === 'light') { c.fillStyle = '#fff'; c.strokeStyle = '#222'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 4, 0, 6.283); c.fill(); c.stroke(); c.fillStyle = '#d32f2f'; c.beginPath(); c.arc(x, y, 1.8, 0, 6.283); c.fill(); c.fillStyle = '#334'; c.textAlign = 'left'; c.fillText(m.name, x + 6, y - 1); c.font = '500 6px Jost, system-ui, sans-serif'; c.fillText(m.chr, x + 6, y + 6); c.font = '600 7px Jost, system-ui, sans-serif'; }
    else if (m.k === 'rock') { c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.stroke(); if (m.name) { c.fillStyle = '#334'; c.textAlign = 'left'; c.font = '500 6px Jost, system-ui, sans-serif'; c.fillText(m.name, x + 5, y + 2); c.font = '600 7px Jost, system-ui, sans-serif'; } }
    else if (m.k === 'pilot') { c.fillStyle = '#e01ea0'; c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y); c.lineTo(x, y + 5); c.lineTo(x - 4, y); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x, y - 2.5); c.lineTo(x + 2, y); c.lineTo(x, y + 2.5); c.lineTo(x - 2, y); c.closePath(); c.fill(); c.fillStyle = '#7a1660'; c.textAlign = 'left'; c.fillText('Plt', x + 6, y + 3); }
    else if (m.k === 'anch') { c.strokeStyle = '#1b6fa8'; c.lineWidth = 1.2; c.setLineDash([2, 2]); c.beginPath(); c.arc(x, y, 7, 0, 6.283); c.stroke(); c.setLineDash([]); c.fillStyle = '#1b6fa8'; c.textAlign = 'center'; c.font = '600 8px Jost, system-ui, sans-serif'; c.fillText('⚓', x, y + 3); c.font = '600 7px Jost, system-ui, sans-serif'; c.textAlign = 'left'; c.fillText('No 4', x + 9, y + 3); }
    else if (m.k === 'ncard') { c.fillStyle = '#111'; c.fillRect(x - 3, y - 2, 6, 6); c.fillStyle = '#f4c20d'; c.fillRect(x - 3, y - 2, 6, 3); c.fillStyle = '#111'; c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x, y - 7); c.lineTo(x + 3, y - 3); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x - 3, y - 8); c.lineTo(x, y - 12); c.lineTo(x + 3, y - 8); c.closePath(); c.fill(); c.fillStyle = '#334'; c.textAlign = 'left'; c.fillText(m.name, x + 6, y + 3); }
    else if (m.k === 'wk') { c.strokeStyle = '#333'; c.lineWidth = 1; c.setLineDash([1.5, 1.5]); c.beginPath(); c.arc(x, y, 5, 0, 6.283); c.stroke(); c.setLineDash([]); c.fillStyle = '#334'; c.textAlign = 'left'; c.font = '500 6px Jost, system-ui, sans-serif'; c.fillText('Wk', x + 7, y + 2); c.font = '600 7px Jost, system-ui, sans-serif'; }
    else if (m.k === 'moor') { c.fillStyle = '#f4c20d'; c.beginPath(); c.arc(x, y, 2, 0, 6.283); c.fill(); }
    else if (m.k === 'label') { c.fillStyle = 'rgba(40,60,30,.8)'; c.textAlign = 'center'; c.font = '600 6.5px Jost, system-ui, sans-serif'; c.fillText(m.name, x, y); c.font = '600 7px Jost, system-ui, sans-serif'; } }
  // targets: the boats, the pilot
  for (const o of obs) { if (!o.live && (o.kind === 'pots' || o.kind === 'dolphin')) continue; const g = o.g; const tx = X(g), ty = Y(g); if (tx < 0 || tx > PW || ty < 0 || ty > PH) continue;
    if (o.live) {   // an AIS target as a plotter draws one: the hollow triangle on her course, the COG vector, her name
      c.save(); c.translate(tx, ty); c.rotate(o.hdg * DEG); c.strokeStyle = '#1b7f3a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -5); c.lineTo(3.5, 4); c.lineTo(-3.5, 4); c.closePath(); c.stroke(); if (o.sog > 0.5) { c.beginPath(); c.moveTo(0, -5); c.lineTo(0, -5 - Math.min(24, o.sog * 1.2)); c.stroke(); } c.restore();
      c.fillStyle = '#1b6b34'; c.font = '600 6px Jost, system-ui, sans-serif'; c.textAlign = 'left'; c.fillText(o.name, tx + 6, ty + 2); continue; }
    c.save(); c.translate(tx, ty); c.rotate((brgNow + o.heading) * DEG); c.fillStyle = '#2b8a3e'; c.beginPath(); c.moveTo(0, -4); c.lineTo(3, 3); c.lineTo(-3, 3); c.closePath(); c.fill(); c.restore(); }
  if (pilot) { const g = gMove(gMove(S.pos, S.hdg, pilot.z * NM_PER_UNIT), S.hdg + 90, pilot.lane * NM_PER_UNIT); c.fillStyle = '#e8590c'; c.beginPath(); c.arc(X(g), Y(g), 2.5, 0, 6.283); c.fill(); }
  // our ship with its heading line
  const sx = X(me), sy = Y(me), hdg = brgNow + bank; c.save(); c.translate(sx, sy); c.rotate(hdg * DEG); c.strokeStyle = 'rgba(0,0,0,.4)'; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -Math.max(20, S.speed * 2.5)); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#111'; c.beginPath(); c.moveTo(0, -7); c.lineTo(4, 5); c.lineTo(0, 3); c.lineTo(-4, 5); c.closePath(); c.fill(); c.restore();
  // north arrow and scale bar
  c.fillStyle = '#334'; c.font = '600 8px Jost, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('N', PW - 12, 12); c.beginPath(); c.moveTo(PW - 12, 16); c.lineTo(PW - 15, 24); c.lineTo(PW - 9, 24); c.closePath(); c.fill();
  c.strokeStyle = '#334'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(8, PH - 8); c.lineTo(8 + 0.5 * K, PH - 8); c.stroke(); c.font = '500 6.5px Jost, system-ui, sans-serif'; c.textAlign = 'left'; c.fillText('0.5 nm', 8, PH - 11);
  // the disclaimer — always
  c.fillStyle = 'rgba(120,20,30,.85)'; c.font = '700 6.5px Jost, system-ui, sans-serif'; c.textAlign = 'right'; c.fillText('NOT FOR NAVIGATION', PW - 6, PH - 5);
  if (rasterOn) { c.fillStyle = 'rgba(40,50,60,.7)'; c.font = '500 5.5px Jost, system-ui, sans-serif'; c.fillText('© OpenStreetMap contributors · EMODnet', PW - 6, PH - 13); }
  // readouts
  const kts = S.speed; const xte = S.xte * M_PER_UNIT / CFG.exaggerate; const dtwNm = gDist(me, nextWp);   // XTE in true metres
  pro.sog.textContent = kts.toFixed(1); pro.cog.textContent = String(Math.round(((hdg % 360) + 360) % 360)).padStart(3, '0');
  pro.xte.textContent = (Math.abs(xte) < 5 ? '0' : Math.round(Math.abs(xte))) + ' m ' + (xte > 5 ? '◀' : xte < -5 ? '▶' : '·'); pro.dtw.textContent = dtwNm.toFixed(2); pro.wpt.textContent = GEO.names[LEGS.indexOf(legNow) + 1];
}

/* ─────────────────────────── 5c. LIVE AIS ───────────────────────────
   (Howard, 17 Sep: "link this to AIS, and include live ferry and vessel movements, with an image over them on the fly")
   The real vessels on the game's water, from the lab's own AIS buffer (tools/ais-buffer.mjs on Fly): one fetch of what is in
   the box now, then the buffer's live stream for every position report inside it. Each becomes a vessel in the world — the
   sprite picked from her AIS ship type and her name (a DFDS ferry gets the ferry with the brand, a coaster the cargo ship, a
   fishing boat the tuna boat, a yacht the yacht), her name and speed on a tag, dead-reckoned between reports at her real speed
   and course, and drawn on the plotter as an AIS target. They keep the rules but never alter for us — they are real — so the
   captain is told when the yacht is the give-way vessel, and if he stands into one the pilot puts the helm over. Real speeds
   on an exaggerated chart: a ferry at 20 kn takes minutes to cross the screen, not seconds — the game's own traffic is
   theatre; this is the truth. ?live=off turns it off. The feed hears the islands' approaches, not the whole Channel: on a quiet
   morning the box can be near empty. Nothing is stored: positions live in the page and go when it closes. */
const LIVE = { on: /[?&]live=on\b/.test(location.search), /* off by default (GAME-POLISH.md): the intro's 'Real traffic' box turns it on */ box: [49.05, -2.50, 49.32, -1.95], url: /^https?:\/\/(localhost|127\.|192\.168\.|10\.)/.test(location.origin) ? 'https://hlc-ais-buffer.fly.dev' : location.origin, /* on the buffer itself: same origin */ targets: new Map(), es: null, status: 'off', said: false };
const LIVE_KIND = (type, name) => { const t = +type || 0, n = (name || '').toUpperCase();
  if (/\bDFDS\b|COMMODORE|CONDOR|GOODWILL|CLIPPER|LIBERATION|VOYAGER|ISLANDER|BARFLEUR|NORMANDIE|SEVEN SISTERS/.test(n)) return 'dfds';
  if (/SAN PAWL|ISLANDS UNLIMITED/.test(n)) return 'iu';
  if (t >= 60 && t <= 69) return 'ferry';
  if (t === 30 || /\bFV\b|FISHER/.test(n)) return 'tuna';
  if ((t >= 70 && t <= 89) || t === 31 || t === 32 || t === 33 || t === 35 || t === 52) return 'cargo';
  if (t === 36) return 'sail';
  return 'yacht'; };   // 37 pleasure craft, 50 pilot, 51 SAR, 0 not broadcast, the rest
const LIVE_SIZE = { dfds: [24, 7.4], iu: [6, 1.9], ferry: [18, 5.2], tuna: [8, 5], cargo: [14, 3.4], sail: [4, 1.4], yacht: [4.6, 1.3] };   // length, beam in units — representative (the feed gives no dimensions)
function liveUpsert(mmsi, lat, lng, sog, cog, type, name, tMin) {
  if(uiPaused){if(pausedLiveFixes.size<300||pausedLiveFixes.has(mmsi))pausedLiveFixes.set(mmsi,[mmsi,lat,lng,sog,cog,type,name,tMin]);return;}
  if (!(lat > LIVE.box[0] && lat < LIVE.box[2] && lng > LIVE.box[1] && lng < LIVE.box[3])) return;
  const at = tMin ? tMin * 60000 : Date.now(); if (Date.now() - at > 30 * 60000) return;   // older than half an hour is not "now"
  let t = LIVE.targets.get(mmsi);
  if (!t) { const kind = LIVE_KIND(type, name); if (NO_FERRIES && isFerryKind(kind)) return; const [len, w] = LIVE_SIZE[kind]; const sp = SPRITES[kind];
    const el = document.createElement('div'); el.className = 'ob live boat ' + kind; el.innerHTML = `<img alt="" src="${sp.src}">`; if (sp.logo) { const b = logoEl(sp.logo); if (b) el.appendChild(b); } world.appendChild(el);
    const tag = document.createElement('div'); tag.className = 'aistag'; world.appendChild(tag);
    const nc = Math.max(1, Math.round(len / (w * 1.3))), circles = []; for (let i = 0; i < nc; i++) circles.push({ dz: nc === 1 ? 0 : len * 0.38 - i * (len * 0.76 / (nc - 1)), r: w * 0.5 });
    const o = { kind, live: true, mmsi, name: name || String(mmsi), g: [lat, lng], hdg: 0, sog: 0, swim: 0, lane: 0, z: 0, heading: 0, len, w, circles, el, tagEl: tag, wakeEl: wakeLine(el) };
    t = { o }; LIVE.targets.set(mmsi, t); obs.push(o); }
  const o = t.o; if (name && o.name === String(mmsi)) o.name = name;
  o.g = [lat, lng]; o.at = at; o.sog = +sog || 0; if (cog != null && cog >= 0 && cog < 360) o.hdg = +cog; o.swim = (o.sog < 0.3 ? 0 : o.sog) / 3600 / NM_PER_UNIT;   // units per second at her real speed
}
function liveStatus() { const el = $('[data-hud="ais"]'); if (!el) return; const n = LIVE.targets.size; el.textContent = LIVE.status === 'on' ? `AIS ● ${n} live · tap to turn off` : LIVE.status === 'off' ? 'AIS off · tap for real traffic' : `AIS · ${LIVE.status}`; el.classList.toggle('on', LIVE.status === 'on'); }
function liveSay() { if (!S.playing || LIVE.said || LIVE.status !== 'on') return; LIVE.said = true; const names = [...LIVE.targets.values()].map(t => t.o.name);
  comms('AIS', names.length ? `Live AIS on — ${names.length} ${names.length === 1 ? 'vessel' : 'vessels'} reporting on this water now: ${names.slice(0, 6).join(', ')}${names.length > 6 ? '…' : ''}. Real positions, real speeds — they will not alter for you.` : 'Live AIS on — nothing reporting on this water just now; the feed hears the islands\' approaches, so keep a lookout.'); }
function liveTick() { const now = Date.now(); for (const [k, t] of LIVE.targets) { const o = t.o; const age = now - o.at; if (age > 30 * 60000) { removeObstacle(o); o.tagEl.remove(); LIVE.targets.delete(k); continue; } if (age > 10 * 60000) o.swim = 0; } liveStatus(); liveSay(); }
async function liveStart() {
  if (!LIVE.on) { liveStatus(); return; } LIVE.status = 'connecting'; liveStatus();
  try { const m = await import('../../lab-config.js'); const c = m.default || m; if (c.BUFFER_URL) LIVE.url = c.BUFFER_URL; } catch (_) {}
  const box = LIVE.box.join(',');
  try { let r = await fetch(`${LIVE.url}/box.json?box=${box}`, { cache: 'no-store' }); let rows;
    if (r.ok) rows = (await r.json()).vessels; else { r = await fetch(`${LIVE.url}/snapshot.json`, { cache: 'no-store' }); rows = (await r.json()).vessels; }   // the buffer before /box.json: the whole snapshot, filtered here
    for (const v of rows) liveUpsert(v[0], v[1], v[2], v[3], v[4], v[6], v[7], v[5]); LIVE.status = 'on'; liveStatus(); liveSay();
  } catch (e) { LIVE.status = 'no feed'; liveStatus(); if (DEBUG) console.warn('[live]', e.message); return; }
  try { LIVE.es = new EventSource(`${LIVE.url}/live?box=${box}`);
    LIVE.es.onmessage = e => { try { const v = JSON.parse(e.data); liveUpsert(v[0], v[1], v[2], v[3], v[4], v[5], v[6], 0); } catch (_) {} };
    LIVE.es.onerror = () => { LIVE.status = 'reconnecting'; liveStatus(); }; LIVE.es.onopen = () => { LIVE.status = 'on'; liveStatus(); }; } catch (_) {}
}
function liveStop() { try { LIVE.es?.close(); } catch (_) {} LIVE.es = null; for (const [k, t] of LIVE.targets) { removeObstacle(t.o); t.o.tagEl.remove(); LIVE.targets.delete(k); } LIVE.status = 'off'; LIVE.said = false; liveStatus(); }
function liveToggle(on) { LIVE.on = on == null ? !LIVE.on : !!on; const box = $('[data-opt="live"]'); if (box) box.checked = LIVE.on; if (LIVE.on) { if (LIVE.status === 'off' || LIVE.status === 'no feed') liveStart(); } else liveStop(); }
{ // go-live build (Simon + Howard, 4 Nov 2026): the page sets CIPS_LIVE_DATA = false, so there is no real-traffic option and no AIS pill, and nothing is requested
  let noLive = false; try { noLive = window.parent !== window && window.parent.CIPS_LIVE_DATA === false; } catch (_) {}
  if (noLive) { LIVE.on = false; const lb = $('[data-opt="live"]'); if (lb) (lb.closest('label') || lb).remove(); const ap = $('[data-hud="ais"]'); if (ap) ap.remove(); }
  const box = $('[data-opt="live"]'); if (box) { box.checked = LIVE.on; box.addEventListener('change', () => liveToggle(box.checked)); }
  const pill = $('[data-hud="ais"]'); if (pill) pill.addEventListener('click', e => { e.stopPropagation(); liveToggle(); }); }   // the AIS pill on the plotter is the same switch (Howard, 18 Sep)
setInterval(liveTick, 1000); liveStart();

/* ─────────────────────────── 5d. SOUND ───────────────────────────
   (Howard, 18 Sep: 'the engine noise is annoying; a typical SMS/email notice for the VHF; seagulls, the jet passing over, sea
   and waves — research to find'.) Real recordings from Pixabay (assets/game/sound/README.md has the credits): the sea as a
   loop under everything, gulls now and then when there are gulls in the picture, the jet as the flight comes over, a message
   ping for every VHF call, and a small synthesised chime for a star. No engine. On by default (20 Sep); the player's choice is remembered in this browser. */
const SND = { on: false, ctx: null, gain: null, buf: {}, sea: null, seaGain: null, lastGull: 0 };
SND.on = true; try { SND.on = localStorage.getItem('bhi-sound') !== '0'; } catch (_) {}   // on by default (Howard, 20 Sep); off only if the player turned it off
async function sndLoad(name) { if (SND.buf[name]) return SND.buf[name]; try { const r = await fetch('assets/game/sound/' + name + '.mp3'); const b = await SND.ctx.decodeAudioData(await r.arrayBuffer()); SND.buf[name] = b; return b; } catch (_) { return null; } }
function sndInit() { if (SND.ctx) return; try { const C = new (window.AudioContext || window.webkitAudioContext)(); SND.ctx = C; const master = C.createGain(); master.gain.value = 0; master.connect(C.destination); SND.gain = master;
  sndLoad('sea').then(b => { if (!b) return; const src = C.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = 2; src.loopEnd = 38; const g = C.createGain(); g.gain.value = 0.55; src.connect(g); g.connect(master); src.start(); SND.sea = src; SND.seaGain = g; });
  ['gulls', 'jet', 'message'].forEach(sndLoad); } catch (_) {} }
function sndApply(userGesture=false) { radioVoice.setEnabled(false); const b = $('[data-act="sound"]'); if (b) b.textContent = SND.on ? '🔊' : '🔇'; if (!SND.ctx) return; if (SND.ctx.state === 'suspended') SND.ctx.resume(); SND.gain.gain.setTargetAtTime(SND.on && !uiPaused ? 1 : 0, SND.ctx.currentTime, 0.2); }
function sndPlay(name, vol = 1, rate = 1) { if (!SND.ctx || !SND.on) return null; const b = SND.buf[name]; if (!b) return null; const C = SND.ctx; const src = C.createBufferSource(); src.buffer = b; src.playbackRate.value = rate; const g = C.createGain(); g.gain.value = vol; src.connect(g); g.connect(SND.gain); src.start(); return { src, g }; }
function sndTick() { if (!SND.ctx || !SND.on) return; const C = SND.ctx;
  if (SND.seaGain) SND.seaGain.gain.setTargetAtTime(S.playing ? 0.55 : 0.3, C.currentTime, 0.5);   // the sea a little quieter on the intro card
  const gullsNear = obs.some(o => o.kind === 'gull' && !o.el.hidden && Math.hypot(o.x, o.z) < visH * 0.9);
  if (gullsNear && S.t - SND.lastGull > 9 + audioRandom.next() * 8) { SND.lastGull = S.t; sndPlay('gulls', 0.5, 0.95 + audioRandom.next() * 0.1); } }
/* screen passes (Howard, 20 Sep): the crew's easyJet on final (much larger, across the screen on the runway heading, 078°, the view
   being north-up) and the British Airways finale before the end card. Drawn over the scene in screen space so they always cross
   the picture; the jet is heard as she comes in and panned with her across the screen. */
function flyPass({ name, color, dir, size = 0.5, y = 0.42, dur = 4.5, onGone }) {
  const el = document.createElement('div'); el.className = 'pass-jet'; el.innerHTML = `<img alt="" src="${SPRITES.plane.src}"><b style="color:${color}">${name}</b>`;
  const sh = document.createElement('div'); sh.className = 'pass-jet-shadow'; game.appendChild(sh); game.appendChild(el);
  const W = innerWidth, H = innerHeight, len = Math.min(W * size, 820), cx = W * 0.5, cy = H * y, a = dir * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a);
  const R = Math.hypot(W, H) / 2 + len * 0.6, t0 = performance.now(); let snd = null;
  el.style.width = len + 'px'; { const b = el.querySelector('b'); b.style.fontSize = (len * (name.length > 9 ? 0.034 : 0.055)).toFixed(1) + 'px'; b.style.textTransform = name.length > 9 ? 'uppercase' : 'none'; } sh.style.width = sh.style.height = len * 0.92 + 'px'; el.querySelector('b').style.transform = `translate(-50%,-50%) rotate(-90deg)`;
  (function step() { if (uiPaused) { requestAnimationFrame(step); return; } const k = Math.min(1, (performance.now() - t0) / 1000 / dur), d = -R + k * 2 * R, x = cx + ux * d, yy = cy + uy * d;
    el.style.transform = `translate(${x.toFixed(1)}px,${yy.toFixed(1)}px) translate(-50%,-50%) rotate(${dir}deg)`;
    sh.style.transform = `translate(${(x - len * 0.12).toFixed(1)}px,${(yy + len * 0.35).toFixed(1)}px) translate(-50%,-50%) rotate(${dir}deg)`;
    if (!snd && x > -len * 0.4 && x < W + len * 0.4 && yy > -len * 0.4 && yy < H + len * 0.4) snd = sndJet();
    if (snd) snd.p.pan.value = clamp((x / W) * 2 - 1, -1, 1) * 0.85;
    if (k < 1) requestAnimationFrame(step); else { el.remove(); sh.remove(); onGone?.(); } })();
}
function flyFinale(onGone) { flyPass({ name: 'British Airways', color: '#1d3a6e', dir: 90, size: 0.42, y: 0.3, dur: 4.2, onGone }); }
function sndJet() { const r = sndPlay('jet', 1.0); if (!r) return null; const C = SND.ctx, p = C.createStereoPanner ? C.createStereoPanner() : null; if (p) { r.g.disconnect(); r.g.connect(p); p.connect(SND.gain); } return { ...r, p: p || { pan: { value: 0 } } }; }
function sndBlip(kind) { if (!SND.ctx || !SND.on) return; const C = SND.ctx, t = C.currentTime;
  if (kind === 'vhf') sndPlay('message', 0.7);
  else if (kind === 'jet') sndPlay('jet', 0.9);
  else if (kind === 'star') { [660, 880, 1320].forEach((f, i) => { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.16, t + i * 0.09 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.35); o.connect(g); g.connect(SND.gain); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4); }); } }
$('[data-act="sound"]').addEventListener('click', e => { e.stopPropagation(); sndInit(); SND.on = !SND.on; try { localStorage.setItem('bhi-sound', SND.on ? '1' : '0'); } catch (_) {} sndApply(true); });
$('[data-act="start"]').addEventListener('click', () => { if (SND.on) { sndInit(); sndApply(true); } });
sndApply();

/* ─────────────────────────── 6. THE LOOP ─────────────────────────── */
const safetyGuard=createSafetyGuard({
 toXY:g=>[(g[1]-GEO.route[0][1])*60*COSL/NM_PER_UNIT,(g[0]-GEO.route[0][0])*60/NM_PER_UNIT],
 toGeo:(x,y)=>[GEO.route[0][0]+y*NM_PER_UNIT/60,GEO.route[0][1]+x*NM_PER_UNIT/60/COSL],
 landAt,getTargets:()=>obs,
 onAdvice:message=>comms('Pilot',message,'',14,{essential:true,priority:3,repeat:true,group:'safety',key:'pilot-safe-advice'}),
 onIntervention:o=>{if(o){avoided(o);}else{S.hits++;S.penalty+=6;hud.hits.textContent=String(S.hits);S.pilotHelm={dir:1,t:3};comms('Pilot','Captain, I have the helm. Keeping clear of the shore.','',14,{essential:true,priority:4,key:'safety-shore',repeat:true});}}
});
const STEP = 1 / 60; let acc = 0, simT = 0, last = performance.now(); const t0 = last;
for (let i = 0; i < 120; i++) { simT += STEP; wake.update(new THREE.Vector3(0, 0, 0), STEP, simT); } uni.uHeightmap.value = wake.texture();
resize(); addEventListener('resize', resize);
function frame() {
 requestAnimationFrame(frame);const now=performance.now(),elapsed=Math.max(0,(now-last)/1000);last=now;
 if(document.hidden)return;
 if(uiPaused){if(game.classList.contains('plotfull'))drawPlotter(CFG.distance-S.travelled,S.rot/CFG.helm.rot*CFG.helm.bank,S.hdg,0);return;}
 fixedClock.advance(elapsed,(dt,n,lastStep)=>tick(dt,lastStep));
}
function tick(dtForce,renderFrame=true) {   // dtForce: only the debug hook passes one, to step the game by hand
  if(uiPaused)return;
  radioVoice.setEnabled(false);radioVoice.tick();
  const dt=dtForce??STEP; if(!Number.isFinite(dt)||dt<0||dt>.1)throw new Error('Invalid simulation timestep');runTime+=dt;const t=runTime;
  const beforeMotion={g:S.pos.slice(),heading:S.hdg,path:S.path};
  if (S.playing) S.t += dt;
  for (let i = LATER.length - 1; i >= 0; i--) if (S.t >= LATER[i].at) { const q = LATER.splice(i, 1)[0]; q.fn(); }
  // speed: ramps with progress, dips after a close call, and stops once the passage is done
  const fix = routeFix(S.pos, S.legIdx || 0); S.leg = fix.leg; S.travelled = fix.along; S.xte = fix.xte;
  // `prog` still drives the "ON PASSAGE" bar below — kept even though cruise no longer ramps with it.
  const prog = clamp(S.travelled / LEGS[LEGS.length - 1].start, 0, 1);
  if (S.slowT > 0) { S.slowT -= dt; } else S.slowK = lerp(S.slowK, 1, 1 - Math.pow(0.02, dt));
  if (S.graceT > 0) S.graceT -= dt;
  // 26 Sep 2026, Simon: cruise is a flat ceiling (CFG.speed) reachable anywhere in open water, no longer ramped
  // with progress along the route. 28 Sep 2026, Simon: "let's remove the speed cap in the pilot zone, it makes
  // the throttle harder to control" — the zone-specific ceiling (CFG.pilot.maxSpeed) this added is gone again;
  // "slowed down time" in the zone is still real, just carried entirely by CFG.pilot.timeScale below (how much
  // ground she actually covers per real second), not by also clamping the SOG number itself.
  // the engines: each propeller follows its lever with a lag (quicker building thrust than reversing it); the ship's speed follows the MEAN thrust
  const mo = CFG.motion, engTau = (n, d) => (d * n >= 0 && Math.abs(d) >= Math.abs(n)) ? mo.engUp : mo.engRev;
  if (!S.playing) { ENG.nP = ENG.thP; ENG.nS = ENG.thS; } else { ENG.nP += (ENG.thP - ENG.nP) * (1 - Math.exp(-dt / engTau(ENG.nP, ENG.thP))); ENG.nS += (ENG.thS - ENG.nS) * (1 - Math.exp(-dt / engTau(ENG.nS, ENG.thS))); }
  const thrust = (ENG.nP + ENG.nS) / 2;
  const target = S.done ? 0 : !S.playing ? CFG.speedDefault : CFG.speed * thrust * S.slowK;   // the telegraph sets it — pre-start drift now matches the new starting speed, not a stale hardcoded 6
  S.speed = lerp(S.speed, target, 1 - Math.pow(S.done ? 0.2 : (target < S.speed ? CFG.motion.coast : CFG.motion.accelerate), dt));   // a 70 m yacht carries her way: from 10 kn she runs on ~200 m with the engines stopped
  const remaining = CFG.distance - S.travelled;
  // the helm: keys or a drag set the rudder; the rate of turn builds with a lag and with speed; the heading integrates
  S.input = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
  if (bridge && S.playing && !uiPaused && !S.done && S.input && S.dragX == null) { stickSet(STICK.x + S.input * 1.8 * dt, STICK.y); S.input = 0; }   // A / D wind the rudder on (about half a second to full) and it STAYS where it is, like the console's bar; X centres it
  const hm = CFG.helm; let rudderTarget = S.done ? 0 : S.dragTarget != null ? S.dragTarget : S.input;
  if (S.pilotHelm) { S.pilotHelm.t -= dt; rudderTarget = S.pilotHelm.dir; if (S.pilotHelm.t <= 0) S.pilotHelm = null; }   // the pilot has the wheel: full helm away from a real vessel
  S.rudder = lerp(S.rudder, rudderTarget, 1 - Math.pow(CFG.motion.rudder, dt));
  const rudFlow = Math.max(Math.abs(S.speed), CFG.speed * mo.slip * Math.max(ENG.nP, ENG.nS, 0));   // the rudders bite in the water she is moving through, or in the slipstream of an engine driving ahead
  const rotMax = hm.rot * clamp(Math.sqrt(rudFlow / hm.refKn), 0.06, 1.3) * (S.speed < 0 ? -0.6 : 1);   // she answers the helm better with way on; astern the stern walks the other way                     // she answers the helm better with way on
  S.rot = lerp(S.rot, S.rudder * rotMax + (S.done || !S.playing ? 0 : (ENG.nP - ENG.nS) * mo.diffRot), 1 - Math.pow(0.5, dt / hm.lag * 2));   // port engine ahead of starboard turns her to starboard
  if (S.playing && !S.done) S.hdg = ((S.hdg + S.rot * dt) % 360 + 360) % 360;
  // she moves where she is pointing, and the tide sets her the whole time
  // 25 Sep 2026, Simon: "slow down time" once she's on station for the pilot — the displayed speed (and the
  // boarding gate itself) stay real, but the ground she actually covers per real second is damped, so holding
  // 7 kts doesn't carry her out of the zone before there's been a real chance to settle heading and speed.
  // 26 Sep 2026, Simon: full ahead is faster now (CFG.speed, up to 12) — CFG.pace damps ground covered
  // everywhere, not just on station, so she doesn't visibly race across the screen at the higher number; only
  // the ship's own progress along the track is scaled (S.pos/S.path/the tide below) — the displayed SOG and how
  // fast traffic drifts past her (both keyed to the real S.speed a few lines down) are untouched.
  const timeScale = ((S.phase === 'pilotzone' && !S.pilotBoarded) ? CFG.pilot.timeScale : 1) * CFG.pace;
  // 28 Sep 2026, Simon: "watched that ferry collide again... we can't allow this to happen" — found it: rules()
  // below predicts each encounter's closest point (cpa/tcpa) from relative velocity, using S.speed at full,
  // undamped value for OUR side of it — but our own WORLD-POSITION movement is damped by timeScale right above
  // (deliberately, so she doesn't visibly race across the screen at the higher full-ahead speed — see the
  // comment above this block), while traffic keeps moving at its own real, undamped rate. rules() never knew
  // about that gap: it predicted a closest-approach point assuming we'd have moved on by the time that mattered,
  // when in the pilot zone she barely moves at all — so an alteration could be judged "not needed yet" against a
  // projected miss that was never going to happen for real. Exposed on S so rules() (a separate top-level
  // function, not nested in here) can see it — the fix is only to this prediction, not to the actual damping,
  // which stays exactly as designed.
  S.timeScale = timeScale;
  if (S.playing && !S.done) { S.pos = gMove(S.pos, S.hdg, S.speed * dt * timeScale * NM_PER_UNIT); S.path += S.speed * dt * timeScale;
    if (GEO.tide) S.pos = gMove(S.pos, GEO.tide.dir, GEO.tide.kn / 3600 * dt * timeScale);
    const safe=safetyGuard.player(beforeMotion.g,beforeMotion.heading,S.pos,S.hdg,S.speed,dt,S.t);
    S.pos=safe.g;S.hdg=safe.heading;
    if(safe.stopped){S.speed=0;S.path=beforeMotion.path+gDist(beforeMotion.g,S.pos)/NM_PER_UNIT;}
    if(safe.repositioned)S.repositioned++;
    if(safe.unresolved){S.playing=false;S.safetyError='No verified safe position';comms('Pilot','Passage paused for safety. Please restart.','',14,{essential:true,priority:4});setUiPaused(true);arrivalUi?.refresh(true);return;}
  }
  else if (!S.playing) S.drift = (S.drift || 0) + S.speed * dt;   // before Cast off the water still moves past her (drift), so nothing jumps when she gets under way
  S.groundSpeed=S.done?0:(S.playing&&dt>0?gDist(beforeMotion.g,S.pos)/NM_PER_UNIT/dt:Math.abs(S.speed));
  // the pull-back: the opening (Corbière ahead), the passage, then the pilot launch closing in.
  // 25 Sep 2026, Simon: stay pulled back through the whole passage (was zooming to CFG.visH once under way) —
  // keeps Corbière and the coast in the frame the whole way, so the sector light's source stays obvious.
  const opening = !S.done && (!S.playing || S.t < CFG.open.hold);
  const nearStation = S.phase === 'pilotzone' || S.done;
  const targetV = nearStation ? CFG.approach.visH : CFG.open.visH;
  if (Math.abs(targetV - visH) > 0.05) setView(lerp(visH, targetV, 1 - Math.pow(opening ? CFG.camera.openingDamping : CFG.camera.passageDamping, dt)));
  const st = CFG.steer;
  { const li = LEGS.indexOf(S.leg); if (S.playing && li > S.legIdx) { S.legIdx = li;
      if (li === 1) { transmit('nav.course'); S.lightWatch = S.t; } } }
  { const pod = obs.filter(o => o.ride); if (pod.length && S.speed < 1.2) { S.slowPod = (S.slowPod || 0) + dt; if (S.slowPod > 5) { for (const o of pod) removeObstacle(o); S.podCame = false; toast('The dolphins have gone — they ride a moving ship', ''); } } else S.slowPod = 0; }
  if (S.playing && !S.done && !S.wakeDolphins && CFG.dolphins.enabled) {   // ★ dolphins in the wake
    const steady = S.speed > 4.5 && S.speed < 9.6 && Math.abs(S.rot) < 1.5 && !S.pilotHelm; S.steadyT = steady ? (S.steadyT || 0) + dt : 0;
    if (!S.podCame && S.steadyT > CFG.dolphins.triggerSeconds) spawnRidePod();
    else if (S.podCame) { S.rideT += dt; const pod = obs.filter(o => o.ride);
      if (!steady && S.steadyT === 0 && pod.length) { for (const o of pod) removeObstacle(o); S.podCame = false; toast('The dolphins are gone — that was a hard helm', 'bad'); }
      else if (S.rideT > CFG.dolphins.bowSeconds && pod.some(o => o.ride.z > 0)) { for (const o of pod) { o.ride.z = -7 - rnd(0, 2); o.ride.x *= 1.3; } toast('They are in the wake — riding the stern wave', 'good'); }
      else if (S.rideT > CFG.dolphins.bowSeconds+CFG.dolphins.wakeSeconds && pod.length) { S.wakeDolphins = true; star('dolphins'); } } }
  if (S.lightWatch && !S.lightRead) {   // ★ the light read: off the red and on to 095° within 15 s of the point bearing north, before the pilot has to say it
    const d = Math.abs(((S.hdg - 95) + 540) % 360 - 180);
    if (d < 10 && S.t - S.lightWatch > 1) { S.lightRead = true; S.lightWatch = 0; /* Corbiere remains guidance, not a hidden star. */ }
    else if (S.t - S.lightWatch > 15) { S.lightWatch = 0; transmit('nav.course'); } }
  const bank = S.rot / hm.rot * hm.bank;
  // the yacht: fixed at the sim origin, pointing up the bow-up frame; the screen's turn (ROT = her heading, north up) does the rest
  const [hx, hy] = toScreen(0, 0, 0); const heave = Math.sin(t / 4.8 * Math.PI) * 0.35; const swing = S.done ? Math.sin(t * 0.35) * 4 : 0;
  hullEl.style.transform = `translate(${hx.toFixed(1)}px,${hy.toFixed(1)}px) translate(-50%,-50%) rotate(${(-90 + bank + swing + ROT).toFixed(2)}deg) translate(0,${heave.toFixed(2)}px)`;
  // camera: aims at (lat, ahead) so the hull appears at screen x = lat; the sea pattern is locked to the aim (uPan)
  S.lat = 0; let viewDTarget = nearStation ? 0 : (CFG.shipX - 0.5) * visW;
  if (NORTH_UP) {   // the hull at a fixed spot on the screen (CFG.hullPos, the opening's, or the centre once the pilot launch is in sight), whatever her heading; the camera follows her sideways, so steering moves the world past her
    const op = opening ? 1 : 0; const hp = nearStation ? [0.5, 0.5] : [lerp(CFG.hullPos[0], CFG.open.hullPos[0], op), lerp(CFG.hullPos[1], CFG.open.hullPos[1], op)];
    const ox = (hp[0] - 0.5) * W, oy = (hp[1] - 0.5) * H, c = Math.cos(-ROT * DEG), sn = Math.sin(-ROT * DEG); const vx = ox * c - oy * sn, vy = ox * sn + oy * c;   // the offset in the bow-up frame
    viewDTarget = vx / ppu - S.lat; aheadZ = lerp(aheadZ, vy / ppu, 1 - Math.pow(0.5, dt/CFG.camera.followHalfLife)); }
  viewD = lerp(viewD, viewDTarget, 1 - Math.pow(0.5, dt/CFG.camera.followHalfLife));
  // THE WATER IS LOCKED TO THE LAND (Howard, 16 Sep). The hull is the origin of the simulation, so when she steers it is the
  // WORLD that shifts past her by S.lat — the coast (drawn from her true geo position) and the traffic (x = S.lat − lane) already
  // do that; the sea pattern must too, so its pan is S.lat exactly (not the camera's aim, which also carries the view offset
  // and the pull-back — those must move the camera over a still sea). Astern, the pattern has streamed by exactly the distance
  // she has travelled: the shader offsets by uTime·uFlow, so uFlow is set to travelled/time, which makes that product the true
  // distance run whatever the speed has done (throttle, penalties, the anchor).
  { const b = S.hdg; upBrg = NORTH_UP ? 0 : b; ROT = ((b - upBrg) + 540) % 360 - 180; }
  { // the camera: distance camH from the aim point on the water, tilted back along the heading by tilt° (0 = straight down),
    // the screen turned by ROT; the plan layer gets the same tilt about the same axis, so the flat world lies on the sea exactly
    const th = (CFG.view3d.on ? CFG.view3d.tilt : 0) * DEG, r = ROT * DEG; const ax = S.lat + viewD, az = aheadZ;
    const back = camH * Math.sin(th), up = camH * Math.cos(th);                                   // astern along the bow-up frame, then turned by ROT about the vertical
    const ox = -back * Math.sin(r), oz = -back * Math.cos(r);   // astern of the aim along the screen-up direction (sin r, cos r) in world x,z
    camera.position.set(ax + ox, up, az + oz);
    camera.up.set(Math.sin(r) * Math.cos(th), Math.sin(th), Math.cos(r) * Math.cos(th)); camera.lookAt(ax, 0, az);
    planEl.style.transform = th ? `rotate3d(${Math.cos(r).toFixed(4)},${Math.sin(r).toFixed(4)},0,${(th / DEG).toFixed(2)}deg)` : ''; }
  { // Keep legacy pan for the LOCAL wake/foam. Background water has a separate
    // full geographic transform: translation alone cannot preserve it through turns.
    const E = (S.pos[1] - GEO.route[0][1]) * 60 * COSL / NM_PER_UNIT;
    const N = (S.pos[0] - GEO.route[0][0]) * 60 / NM_PER_UNIT, h = S.hdg * DEG;
    const along = E * Math.sin(h) + N * Math.cos(h), across = E * Math.cos(h) - N * Math.sin(h);
    uni.uPan.value.set(across, -along);
    waterFrame.update(E,N,S.hdg,t);
  }
  uni.uTime.value = t; uni.uFlow.value = t > 0.001 ? S.drift / t : 0;
  wake.uniforms.uShipSpeed.value = Math.max(2, S.speed / 0.38); wake.uniforms.uWakeIntensity.value = CFG.sea.wakeStrength * clamp(S.speed / 15, 0.05, 1.2); uni.uWakeIntensity.value = wake.uniforms.uWakeIntensity.value; uni.uFoamIntensity.value = CFG.sea.foam * clamp(S.speed / 15, 0.05, 1);

  uni.uOceanSpeed.value=CFG.sea.oceanSpeed;
  uni.uHeightScale.value=lerp(1.9,1.2,clamp((visH-50)/80,0,1))*CFG.sea.swell;
  if (S.playing && !S.done) {
    // spawning by distance travelled (the sea only), the pilot and the overflights by time
    while(S.sched<activeSchedule.length&&S.t>=activeSchedule[S.sched].at){
      const item=activeSchedule[S.sched++];if(isFerryKind(item.kind)){ if(!NO_FERRIES)ferryDirector.enqueue(item); }else spawnOnRoute(item);
    }
    const toPilot=LEGS[LEGS.length-1].start-S.travelled;
    const liveFerryNearby=obs.some(o=>o.live&&isFerryKind(o.kind)&&gDist(o.g,GEO.route[GEO.route.length-2])/NM_PER_UNIT<120);
    // 26 Sep 2026, Simon: "I don't like how a ferry appears either just before or while in the pilot zone —
    // pilots would have scheduled this not to occur" — was <95 units out, which only stopped a NEW ferry being
    // dispatched that late; one already released a little earlier could still be mid-crossing by the time she
    // arrived. Widened well clear of the zone instead, so nothing new is ever released close enough to still be
    // under way there (any straggler that slipped through before this widened is also now made to give way —
    // see rules()'s clearForPilot).
    ferryDirector.dispatch({time:S.t,targets:obs,gap:trafficRun.ferryGap,liveNearby:liveFerryNearby,
      boardingBusy:!S.pilotBoarded&&(!!pilot||(toPilot>=-BOARDING_ZONE_UNITS&&toPilot<220))},spawnOnRoute);   // the traffic, on its routes, to its timetable
    if (!S.pilotDone && !pilot && S.travelled >= LEGS[LEGS.length - 1].start - CFG.pilot.before) { S.pilotDone = true; spawnPilot();   // the pilot boards at the boarding place (the start of the last leg)
      if (Math.abs(S.xte) > 25) { S.penalty += CFG.penalties.pilotOff; S.hits++; hud.hits.textContent = String(S.hits); later(2.2, () => toast(`The launch had to come and find you — ${Math.round(Math.abs(S.xte) * M_PER_UNIT / CFG.exaggerate)} m ${S.xte > 0 ? 'south' : 'north'} of the boarding place · +${CFG.penalties.pilotOff} s`, 'bad')); } }
    if (S.t >= S.nextFlight) { S.nextFlight = S.t + CFG.overflight.every + rnd(-4, 6); spawnOverflight(); if (!S.flightSaid) { S.flightSaid = true; comms('Jersey Airport','Your crew flight is inbound. CIPS has the transfer arranged.','',null,{essential:false,group:'ambience',priority:0}); } }
    // best practice on the radio, timed: the hour's notice, the pilot's advice, the report inside the line
    const toBoard = LEGS[LEGS.length - 1].start - S.travelled;
    // 26 Sep 2026, Simon: "if they don't do it in time then it can do automatically but they don't get the star" —
    // was a penalty-only nudge that left CALLS.coastguard false forever if the player never noticed; now it
    // genuinely completes the call for them (so the VTS report later still triggers normally) but S.noticeAuto
    // marks it as not theirs, so arrivalChecklist's 'notice' criterion (below) withholds the tick/star for it.
    if (!CALLS.coastguard && !S.noticeChased && S.t > 16) { S.noticeChased = true; S.noticeAuto = true; S.penalty += CFG.penalties.noNotice; CALLS.coastguard = true; S.noticeAt = S.t; CM.ch.textContent = 'CH 82'; CM.vtsLabel.textContent = 'Report inside the line · Ch 14';
      comms('Jersey Coastguard', `${YACHT.name}, Coastguard. No notice received — logging you in ourselves. Report to VTS on channel one four.`, '',82,{essential:true,priority:2}); }
    if (CALLS.coastguard&&!CALLS.vts&&toBoard<95)callVts(); // Authored approach report, not a timed radio exercise.
    if (!S.pilotAdvised && toBoard < 180) { S.pilotAdvised=true;S.pilotReminderAt=S.t;if(boardingOk())transmit('pilot.ready',{}, {valid:()=>!S.pilotBoarded&&boardingOk()});else transmit('pilot.hold',{}, {key:'pilot-speed',valid:()=>!S.pilotBoarded&&!boardingOk()}); }   // 24 Oct 2026, Simon: the target heading and speed appear sooner, outside the zone (was 95 units, 0.85 nm; now ~1.6 nm out)
    if (!CALLS.vts && toBoard < 45)callVts();
    if (S.phase === 'sea' && toBoard <= 45) S.phase = 'pilotzone';   // the camera zooms in on the station mark a little ahead of the launch itself; the mark itself exists from the start now (reset())
    // 28 Sep 2026, Simon: "pilot aboard scoring... should be how many s after entering the pilot boarding area" —
    // a fixed mark the moment she first crosses into the zone, for scoring.js's task 5. Deliberately NOT inside
    // `if(pilot){...}` below: the ship can cross into BOARDING_ZONE_UNITS (36) before spawnPilot() has even fired
    // (that happens at CFG.pilot.before=28, a closer threshold) — gating this on `pilot` existing would have
    // missed the true first moment, same bug shape as the "doesn't come back" heading miss earlier today.
    // Uses the same radial gDist check `withinStation` (below) uses, not `toBoard` — that's along-track progress,
    // which can differ from actual distance to the waypoint if she's carrying any cross-track error.
    if(S.enteredStationAt==null&&gDist(S.pos,GEO.route[GEO.route.length-2])/NM_PER_UNIT<=BOARDING_ZONE_UNITS)S.enteredStationAt=S.t;
    hud.clock.textContent = fmt(S.t + S.penalty); hud.nm.textContent = (Math.max(0, toBoard) * NM_PER_UNIT).toFixed(1); hud.bar.style.setProperty('--k', (prog * 100).toFixed(1) + '%');
  }
  const flow = S.speed * dt;
  // the pilot launch: out from astern, alongside to starboard (screen right), holds, then away ahead and off
  if (pilot) {
    const P=CFG.pilot,gapLane=1.9,waitingGap=16;   // 25 Sep 2026, Simon: hold well off (was 7) until she's on the right heading/speed — only then does the launch close in. 26 Sep 2026, Simon: "close the gap between pilot boat and Kinship" once alongside — gapLane (was 2.6) tightened; not lower still, tested live — under ~1.6 the launch sits inside the hull sprite's own drawn footprint (she's deliberately drawn big, out of scale) rather than beside it
    const withinStation=gDist(S.pos,GEO.route[GEO.route.length-2])/NM_PER_UNIT<=BOARDING_ZONE_UNITS;
    // A clear starboard-side envelope for the launch; no ferry is pushed away to board.
    const launchAt=simToGeo(-gapLane,-1.5);
    const areaClear=!landAt(launchAt)&&!obs.some(o=>o.g&&o.circles?.length&&!o.ride&&!o.safeSubmerged&&o.kind!=='dolphin'&&
      gDist(o.g,launchAt)/NM_PER_UNIT<(o.len||4)*.6+4);
    // 26 Sep 2026, Simon: on a replay the launch appeared but "didn't come alongside... just followed us all the way out
    // of the pilot area" — not a reset bug (traced: pilot/station/S.pilotDone/legIdx all clear correctly in reset()), but
    // a real, previously-flagged gap: sail through the zone without ever holding the right speed/heading/clear water
    // long enough (1.25s, or landing the tap) and the launch used to just keep pace astern forever. Now: "if the user
    // doesn't get the pilot on board by the time the whole vessel is clear of the pilot zone, the pilot should judge it
    // themselves" — a full zone-radius past the boarding waypoint, still unboarded, and the pilot takes it out of the
    // player's hands (advanceBoarding's clearOfZone), same as the existing 3-miss auto-board, just a different trigger.
    // 28 Sep 2026, Simon: "should be almost impossible to leave without having got the pilot boat alongside" — this
    // last-resort net was firing at exactly the same distance "on station" is judged against, so it was catching
    // genuine attempts, not just abandoned ones; clearMargin adds real extra runway on top (see config.js).
    const clearOfZone=S.travelled-LEGS[LEGS.length-1].start>BOARDING_ZONE_UNITS+CFG.pilot.clearMargin;
    const events=advanceBoarding(pilot,{dt,speed:S.speed,heading:S.hdg,withinStation,clear:areaClear,hold:P.hold,clearOfZone});
    for(const event of events){
      S.pilotBoardingLog.push({event,time:S.t,speed:S.speed,phase:pilot.phase});
      if(event==='onStation'){S.onStation=true;star('onStation');}
      if(event==='boarding')transmit('pilot.boarding',{}, {valid:()=>pilot?.phase==='boarding'});
      if(event==='aborted'){
        // 28 Sep 2026, Simon: "missed the pilot 3 times, then the pilot boat just shot off... the pilot then says
        // standby for the launch but it doesnt come back" — traced live: 3 misses on their own never abort the
        // transfer (tested with heading/speed pinned safe throughout — the pilot boards himself right on schedule).
        // What actually happened: heading drifted outside boardingHeadingSafe's tolerance while attention was on
        // the tap game, which DOES abort — but this whole messaging block never checked heading at all, only
        // speed/station/traffic, so a heading-only abort fell through to 'pilot.clearance' ("Holding clear until
        // the traffic has passed") — true of nothing, and no help getting the launch back alongside.
        if(!boardingSpeedSafe(S.speed)||!boardingHeadingSafe(S.hdg))transmit('pilot.abort',{}, {valid:()=>!S.pilotBoarded&&(!boardingSpeedSafe(S.speed)||!boardingHeadingSafe(S.hdg))});
        else if(!withinStation)transmit('pilot.station',{}, {valid:()=>!S.pilotBoarded});
        else transmit('pilot.clearance',{}, {valid:()=>!S.pilotBoarded});
      }
      if(event==='autoMissed')toast("Clear of the boarding area — the pilot's come aboard in their own time.",'',{priority:3,seconds:5});
      if(event==='aboard'){S.pilotBoarded=true;S.boardedAt=S.t;star('pilot');transmit(pilot.boardedBy==='auto'&&clearOfZone?'pilot.autoboard':'pilot.aboard');
        // 29 Sep 2026, Simon: "after the pilot has transferred, lets have the pilot boat peel away and head off
        // screen, same as it does in the main beat" — traced live: the launch already DOES peel away correctly
        // (phase 'alongside'->'home', lane climbing from ~1.9 to 20+ over ~3.5s, then removed) — the bug was
        // never the animation, it's that finish()'s end card was popping up only 4s after boarding, while
        // 'alongside' alone holds for CFG.pilot.hold (9s) before the peel-away even starts. The card was covering
        // the screen for the whole thing, every time. Pushed out to comfortably clear hold(9) + the peel-away's
        // own 3.5s, so the departure is actually on screen before the card arrives.
        later(CFG.pilot.hold+4,()=>{if(!S.done)finish();});}
      if(event==='departing'){pilot.lane0=pilot.lane;}
    }
    if(pilot.phase==='waiting'&&S.t-S.pilotReminderAt>=CFG.comms.repeatSeconds){
      S.pilotReminderAt=S.t;
      if(!withinStation)transmit('pilot.station',{}, {valid:()=>!S.pilotBoarded&&gDist(S.pos,GEO.route[GEO.route.length-2])/NM_PER_UNIT>BOARDING_ZONE_UNITS});
      else if(!areaClear)transmit('pilot.clearance',{}, {valid:()=>!S.pilotBoarded});
      else if(!boardingSpeedSafe(S.speed)||!boardingHeadingSafe(S.hdg))transmit('pilot.wait',{}, {key:'pilot-speed',valid:()=>!S.pilotBoarded&&(!boardingSpeedSafe(S.speed)||!boardingHeadingSafe(S.hdg))});
    }
    if(pilot.phase==='out'){
      const k=smooth(0,3.2,pilot.t);pilot.lane=lerp(pilot.lane0??(pilot.lane0=pilot.lane),S.lat+waitingGap,k);
      pilot.z=lerp(-visH*.5-12,-20,k);pilot.heading=lerp(-22,0,k);
    }else if(pilot.phase==='waiting'||pilot.phase==='boarding'){
      const k=pilot.phase==='boarding'?smooth(0,BOARDING_CLOSE_S,pilot.t):0;
      pilot.lane=lerp(pilot.lane,S.lat+lerp(waitingGap,gapLane,k),Math.min(1,4*dt));
      pilot.z=lerp(pilot.z,lerp(-20,-1.5,k),Math.min(1,4*dt));pilot.heading=0;
    }else if(pilot.phase==='alongside'){
      pilot.lane=lerp(pilot.lane,S.lat+gapLane,Math.min(1,6*dt));pilot.z=-1.5+Math.sin(t*1.3)*.3;pilot.heading=Math.sin(t*.9)*1.5;
      // Boarding no longer grants a magic right-of-way or slides passing traffic.
    }else{
      const k=smooth(0,3.5,pilot.t);pilot.lane=pilot.lane0+26*k*k;pilot.z=-1.5+40*k;pilot.heading=lerp(0,55,smooth(0,.6,k));
    }
    if(events.includes('departed')){pilot.el.remove();pilot.wakeEl.remove();pilot.glowEl.remove();pilot.personEl.remove();pilot=null;}
    if (pilot) { const [sx, sy] = toScreen(S.lat - pilot.lane, pilot.z, S.lat); pilot.el.style.width = (pilot.len * ppu).toFixed(1) + 'px';   // the launch is drawn bow-right: its width IS its length
      place(pilot.el, sx, sy, pilot.heading - 90); const L = pilot.len * 2.4 * ppu; pilot.wakeEl.style.width = (pilot.w * 0.5 * ppu).toFixed(1) + 'px'; pilot.wakeEl.style.height = L.toFixed(1) + 'px';
      pilot.wakeEl.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,0) rotate(${(pilot.heading + 180 + ROT).toFixed(1)}deg) translate(0,${(pilot.len * 0.45 * ppu).toFixed(1)}px)`; }
  }
  // move the traffic: everything drifts astern at our speed, plus its own way
  for (const o of obs.slice()) {
    const oldTrafficG=o.g.slice(),oldTrafficHeading=o.hdg;
    // everything lives in the world: a geo position and a true heading; its sim-frame place comes from hers each frame
    if (o.route && !o.giveWay) followRoute(o, dt); else if (o.giveWay && !o.route) o.giveWay = null;
    if (o.swim && !o.fixed && !o.live && !o.ride && !o.orbit && o.kind !== 'pots') {   // the traffic keeps clear of the traffic: the lesser boat slows for the greater one close ahead (never a contact between them)
      if (!o.yieldT || S.t - o.yieldT > 0.25) { o.yieldT = S.t; o.yieldK = 1; const pri = o.standOn ? 2 : 1;
        for (const q of obs) { if (q === o || !q.g || q.kind === 'pots' || q.kind === 'gull' || q.kind === 'shoal' || q.kind === 'dolphin' || q.orbit || q.ride) continue; const qp = q.standOn ? 2 : 1; const d = gDist(o.g, q.g) / NM_PER_UNIT; const reach = ((o.len || 4) + (q.len || 4)) * 0.9; if (d > reach * 1.6) continue; const rel = ((gBearing(o.g, q.g) - o.hdg) + 540) % 360 - 180; if (Math.abs(rel) > 100) continue;
          const dead = Math.abs(rel) < 28; if (!dead) { if (qp < pri || (qp === pri && (q.len || 0) < (o.len || 0))) continue; if (qp === pri && q.len === o.len && obs.indexOf(q) > obs.indexOf(o)) continue; }   // dead ahead: whoever is behind slows, whatever her standing
          o.yieldK = d < reach ? 0 : 0.35; break; } }
      o.g = gMove(o.g, o.hdg, o.swim * (o.yieldK == null ? 1 : o.yieldK) * dt * NM_PER_UNIT); }
    else if (o.swim) o.g = gMove(o.g, o.hdg, o.swim * dt * NM_PER_UNIT);
    if (o.swim && !o.fixed && !o.live && !o.ride && !o.orbit && landAt(o.g)) { if (o.route) { o.g = o.lastSea || o.g; } else if (!o.turned) { o.turned = S.t; o.hdg = (o.hdg + 180) % 360; o.giveWay = null; } } else if (o.swim && !o.fixed) { o.lastSea = o.g; if (o.turned && S.t - o.turned > 10) o.turned = 0; }   // the rule: nobody crosses land — a free swimmer is turned back to sea, a boat on a route is held at the last water she had
    if (o.orbit) { const B = o.orbit; B.a += B.w * dt; const over = B.over; if (!obs.includes(over)) { removeObstacle(o); continue; } o.g = gMove(gMove(over.g, 0, Math.cos(B.a) * B.r * NM_PER_UNIT), 90, Math.sin(B.a) * B.r * NM_PER_UNIT); o.hdg = (B.a / DEG + (B.w > 0 ? 90 : -90) + 360) % 360; }
    if (o.ride) { const R = o.ride; o.g = gMove(gMove(S.pos, S.hdg, R.z * NM_PER_UNIT), S.hdg + 90, R.x * NM_PER_UNIT); o.hdg = S.hdg; }
    if (o.evade && !o.live) { const E = o.evade, A = CFG.avoid; E.t -= dt; const k = Math.max(0, E.t / A.time);           // getting clear: sideways, and (a boat) with her head swung away then brought back
      o.g = gMove(o.g, S.hdg + 90 * E.dir, A.push * (0.4 + 0.6 * k) * dt * NM_PER_UNIT); if (o.kind !== 'dolphin') o.hdg = E.hdg0 + E.dir * A.swing * Math.sin(Math.PI * Math.min(1, 1 - k));
      if (o.kind === 'dolphin') { o.air = 0; o.phase = 0; o.el.classList.add('under'); } if (E.t <= 0) { o.evade = null; if (o.kind !== 'dolphin') o.hdg = E.hdg0; } }
    { const [x, z] = geoToSim(o.g); o.x = x; o.z = z; o.lane = -x; o.heading = ((o.hdg - S.hdg) % 360 + 540) % 360 - 180; }   // relative heading for the sprite and the collision circles
    if (S.playing && !S.done) rules(o, dt); if (o.giveWay && o.giveWay.t > 6) { o.giveWay = null; }   // after the alteration the route brings her back
    if(!o.live && !o.fixed && !o.ride && !o.orbit){
      safetyGuard.traffic(o,oldTrafficG,oldTrafficHeading,dt,S.pos,S.hdg);
      const [gx,gz]=geoToSim(o.g);o.x=gx;o.z=gz;o.lane=-gx;o.heading=((o.hdg-S.hdg)%360+540)%360-180;
    }
    const hr = o.heading * Math.PI / 180;
    if (o.live) { const far = Math.hypot(o.x, o.z) > visH * 1.6; o.el.hidden = far; o.tagEl.hidden = far; o.wakeEl.hidden = far || !o.swim; if (far) continue; }   // a real vessel out of the picture: just not drawn
    else if ((!o.route && !o.fixed && o.swim && Math.hypot(o.x, o.z) > visH * 0.9) || Math.hypot(o.x, o.z) > 900) { removeObstacle(o); continue; }   // off her route and out of sight: gone
    let scale = 1, shadowDx = 0, shadowA = 0;
    // 26 Sep 2026, Simon: "reduce the size of the dolphins when zoomed in" — the tight pilot-zone view (CFG.approach.visH)
    // makes everything read bigger; dolphins in particular looked oversized there. Shrinks the DRAWN sprite/shadow only —
    // her len/w (avoidance math, collision circles) are untouched, so this is cosmetic, not a gameplay change.
    const dolphinZoomK = (o.kind === 'dolphin' && nearStation) ? 0.6 : 1;
    if (o.kind === 'dolphin') {                                  // surface, leap, dive
      if(o.safeSubmerged && Math.hypot(o.x,o.z)>SHIP_LENGTH_WORLD+6)o.safeSubmerged=false;
      if(o.safeSubmerged)o.phase=-dt; // stay below the surface until genuinely clear of Kinship

      o.phase += dt; const cyc = o.underT + o.leapT; const ph = ((o.phase % cyc) + cyc) % cyc;
      if (ph < o.underT) { o.air = 0; if (o.sprayed) { o.sprayed = 0; o.splashed = 0; } o.el.classList.add('under'); }
      else { const k = (ph - o.underT) / o.leapT; o.air = Math.sin(Math.PI * k); o.el.classList.remove('under');
        const [sx, sy] = toScreen(o.x, o.z, S.lat);
        if (!o.sprayed && k > 0.02) { o.sprayed = 1; spray(sx, sy, 16, 4.5, o.heading + 180); ring(sx, sy, 4, 22, 0.8); splash(o.x, o.z, 1.2, -0.35); }
        if (!o.splashed && k > 0.86) { o.splashed = 1; spray(sx, sy, 28, 6, o.heading); ring(sx, sy, 5, 34, 1.1); splash(o.x, o.z, 1.8, -0.9); } }
      scale = 1 + 0.38 * o.air; shadowDx = -o.air * 1.1; shadowA = 0.55 * (1 - 0.5 * o.air);
      o.shadow.style.width = (o.len * 0.5 * ppu * dolphinZoomK).toFixed(1) + 'px'; o.shadow.style.height = (o.len * ppu * dolphinZoomK).toFixed(1) + 'px';
      const [shx, shy] = toScreen(o.x, o.z, S.lat);   // shadow stays on the water, sliding across it as she rises (sun from the right)
      o.shadow.style.transform = `translate(${(shx + shadowDx * ppu).toFixed(1)}px,${shy.toFixed(1)}px) translate(-50%,-50%) rotate(${o.heading + ROT}deg)`; o.shadow.style.opacity = shadowA.toFixed(2);
    }
    const [sx, sy] = toScreen(o.x, o.z, S.lat); const vb = SPRITES[o.spriteKind || o.kind].vb; const wpx = o.len * ppu * vb[0] / vb[1] * dolphinZoomK;
    o.el.style.width = wpx.toFixed(1) + 'px'; place(o.el, sx, sy, o.heading, `scale(${scale.toFixed(3)})` + (CFG.view3d.on && o.kind === 'dolphin' && o.air ? ` translateZ(${(o.air * 3 * ppu).toFixed(1)}px)` : ''));
    if (o.tagEl) { o.tagEl.textContent = `${o.name} · ${o.sog.toFixed(1)} kn`; o.tagEl.style.transform = `translate(${sx.toFixed(1)}px,${(sy + o.len * 0.5 * ppu + 6).toFixed(1)}px) translate(-50%,0)`; }
    if (o.wakeEl) { const L = o.len * 1.9 * ppu; o.wakeEl.style.width = (o.w * 0.32 * ppu).toFixed(1) + 'px'; o.wakeEl.style.height = L.toFixed(1) + 'px';
      o.wakeEl.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,0) rotate(${(o.heading + 180 + ROT).toFixed(1)}deg) translate(0,${(o.len * 0.45 * ppu).toFixed(1)}px)`; }
    // collision with the hull (a row of circles down her centreline) — not a dolphin in the air
    if (S.playing && !S.done && !o.hit && !(o.kind === 'dolphin' && o.air > 0.35)) {
      const margin = safetyMargin(CFG);                                    // animals and vessels: the game steps in before contact; pots: contact fouls the prop
      for (const c of o.circles) { const cx = o.x - Math.sin(hr) * c.dz, cz = o.z + Math.cos(hr) * c.dz;   // circle position along the obstacle's heading (screen right = −X)
        let hit = false; for (const hz of [-4.2, -1.4, 1.4, 4.2]) { if (Math.hypot(cx, cz - hz) < c.r + 1.25 + margin) { hit = true; break; } }
        if (hit) { o.hit = true; if (DEBUG) console.log('[close]', o.kind, 'lane', o.lane.toFixed(1), 'z', o.z.toFixed(1), 'lat', S.lat.toFixed(1), 'circle', c);
          avoided(o); break; } }
    }
  }
  // overflights: high and fast; the shadow runs on the water well to the left of the aircraft (sun from the right)
  for (const f of flights.slice()) {
    f.g = gMove(f.g, f.hdg, f.speed * dt * NM_PER_UNIT);
    let landed = false;
    { const toGo = gDist(f.g, RUNWAY.thr08); f.alt = clamp(toGo / f.total, 0, 1);   // descending on the glide, 1 = 2,000 ft, 0 = the threshold
    const past = gBearing(RUNWAY.thr08, f.g); landed = Math.abs(((past - RUNWAY.hdg) + 540) % 360 - 180) < 90; }   // beyond the threshold, on the ground
    if (landed) { f.el.remove(); f.shadow.remove(); flights.splice(flights.indexOf(f), 1); if (!S.landedSaid) { S.landedSaid = true; transmit('ambient.airport'); } continue; }
    const [x, z] = geoToSim(f.g); const [sx, sy] = toScreen(x, z, 0); const rel = ((f.hdg - S.hdg) % 360 + 360) % 360;
    const lenNow = f.len * lerp(0.55, 1, f.alt);                                     // she looks bigger the higher she is (nearer the camera)
    if (f.tag) f.tag.style.fontSize = Math.max(8, lenNow * ppu * Number(f.tag.dataset.k || 0.055)).toFixed(1) + 'px';   // the painted name grows with her
    { const W = innerWidth, H = innerHeight, onScreen = sx > -0.15 * W && sx < 1.15 * W && sy > -0.15 * H && sy < 1.15 * H;
      if (onScreen && !f.heard) { f.heard = true; f.snd = sndJet(); }
      if (f.snd) f.snd.p.pan.value = clamp((sx / W) * 2 - 1, -1, 1) * 0.85; }   // the jet follows her across the stereo field
    f.el.style.width = (lenNow * ppu).toFixed(1) + 'px'; place(f.el, sx, sy, rel, CFG.view3d.on ? `translateZ(${(60 * ppu * f.alt).toFixed(0)}px)` : '');
    f.shadow.style.width = (f.len * 0.85 * ppu).toFixed(1) + 'px'; f.shadow.style.height = (f.len * 0.85 * ppu).toFixed(1) + 'px'; f.shadow.style.opacity = (0.25 + 0.4 * (1 - f.alt)).toFixed(2);
    place(f.shadow, sx - 26 * ppu * f.alt, sy + 9 * ppu * f.alt, rel);   // the shadow runs in under her as she comes down
  }
  if (station) {
    { const [bx, bz] = geoToSim(station.g); station.lane = -bx; station.z = bz; } const [ax, ay] = toScreen(-station.lane, station.z, 0);
    station.ring.style.transform = `translate(${ax.toFixed(1)}px,${ay.toFixed(1)}px) translate(-50%,-50%)`; station.ring.classList.toggle('live', S.phase === 'pilotzone' && !S.pilotBoarded);
  }
  const brgNow = S.hdg; drawCoast(brgNow); placeCorbiere(brgNow); drawPlotter(remaining, bank, brgNow, dt); drawRibbon(); drawStick(); drawPilotXfer(); drawPilotBoatGlow(); sndTick();
  arrivalUi?.refresh();
  // sim + render
  acc += dt; let n = 0; while (acc >= STEP && n < 3) { simT += STEP; wake.update(new THREE.Vector3(0, 0, 0), STEP, simT); for (let i = 0; i < dropN; i++) drops.value[i].set(0, 0, 0, 0); dropN = 0; acc -= STEP; n++; }
  if (n === 3) acc = Math.min(acc, STEP); if (n > 0) uni.uHeightmap.value = wake.texture();
  if(testRender&&renderFrame)renderer.render(scene, camera);
  drawFx(dt, S.speed * ppu);
}
function clearArrivalInput(){keys.clear();S.dragX=null;S.input=0;S.dragTarget=Math.abs(STICK.x)>=.06?STICK.x:null;}
function setUiPaused(on){uiPaused=!!on;if(!uiPaused&&pausedLiveFixes.size){const fixes=[...pausedLiveFixes.values()];pausedLiveFixes.clear();for(const f of fixes)liveUpsert(...f);}game.classList.toggle('arrival-paused',uiPaused);clearArrivalInput();radioVoice.cancel();last=performance.now();if(typeof SND!=='undefined'&&SND.ctx)sndApply();}
arrivalUi=mountArrivalUI({read:()=>({S,calls:CALLS,cfg:CFG,pilot}),format:id=>formatMessage(id,{vessel:YACHT.name},CFG.comms.messages).text,onOrder:placeGameOrder,setPaused:on=>setUiPaused(on||game.classList.contains('plotfull')),onResetInput:clearArrivalInput,onNoticeCall:callVts});
$('[data-act="arrival-map"]').addEventListener('click',()=>plotFull(!game.classList.contains('plotfull')));
arrivalUi.refresh(true);
frame();
const director=mountDirector({enabled:DIRECTOR,textOnly:true,CFG,baselinePreset,getReplay:()=>S.replay,
 restart:()=>reset({seed:S.replay?.seed,variation:S.replay?.variation}),
 newSeed:()=>{const a=new Uint32Array(2);crypto.getRandomValues(a);reset({seed:`BHI-${a[0].toString(16)}-${a[1].toString(16)}`,variation:S.replay?.variation??CFG.replay.later});},
 previewNext:()=>reset({seed:`${S.replay?.seed||FIRST_SEED}/next`,variation:CFG.replay.later}),
 importReplay:r=>reset({seed:r.seed,variation:r.variation}),storage:directorStorage,radio:{
 voices:()=>radioVoice.voices,status:()=>voiceStatus,preview:()=>formatMessage('pilot.hold',{},CFG.comms.messages).text,stop:()=>radioVoice.cancel()}
});
if (DEBUG || DIRECTOR) window.__game = { ENG, arrivalUi,placeGameOrder,arrivalNotes,setUiPaused,get uiPaused(){return uiPaused;},radioVoice,transmit,comms,ferryDirector,waterFrame, S, obs, CFG, GEO, LEGS, tick, reset, finish, get schedule(){return activeSchedule;}, get streams(){return streams;}, setTestRender:on=>{testRender=!!on;}, shipGeo, setThrottle, plotView, LIVE, liveUpsert, depthAt, landAt, ROUTES, CALLS, STARS, stickSet, flights, gDist, NM_PER_UNIT, get pilot() { return pilot; }, get station() { return station; }, pilotAttempt, pacePosition, inSafeZone };

addEventListener('blur',()=>{clearArrivalInput();if(S.playing&&!S.done&&!arrivalUi.activePanel)arrivalUi.open('pause');});

addEventListener('pagehide',()=>radioVoice.cancel());
document.addEventListener('visibilitychange',()=>{if(document.hidden){radioVoice.cancel();clearArrivalInput();if(S.playing&&!S.done&&!arrivalUi.activePanel)arrivalUi.open('pause');}});
