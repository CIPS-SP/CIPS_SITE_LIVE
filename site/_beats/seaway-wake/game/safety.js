// Game-space clearance, not a navigational collision-avoidance system.
// The protected floor cannot be edited in Director or imported presets.
export const MIN_CLEARANCE=2.6;
export const HULL_CIRCLES=[-4.2,-1.4,1.4,4.2].map(dz=>({dz,r:1.25}));
export const safetyMargin=cfg=>Math.max(MIN_CLEARANCE,Number(cfg.avoid.margin)||MIN_CLEARANCE);
export const mayDisplaceTarget=o=>!o.live&&!o.fixed&&!o.standOn&&o.kind!=='pots';
export function circleCentres(pose,circles) {
 const h=pose.heading*Math.PI/180;
 return circles.map(c=>({x:pose.x+Math.sin(h)*c.dz,y:pose.y+Math.cos(h)*c.dz,r:c.r}));
}
const bound=p=>Math.max(0,...p.circles.map(c=>Math.abs(c.dz)+c.r));
export function clearance(a,b){const coarse=Math.hypot(a.x-b.x,a.y-b.y)-bound(a)-bound(b);if(coarse>4)return coarse;let min=Infinity;for(const p of circleCentres(a,a.circles))for(const q of circleCentres(b,b.circles))min=Math.min(min,Math.hypot(p.x-q.x,p.y-q.y)-p.r-q.r);return min;}
// Conservative swept envelopes: catches a fast object crossing between two ticks.
export function sweptClearance(a0,a1,b0,b1) {
 const rx=a0.x-b0.x,ry=a0.y-b0.y,vx=a1.x-b1.x-rx,vy=a1.y-b1.y-ry,vv=vx*vx+vy*vy;
 const t=vv?Math.max(0,Math.min(1,-(rx*vx+ry*vy)/vv)):0;
 const broad=Math.hypot(rx+t*vx,ry+t*vy)-Math.max(bound(a0),bound(a1))-Math.max(bound(b0),bound(b1));
 if(broad>4)return broad;
 const aa0=circleCentres(a0,a0.circles),aa1=circleCentres(a1,a1.circles),bb0=circleCentres(b0,b0.circles),bb1=circleCentres(b1,b1.circles);
 let min=Infinity;
 for(let i=0;i<aa0.length;i++)for(let j=0;j<bb0.length;j++){
  const p=aa0[i],q=bb0[j],end=aa1[i],qe=bb1[j];const x=p.x-q.x,y=p.y-q.y,vx=end.x-qe.x-x,vy=end.y-qe.y-y;
  const vv=vx*vx+vy*vy,k=vv?Math.max(0,Math.min(1,-(x*vx+y*vy)/vv)):0;
  // Heading interpolation can bow out from the chord. Bound that arc conservatively.
  const da=Math.abs((((a1.heading-a0.heading)+540)%360)-180)*Math.PI/180;
  const db=Math.abs((((b1.heading-b0.heading)+540)%360)-180)*Math.PI/180;
  const arc=Math.abs(a0.circles[i].dz)*(1-Math.cos(da/2))+Math.abs(b0.circles[j].dz)*(1-Math.cos(db/2));
  min=Math.min(min,Math.hypot(x+k*vx,y+k*vy)-p.r-q.r-arc);
 }return min;
}
export function hullOnLand(pose,toGeo,landAt){
 for(const c of circleCentres(pose,pose.circles)){
  if(landAt(toGeo(c.x,c.y)))return true;
  for(let k=0;k<16;k++){const a=k*Math.PI/8;if(landAt(toGeo(c.x+Math.sin(a)*c.r,c.y+Math.cos(a)*c.r)))return true;}
 }return false;
}
export function warningText(kind,name){return kind==='pots'?'Pots ahead, Captain. Ease her and keep the string clear.':`${name||'Traffic'} ahead, Captain. Keep a comfortable clearance.`;}
