// 25 Sep 2026, Simon: replaces the old "stopped dead, <=2kn" gate — the anchorage is gone from this game
// entirely (see WORKING-NOW.md), and pilot boarding is now the arrival climax itself. She comes alongside
// making way, matching the pilot's own hailed line ("Hold this course, hold seven knots"), not stopped —
// a band around 7kn, not a ceiling, plus a heading check she didn't have before. Howard's game rule either
// way, not a universal real-world pilot-transfer speed/heading window.
export const BOARDING_SPEED_MIN_KNOTS = 6;
export const BOARDING_SPEED_MAX_KNOTS = 8;
export const BOARDING_TARGET_KNOTS = 7;   // the single number the pilot actually says over VHF ("hold seven knots")
// 28 Sep 2026, Simon: "could we try something simpler, just like be within the pilot area, on a heading of 85 to
// 115 and maintain 6-8kn?" — was a ±15° window around whichever route leg's own bearing happened to be active
// (095° into the pilot boarding place, 110° out toward Le Fret Point, per the real Ports of Jersey directions —
// see geography-data.js), which needed a live lookup of the current leg to check at all. A fixed 85-115° window
// comfortably covers both those real bearings with margin either side, and drops the leg lookup entirely —
// simpler to state on the arrival notes, and simpler here.
export const BOARDING_HEADING_MIN_DEG = 85, BOARDING_HEADING_MAX_DEG = 115;
export const BOARDING_ZONE_UNITS = 36;
export function boardingSpeedSafe(knots) {
  return Number.isFinite(knots) && knots >= BOARDING_SPEED_MIN_KNOTS && knots <= BOARDING_SPEED_MAX_KNOTS;
}
export function boardingHeadingSafe(headingDeg) {
  return Number.isFinite(headingDeg) && headingDeg >= BOARDING_HEADING_MIN_DEG && headingDeg <= BOARDING_HEADING_MAX_DEG;
}
/* 25 Sep 2026, Simon (Phase 2): the actual transfer is hands-on now, ported from the tuned Chapter 1 prototype
   (_beats/tools/proto/pilot-boarding.html) rather than a fixed 2-second wait — the pilot paces the gunwale on a
   sine cycle, tap (or Space) when they're in the safe zone. Numbers below are that prototype's own tuned CFG,
   unchanged: it's already been iterated on and approved. Position is normalised to -1..1 (the prototype's
   walkRange in metres, factored out — only the shape of the cycle matters here, not a real distance). */
export const BOARDING_PACE_PERIOD_S = 3.6;      // seconds for one full there-and-back pace
export const BOARDING_SAFE_FRAC = 0.15;         // half-width of the safe zone, as a fraction of the pace's full swing
export const BOARDING_MISS_PENALTY_S = 2;
export const BOARDING_MISSES_FOR_AUTO = 3;      // after this many misses, the pilot boards themself next time they swing through the zone
export const BOARDING_TRANSFER_S = 2.2;         // 26 Sep 2026, Simon: "a bit slower — I couldn't actually see him transfer" (was 1)
// 28 Sep 2026, Simon: "the slider for pilot boarding should only appear AFTER the pilot boat is alongside" — the
// launch spends its first couple of seconds in 'boarding' phase still closing the gap (game.js's own
// smooth(0,BOARDING_CLOSE_S,pilot.t) lerp from the waiting distance to properly alongside); the tap game below
// now waits out the same span before it starts pacing, so the marker's cycle — and the UI showing it at all —
// begins exactly when the boat visibly arrives, not two seconds before.
export const BOARDING_CLOSE_S = 2;
export const BOARDING_HIT_FREEZE_S = 0.35;      // marker holds still after a hit, so the tap visibly lands
export const BOARDING_MISS_FREEZE_S = 2;        // marker holds still after a miss, so you can see exactly how far off you were

