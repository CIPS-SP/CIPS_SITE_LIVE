import {HULL_CIRCLES,clearance,sweptClearance,hullOnLand,MIN_CLEARANCE,warningText} from './safety.js';
// Pure guard wired into the existing update, not an alternative movement simulator.
export function createSafetyGuard({toXY,toGeo,landAt,getTargets,onAdvice,onIntervention}) {
 const advised=new Map(),charged=new Map();let held=0;
 const pose=(g,heading,circles)=>{const [x,y]=toXY(g);return {x,y,heading,circles};};
 const body=o=>pose(o.g,o.hdg,o.circles||[]);
 const inWater=p=>!hullOnLand(p,toGeo,landAt);
 const targetNext=(o,dt)=>{const p=body(o),h=p.heading*Math.PI/180;return {...p,x:p.x+Math.sin(h)*(o.swim||0)*dt,y:p.y+Math.cos(h)*(o.swim||0)*dt};};
 const relevant=o=>o.g&&o.circles?.length&&!o.orbit&&!o.ride&&!o.safeSubmerged;
 function record(o,time){const key=o||'shore';if(time-(charged.get(key)??-Infinity)>5){charged.set(key,time);onIntervention(o);}}
 function advise(o,time){if(o.kind!=='pots')return;   // 24 Oct 2026, Simon: the ferries are gone, so the pilot no longer says "Traffic ahead" (the pilot still warns about pots)
  if(time-(advised.get(o)??-Infinity)>18){advised.set(o,time);onAdvice(warningText(o.kind,o.name));}}
 return {
  reset(){advised.clear();charged.clear();held=0;},
  player(oldG,oldHeading,newG,newHeading,speed,dt,time){
   const a0=pose(oldG,oldHeading,HULL_CIRCLES),a1=pose(newG,newHeading,HULL_CIRCLES),targets=getTargets().filter(relevant);
   let offender=null,unsafe=!inWater(a1); const h=newHeading*Math.PI/180;
   const ahead={...a1,x:a1.x+Math.sin(h)*Math.max(0,speed)*4,y:a1.y+Math.cos(h)*Math.max(0,speed)*4};
   for(const o of targets){const b0=body(o),b1=targetNext(o,dt);
    if(sweptClearance(a0,a1,b0,b1)<.5){unsafe=true;offender=o;break;}
    if(sweptClearance(a1,ahead,b1,targetNext(o,4+dt))<MIN_CLEARANCE)advise(o,time);
   }
   if(!unsafe){held=0;return {g:newG,heading:newHeading,stopped:false};}
   record(offender,time);held++;
   const valid=p=>inWater(p)&&targets.every(o=>clearance(p,targetNext(o,dt))>=.55);
   // Keep position and turn away early. No collision, bounce, damage or moving fishing gear.
   for(const delta of [0,2,-2,5,-5,12,-12]){const p={...a0,heading:newHeading+delta};if(valid(p)&&targets.every(o=>sweptClearance(a0,p,body(o),targetNext(o,dt))>=.25))return {g:oldG.slice(),heading:p.heading,stopped:true};}
   // Exceptional last backstop (e.g. a fresh AIS report places real traffic on our previous pose).
   // Only Kinship can be relocated. The real report, fixed gear and coast are never altered.
   for(let radius=1;radius<=80;radius+=1)for(let k=0;k<24;k++){
    const angle=(oldHeading+180+k*15)*Math.PI/180;
    const p={...a0,x:a0.x+Math.sin(angle)*radius,y:a0.y+Math.cos(angle)*radius};
    if(valid(p))return {g:toGeo(p.x,p.y),heading:p.heading,stopped:true,repositioned:true};
   }
   // Explicit failure, never a false claim of a safe state. Caller pauses and records this.
   return {g:oldG.slice(),heading:oldHeading,stopped:true,unresolved:true};
  },
  traffic(o,oldG,oldHeading,dt,shipG,shipHeading){
   if(o.live||!relevant(o))return true;
   const a0=pose(oldG,oldHeading,o.circles),a1=body(o);let safe=inWater(a1);
   // Shoreline samples through the move, rather than testing just the endpoint.
   const distance=Math.hypot(a1.x-a0.x,a1.y-a0.y),samples=Math.max(1,Math.ceil(distance/.5));
   for(let k=1;safe&&k<samples;k++){const f=k/samples;safe=inWater({...a1,x:a0.x+(a1.x-a0.x)*f,y:a0.y+(a1.y-a0.y)*f});}
   if(safe){const ship=pose(shipG,shipHeading,HULL_CIRCLES);safe=sweptClearance(a0,a1,ship,ship)>=.3;}
   if(safe)for(const q of getTargets()){if(q===o||!relevant(q))continue;const b=body(q);if(sweptClearance(a0,a1,b,b)<.3){safe=false;break;}}
   if(!safe){o.g=oldG.slice();o.hdg=oldHeading;o.giveWay=null;o.evade=null;o.safetyHeld=true;}else{o.safetyHeld=false;}
   return safe;
  },
  get holds(){return held;}
 };
}
