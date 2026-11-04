import {MESSAGES,validateMessageTemplate} from './comms-catalog.js';
import {CONTROLS,getSetting,setSetting,exportPreset,applyPreset} from './settings.js';
// Native inputs keep this no-build, offline-capable game independent of React.
// Development panel only: not authentication and never a source of parallel simulation logic.
export function mountDirector({enabled,textOnly=false,CFG,baselinePreset,getReplay,restart,newSeed,previewNext,importReplay,storage,radio}) {
 if(!enabled)return null;
 const el=document.createElement('aside');el.className='game-director';el.setAttribute('aria-label','The Approaches development Director');
 const header=document.createElement('header');const title=document.createElement('b');title.textContent='The Approaches: Director';header.append(title);el.append(header);
 const status=document.createElement('p');status.className='dstatus';status.setAttribute('role','status');el.append(status);
 const meta=document.createElement('p');meta.className='dmeta';el.append(meta);
 const note=document.createElement('p');note.className='dnote';note.textContent='North-up retained. Boarding band: 6–8 knots, course held. Ferries pass one at a time. Comms controls change messages, never the safety rules. Timing changes apply on restart.';el.append(note);
 const controls=document.createElement('div');controls.className='dcontrols';el.append(controls);
 const groups=new Map(),bindings=[];
 const report=text=>{status.textContent=text;};
 const persist=()=>{try{storage?.setItem('bhi.director.active.v2',JSON.stringify(exportPreset(CFG,'Director working preset',getReplay())));}catch{report('Settings work here, but browser storage is unavailable. Export to keep them.');}};
 for(const [group,label,path,min,max,step,when] of CONTROLS){
  if(textOnly&&['comms.voice','comms.rate','comms.volume'].includes(path))continue;
  if(!groups.has(group)){const d=document.createElement('details'),h=document.createElement('summary');h.textContent=group;d.open=group==='Kinship';d.append(h);controls.append(d);groups.set(group,d);}
  const row=document.createElement('label'),text=document.createElement('span'),output=document.createElement('output'),input=document.createElement('input');
  text.textContent=label;input.type=min===null?'checkbox':'range';input.dataset.setting=path;input.setAttribute('aria-label',label);
  if(min!==null){input.min=min;input.max=max;input.step=step;}row.append(text,output,input);groups.get(group).append(row);
  const refresh=()=>{const v=getSetting(CFG,path);if(min===null)input.checked=v;else input.value=v;output.textContent=String(v);};refresh();bindings.push(refresh);
  input.addEventListener('input',()=>{const before=getSetting(CFG,path);try{
    setSetting(CFG,path,min===null?input.checked:Number(input.value));
    const r=CFG.replay;if(r.first>r.second||r.second>r.later||r.later>r.cap)throw new Error('Keep first <= second <= later <= cap');
    output.textContent=String(getSetting(CFG,path));persist();report(when==='live'?'Applied to the current passage.':when==='restart'?'Saved. Restart the passage to apply.':'Saved. Reload to rebuild the wake.');
   }catch(e){setSetting(CFG,path,before);refresh();report(e.message);}});
 }
 const foot=document.createElement('footer');el.append(foot);
 const button=(text,fn,parent=foot)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',()=>{try{fn();updateMeta();}catch(e){report(e.message);}});parent.append(b);return b;};
 // Comms editor uses the same validated configuration as the game and JSON presets.
 const comms=groups.get('Comms');
 if(comms&&radio){
  const help=document.createElement('p');help.className='dnote';help.textContent=textOnly?'Interface 03 uses essential text only. The player sound control is for ambience. These templates feed the compact buttons.':'Essential text stays on. Use the game speaker button for voice. Routine traffic and local colour are optional. Voices run on this device; no microphone is used.';comms.append(help);
  const voiceSelect=document.createElement('select');voiceSelect.setAttribute('aria-label','Local English VHF voice');voiceSelect.hidden=textOnly;comms.append(voiceSelect);
  let lastVoices='';
  const refreshVoices=()=>{const voices=radio.voices();const key=voices.map(v=>v.id).join('|');if(key===lastVoices&&voiceSelect.children.length)return;lastVoices=key;voiceSelect.replaceChildren();
   const auto=document.createElement('option');auto.value='';auto.textContent=voices.length?'Automatic local English voice':'No local English voice available';voiceSelect.append(auto);
   for(const v of voices){const o=document.createElement('option');o.value=v.id;o.textContent=v.name+' ('+v.lang+')';voiceSelect.append(o);}voiceSelect.value=CFG.comms.voiceURI;
  };
  voiceSelect.addEventListener('change',()=>{CFG.comms.voiceURI=voiceSelect.value;persist();});
  button(textOnly?'Preview boarding text':'Test boarding call',()=>{const result=radio.preview();bindings.forEach(f=>f());report(textOnly?result:'Voice preview requested. Device support is shown below.');},comms);
  if(!textOnly)button('Stop voice',()=>radio.stop(),comms);
  const voiceState=document.createElement('p');voiceState.className='dnote';voiceState.setAttribute('role','status');comms.append(voiceState);
  const copy=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Edit VHF wording';copy.append(summary);comms.append(copy);
  for(const [id,spec] of Object.entries(MESSAGES)){
    const label=document.createElement('label'),span=document.createElement('span'),input=document.createElement('textarea');span.textContent=spec.label+(spec.essential?' (essential)':' (optional)');
    input.rows=3;input.maxLength=220;input.dataset.message=id;input.setAttribute('aria-label',spec.label);input.value=CFG.comms.messages[id]??spec.text;
    label.append(span,input);copy.append(label);
    const refresh=()=>{input.value=CFG.comms.messages[id]??spec.text;};bindings.push(refresh);
    input.addEventListener('change',()=>{try{CFG.comms.messages[id]=validateMessageTemplate(id,input.value);persist();report('VHF wording saved. It will be used next time this event occurs.');}catch(e){report(e.message);}});
  }
  const placeholders=document.createElement('p');placeholders.className='dnote';placeholders.textContent='Keep {boardingSpeed} in boarding-speed instructions: the game supplies 2. {vessel} supplies Kinship. Messages are saved with your preset.';copy.append(placeholders);
  bindings.push(()=>{refreshVoices();voiceSelect.value=CFG.comms.voiceURI;});
  const refreshStatus=()=>{refreshVoices();voiceState.textContent=textOnly?'Spoken VHF is disabled in this interface test.':radio.status();};refreshStatus();
  el._radioTimer=setInterval(refreshStatus,1000);
 }
 function updateMeta(){const r=getReplay();meta.textContent=r?`Passage ${r.run} | ${r.seed} | variation ${Math.round(r.variation*100)}%`:'Authored first passage ready. Director runs do not advance player progress.';}
 button('Restart same passage',()=>{restart();report('Restarted with the same seed and variation.');});
 button('New seed',()=>{newSeed();report('New seed, same variation.');});
 button('Preview replay',()=>{previewNext();report('Previewing replay variation without recording a player completion.');});
 button('This build defaults',()=>{applyPreset(CFG,baselinePreset);bindings.forEach(f=>f());persist();restart();report('This build defaults restored. Reload if wake persistence was changed.');});
 button('Reload',()=>{persist();location.reload();});
 const name=document.createElement('input');name.type='text';name.value='Harbour test';name.maxLength=80;name.setAttribute('aria-label','Preset name');foot.append(name);
 const select=document.createElement('select');select.setAttribute('aria-label','Saved presets');foot.append(select);
 const saved=()=>{try{const x=JSON.parse(storage?.getItem('bhi.director.presets.v2')||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return {};}};
 function refreshSaved(){select.replaceChildren();for(const k of Object.keys(saved())){const o=document.createElement('option');o.value=k;o.textContent=k;select.append(o);}}
 button('Save named preset',()=>{const key=name.value.trim();if(!key||['__proto__','prototype','constructor'].includes(key))throw new Error('Choose a different preset name');const all=saved();if(Object.keys(all).length>=30&&!Object.hasOwn(all,key))throw new Error('Export presets before saving more than 30');all[key]=exportPreset(CFG,key,getReplay());if(!storage)throw new Error('Storage unavailable. Use Export instead.');storage.setItem('bhi.director.presets.v2',JSON.stringify(all));refreshSaved();select.value=key;report('Saved on this browser. Nothing uploaded.');});
 function load(data){applyPreset(CFG,data);bindings.forEach(f=>f());name.value=data.name||'Imported';persist();if(data.replay)importReplay(data.replay);else restart();report('Preset loaded. Reload if wake persistence changed.');}
 button('Load saved',()=>{const data=saved()[select.value];if(!data)throw new Error('Select a saved preset');load(data);});
 function download(filename,data){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 button('Export preset',()=>download('bring-her-in-preset.json',exportPreset(CFG,name.value,getReplay())));
 button('Copy preset',async()=>{const text=JSON.stringify(exportPreset(CFG,name.value,getReplay()),null,2);try{await navigator.clipboard.writeText(text);report('Preset copied.');}catch{report('Clipboard blocked. Use Export preset instead.');}});
 const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','Import a preset JSON file');foot.append(file);
 file.addEventListener('change',async()=>{try{const f=file.files?.[0];if(!f)return;if(f.size>131072)throw new Error('Preset file is too large');load(JSON.parse(await f.text()));}catch(e){report(`Preset not loaded: ${e.message}`);}finally{file.value='';}});
 button('Hide Director',()=>{el.hidden=true;toggle.hidden=false;},header);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='director-reopen';toggle.textContent='Director';toggle.hidden=true;toggle.addEventListener('click',()=>{el.hidden=false;toggle.hidden=true;});
 // Stop all panel input before it reaches global wheel/helm handlers.
 for(const type of ['keydown','keyup','pointerdown','pointerup','pointermove','wheel','touchstart','touchmove'])el.addEventListener(type,e=>e.stopPropagation());
 document.body.append(el,toggle);refreshSaved();updateMeta();report(textOnly?'Approaches Interface 03. Local test, no real orders.':'North-up, Comms and boarding review 02. No public deployment.');
 const timer=setInterval(updateMeta,1000);
 return {element:el,refresh(){bindings.forEach(f=>f());updateMeta();},destroy(){clearInterval(timer);clearInterval(el._radioTimer);el.remove();toggle.remove();},load};
}
