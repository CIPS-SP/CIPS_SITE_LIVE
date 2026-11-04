import {createReplayRandom} from './random.js';
const FERRY=new Set(['dfds','iu','ropax']);
const GROUP={potter:'fishing',tuna:'fishing',trawler:'fishing',openboat:'fishing',shyc:'leisure',rciyc:'leisure',kayak:'leisure',superyacht:'leisure',shoal:'wildlife',pod:'wildlife'};
// Coordinates, direction and ferry speed are never randomised. First-run baseline is authored.
export function buildSchedule(authored, traffic, replay, enabledDolphins=true) {
  const rng=createReplayRandom(`${replay.seed}/schedule`,replay.variation);
  return authored.map((e,i)=>({...e,id:`${i}:${e.kind}:${e.route||'fixed'}`})).filter(e=>{
    if(FERRY.has(e.kind))return traffic[e.kind]!==false;
    if(e.kind==='pod'&&!enabledDolphins)return false;
    const activity=traffic[GROUP[e.kind]]??1;
    // Keying decisions by entry prevents toggling one operator from reshuffling all others.
    const probability=GROUP[e.kind]?activity*(1-traffic.replayThinning*replay.variation):activity;
    return rng.fork(e.id).chance(probability);
  }).map(e=>{
    const ferry=FERRY.has(e.kind), random=rng.fork(`${e.id}/time`);
    const offset=ferry?(traffic[`${e.kind}Offset`]||0):0;
    const window=ferry?traffic.ferryWindow:traffic.encounterWindow;
    return {...e,at:Math.max(0,e.at+offset+random.signed(window))};
  }).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
}
