/* _beats/_shared/coast-plate.js — the real Esri/OSM satellite coastline plate: one mesh builder, shared between
   game.js (the interactive steering game) and any scroll beat. Extracted 30 Sep 2026, plan
   `shimmying-seeking-goose.md`'s addendum: game.js's own coastMesh() and seaway-wake/beat.js's own
   addCoastPlate() were already ~95% identical (same TextureLoader/PlaneGeometry/MeshBasicMaterial setup) —
   two copies that could silently diverge, not two genuinely different things. This is the one implementation.
   Placement is NOT shared: game.js's default view is bow-up (the current leg bearing is screen-up, so a plate's
   position AND rotation both change every frame as she turns) via a flat 2D world; a scroll beat drives a real
   three.js perspective camera, fixed north-up (matching the game's own NORTH_UP default), so only a plate's
   position changes and its rotation is a constant set once. Those are genuinely different conventions, not
   drift — this file gives each its own small placement function, both operating on the same plate object this
   file's own builder returns. */
import * as THREE from 'three';

/* Land grade (16-20 Oct 2026, Simon: the tilt-shift look; "bring the greens back ever so slightly", "add the shoreline glow we had in papercut relief", "make the browns a bit richer and more
   visible, especially around the cliffs, coasts"): the satellite land is graded in the plate's own fragment shader.
     - richer colour and a little contrast everywhere
     - wherever the photograph is green (fields, woods, parks) the colour is pulled toward a fresh bright green, keeping the picture's own light and shade
     - earth tones (bare ground, rock, cliff, dark scrub that reads brown or grey) are pulled toward a rich warm brown, and the land's own edge (the coast, the cliff line, the quay edge) gets a
       band of that brown, so coasts and cliffs read clearly
     - a soft shoreline glow in the water just off the land: pale turquoise, brightest at the edge and fading out over ~15 m (no waves, no animation: the glow of the papercut sheets).
   It needs no extra texture: the plate's own alpha is read at three blurred scales (mip levels picked so they correspond to ~2.5, 7 and 16 m of ground) to say how close the land is.
   A plate whose edge is feathered to cross-fade into the next one (the SW plate's east and north, the first bay chunks' west) passes `feather: [W, E, N, S]` in pixels: the glow and the coast band fade out over that margin.
   Land pixels keep their own alpha; switch the whole thing off per plate with { grade: false }. */
