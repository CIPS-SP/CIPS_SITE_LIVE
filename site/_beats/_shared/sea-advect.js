/* The sea moves WITH the ground (15 Oct 2026, Simon: "the land is plonked on top of the sea... it's like the sea and the land move around the yacht").
   The ocean shader's swell/foam/normal-map pattern was pinned to the SCREEN (uPan = the camera's aim), so while the satellite plates and marks slid past under the hull, the sea
   texture stayed put and only drifted astern at a fixed rate. Here the pattern is tied to the ground instead: each beat registers how its ship moves over the ground (position and the
   scale the ground is drawn at, both functions of the beat's own progress p), and the beat subtracts at(p) from uPan, so the waves slide past the hull at exactly the speed the land
   does, and stop when it stops.
   Pure function of p (a table integrated once, linear interpolation), NOT a running total: the stage updates the active beat AND the one beneath it every frame, so a shared running
   total made two beats pull it back and forth and the sea flickered (the 15 Oct bug). Each beat's table starts where the previous beat's ends (`after`), so the pattern carries
   over the seams (seaway-wake -> noirmont-transit -> st-helier-approach). */
const M_LAT = 111320, reg = {};
function build(name) {
  const e = reg[name]; if (!e) return null; if (e.built) return e.built;
  const { after, pMax = 1, posAt, perMetreAt, steps = 700 } = e.spec;
  const prev = after ? build(after) : null; let x = prev ? prev.total[0] : 0, z = prev ? prev.total[1] : 0;
  const X = new Float32Array(steps + 1), Z = new Float32Array(steps + 1); let last = posAt(0); X[0] = x; Z[0] = z;
  for (let i = 1; i <= steps; i++) {
    const p = pMax * i / steps, ll = posAt(p), k = perMetreAt(pMax * (i - 0.5) / steps);
    x += (ll[0] - last[0]) * M_LAT * k; z += (ll[1] - last[1]) * M_LAT * Math.cos(ll[0] * Math.PI / 180) * k; last = ll; X[i] = x; Z[i] = z;
  }
  return (e.built = { X, Z, steps, pMax, total: [x, z] });
}
export function registerSea(name, spec) {   // spec: { after?, pMax?, posAt(p) -> [lat,lng], perMetreAt(p) -> world units per metre of ground }
  reg[name] = { spec, built: null };
  return { at(p) { const t = build(name); const f = Math.max(0, Math.min(1, p / t.pMax)) * t.steps, i = Math.min(t.steps - 1, Math.floor(f)), u = f - i; return [t.X[i] + (t.X[i + 1] - t.X[i]) * u, t.Z[i] + (t.Z[i + 1] - t.Z[i]) * u]; } };
}
