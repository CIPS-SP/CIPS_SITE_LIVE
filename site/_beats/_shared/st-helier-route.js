/* _beats/_shared/st-helier-route.js — the route from Noirmont to the St Helier harbour entrance, and where noirmont-transit ends on it.
   4 Oct 2026: moved here out of noirmont-transit/beat.js so the beat that picks up from it (st-helier-approach) starts on EXACTLY the same
   route and pose rather than a hand-copied one. noirmont-transit imports ROUTE from here (its own comment, above where it used to be
   declared, still holds the full account of how each waypoint was derived from the Jersey pilotage syllabus and checked against the real
   seamarks). tools/plates-build/plan.js keeps its own copy of this array (it's plain node and can't import a browser module): keep it in
   step if a waypoint ever changes.
   Points are [lat, lng]. Legs: 0 = 0.2 nm SW of Le Fret -> Diamond/Ruaudière gate (088°); 1 -> East Rock gate (080°); 2 -> Platte Beacon
   projected onto the Small Road 022° line; 3 -> just inside the entrance between the pier heads (024°). */
export const ROUTE = [
  [49.1626, -2.2002],
  [49.163868, -2.143751],
  [49.166290, -2.122589],
  [49.168942, -2.120951],
  [49.17725, -2.11529],
];

/* Where noirmont-transit hands over. It runs its own 0..1 over the first `endAt` of the old 0..1 (3 Oct 2026, Simon: "end noirmont beat at
   the point where it is currently p80%"), and the shared route index at that point is idx = 1 + endAt*(N_IDX-1) = 4.2 with the preamble
   point counted: i.e. 20% of the way along the last leg (ROUTE[3] -> ROUTE[4]), clear of the corner fillet at ROUTE[3] (its window ends at
   idx ≈ 4.12), so the hull is on the straight leg at the leg's own bearing. */
/* 23 Oct 2026, Simon: "start the zoom in as we pass East Rock and land on the 022 degree heading". The handover moves back from leg 3 (ROUTE[3] -> ROUTE[4], 24 degrees) to leg 2 (ROUTE[2] -> ROUTE[3]), which is the 022 degree Small Road leg:
   East Rock gate is ROUTE[2], and 25% along that leg is clear of the corner fillet at ROUTE[2] (its window ends at idx ≈ 3.12). idx = 3.25, so endAt = (idx - 1) / 4 = 0.5625. noirmont's track in index.html goes from 1280vh to 900vh (1600 * 0.5625)
   so its scroll speed is unchanged; the St Helier approach now begins about 0.3 nm earlier on the same route. */
export const NOIRMONT_END = {
  endAt: 0.5625,
  legFrom: 2,              // ROUTE index the final leg starts at
  legFraction: 0.25,       // fraction of that leg already travelled when noirmont stops
  // on-screen placement noirmont holds at that moment (its own defaults: shipX / shipEase, ship drifts left across the beat)
  shipX: [0.5, 0.42],
  shipEase: 0.15,
};

/* The bearing (degrees true) and position at the end of noirmont-transit. */
export function noirmontEndPose() {
  const a = ROUTE[NOIRMONT_END.legFrom], b = ROUTE[NOIRMONT_END.legFrom + 1], t = NOIRMONT_END.legFraction;
  const lat = a[0] + (b[0] - a[0]) * t, lng = a[1] + (b[1] - a[1]) * t, cosLat = Math.cos(a[0] * Math.PI / 180);
  const headingDeg = ((Math.atan2((b[1] - a[1]) * cosLat, b[0] - a[0]) * 180 / Math.PI) + 360) % 360;
  return { lat, lng, headingDeg };
}
