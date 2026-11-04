// Extracted from BRING_HER_IN_BASELINE_01. Keep behaviour-equivalent.
export const CFG = {
  /* 3D (Howard, 16 Sep: "so we can see the land and yacht more"). The camera sits astern and above her, tilted forward, looking
     along the heading: the yacht large in the foreground, the coast rising in the distance. The sea is real 3D already; the flat
     world (sprites, particles) is a plan layer tilted with CSS 3D to match the camera exactly, and the coast is two textured
     planes in the scene itself. view3d.on false = the old plan view (north-up). tilt: degrees from straight down; fov: vertical. */
  view3d: { on: false, tilt: 64, fov: 46, visH: 62, hullY: 0.84, openVisH: 240, approachVisH: 40 },   // off by default (Howard, 16 Sep: it stays a 2-D game); ?view=3d turns it on
  /* THE SCALE (Howard, 16 Sep): "a 2-D game, helpful for the Captain to see the whole area in a simple, fun way — the ship bigger
     and out of scale so the land can be seen; exaggerated so it is clearly fun, representative not accurate." One world unit is
     70 m ÷ 11 × exaggerate: the yacht, the traffic, the dolphins and her wake keep their sizes in units, the geography is drawn
     that many times smaller round them, so she reads big against a coast that is still exactly where it is. */
  exaggerate: 2.6,
  fov: 35, visH: 74,              // world units visible top-to-bottom on passage (the 11-unit yacht ≈ 10 % of the height — pulled back from 50 so the south coast is in view to port: Howard, 16 Sep)
  shipX: 0.72,                     // (bow-up view only) on passage the hull sits this far across the screen; 0.5 once the pilot launch is in sight
  hullPos: [0.44, 0.60],           // (north-up view) where the hull sits on screen on passage — left and low, so the 110° / 095° legs ahead of her and the coast to the north have the room; the centre once the pilot launch is in sight
  open: { visH: 170, hold: 5, hullY: 0.86, hullPos: [0.3, 0.6] },  // the opening: pulled right back with Corbière ahead and her light going, held this long after Cast off, then the view comes down to visH
  hullY: 0.70,                     // the hull sits this far down the screen
  distance: 0, nm: 0,              // filled in from GEO.route below (units along the track, and the same in nm)
  // 26 Sep 2026, Simon: "couldn't get it to go to 12kts before the pilot zone" / "the game didn't start at
  // default speed and throttle position for 8kts" — the old speed:[start,end] ramped cruise with progress along
  // the WHOLE route, so full ahead only really meant 12 right at the very end, and the "default = 8" from last
  // round only worked out to 8 by *also* setting throttle0 to full (1), leaving no room to push past it for
  // "full ahead". Dropped the ramp entirely: speed is now a flat full-ahead ceiling, reachable anywhere in open
  // water; throttle0 is a genuine default (partial) telegraph position, not full ahead already.
  speed: 12,                       // full ahead, units/s — flat, not ramped with progress
  speedDefault: 10,                // 28 Sep 2026, Simon: "give a bit more time to do the 1hr notice etc" (was 8) — what she's making before you touch the telegraph — CFG.speed * CFG.throttle0
  pace: 0.7,                       // 26 Sep 2026, Simon: raising full-ahead needed a general damper so she doesn't visibly race — this scales the GROUND actually covered per real second everywhere (not the displayed SOG, and not the traffic drifting past, which both stay tied to the real S.speed number), so the whole passage takes a little longer, not just full ahead
  throttle0: 10 / 12,              // 28 Sep 2026: 6/12 — see speedDefault above
  approach: { visH: 22 },           // 26 Sep 2026, Simon: tighter still, twice now (was 50, then 32) — closer in on the pilot boat/tap bar so the transfer reads clearly; dolphins are shrunk back down to compensate (see the dolphinZoomK in tick()), the pilot boat and figure are not (they're the point at this zoom)
  steer: { max: 24, accel: 70, drag: 5.5, bank: 20 },   // (the old lateral helm — kept for the pilot launch's relative motion only)
  helm: { rot: 4.5, lag: 1.4, bank: 7, refKn: 6 },     // rate of turn °/s at cruise with the wheel hard over; seconds for the rate to build; heel at full rate
  spawnEvery: [18, 34],            // units of travel between spawns (≈ 2–4 s)
  penalties: { dolphin: 10, tuna: 6, pots: 3, dfds: 12, iu: 6, taxi: 4, live: 8, late: 10, drag: 6, pilotOff: 8, noNotice: 6, noReport: 6 },
  credit: 8,                       // seconds off the time for each service used on the radio (Howard, 17 Sep: points for using all the services) — Coastguard, VTS, pilot, taxi, crew, fuel, stores
  /* THE RULE (Howard, 16 Sep 2026): there are no collisions in this game. A collision with an animal or another vessel is always
     avoided — by the player if they see it, and if they don't, by the game: the dolphin dives clear, the other vessel sounds five
     short blasts and alters, the pilot takes the wheel and eases her (on VHF from the station until he is aboard). The player loses the points either way. Pots remain fixed hazards; the Pilot prevents contact. */
  avoid: { margin: 2.6, push: 16, swing: 28, nudge: 5, time: 1.4, grace: 2.5 },   // margin: how far outside the hull the game steps in (units); push: the other's sideways speed; swing: her heading change (°); nudge: the pilot's helm; time: seconds
  pilot: { hold: 4, before: 28, timeScale: 0.2, clearMargin: 50 },      // seconds alongside; units before the pilot station she comes up from astern; ground covered per real second once on station, so holding speed doesn't carry her out of the zone (Simon, 25 Sep) — tuned low enough to give a few missed tap attempts (Phase 2) real headroom, not just a quick top-up. 26 Sep 2026, Simon: "slightly speed up what 7kts looks like inside the pilot area" — was 0.15 against a pace of 1 everywhere (effective 1.05 "kn" on station); now layered on the new general `pace` (0.7) above, retuned to 0.28 so the combined effect (~0.20) is a real increase on the old 0.15 — she reads noticeably less glacial. 28 Sep 2026, Simon: "I sailed through the pilot zone before I was able to hold the speed... should be almost impossible to leave without having got the pilot boat alongside" — 0.28 (combined ~0.196) still let a fumbled approach cross the zone; nudged back down to 0.2 (combined ~0.14) for real headroom to dial in speed/heading, short of the 0.15-raw figure Simon called glacial on 26 Sep. 28 Sep 2026, Simon, again: "let's remove the speed cap in the pilot zone, it makes the throttle harder to control" — the maxSpeed field this section once had (a hard ceiling on the SOG reading itself, on top of timeScale's ground-covered damping) is gone; "slowed down time" in the zone is carried by timeScale alone now. clearMargin: 28 Sep 2026, Simon — the auto-board safety net (advanceBoarding's clearOfZone, game.js) existed so the game can't soft-lock if speed/heading are never held; it fired at exactly BOARDING_ZONE_UNITS (36) past the waypoint, the same distance "on station" is measured against, so overshooting the ring at all was enough to end the attempt for you. This adds real extra runway on top — 86 units total, at the now-slower timeScale — so the net stays a genuine last resort, not something a single fumbled approach can trip
  overflight: { first: 2.5, every: 48 }   // the crew's flight comes in during the opening, while the view is wide
};
