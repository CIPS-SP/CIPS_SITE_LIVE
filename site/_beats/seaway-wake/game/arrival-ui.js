import {arrivalChecklist,currentVtsMessage,orderAcknowledgement,validateOrder,compactInstruction} from './arrival-rules.js';
import {SIMON_CONTACT,contactLinks} from './contact-config.js';
import {sceneScore} from './scoring.js';

/** UI adapter only. All completion criteria and orders use the actual game state.
 *  No external app opens except through the two explicit links in the contact dialog.
 *  No network requests, voice, analytics or automatic real-world messages here.
 */
export function mountArrivalUI({read,format,onOrder,setPaused,onResetInput,onNoticeCall}) {
  const $ = s => document.querySelector(s);
  const vts=$('[data-arrival="vts"]'), simon=$('[data-arrival="simon"]');
  // 26 Sep 2026, Simon: the notice call is its own quick-tap button now (was automatic on start) — a sibling of
  // the vts-contact card, not nested inside it (a button can't contain a button); onNoticeCall is game.js's callVts.
  const noticeBtn=$('[data-act="notice-call"]');
  noticeBtn?.addEventListener('click',e=>{e.stopPropagation();onNoticeCall?.();refresh(true);});
  const mini=$('[data-arrival="mini"]'),full=$('[data-arrival="full"]');
  const form=$('[data-arrival="order-form"]'),error=$('[data-arrival="order-error"]');
  const count=$('[data-arrival="count"]'),scoreLine=$('[data-arrival="score"]');

  const panels=Object.fromEntries(['notes','orders','contact','vts','pause'].map(k=>[k,$('#arrival-'+k+'-dialog')]));
  // 25 Sep 2026, Simon: the notes panel collapses to just its header — separate from opening the full dialog
  // (data-arrival-act="notes") — remembered across reloads the same way the sound preference already is.
  const notepad=$('.arrival-notepad'),collapseBtn=$('[data-arrival-act="collapse"]');
  function setCollapsed(on){
    notepad.classList.toggle('collapsed',on);collapseBtn.setAttribute('aria-expanded',String(!on));
    try{localStorage.setItem('bhi-notes-collapsed',on?'1':'0');}catch(_){}
  }
  let startCollapsed=false;try{startCollapsed=localStorage.getItem('bhi-notes-collapsed')==='1';}catch(_){}
  setCollapsed(startCollapsed);
  collapseBtn.addEventListener('click',e=>{e.stopPropagation();setCollapsed(!notepad.classList.contains('collapsed'));});
  let active=null,lastMessage=null,lastNotes='',lastVts='',lastSimon='',lastUpdate=-Infinity,priorFocus=null;
  const links=contactLinks();
  $('[data-arrival="number"]').textContent=SIMON_CONTACT.display;
  $('[data-arrival="phone"]').setAttribute('href',links.phone);
  $('[data-arrival="whatsapp"]').setAttribute('href',links.whatsapp);
  function close() {
    const name=active;active=null;
    if(name&&panels[name]?.open)panels[name].close();
    setPaused(false);onResetInput();priorFocus?.focus?.();
  }
  function open(name) {
    if(!Object.hasOwn(panels,name))return;
    if(active===name)return;
    const previous=active;active=name;
    if(previous&&panels[previous]?.open)panels[previous].close();
    priorFocus=document.activeElement;
    onResetInput();setPaused(true);refresh(true);
    if(name==='orders') {
      const snap=read(), hasOrdered=snap.calls.stores!==null||snap.calls.fuel!==false;
      if(hasOrdered) {
        form.querySelectorAll('input[name="store"]').forEach(i=>{i.checked=Array.isArray(snap.calls.stores)&&snap.calls.stores.includes(i.value);});
        const fuel=form.querySelector('input[name="fuel"]');if(fuel)fuel.checked=!!snap.calls.fuel;
        const hamper=form.querySelector('select[name="hamper"]');if(hamper)hamper.value=snap.calls.hamper||'produce';
      }
      if(!hasOrdered)form.reset();
      error.textContent=snap.S.playing&&!snap.S.done?'':'Start a passage before arranging game supplies. Real contact is always available.';
      $('[data-arrival="order-submit"]').disabled=!snap.S.playing||snap.S.done;
    }
    panels[name].showModal();
  }
  for(const [name,panel] of Object.entries(panels)) {
    panel.querySelectorAll('[data-arrival-close]').forEach(b=>b.addEventListener('click',close));
    panel.addEventListener('cancel',e=>{e.preventDefault();close();});
    panel.addEventListener('close',()=>{if(active===name)close();});
    // Stop helm/throttle handling, not the dialog's own tab/space interactions.
    for(const type of ['keydown','keyup','pointerdown','pointermove','pointerup','wheel'])panel.addEventListener(type,e=>e.stopPropagation());
  }
  for(const [action,panel] of [['vts','vts'],['simon','orders'],['contact','contact'],['notes','notes'],['pause','pause']]) {
    $('[data-arrival-act="'+action+'"]').addEventListener('click',e=>{e.stopPropagation();open(panel);});
  }
  form.addEventListener('submit',e=>{
    e.preventDefault();
    try {
      const data=new FormData(form),order=validateOrder({stores:data.getAll('store'),fuel:data.has('fuel'),hamper:data.get('hamper')});
      const result=onOrder(order);if(result===false)throw new Error('Start the passage before arranging supplies.');
      error.textContent='';close();refresh(true);
    } catch(ex) {error.textContent=ex.message;}
  });
  function list(container,notes) {
    container.replaceChildren();
    for(const note of notes) {
      const li=document.createElement('li'),tick=document.createElement('span'),label=document.createElement('span'),criteria=document.createElement('span');
      li.className=[note.done&&'note-done',note.done&&note.auto&&'note-auto'].filter(Boolean).join(' ');li.dataset.star=note.id;
      tick.className='note-check';tick.setAttribute('aria-label',note.done?(note.auto?'Complete — sent for you, not by you':'Complete'):'Not yet complete');
      label.className='note-label';label.textContent=note.label;
      criteria.className='note-criterion';criteria.textContent=note.criterion;
      li.append(tick,label,criteria);container.append(li);
    }
  }
  function refresh(force=false) {
    const snap=read(),t=snap.S.t;
    if(!force&&t>=lastUpdate&&t-lastUpdate<.15)return;
    lastUpdate=t;
    const status=currentVtsMessage({...snap,lastMessage},format);
    if(status.text!==lastVts) {lastVts=status.text;vts.textContent=compactInstruction(status.text);$('[data-arrival="vts-detail"]').textContent=status.text;}
    const card=$('[data-arrival-act="vts"]');card.classList.toggle('urgent',!!status.urgent);card.classList.toggle('active',!!status.active);
    if(noticeBtn)noticeBtn.hidden=!snap.S.playing||snap.S.done||!!snap.calls.coastguard;
    const reply=snap.S.orderAckPending?'Order sent in game. Simon is arranging it.':orderAcknowledgement(snap.calls);
    if(reply!==lastSimon){lastSimon=reply;simon.textContent=reply;}
    const notes=arrivalChecklist(snap.S,snap.calls,snap.cfg),key=JSON.stringify(notes);
    if(key!==lastNotes){lastNotes=key;list(mini,notes);list(full,notes);count.textContent=notes.filter(n=>n.done).length+'/5';}
    // 26 Sep 2026, Simon: "the running total could add up in the score section of the arrival notes" — recomputed
    // every refresh (score changes mid-task, e.g. as S.t ticks past the notice's own decay window, not just when
    // a note ticks over), so this doesn't share the notes' own change-gated update.
    if(scoreLine){const{total}=sceneScore(snap.S,snap.calls,snap.cfg);scoreLine.textContent=total+' pts';}
    const stateText=snap.S.done?'Pilot aboard. Welcome to Jersey.':snap.S.pilotBoarded?'Pilot aboard.':Number.isFinite(snap.S.speed)?'Speed '+Math.abs(snap.S.speed).toFixed(1)+' kts. Boarding: hold course, 6–8 knots.':'Boarding: hold course, 6–8 knots.';
    $('[data-arrival="notes-live"]').textContent=stateText;
  }
  return {
    open,close,refresh,
    present(message) {
      if(message.essential!==false&&!message.from?.includes('CIPS')&&message.from!=='You') {
        const now=read().S.t;
        const protectedMessage=lastMessage&&now<lastMessage.until&&(!lastMessage.valid||lastMessage.valid())&&(lastMessage.priority>=4||lastMessage.group==='safety');
        if(!protectedMessage||(message.priority||0)>=(lastMessage.priority||0))lastMessage={...message,until:now+Math.max(6,read().cfg.comms.holdSeconds)};
      }
      refresh(true);
    },
    reset(){lastMessage=null;lastNotes='';lastUpdate=-Infinity;close();refresh(true);},
    get activePanel(){return active;},
    get message(){return lastVts;},
  };
}
