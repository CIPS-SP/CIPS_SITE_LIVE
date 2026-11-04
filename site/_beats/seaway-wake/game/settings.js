import {validateMessageTemplate} from './comms-catalog.js';
// One catalogue for the Director, preset validation and runtime tuning.
// Navigation, asset paths, world scale and safety floors are NOT editable presets.
export const PRESET_VERSION=2;
export function extendConfig(cfg) {
  Object.assign(cfg,{
    motion:{accelerate:0.75,coast:0.7,rudder:0.05,engUp:1.0,engRev:2.0,diffRot:3.0,slip:0.6},   // 26 Sep 2026, Simon: "accelerating up to max speed should be quicker" (was 0.45, dropped to 0.28) then "it's now way too responsive" (nudged to 0.38). 28 Sep 2026, Simon, again: "not the grip that was the issue, its how quickly the vessel speeds up when you move the throttle, was way too fast" — the actual fix is here, not the input controls; 0.38 still means ~86% of the way to a new target speed after just 2 real seconds. Nudged to 0.62 (slower than the ORIGINAL 0.45), still reported "too fast" (~90% converged in ~5s) — genuinely needed to be slower than CFG.motion.coast (0.7, how she carries her way with the engines back), not just close to it as first tried: 0.75 now takes ~8s to reach 90% of a new target — smaller = faster convergence in the S.speed lerp (game.js)
    camera:{followHalfLife:1,openingDamping:0.55,passageDamping:0.75},
    sea:{wakeRun:1.8,wakeStrength:0.6,swell:1,foam:0.26,spray:1,oceanSpeed:0.9},
    traffic:{dfds:true,iu:true,ropax:true,ferryGap:10,dfdsOffset:0,iuOffset:0,ropaxOffset:0,ferryWindow:5,encounterWindow:8,fishing:1,leisure:1,wildlife:1,replayThinning:0.25},
    dolphins:{enabled:true,triggerSeconds:12,bowSeconds:6,wakeSeconds:5,podSize:3},
    replay:{first:0,second:0.25,later:0.4,cap:0.6},
    comms:{essentialOnly:true,voice:true,traffic:false,ambience:false,repeatSeconds:12,holdSeconds:7,rate:1,volume:1,voiceURI:'',messages:{}},
  });return cfg;
}
// [section,label,path,min,max,step,when]; when=live or restart or reload.
export const CONTROLS=[
 ['Kinship','Rudder turning effect (deg/s)','helm.rot',1,6,.1,'live'],['Kinship','Rudder lag','helm.lag',.4,4,.1,'live'],['Kinship','Heel','helm.bank',0,12,.5,'live'],
 ['Kinship','Engine response','motion.accelerate',.2,.8,.05,'live'],['Kinship','Way carried','motion.coast',.4,.9,.05,'live'],
 ['Camera','Passage view','visH',55,140,1,'live'],['Camera','Opening view','open.visH',145,260,1,'live'],['Camera','Opening hold (s)','open.hold',3,12,.5,'live'],
 ['Camera','Approach view','approach.visH',65,160,1,'live'],['Camera','Follow half-life (s)','camera.followHalfLife',.25,3,.05,'live'],
 ['Sea and wake','Wake strength','sea.wakeStrength',.2,.9,.05,'live'],['Sea and wake','Swell scale','sea.swell',.5,1.5,.05,'live'],
 ['Sea and wake','Foam','sea.foam',.05,.5,.01,'live'],['Sea and wake','Spray quantity','sea.spray',0,1.5,.1,'live'],
 ['Sea and wake','Wave motion','sea.oceanSpeed',.4,1.2,.05,'live'],['Sea and wake','Wake persistence','sea.wakeRun',1,2.5,.1,'reload'],
 ['Ferries','DFDS fast','traffic.dfds',null,null,null,'restart'],['Ferries','Islands Unlimited','traffic.iu',null,null,null,'restart'],['Ferries','DFDS conventional','traffic.ropax',null,null,null,'restart'],
 ['Ferries','DFDS fast offset (s)','traffic.dfdsOffset',-5,15,.5,'restart'],['Ferries','Islands Unlimited offset (s)','traffic.iuOffset',-5,15,.5,'restart'],['Ferries','Conventional offset (s)','traffic.ropaxOffset',-40,20,.5,'restart'],
 ['Ferries','Pause between ferries (s)','traffic.ferryGap',8,30,1,'restart'],
 ['Life around the passage','Fishing activity','traffic.fishing',0,1,.1,'restart'],['Life around the passage','Leisure activity','traffic.leisure',0,1,.1,'restart'],['Life around the passage','Wildlife crossings','traffic.wildlife',0,1,.1,'restart'],
 ['Dolphins','Bow riders enabled','dolphins.enabled',null,null,null,'restart'],['Dolphins','Steady run before arrival (s)','dolphins.triggerSeconds',8,24,1,'live'],
 ['Dolphins','Bow ride (s)','dolphins.bowSeconds',4,12,.5,'live'],['Dolphins','Wake ride before star (s)','dolphins.wakeSeconds',3,10,.5,'live'],['Dolphins','Pod size','dolphins.podSize',2,4,1,'restart'],
 ['Comms','Essential calls only','comms.essentialOnly',null,null,null,'live'],
 ['Comms','Spoken VHF (with sound on)','comms.voice',null,null,null,'live'],
 ['Comms','Routine traffic calls','comms.traffic',null,null,null,'live'],
 ['Comms','Airport and local colour','comms.ambience',null,null,null,'live'],
 ['Comms','Repeat reminder after (s)','comms.repeatSeconds',8,30,1,'live'],
 ['Comms','Essential text display (s)','comms.holdSeconds',4,12,1,'live'],
 ['Comms','Speaking pace','comms.rate',.75,1.25,.05,'live'],
 ['Comms','Voice volume','comms.volume',0,1,.05,'live'],
 ['Replay','First-play variation','replay.first',0,.1,.01,'restart'],['Replay','Second-play variation','replay.second',0,.4,.05,'restart'],['Replay','Later-play variation','replay.later',0,.6,.05,'restart'],['Replay','Variation cap','replay.cap',0,.6,.05,'restart'],
 ['Replay','Replay activity variation','traffic.replayThinning',0,.5,.05,'restart'],
 ['Replay','Ferry timing window (s)','traffic.ferryWindow',0,8,.5,'restart'],['Replay','Other timing window (s)','traffic.encounterWindow',0,12,.5,'restart'],
];
const catalogue=new Map(CONTROLS.map(c=>[c[2],c]));
export const getSetting=(cfg,path)=>path.split('.').reduce((o,k)=>o[k],cfg);
export function setSetting(cfg,path,value) {
 const c=catalogue.get(path);if(!c)throw new Error(`Unknown or protected setting: ${path}`);
 if(c[3]===null){if(typeof value!=='boolean')throw new Error(`${path} must be true or false`);}
 else if(typeof value!=='number'||!Number.isFinite(value)||value<c[3]||value>c[4]||(c[5]===1&&!Number.isInteger(value)))throw new Error(`Out-of-range value: ${path}`);
 const keys=path.split('.'),last=keys.pop();let obj=cfg;for(const k of keys)obj=obj[k];obj[last]=value;return c[6];
}
export function exportPreset(cfg,name='Working preset',replay=null) {
 return {schema:'bring-her-in-preset',version:PRESET_VERSION,name:String(name).slice(0,80),values:Object.fromEntries(CONTROLS.map(c=>[c[2],getSetting(cfg,c[2])])),replay:replay?{seed:replay.seed,variation:replay.variation,run:replay.run}:null,comms:{voiceURI:cfg.comms.voiceURI,messages:{...cfg.comms.messages}}};
}
export function applyPreset(cfg,data) {
 if(!data||data.schema!=='bring-her-in-preset'||data.version!==PRESET_VERSION||!data.values||typeof data.values!=='object'||Array.isArray(data.values))throw new Error('Not a version 2 Bring Her In preset');
 const draft=JSON.parse(JSON.stringify(cfg));const changes=[];
 for(const [path,value] of Object.entries(data.values))changes.push(setSetting(draft,path,value));
 if(draft.replay.first>draft.replay.second||draft.replay.second>draft.replay.later||draft.replay.later>draft.replay.cap)throw new Error('Replay variation must rise from first to second to later, within the cap');
 if(data.replay){if(typeof data.replay.seed!=='string'||data.replay.seed.length>128||!Number.isFinite(data.replay.variation)||data.replay.variation<0||data.replay.variation>.6)throw new Error('Invalid replay descriptor');}
 let radio=null;
 if(data.comms){
  if(typeof data.comms.voiceURI!=='string'||data.comms.voiceURI.length>300||!data.comms.messages||typeof data.comms.messages!=='object'||Array.isArray(data.comms.messages))throw new Error('Invalid Comms preset');
  radio={voiceURI:data.comms.voiceURI,messages:{}};
  for(const [id,text] of Object.entries(data.comms.messages))radio.messages[id]=validateMessageTemplate(id,text);
 }
 // All-or-nothing validation. Never merge arbitrary object keys into live configuration.
 for(const [path,value] of Object.entries(data.values))setSetting(cfg,path,value);
 if(radio){cfg.comms.voiceURI=radio.voiceURI;cfg.comms.messages=radio.messages;}
 return {reload:changes.includes('reload'),restart:changes.some(x=>x!=='live')};
}
export function guardedStorage(name='sessionStorage') {try{return globalThis[name];}catch{return undefined;}}
export function readDirectorPreset(cfg,search,storage) {
 if(!new URLSearchParams(search).has('director'))return null;
 try{const raw=storage?.getItem('bhi.director.active.v2');if(!raw)return null;const data=JSON.parse(raw);applyPreset(cfg,data);return data;}catch(e){console.warn('[Director] Ignored invalid stored preset:',e.message);return null;}
}
