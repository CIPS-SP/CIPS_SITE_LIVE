// The twin-screw handling model (3 degrees of freedom: surge, sway, yaw) of a ~50 m twin-engine yacht: two engines on independent levers, two rudders behind the propellers, bow and stern thrusters that lose
// their force with speed. Moved here from tools/site-directions/twin-screw-lab.mjs on 30 Oct 2026 so the berthing game and the lab run the SAME model (the lab imports it and prints the checks).
// Units: metres, seconds, newtons, radians; x east, y north, psi clockwise from north; u surge (forward), v sway (to starboard), r yaw rate (to starboard), all through the water. The research and sources are in DOCS/HANDLING-twin-screw.md;
// every number is an estimate for a yacht of this size, marked "assumed", and is a dial.

export const P = {
  L: 50, B: 9.5, draft: 2.6, mass: 6.0e5,                 // metres, tonnes -> kg (a 50 m motor yacht, about 600 t)  [assumed]
  addX: 1.05, addY: 1.5, kyy: 0.25,                         // added-mass factors (surge, sway) and the radius of gyration as a fraction of L  [assumed, textbook ranges]
  shaft: 2.2,                                               // each shaft this far off the centreline (m)  [assumed: about 0.45 B]
  Tmax: 100e3, astern: 0.65, Vmax: 7.7,                     // static thrust per engine (N); astern thrust as a fraction of ahead at the same lever (fixed-pitch rule of thumb); top speed 15 kn  [assumed]
  tauUp: 1.8, tauRev: 3.2,                                  // propeller speed follows the lever: seconds to follow, and seconds when a shaft has to be reversed (clutch and gear)  [assumed]
  rudA: 0.4, rudCLa: 2.6, rudStall: 0.5, rudRate: 2.3, rudMax: 35, rudX: -0.46, kSlip: 0.5, propD: 1.2,   // two rudders, 1.4 m2 each, lift slope per rad, stall at ~29 deg, 2.3 deg/s (SOLAS: 35 to 30 the other way in 28 s), aft, how much of the slipstream the rudder sees
  thB: 20e3, thS: 15e3, thBx: 0.42, thSx: -0.40, thTau: 1.0, thU0: 1.8, thK: 1.6,   // bow and stern thruster side force (N), where they sit, response, and the speed (m/s) at which they have half their force
  sternMult: 15,                                            // the hull resists going astern about 15 times as much as ahead (30 Oct 2026: held at full astern the yacht had reached 19 knots backwards): a top speed astern of about 6 knots  [assumed]
  kTurn: 1.2,                                               // extra hull resistance in a turn  [calibrated]
  cyq: 0, cyl: 0, cnq: 0, cnl: 0,                           // hull damping: set below by calibrate()
};
P.cyq = 0.5 * 1025 * 1.0 * P.L * P.draft * 0.6;             // cross-flow drag on the hull in sway (quadratic)
P.cnq = 0.5 * 1025 * 1.0 * P.draft * (P.L / 2) ** 4 / 2 * 0.6 * 0.15;   // and in yaw (quadratic; a yacht's fine ends make this far less than a flat plate)  [calibrated: spin of ~2.5 deg/s at +-0.5 levers]
P.cyl = 1.5e5; P.cnl = 1.0e6;                               // speed-dependent linear damping (what gives a ship her directional stability and her turning circle)  [calibrated, see calibrate()]
export const rho = 1025, KN = 0.5144;
export const cR = () => { const Vp = 1.35 * P.Vmax, T = 2 * P.Tmax * (1 - P.Vmax / Vp); return T / P.Vmax ** 2; };

