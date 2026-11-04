/**
 * Geographic background water for the existing bow-relative simulation.
 *
 * Only the sea's BACKGROUND sampling and its lighting frame change. The shared
 * beat, hull simulation, camera, geography and local GPU wake are not modified.
 * A fixed reference bearing preserves the opening's existing texture orientation.
 * No camera coordinate, travelled distance or pre-start drift enters this frame.
 */
const DEG = Math.PI / 180;
export const WATER_FRAME_VERSION = 'BHI-NORTH-UP-WATER-01';

/** Bow-relative sim +X = port; +Z = ahead. Geographic +E = east; +N = north. */
export function simToEarth(x, z, east, north, heading) {
  const h = heading * DEG, c = Math.cos(h), s = Math.sin(h);
  return [east - c*x + s*z, north + s*x + c*z];
}
export function earthToSim(e, n, east, north, heading) {
  const h = heading * DEG, c = Math.cos(h), s = Math.sin(h);
  const de=e-east, dn=n-north;
  return [-c*de+s*dn, s*de+c*dn];
}
export function earthToReference(east, north, referenceHeading) {
  const h=referenceHeading*DEG, c=Math.cos(h), s=Math.sin(h);
  return [-c*east+s*north, s*east+c*north];
}
export function backgroundSample(x,z,east,north,heading,referenceHeading) {
  const [e,n]=simToEarth(x,z,east,north,heading);
  return earthToReference(e,n,referenceHeading);
}
/** Plane tangent coordinates are (sim.x, -sim.z). Rotate background normals only. */
export function referenceNormalToPlane(nx,ny,heading,referenceHeading) {
  const h=(heading-referenceHeading)*DEG, c=Math.cos(h),s=Math.sin(h);
  return [c*nx-s*ny, s*nx+c*ny];
}
function replaceOnce(source, needle, replacement, label) {
  const at=source.indexOf(needle);
  if(at<0 || source.indexOf(needle,at+needle.length)>=0) {
    throw new Error(`Water frame adapter: shared shader changed at ${label}. Refusing a partial patch.`);
  }
  return source.slice(0,at)+replacement+source.slice(at+needle.length);
}
const COMMON = /* glsl */`
uniform vec2 uGeoRotation; // cos,sin of heading minus fixed reference heading
uniform vec2 uGeoOffset;   // vessel E/N translated into the FIXED reference frame
uniform vec2 uGeoReference; // cos,sin of fixed reference bearing
uniform float uGeoTime;
uniform float uGeoGrid;
vec2 bhiRotate(vec2 p) {
  return vec2(uGeoRotation.x*p.x-uGeoRotation.y*p.y,
              uGeoRotation.y*p.x+uGeoRotation.x*p.y);
}
vec2 bhiWaterPoint(vec2 p) { return bhiRotate(p)+uGeoOffset; }
vec2 bhiReferenceToEarth(vec2 p) {
  return vec2(-uGeoReference.x*p.x+uGeoReference.y*p.y,
               uGeoReference.y*p.x+uGeoReference.x*p.y);
}
`;