export function createBoardingState() {
  return {phase:'out',t:0,stable:0,boarded:false,onStation:false,boardingSpeed:null,
    paceT:0,freezeT:0,freezeDur:0,freezePos:0,tries:0,misses:0,autoArmed:false,boardedPending:false,pendingT:0,boardedBy:null};
}
// the pilot's position on the gunwale right now, -1 (aft) .. 1 (forward) — frozen at freezePos for a beat after any attempt
export function pacePosition(p) {
  return p.freezeT > 0 ? p.freezePos : Math.sin(2 * Math.PI * p.paceT / BOARDING_PACE_PERIOD_S);
}
export function inSafeZone(pos) { return Math.abs(pos) <= BOARDING_SAFE_FRAC; }
// call once per tap/Space press while phase is 'boarding'; returns 'hit', 'miss', or null if the attempt can't land
// right now (already mid-transfer, or the marker's still frozen from the last attempt)
export function attemptBoarding(p) {
  if (p.phase !== 'boarding' || p.t < BOARDING_CLOSE_S || p.freezeT > 0 || p.boardedPending) return null;
  p.tries++;
  const pos = pacePosition(p), hit = inSafeZone(pos);
  p.freezePos = pos; p.freezeDur = hit ? BOARDING_HIT_FREEZE_S : BOARDING_MISS_FREEZE_S; p.freezeT = p.freezeDur;
  if (hit) { p.boardedPending = true; p.pendingT = 0; p.boardedBy = 'player'; }
  else { p.misses++; if (p.misses >= BOARDING_MISSES_FOR_AUTO) p.autoArmed = true; }
  return hit ? 'hit' : 'miss';
}
// "let the pilot judge it": gives up on timing it yourself, same fallback as running out of tries
export function armAutoBoard(p) { if (p.phase === 'boarding' && !p.boardedPending) p.autoArmed = true; }
// No clock, randomness, scoring or DOM here beyond the pacing cycle itself (a pure function of p.paceT, same
// reasoning as the prototype). An unsafe speed/heading/clearance change aborts the transfer and the pacing
// resets with it; "aboard" cannot be emitted until either a timed tap lands or the pilot boards themself.
// "onStation" fires once when she first holds long enough for the transfer to begin — the achievement that
// replaced "anchored" (arrival-rules.js), awarded for getting into position, distinct from "pilot" (boarded).
// 26 Sep 2026, Simon: "if the user doesn't get the pilot on board by the time the whole vessel is clear of the pilot
// zone, that's when the pilot should judge it themselves" — clearOfZone is true once she's travelled a full zone-
// radius past the boarding waypoint (game.js), still unboarded; the pilot takes it out of the player's hands from
// either 'waiting' (never settled on course/speed) or 'boarding' (was trying, ran out of room) — same 'aboard'
// event the timed/3-miss paths already use, plus 'autoMissed' so the caller can say so distinctly.
export function advanceBoarding(p,{dt,speed,heading,withinStation=true,clear=true,hold=9,clearOfZone=false}) {
  if(!Number.isFinite(dt)||dt<0||dt>.1)throw new Error('Invalid boarding timestep');
  const events=[];p.t+=dt;
  const safe=boardingSpeedSafe(speed)&&boardingHeadingSafe(heading)&&withinStation&&clear;
  if(clearOfZone&&(p.phase==='waiting'||p.phase==='boarding')){
    p.phase='alongside';p.t=0;p.boarded=true;p.boardingSpeed=speed;p.boardedBy='auto';p.freezeT=0;p.boardedPending=false;
    events.push('aboard');events.push('autoMissed');
  }
  else if(p.phase==='out'&&p.t>=3.2){p.phase='waiting';p.t=0;p.stable=0;events.push('waiting');}
  else if(p.phase==='waiting'){
    p.stable=safe?p.stable+dt:0;
    if(p.stable>=1.25){p.phase='boarding';p.t=0;p.paceT=0;p.freezeT=0;p.tries=0;p.misses=0;p.autoArmed=false;p.boardedPending=false;p.onStation=true;events.push('onStation');events.push('boarding');}
  }else if(p.phase==='boarding'){
    if(!safe){p.phase='waiting';p.t=0;p.stable=0;events.push('aborted');}
    else if(p.t>=BOARDING_CLOSE_S){   // still closing the gap before this: no pacing, no tap window yet
      if(p.freezeT>0){p.freezeT-=dt;if(p.freezeT<=0){p.freezeT=0;p.paceT+=p.freezeDur;}}
      else p.paceT+=dt;
      // freezePos captured here too (not just in attemptBoarding's hit case) — the caller draws the actual
      // gunwale-to-deck walk from this fixed point, and paceT keeps moving underneath it during the transfer.
      if(p.autoArmed&&!p.boardedPending&&p.freezeT<=0&&inSafeZone(pacePosition(p))){p.boardedPending=true;p.pendingT=0;p.boardedBy='auto';p.freezePos=pacePosition(p);events.push('transferStart');}
      if(p.boardedPending){p.pendingT+=dt;if(p.pendingT>=BOARDING_TRANSFER_S){p.phase='alongside';p.t=0;p.boarded=true;p.boardingSpeed=speed;events.push('aboard');}}
    }
  }else if(p.phase==='alongside'&&p.t>=hold){p.phase='home';p.t=0;events.push('departing');}
  else if(p.phase==='home'&&p.t>=3.5){events.push('departed');}
  return events;
}