export function newState() { return { x: 0, y: 0, psi: 0, u: 0, v: 0, r: 0, np: 0, ns: 0, rud: 0, thb: 0, ths: 0, t: 0 }; }
export function step(s, c, dt, wind = null) {   // c: { lp, ls (engine levers -1..1), rud (deg, +stbd), bow, stern (-1..1, + = to starboard) }
  const Vp = 1.35 * P.Vmax, I = P.mass * (P.kyy * P.L) ** 2 * 1.3, mx = P.mass * P.addX, my = P.mass * P.addY;
  const lag = (n, lev) => { const rev = n * lev < -1e-3 || (Math.abs(lev) < 0.05 && Math.abs(n) > 0.05 && false); const tau = (Math.sign(n) !== Math.sign(lev) && Math.abs(n) > 0.05 && Math.abs(lev) > 0.02) ? P.tauRev : P.tauUp; return n + (lev - n) * Math.min(1, dt / tau); };
  s.np = lag(s.np, c.lp); s.ns = lag(s.ns, c.ls);
  const thrust = n => n >= 0 ? P.Tmax * n * n * Math.max(0.05, 1 - Math.max(0, s.u) / Vp) : -P.Tmax * P.astern * n * n;
  const Tp = thrust(s.np), Ts = thrust(s.ns);
  const dr = Math.max(-1, Math.min(1, (c.rud - s.rud) / (P.rudRate * dt + 1e-9))) * P.rudRate * dt; s.rud = Math.max(-P.rudMax, Math.min(P.rudMax, s.rud + dr));
  const del = s.rud * Math.PI / 180, ad = Math.PI / 4 * P.propD ** 2;
  const slip = T => { if (T <= 0) return Math.abs(s.u); const vs = Math.sqrt(s.u * s.u + 2 * T / (rho * ad)); return Math.abs(s.u) + P.kSlip * (vs - Math.abs(s.u)); };   // ahead thrust speeds up the water over the rudder; astern or stopped: only the ship's own way
  const Ur = [slip(Tp), slip(Ts)], clamp = (v, a, b) => Math.max(a, Math.min(b, v)), CL = P.rudCLa * clamp(del, -P.rudStall, P.rudStall) * (s.u < -0.05 ? -1 : 1);
  const FN = Ur.reduce((a, U) => a + 0.5 * rho * P.rudA * CL * U * U, 0);          // rudders to starboard push the stern to port
  s.thb += (c.bow - s.thb) * Math.min(1, dt / P.thTau); s.ths += (c.stern - s.ths) * Math.min(1, dt / P.thTau);
  const fth = 1 / (1 + (Math.abs(s.u) / P.thU0) ** P.thK), Yb = P.thB * s.thb * fth, Ys = P.thS * s.ths * fth;
  let X = Tp + Ts - cR() * (s.u < 0 ? P.sternMult : 1) * s.u * Math.abs(s.u) * (1 + P.kTurn * Math.abs(s.r) * P.L / Math.max(Math.abs(s.u), 1.5));   // a ship turning hard loses speed: the hull is dragged across the water (kTurn sets how much: about a third of her speed in a hard turn)
  let Y = -FN - P.cyq * s.v * Math.abs(s.v) - P.cyl * Math.abs(s.u) * s.v + Yb + Ys, N = (Tp - Ts) * P.shaft + P.rudX * P.L * -FN * -1 * -1 - P.cnq * s.r * Math.abs(s.r) - P.cnl * Math.abs(s.u) * s.r + Yb * P.thBx * P.L + Ys * P.thSx * P.L;
  N = (Tp - Ts) * P.shaft + (-P.rudX * P.L) * FN - P.cnq * s.r * Math.abs(s.r) - P.cnl * Math.abs(s.u) * s.r + Yb * P.thBx * P.L + Ys * P.thSx * P.L - 0.4 * P.cnl * Math.abs(s.r) * 0;
  if (wind) { Y += wind.Y; N += wind.N; X += wind.X || 0; }   // wind: forces on the hull in her own axes (the berthing game computes them from the wind and her heading)
  const du = (X + my * s.v * s.r) / mx, dv = (Y - mx * s.u * s.r) / my, dr_ = N / I;
  s.u += du * dt; s.v += dv * dt; s.r += dr_ * dt;
  s.psi += s.r * dt; s.x += (s.u * Math.sin(s.psi) + s.v * Math.cos(s.psi)) * dt; s.y += (s.u * Math.cos(s.psi) - s.v * Math.sin(s.psi)) * dt; s.t += dt;
  return s;
}
