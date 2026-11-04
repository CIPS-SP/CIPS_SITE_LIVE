// Deterministic dispatch gate. Authored times are earliest release times, not
// permissions to stack ferries at the pilot station. Routes/speeds stay authored.
export const isFerryKind=kind=>['dfds','iu','ropax','ferry'].includes(kind);
export const MIN_FERRY_GAP_SECONDS=8;
export function createFerryDirector(){
 let queue=[],occupied=false,clearAt=-Infinity;const history=[];
 return {
  reset(){queue=[];occupied=false;clearAt=-Infinity;history.length=0;},
  enqueue(item){if(!isFerryKind(item.kind))throw new Error('Not a ferry');queue.push({...item});},
  dispatch({time,targets,boardingBusy=false,liveNearby=false,gap=MIN_FERRY_GAP_SECONDS},spawn){
   const active=targets.some(o=>!o.live&&isFerryKind(o.kind));
   if(active){occupied=true;return null;}
   if(occupied){clearAt=time;occupied=false;}
   if(boardingBusy||liveNearby||time-clearAt<Math.max(MIN_FERRY_GAP_SECONDS,gap)||!queue.length)return null;
   const item=queue.shift();spawn(item);occupied=true;
   const event={id:item.id,kind:item.kind,route:item.route,due:item.at,released:time};history.push(event);return event;
  },
  get pending(){return queue.map(x=>({...x}));},get history(){return history.map(x=>({...x}));}
 };
}
