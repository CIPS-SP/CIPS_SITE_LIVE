// Completion, not page loads or retries, advances the passage. No accounts or network.
export const REPLAY_VERSION = 2;
const KEY='bringHerIn.replay.v2';
export const FIRST_SEED='BRING_HER_IN_FIRST_PASSAGE';
export function variationForCompleted(n,policy={first:0,second:0.25,later:0.4,cap:0.6}) {
  n=Number.isSafeInteger(n)&&n>=0?n:0;
  return n===0?policy.first:n===1?policy.second:Math.min(policy.cap,policy.later+(n-2)*0.05);
}
export function createReplayPolicy({storage,makeSeed=()=>`BHI-${Date.now().toString(36)}`}={}) {
  let memory={completed:0,baseSeed:makeSeed()},active=null,finished=new Set();
  try {const j=JSON.parse(storage?.getItem(KEY)||'null');if(j&&Number.isSafeInteger(j.completed)&&j.completed>=0&&typeof j.baseSeed==='string')memory=j;}catch{}
  const save=()=>{try{storage?.setItem(KEY,JSON.stringify(memory));}catch{}};
  return {
    next({policy,seed,variation,preview=false}={}) {
      const n=memory.completed;
      active={version:REPLAY_VERSION,run:n+1,seed:String(seed??(n===0?FIRST_SEED:`${memory.baseSeed}/passage-${n+1}`)),variation:variation??variationForCompleted(n,policy),preview};
      return {...active};
    },
    complete(run=active) {
      if(!run||run.preview)return false;
      const id=`${run.run}/${run.seed}`;if(finished.has(id)||run.run!==memory.completed+1)return false;
      finished.add(id); memory.completed++;save();return true;
    },
    reset(){memory={completed:0,baseSeed:makeSeed()};active=null;finished.clear();save();},
    completed:()=>memory.completed,
  };
}
