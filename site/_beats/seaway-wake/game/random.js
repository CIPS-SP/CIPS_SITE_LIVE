// Versioned deterministic streams. Never share gameplay and presentation consumers.
export const RNG_VERSION = 'mulberry32-fnv1a-v2';
export function hashSeed(value) {
  let h = 2166136261 >>> 0;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function createReplayRandom(seed = 'BHI-01', variation = 0) {
  let state = hashSeed(seed), draws = 0;
  const v = Math.max(0, Math.min(1, Number(variation) || 0));
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0; draws++;
    let t = state; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: String(seed), variation: v, next,
    range: (a,b) => a + (b-a)*next(),
    chance: p => next() < Math.max(0,Math.min(1,p)),
    signed: m => (next()*2-1)*m*v,
    fork: name => createReplayRandom(`${seed}/${name}`, v),
    snapshot: () => ({version: RNG_VERSION, state, draws}),
  };
}
export function createStreams(seed, variation=0) {
  const root=createReplayRandom(seed,variation);
  return {gameplay:root.fork('gameplay'),schedule:root.fork('schedule'),fx:root.fork('fx'),audio:root.fork('audio'),decor:root.fork('decor')};
}