const GRADE_HEAD = `
uniform float uGradeMPP;
uniform vec4 uFeather;   // feathered plate edges (W, E, N, S) as a fraction of the plate: the cross-fade into the next plate is not a coastline
`;
const GRADE_GLSL = `
  { float landA = diffuseColor.a;
    float cE = textureLod( map, vMapUv, log2(max(1.0, 5.0 / uGradeMPP)) ).a;      // land coverage within ~5 m: ~0.5 right at the coast, 1.0 well inland
    float c1 = textureLod( map, vMapUv, log2(max(1.0, 2.5 / uGradeMPP)) ).a;
    float c2 = textureLod( map, vMapUv, log2(max(1.0, 7.0 / uGradeMPP)) ).a;
    float c3 = textureLod( map, vMapUv, log2(max(1.0, 16.0 / uGradeMPP)) ).a;
    vec3 s = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
    float L = dot(s, vec3(0.30, 0.59, 0.11));
    s = vec3(L) + (s - vec3(L)) * 1.18;
    float veg = smoothstep(0.012, 0.075, s.g - (s.r + s.b) * 0.5);
    vec3 fresh = vec3(0.45, 0.78, 0.24) * (0.56 + 0.90 * L);
    s = mix(s, fresh, veg * 0.46);
    float warm = smoothstep(0.004, 0.06, s.r - s.b);
    float dark = 1.0 - smoothstep(0.16, 0.42, L);
    float earthW = clamp(max(warm * 0.75, dark * 0.55) * (1.0 - veg * 0.7), 0.0, 1.0);
    vec3 earth = vec3(0.66, 0.40, 0.20) * (0.50 + 0.95 * L) + vec3(0.04, 0.02, 0.0);
    s = mix(s, earth, earthW * 0.50);
    float edgeOK = 1.0;
    if (uFeather.x > 0.0) edgeOK *= smoothstep(uFeather.x * 0.4, uFeather.x * 1.1, vMapUv.x);
    if (uFeather.y > 0.0) edgeOK *= smoothstep(uFeather.y * 0.4, uFeather.y * 1.1, 1.0 - vMapUv.x);
    if (uFeather.z > 0.0) edgeOK *= smoothstep(uFeather.z * 0.4, uFeather.z * 1.1, 1.0 - vMapUv.y);
    if (uFeather.w > 0.0) edgeOK *= smoothstep(uFeather.w * 0.4, uFeather.w * 1.1, vMapUv.y);
    float coastW = clamp(landA * (1.0 - smoothstep(0.52, 0.97, cE)) * 1.6, 0.0, 1.0) * edgeOK;
    s = mix(s, vec3(0.60, 0.38, 0.21) * (0.55 + 0.9 * L), coastW * 0.55);
    s = (s - 0.5) * 1.05 + 0.5;
    vec3 land = pow(clamp(s, 0.0, 1.0), vec3(2.2));
    float shallow = smoothstep(0.015, 0.35, c3) * 0.45 + smoothstep(0.02, 0.40, c2) * 0.55;
    float glowA = clamp(shallow * 0.52 + smoothstep(0.1, 0.6, c1) * 0.10, 0.0, 0.55) * edgeOK;
    vec3 glow = mix(vec3(0.015, 0.30, 0.34), vec3(0.07, 0.56, 0.58), shallow);   // teal / turquoise, not white (20 Oct: the first version was way too white)
    float outA = landA + (1.0 - landA) * glowA;
    diffuseColor.rgb = (land * landA + glow * glowA * (1.0 - landA)) / max(outA, 0.0001);
    diffuseColor.a = outA; }
`;
export const SW_PLATE_FEATHER = [0, 230, 230, 0];   // sw-plate.webp fades out over its last ~230 px to the east and north (~360 m)
export function createCoastPlate(scene, renderer, { src, wPx, hPx, mPerPx, mPerUnit, bounds, order, scale = 1, grade = true, feather = null }) {
  // 3 Oct 2026: initTexture uploads to the GPU as soon as the image arrives, instead of at the first frame the plate is visible
  // (a multi-MB upload landing mid-scroll is a visible hitch when a beat first reveals a plate)
  const tex = new THREE.TextureLoader().load(src, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); try { renderer.initTexture?.(t); } catch (_) {} });
  const geo = new THREE.PlaneGeometry(wPx * mPerPx / mPerUnit * scale, hPx * mPerPx / mPerUnit * scale);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.97 });   // always over the sea: no z-fight at range
  if (grade) { mat.onBeforeCompile = shader => { shader.uniforms.uGradeMPP = { value: mPerPx }; const f = feather || [0, 0, 0, 0]; shader.uniforms.uFeather = { value: new THREE.Vector4(f[0] / wPx, f[1] / wPx, f[2] / hPx, f[3] / hPx) }; const nl = String.fromCharCode(10); shader.fragmentShader = shader.fragmentShader.replace('void main() {', GRADE_HEAD + 'void main() {').replace('#include <map_fragment>', '#include <map_fragment>' + nl + GRADE_GLSL); }; mat.customProgramCacheKey = () => 'coast-grade-5'; }
  const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.rotation.order = 'YXZ'; scene.add(m);
  const centre = [(bounds.north + bounds.south) / 2, (bounds.west + bounds.east) / 2];   // the plate's geographic centre (Mercator: near enough over 10 km)
  return { m, centre };
}

// game.js's own convention: bow-up — the current leg bearing is screen-up, so a plate's position AND rotation
// both change every frame as she turns onto a new leg. `geo` is {gDist,gBearing,DEG,nmPerUnit} — the caller's
// own real-geography helpers, passed through rather than duplicated here.
export function placeCoastPlateBowUp(plate, meGeo, brg, geo) {
  const nm = geo.gDist(meGeo, plate.centre), rel = (geo.gBearing(meGeo, plate.centre) - brg) * geo.DEG, r = nm / geo.nmPerUnit;
  plate.m.position.set(-Math.sin(rel) * r, 0.3, Math.cos(rel) * r);           // starboard = −X, ahead = +Z
  plate.m.rotation.set(-Math.PI / 2, (brg + 180) * geo.DEG, 0, 'YXZ');        // laid flat, north (texture up) turned to its true direction in the bow-up frame
}

// a scroll beat's own convention: fixed north-up (matches the game's own NORTH_UP default view), so only a
// plate's position changes frame to frame — its rotation is a fixed constant, set once at creation and never
// touched again. `worldOffsetTo(pp, latlng)` is the beat's own real-bearing-to-world-XZ helper.
export function placeCoastPlateNorthUp(plate, pp, worldOffsetTo) {
  const [x, z] = worldOffsetTo(pp, plate.centre);
  plate.m.position.set(x, 0.3, z);
}
