/* _beats/_shared/zoom-score.js — a beat declares its wide/close zoom keyframes, not its own lerp/smooth chain.
   29 Sep 2026: the seaway-wake -> noirmont-transit -> small-roads -> harbour-approach arc needs a repeating
   wide/close/wide/close rhythm; every beat until now hand-rolled its own scale curve (noirmont-transit's own
   "hold wide then zoom in for the match-cut" fix was one bespoke lerp chain). One helper instead. */
import { clamp01, lerp, smooth } from '../runtime/stage.js';

// keyframes: [{p, scale}, ...] sorted ascending by p. Holds the first/last scale flat outside the given range,
// eases between whichever two bracket p using the same smooth() curve every beat already imports.
export function scoreAt(p, keyframes) {
  const n = keyframes.length;
  if (n === 0) return 1;
  if (n === 1 || p <= keyframes[0].p) return keyframes[0].scale;
  if (p >= keyframes[n - 1].p) return keyframes[n - 1].scale;
  let i = 0;
  while (i < n - 2 && p > keyframes[i + 1].p) i++;
  const a = keyframes[i], b = keyframes[i + 1];
  return lerp(a.scale, b.scale, smooth(a.p, b.p, clamp01(p)));
}
