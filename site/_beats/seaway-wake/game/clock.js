// Gameplay ticks at 60 Hz. Slow rendering changes wall-clock duration, never skips navigation.
export function createFixedClock({step=1/60,maxSteps=6}={}) {
 let accumulator=0, ticks=0;
 return {
  advance(seconds,update){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid frame duration');
   accumulator+=Math.min(seconds,step*maxSteps);let n=0;const count=Math.min(maxSteps,Math.floor((accumulator+1e-12)/step));
   while(accumulator+1e-12>=step&&n<maxSteps){accumulator=Math.max(0,accumulator-step);ticks++;n++;update(step,n,n===count);}
   return n;},
  reset(){accumulator=0;ticks=0;},get ticks(){return ticks;},get time(){return ticks*step;}
 };
}