/** Apply AFTER the beat's own onBeforeCompile; explicit source anchors fail closed. */
export function patchWaterShaders(shader) {
  let v=shader.vertexShader, f=shader.fragmentShader;
  v=replaceOnce(v,
    'float fx=position.x-uPan.x; float fy=position.y+uPan.y-uTime*uFlow;',
    'vec2 geoWater=bhiWaterPoint(vOceanWorldPosition.xz); float fx=geoWater.x; float fy=-geoWater.y;', 'ambient coordinates');
  v=replaceOnce(v,'uTime*0.5*uOceanSpeed','uGeoTime*0.5*uOceanSpeed','swell clock 1');
  v=replaceOnce(v,'uTime*1.0*uOceanSpeed','uGeoTime*1.0*uOceanSpeed','swell clock 2');
  v=replaceOnce(v,'transformed.z+=elevation+wakeHeight;',
    'transformed.z+=(uGeoGrid>0.5 ? 0.0 : elevation+wakeHeight);', 'diagnostic flat plane');
  f=replaceOnce(f,
    'float fluid=snoise(vec3((vOceanWorldPosition.xz-uPan)*0.01*NOISE_SCALE,uTime*0.5));',
    'float fluid=snoise(vec3(bhiWaterPoint(vOceanWorldPosition.xz)*0.01*NOISE_SCALE,uGeoTime*0.5));', 'background colour');
  f=replaceOnce(f,
    'vec2 wp=vOceanWorldPosition.xz-uPan; wp.y+=uTime*uFlow;',
    'vec2 wp=bhiWaterPoint(vOceanWorldPosition.xz); off=bhiRotate(off);', 'normal texture coordinates');
  for(const [a,b] of [
    ['vec2(uTime*0.004,0.0)','vec2(uGeoTime*0.004,0.0)'],
    ['vec2(0.0,uTime*0.002)','vec2(0.0,uGeoTime*0.002)'],
    ['vec2(-uTime*0.006,0.0)','vec2(-uGeoTime*0.006,0.0)'],
  ]) f=replaceOnce(f,a,b,`ripple clock ${a}`);
  f=replaceOnce(f,
    'vec3 on=vec3(m1.xy+m2.xy+m3.xy,1.0);',
    'vec3 on=vec3(bhiRotate(m1.xy+m2.xy+m3.xy),1.0);', 'background tangent normals');
  // Debug-only: a frozen east/north checkerboard replaces WATER output. Land is
  // still rendered normally, above it. No map, control, physics or gameplay change.
  f=replaceOnce(f,'#include <opaque_fragment>',/* glsl */`
    if(uGeoGrid>0.5) {
      vec2 en=bhiReferenceToEarth(bhiWaterPoint(vOceanWorldPosition.xz));
      vec2 cells=en/10.0;
      vec2 aa=max(fwidth(cells),vec2(0.0001));
      vec2 edges=abs(fract(cells+0.5)-0.5)/aa;
      float grid=1.0-clamp(min(edges.x,edges.y),0.0,1.0);
      float checker=mod(floor(cells.x)+floor(cells.y),2.0);
      vec3 gridColour=mix(vec3(0.020,0.20,0.22),vec3(0.028,0.26,0.27),checker);
      gl_FragColor=vec4(mix(gridColour,vec3(0.72,0.88,0.86),grid*0.65),1.0);
      return;
    }
    #include <opaque_fragment>
  `,'diagnostic output');
  shader.vertexShader=COMMON+v;
  shader.fragmentShader=COMMON+f;
  return shader;
}

/** Install a private adapter on this game material, never on the shared beat. */
export function installWaterFrame(mat, {referenceHeading, sun=null, grid=false, frozen=false}={}) {
  if(!Number.isFinite(referenceHeading)) throw new TypeError('A finite reference heading is required');
  const uniforms={
    uGeoRotation:{value:[1,0]},uGeoOffset:{value:[0,0]},
    uGeoReference:{value:[Math.cos(referenceHeading*DEG),Math.sin(referenceHeading*DEG)]},
    uGeoTime:{value:0},uGeoGrid:{value:grid?1:0}
  };
  const previousCompile=mat.onBeforeCompile;
  const previousCacheKey=mat.customProgramCacheKey?.bind(mat);
  const cacheKey=previousCacheKey ? previousCacheKey() : '';
  mat.onBeforeCompile=function(shader, renderer) {
    previousCompile.call(this,shader,renderer);
    patchWaterShaders(shader);
    Object.assign(shader.uniforms,uniforms);
  };
  mat.customProgramCacheKey=()=>cacheKey+'|'+WATER_FRAME_VERSION;
  mat.needsUpdate=true;
  const light0=sun ? {x:sun.position.x,y:sun.position.y,z:sun.position.z} : null;
  const env0=mat.envMapRotation?.y||0;
  let current={east:0,north:0,heading:referenceHeading,time:0};
  return {
    uniforms,
    update(east,north,heading,time) {
      if(![east,north,heading,time].every(Number.isFinite)) throw new TypeError('Non-finite geographic water pose');
      const d=(heading-referenceHeading)*DEG, c=Math.cos(d),s=Math.sin(d);
      const q=earthToReference(east,north,referenceHeading);
      uniforms.uGeoRotation.value[0]=c;uniforms.uGeoRotation.value[1]=s;
      uniforms.uGeoOffset.value[0]=q[0];uniforms.uGeoOffset.value[1]=q[1];
      uniforms.uGeoTime.value=frozen?0:time;
      // Sun and environment are world-fixed too, not mounted to Kinship's bow.
      if(sun) sun.position.set(c*light0.x+s*light0.z,light0.y,-s*light0.x+c*light0.z);
      // Three r165 applies the inverse Euler to a PMREM sampling direction.
      // +d Euler yields the same x/z reference rotation used by bhiRotate.
      if(mat.envMapRotation) mat.envMapRotation.y=env0+d;
      current={east,north,heading,time};
    },
    inspect(){return {...current,referenceHeading,grid,frozen,version:WATER_FRAME_VERSION};}
  };
}
