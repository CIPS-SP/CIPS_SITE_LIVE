/* _beats/_shared/nav-light.js — a general approximation of real IALA light-character blink timing (F, Fl,
   Fl(n), Q, VQ, Oc, Iso), for navigational marks that aren't Corbière itself (see corbiere-light.js for that
   light's own real Iso 10s + W/R sector timing, which stays as its own thing). Reads straight off the real OSM
   seamark tags (light:character, light:group, light:period) in seaway-wake/assets/game/seamarks.json — not a
   precise reproduction of the Admiralty List of Lights' own decisecond timing tables, which this project has no
   source for, but directionally correct and visually distinct between characters: F stays lit, Iso is equal
   on/off, Oc stays lit with brief dark eclipses, Fl/Q/VQ stay dark with brief bright flashes (grouped per
   light:group, faster for Q/VQ which usually carry no period field of their own in the data — real IALA rates
   used for those instead of a guess). */
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

export function isoPhase(t, period) {
  const half = period / 2, ph = t % period;
  return smooth(0, 0.35, ph) * (1 - smooth(half - 0.35, half, ph));
}

// 0..1 brightness for a mark at time t, from its own real light:character/group/period tags.
export function lightPhase(t, mark) {
  const ch = mark['light:character'];
  if (!ch || ch === 'F') return 1;
  const period = parseFloat(mark['light:period']) || (ch === 'VQ' ? 0.5 : ch === 'Q' ? 1.0 : 4);
  if (ch === 'Iso') return isoPhase(t, period);
  const group = parseInt(mark['light:group']) || 1;
  const ph = t % period;
  if (ch === 'Oc') {   // occulting: lit most of the time, with `group` brief dark eclipses
    const eclipseDur = Math.min(0.35, period * 0.08), gapDur = eclipseDur * 1.2;
    const groupSpan = group * (eclipseDur + gapDur);
    if (ph >= groupSpan) return 1;
    return (ph % (eclipseDur + gapDur)) < eclipseDur ? 0 : 1;
  }
  // Fl / Fl(n) / Q / VQ: dark most of the time, `group` brief bright flashes near the start of each period
  const flashDur = Math.min(0.35, period * 0.18), gapDur = flashDur * 0.9;
  const groupSpan = group * (flashDur + gapDur);
  if (ph >= groupSpan) return 0;
  return (ph % (flashDur + gapDur)) < flashDur ? 1 : 0;
}
