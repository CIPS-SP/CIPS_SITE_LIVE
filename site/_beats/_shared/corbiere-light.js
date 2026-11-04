/* _beats/_shared/corbiere-light.js — the real La Corbière navigational sector-light math: which sector she's in,
   the conic-gradient sector-wash string, and the Iso 10s on/off timing. Extracted 30 Sep 2026, plan
   `shimmying-seeking-goose.md`'s addendum — game.js's own sectorGradient() was already byte-identical to
   seaway-wake/beat.js's own copy, and the two files' own sector-index lookups (game.js's corbiereSector() +
   a separate mineIdx re-lookup, beat.js's corbiereSectorIndexAt()) were two independent loops over the same
   GEO.corbiere.sectors data that could silently diverge. This is the one implementation of all three; the DOM
   placement/screen-projection around it stays in each file, since game.js's flat 2D plan view and a scroll
   beat's real 3D perspective camera are genuinely different, not drift. */
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

export const SECT_W = '255,246,215', SECT_R = '255,70,60';

// the conic-gradient background string for the sector wash on the sea. `only`: a sector index to draw alone
// (used for the `.mine` layer — the sector she's actually in, flared brighter — with every other sector's alpha
// zeroed), omitted/null draws every sector at its own alpha (the base `.sectors` wash).
export function sectorGradient(sectors, alphaW, alphaR, only) {
  const stops = [];
  sectors.forEach(([a, b, c], i) => { const col = c === 'R' ? SECT_R : SECT_W, al = c === 'R' ? alphaR : alphaW; const A = only != null && only !== i ? 0 : al;
    if (a < b) stops.push(`rgba(${col},${A}) ${a}deg ${b}deg`); else { stops.push(`rgba(${col},${A}) ${a}deg 360deg`); stops.unshift(`rgba(${col},${A}) 0deg ${b}deg`); } });
  return `conic-gradient(from 0deg at 50% 50%, ${stops.join(', ')})`;
}

// which of GEO.corbiere.sectors she's in, given the bearing FROM the light to her (i.e. the reciprocal of her
// own bearing to it) — returns both the index (for the `.mine` sector-wash flare) and the colour ('W'|'R', the
// real navigational fact of which side of the leading line she's on), one loop instead of two.
export function sectorAt(sectors, brgFromLight) {
  for (let i = 0; i < sectors.length; i++) { const [a, b, c] = sectors[i]; if (a < b ? (brgFromLight >= a && brgFromLight < b) : (brgFromLight >= a || brgFromLight < b)) return { index: i, colour: c }; }
  return { index: 0, colour: sectors[0] ? sectors[0][2] : 'W' };
}

// Iso 10s: on for the first ~35% of half the period, off for the back half either side — game.js's own formula
// hardcoded these breakpoints for its period=10 (4.65/5); this is the same formula generalised to any period,
// verified to reduce to game.js's exact original constants at period=10 before landing (half-0.35=4.65, half=5).
export function isoPhase(t, period) {
  const half = period / 2, ph = t % period;
  return smooth(0, 0.35, ph) * (1 - smooth(half - 0.35, half, ph));
}
