import {BOARDING_TARGET_KNOTS,BOARDING_HEADING_MIN_DEG,BOARDING_HEADING_MAX_DEG} from './pilot-boarding.js';
// Short operational cues for a game, never a replacement for the port's directions.
// Essential instructions cannot be disabled by a content preset.
// 28 Sep 2026, Simon: "include those requirements on the arrival notes, and perhaps the pilot dialogue too" — the
// heading window is a fixed constant now (see pilot-boarding.js), not a per-leg lookup, so it's spelled out as
// plain text below rather than a template placeholder.
const HDG_RANGE=`${String(BOARDING_HEADING_MIN_DEG).padStart(3,'0')}–${String(BOARDING_HEADING_MAX_DEG).padStart(3,'0')}°`;
export const MESSAGES={
 'pilot.ready':{label:'Heading and speed good',from:'Pilots',group:'pilot',essential:true,priority:2,channel:14,text:'{vessel}, Pilots. Heading and speed are good. Hold steady for the launch.'},
 'pilot.hold':{label:'Hold speed and course for boarding',from:'Pilots',group:'pilot',essential:true,priority:3,channel:14,repeat:true,required:['boardingSpeed'],text:`{vessel}, Pilots. Hold heading ${HDG_RANGE}, hold {boardingSpeed} knots for boarding.`},
 'pilot.wait':{label:'Launch waiting',from:'Pilots',group:'pilot',essential:true,priority:3,channel:14,repeat:true,required:['boardingSpeed'],text:`{vessel}, Pilots. Standing by. Hold {boardingSpeed} knots, heading ${HDG_RANGE}, please.`},
 'pilot.boarding':{label:'Boarding in progress',from:'Pilots',group:'pilot',essential:true,priority:3,channel:14,text:`{vessel}, Pilots. Hold this speed and heading ${HDG_RANGE} — the pilot’s coming across when the roll’s right.`},
 'pilot.abort':{label:'Transfer paused',from:'Pilots',group:'pilot',essential:true,priority:4,channel:14,repeat:true,required:['boardingSpeed'],text:`{vessel}, Pilots. Transfer paused. Hold {boardingSpeed} knots, heading ${HDG_RANGE}, please.`},
 'pilot.aboard':{label:'Pilot aboard',from:'Pilot',group:'pilot',essential:true,priority:3,channel:14,text:'Pilot aboard, Captain. Thank you — let’s bring the ship in to St Helier.'},
 'pilot.autoboard':{label:'Pilot boarded themself, clear of the window',from:'Pilot',group:'pilot',essential:true,priority:3,channel:14,text:'Clear of the boarding area now, Captain — I came across in my own time.'},
 'pilot.station':{label:'Outside boarding area',from:'Pilots',group:'pilot',essential:true,priority:3,channel:14,repeat:true,text:'{vessel}, Pilots. Please return to the pilot boarding area.'},
 'pilot.clearance':{label:'Waiting for clear water',from:'Pilots',group:'pilot',essential:true,priority:3,channel:14,repeat:true,text:'{vessel}, Pilots. Holding clear until the traffic has passed.'},
 'pilot.assist':{label:'Pilot taking avoiding action',from:'Pilot',group:'safety',essential:true,priority:4,channel:14,repeat:true,text:'Captain, I have the helm. Keeping us safely clear.'},
 'nav.report':{label:'VTS report reminder',from:'St Helier VTS',group:'navigation',essential:true,priority:2,channel:14,repeat:true,text:'{vessel}, VTS. Please report your position and ETA on channel one four.'},
 'nav.course':{label:'Corbiere course alteration',from:'Pilot',group:'navigation',essential:true,priority:2,channel:14,repeat:true,text:'Corbiere bears north, Captain. Come to zero nine five degrees.'},
 'cips.stores':{label:'Stores acknowledged',from:'CIPS / Simon',group:'services',essential:true,priority:1,text:'Stores received, Captain. Water Taxi CI will meet you alongside at St Helier.'},
 'traffic.passing':{label:'Ferry passing',from:'Bridge',group:'traffic',essential:false,priority:1,text:'{target} on the passage. Keep a comfortable clearance.'},
 'ambient.airport':{label:'Crew flight landed',from:'Jersey Airport',group:'ambience',essential:false,priority:0,text:'Your crew have landed. CIPS has their transfer arranged.'},
 'ambient.corbiere':{label:'Corbiere background',from:'Pilot',group:'ambience',essential:false,priority:0,text:'La Corbiere ahead, Captain. A familiar welcome to Jersey.'},
};
export const MESSAGE_IDS=Object.keys(MESSAGES);
export function validateMessageTemplate(id,text){
 const spec=Object.hasOwn(MESSAGES,id)?MESSAGES[id]:null;if(!spec)throw new Error('Unknown VHF message');
 if(typeof text!=='string'||text.trim().length<5||text.length>220||/[<>\u0000-\u0008]/.test(text))throw new Error('Use 5 to 220 characters of plain text');
 const allowed=new Set(['vessel','boardingSpeed','target']);
 for(const m of text.matchAll(/\{([^}]+)\}/g))if(!allowed.has(m[1]))throw new Error('Unknown message placeholder');
 for(const key of spec.required||[])if(!text.includes('{'+key+'}'))throw new Error(`Keep {${key}} so the instruction uses the actual game rule`);
 return text.trim();
}
export function formatMessage(id,values={},overrides={}){
 const spec=Object.hasOwn(MESSAGES,id)?MESSAGES[id]:null;if(!spec)throw new Error(`Unknown VHF message ${id}`);
 const text=overrides[id]??spec.text;const vars={vessel:'Kinship',boardingSpeed:BOARDING_TARGET_KNOTS,target:'Traffic',...values};
 // The configured game rule, not an edited value, always supplies boarding speed.
 vars.boardingSpeed=BOARDING_TARGET_KNOTS;
 return {...spec,id,text:text.replace(/\{(\w+)\}/g,(_,key)=>String(vars[key]??''))};
}
export function createCommsFilter(){
 const sent=new Map();return {
  reset(){sent.clear();},
  accept(message,now,cfg){
   if(!message.essential){
    if(cfg.essentialOnly)return false;
    if(message.group==='traffic'&&!cfg.traffic)return false;
    if(message.group==='ambience'&&!cfg.ambience)return false;
   }
   const key=message.key||message.id||`${message.from}:${message.text}`;
   const last=sent.get(key);
   if(last!==undefined&&(!message.repeat||now-last<cfg.repeatSeconds))return false;
   sent.set(key,now);return true;
  }
 };
}
