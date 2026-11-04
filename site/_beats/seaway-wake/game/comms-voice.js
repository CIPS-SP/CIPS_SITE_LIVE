// Speech output only. No microphone, recognition, account, API key or remote TTS.
// Only device voices explicitly marked localService are used. Text always works.
export function createRadioVoice({host=globalThis,config,getTime=()=>0,onSpeaking=()=>{},onStatus=()=>{}}={}){
 const synth=host.speechSynthesis,Utterance=host.SpeechSynthesisUtterance;
 let enabled=false,activated=false,active=null,queue=[],token=0,voices=[];
 const supported=!!(synth&&Utterance);
 const refresh=()=>{try{voices=supported?synth.getVoices().filter(v=>v.localService===true&&/^en\b/i.test(v.lang)):[];}catch{voices=[];}return voices;};
 const choose=()=>voices.find(v=>v.voiceURI===config.voiceURI)||voices.find(v=>/^en[-_]GB$/i.test(v.lang))||voices.find(v=>v.default)||voices[0];
 function cancel(){queue=[];token++;active=null;if(supported)synth.cancel();onSpeaking(false);}
 function ready(){return supported&&activated&&enabled&&config.voice;}
 function pump(){
  if(!ready()||active)return;
  queue=queue.filter(x=>getTime()-x.at<=x.ttl&&(!x.valid||x.valid()));
  if(!queue.length)return;
  refresh();const voice=choose();if(!voice){queue=[];onStatus('No local English voice found. VHF remains text-only.');return;}
  const msg=queue.shift(),current=++token;
  const u=new Utterance(msg.text.replace(/\b2 knots\b/g,'two knots'));
  u.voice=voice;u.lang=voice.lang;u.rate=config.rate;u.volume=config.volume;u.pitch=1;
  active={msg,u,startedAt:getTime()};onSpeaking(true);
  const done=error=>{if(current!==token)return;active=null;onSpeaking(false);if(error)onStatus('Voice unavailable for this call. The instruction remains in VHF text.');pump();};
  u.onend=()=>done(false);u.onerror=()=>done(true);
  try{synth.speak(u);onStatus(`Local voice: ${voice.name}`);}catch{done(true);}
 }
 function enqueue(msg){
  if(!ready())return false;
  if(active?.msg.key===msg.key||queue.some(x=>x.key===msg.key))return false;
  const event={...msg,at:getTime(),ttl:msg.ttl??12};
  if(active&&msg.priority>active.msg.priority){token++;synth.cancel();active=null;onSpeaking(false);}
  queue.push(event);queue.sort((a,b)=>b.priority-a.priority||a.at-b.at);queue=queue.slice(0,3);pump();return true;
 }
 synth?.addEventListener?.('voiceschanged',refresh);refresh();if(!supported)onStatus('Speech output is unavailable in this browser. VHF text stays on.');
 return {
  supported,get active(){return !!active;},get voices(){return refresh().map(v=>({id:v.voiceURI,name:v.name,lang:v.lang}));},
  activate(){activated=true;try{synth?.resume();}catch{}refresh();},
  setEnabled(value){enabled=!!value;if(!enabled||!config.voice){if(active||queue.length)cancel();}else pump();},
  enqueue,
  tick(){if(!ready()){if(active||queue.length)cancel();return;}if(active&&((active.msg.valid&&!active.msg.valid())||getTime()-active.startedAt>25)){token++;synth.cancel();active=null;onSpeaking(false);}pump();},
  cancel,
  preview(text){activated=true;enabled=true;cancel();enqueue({key:'preview',text,priority:1,ttl:15});},
  destroy(){cancel();synth?.removeEventListener?.('voiceschanged',refresh);}
 };
}
