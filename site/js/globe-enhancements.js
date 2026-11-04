/* Globe enhancements (Howard, 21 Sep 2026): the globe improvements first made on the Monaco page (/monaco/?s=simon),
   applied to the main site's globe. A presentation layer only: the shared globe (_beats/globe-live) is unchanged and
   remains the owner of vessel selection and route calculation. Its two controllers, ship-picker.mjs and voyage-prompt.mjs, are this site's own copies in js/ (copied from the Monaco page on 30 Oct 2026; the live site shares no files with it).
   - intro: a compact "Play the journey" button (was "Start your voyage"); the chooser is titled "Choose your ship"
   - chooser: real controls moved into a tidy panel; "Go to Ship", "Choose another ship", "Simulate route to Jersey",
     a persistent Simulation label, Escape steps back one level
   - route: the calculation stays readable, then a one-time "Scroll to continue your journey" cue, dismissed on scroll
   - stats: the four practical reasons to call (fuel, pontoons, airport, tidal access) replace the live-traffic figures
   - phones: horizontal swipes turn the globe, vertical gestures scroll the page
   Not brought across: Monaco's own welcome, page ride and contact sections (the site keeps its own ride). */
import { installShipPicker } from './ship-picker.mjs';
import { installVoyagePrompt } from './voyage-prompt.mjs';

export function installGlobeEnhancements(root = '#beats') {
  const stage = document.querySelector(`${root} .beat-globe-live > .beat-stage`);
  if (!stage) return;
  const R = root;
  // Scope to the globe's own stage: on the home page the globe sits inside an outer group .beat-stage,
  // which would otherwise match the :not(.globe-intro) rule and show the chooser before Start your voyage.
  const S = `${R} .beat-globe-live > .beat-stage`;
  stage.classList.add('globe-intro');
  const WB = ['.lexample', '.lgo', '.lreopen', '.ltake'].map(c => `${R} .beat-globe-live ${c}`).join(','), WO = ['.lclear', '.lchange'].map(c => `${R} .beat-globe-live ${c}`).join(',');   // white buttons / outline buttons of the picker
  const style = document.createElement('style');
  style.textContent = `
    ${S}.globe-intro [data-live="panel"]{display:none!important}
    ${S}.globe-intro [data-g="voyageCta"]{display:flex!important;margin-top:18px!important}
    ${S}:not(.globe-intro):not(.following) [data-live="panel"]{display:block!important;width:min(320px,88vw)}
    ${R} [data-g="voyageCta"] .gcta-btn{position:relative!important;padding:15px 26px!important;font:600 12.5px/1.2 'Jost',system-ui,sans-serif!important;letter-spacing:.14em!important;text-transform:uppercase!important;border-radius:0!important;background:#fff!important;color:#1A1D22!important;box-shadow:none;border:1px solid #fff!important}
    ${R} [data-g="voyageCta"] .gcta-btn::after{content:'';position:absolute;left:0;bottom:-1px;height:3px;width:0;background:#FF8A1E;transition:width .25s ease}   /* the orange line that draws along the bottom on hover */
    ${R} [data-g="voyageCta"] .gcta-btn:hover::after{width:100%}
    /* 25 Oct 2026, Simon: a bolder nudge when someone tries to scroll the locked globe (beat.js adds .pulse): glow, ripple and swell (no bottom line: Simon, too much) */
    @keyframes voyageNudge{0%{box-shadow:0 0 0 0 rgba(255,138,30,.8),0 0 0 0 rgba(255,138,30,0);transform:scale(1)}40%{box-shadow:0 0 0 0 rgba(255,138,30,.55),0 0 38px 12px rgba(255,138,30,.8);transform:scale(1.07)}100%{box-shadow:0 0 0 22px rgba(255,138,30,0),0 0 0 0 rgba(255,138,30,0);transform:scale(1)}}
    ${R} [data-g="voyageCta"] .gcta-btn.pulse{animation:voyageNudge 1s ease-out 2}
      /* no box-shadow override: Simon's orange glow and scroll-nudge pulse (voyageCtaPulse, beat.css) must show through */
    /* Observe the Channel Islands caps the scroll; its two exits ("Jump to the approaches", "Find a ship to take in")
       must show while it is armed, and the "scroll to move on" hint is wrong there, so it is hidden. */
    ${S}:not(:has([data-g="voyageMonitor"].armed)) [data-g="voyageReopenPanel"],${S}:not(:has([data-g="voyageMonitor"].armed)) [data-g="voyageEnterApproaches"]{display:none!important}
    ${S}:has([data-g="voyageMonitor"].armed) [data-g="hint"]{display:none!important}
    @media(max-width:760px){
      ${R} [data-g="voyageCta"] .gcta-btn{padding:13px 20px!important;font-size:12px!important}
      ${S}:not(.globe-intro):not(.following) [data-live="panel"]{right:50%!important;transform:translateX(50%);top:10vh!important}
    }
    /* 28 Oct 2026, Simon: the ship picker's buttons match the home page's white button (Play the journey): square, white, tracked capitals, an orange line that draws along the bottom on hover. Secondary ones (Clear, Change ship) take the Skip pill's look: a thin blue-violet-green outline. */
    ${WB} {position:relative!important;border-radius:0!important;background:#fff!important;color:#1A1D22!important;border:1px solid #fff!important;font:600 12px/1.2 'Jost',system-ui,sans-serif!important;letter-spacing:.14em!important;text-transform:uppercase!important;padding:13px 18px!important;text-shadow:none!important}
    ${WB.replace(/,/g, '::after,')}::after {content:'';position:absolute;left:0;bottom:-1px;height:3px;width:0;background:#FF8A1E;transition:width .25s ease}
    ${WB.replace(/,/g, ':hover::after,')}:hover::after, ${WB.replace(/,/g, ':focus-visible::after,')}:focus-visible::after {width:100%}
    ${WB.replace(/,/g, ':hover,')}:hover {background:#fff!important;color:#1A1D22!important;border-color:#fff!important}
    /* 1 Nov 2026, Simon: in Observe mode the two exits ('Find a ship to take in', 'Jump to the approaches') sat in the wrong place: the white-button restyle above sets position:relative!important on every .lreopen, which cancelled the pills' own corner placement (beat.css) and dropped them into the page flow at the top left over the legend. They are put back in the top right corner, stacked under the Skip to CIPS pill, the same width. */
    @media(min-width:821px){
      ${R} .beat-globe-live .lreopen{position:absolute!important;left:auto!important;right:16px!important;top:128px!important;bottom:auto!important;width:264px!important;min-width:0!important;text-align:center}
      ${R} .beat-globe-live .lreopen.lenter{top:176px!important}
    }
    @media(max-width:820px){
      ${R} .beat-globe-live .lreopen{position:absolute!important;left:auto!important;right:3vw!important;top:auto!important;bottom:4vh!important;min-width:220px!important;text-align:center}
      ${R} .beat-globe-live .lreopen.lenter{top:auto!important;bottom:calc(4vh + 52px)!important}
    }
    ${R} .beat-globe-live .ltake .ltake-l1 {font:600 10px 'Jost',system-ui,sans-serif;letter-spacing:.14em;opacity:.7}
    ${R} .beat-globe-live .ltake .ltake-l2 {font:700 13.5px 'Jost',system-ui,sans-serif;letter-spacing:.14em}
    ${WO} {position:relative!important;border-radius:0!important;background:rgba(6,10,18,.55)!important;color:#fff!important;border:0!important;font:600 11px/1.2 'Jost',system-ui,sans-serif!important;letter-spacing:.14em!important;text-transform:uppercase!important;padding:11px 16px!important}
    ${WO.replace(/,/g, '::before,')}::before {content:'';position:absolute;inset:0;padding:1px;background:linear-gradient(100deg,#9a4dff,#4fb0e4 55%,#5fe0b5);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
    ${WO.replace(/,/g, '::after,')}::after {content:'';position:absolute;left:0;bottom:-1px;height:3px;width:0;background:linear-gradient(100deg,#9a4dff,#4fb0e4 55%,#5fe0b5);transition:width .25s ease}
    ${WO.replace(/,/g, ':hover::after,')}:hover::after {width:100%}
    ${WO.replace(/,/g, ':hover,')}:hover {background:rgba(255,255,255,.1)!important;color:#fff!important}
    ${R} .beat-globe-live .lchange {padding:8px 12px!important;font-size:10px!important}
    ${R} .gstats.globe-proof-stats{gap:10px;align-items:stretch}
    ${R} .gstats.globe-proof-stats .s{display:block;flex:1 1 0;margin:0;padding:14px 16px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(6,10,18,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    ${R} .gstats.globe-proof-stats .s b{display:block;font-size:15px;line-height:1.2;margin-bottom:6px;color:#FF8A1E;white-space:normal}
    ${R} .gstats.globe-proof-stats .s span{display:block;font-size:9.5px;line-height:1.45;letter-spacing:.07em}
    ${R} .gstats.globe-proof-stats .s span{max-width:none!important;width:auto!important;white-space:normal}
    @media(min-width:821px){${S}.proof-stats-on .globeCopy:not(.globeCopy2){bottom:calc(6% + 170px)!important}}   /* the taller reason boxes: keep the opening invitation clear of them. 24 Sep 2026, Simon: the deep-zoom copy (.globeCopy2, beat.css) shares the .globeCopy class for its own styling and was being caught by this same !important rule, cancelling its own bottom positioning (undoing the fix for the sprite arriving hidden behind it) even though the reason boxes this rule protects against aren't visible at that point in the scroll. */
    @media(max-width:760px){
      ${R} .gstats.globe-proof-stats{left:18px;right:18px;bottom:3.5%;display:grid;grid-template-columns:1fr 1fr;gap:7px;padding-top:0;border-top:0}
      ${R} .gstats.globe-proof-stats .s{min-height:78px;padding:10px 11px}
      ${R} .gstats.globe-proof-stats .s b{font-size:12px;margin-bottom:4px}
      ${R} .gstats.globe-proof-stats .s span{font-size:8px;line-height:1.35}
    }
    ${S}.globe-ship-selected [data-g="voyageExample"],
    ${S}.globe-ship-selected [data-g="voyageMonitor"],
    ${S}.globe-ship-selected [data-live="results"],
    ${S}.globe-ship-selected [data-live="expand"],
    ${S}.globe-ship-selected [data-live="search"]{display:none!important}
    ${S}.globe-ship-selected .lactions{display:flex!important;flex-direction:column;margin:12px 0}
    ${S}.globe-ship-selected .lcard{display:flex!important}
    ${S}.globe-picker-reopened:not(.following) [data-live="panel"],
    ${S}.globe-ship-selected:not(.following) [data-live="panel"]{opacity:1!important;pointer-events:auto!important}
    ${S}.following [data-live="panel"]{display:none!important}
    ${R} .lactions button{min-height:44px}
    @media(max-width:820px){
      ${S}:not(.globe-intro):not(.following) [data-live="panel"]{box-sizing:border-box;left:auto!important;right:50%!important;transform:translateX(50%);top:10vh!important;bottom:auto!important;width:min(340px,92vw);max-height:75vh;max-height:75dvh;overflow-y:auto;touch-action:pan-y}
    }
    ${R} [data-live="panel"]{max-height:75vh;max-height:75dvh;overflow-y:auto;touch-action:pan-y}
    ${S}.globe-ship-selected:not(.following) .kin-callout-card:not([data-g]){display:none!important}
    ${R} .globe-prompt-dismissed{display:none!important}
    #globe-simulation-indicator{position:fixed;left:max(16px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));z-index:250;border:1px solid #ef9a5870;border-radius:999px;background:#081820ee;color:#ef9a58;padding:7px 13px;font:600 11px/1.3 Arial,sans-serif;letter-spacing:.08em;pointer-events:none}
  `;
  document.head.appendChild(style);

  const voyageButton = stage.querySelector('[data-g="voyageCtaBtn"]');
  if (voyageButton) { voyageButton.textContent = 'Play the journey'; voyageButton.addEventListener('click', () => stage.classList.remove('globe-intro')); }
  const pickerTitle = stage.querySelector('[data-live="panel"] .lhead b');
  if (pickerTitle) pickerTitle.textContent = 'Where are you sailing from?';

  installShipPicker(stage);
  arrangeDeparture(stage, S);
  addSkipLink(stage, R);
  extendNudges(stage, S);
  installVoyagePrompt(stage, {readyLabel: 'Scroll to see your route (simulated)', dismissOnScroll: false});   // keep Simon's pulsing prompts up

  const stats = stage.querySelector('.gstats');
  if (stats) {
    stats.innerHTML = `
      <div class="s proof-stat"><b>Duty and VAT Free Fuel</b><span>Competitive marine bunkering</span></div>
      <div class="s proof-stat"><b>Superyacht ready pontoons</b><span>Accessible superyacht pontoons and fendered berths</span></div>
      <div class="s proof-stat"><b>International airport (minutes from the harbour)</b><span>Owner, guest and crew connections close to the harbour</span></div>
      <div class="s proof-stat"><b>24/7 Tidal access</b><span>No locks, good access across the tide and plenty of sheltered bay anchorages</span></div>`;
    stats.classList.add('globe-proof-stats');
    stage.classList.add('proof-stats-on');
  }
  const hint = stage.querySelector('[data-g="hint"]');
  if (hint) hint.textContent = 'Swipe to rotate · scroll to move on';
  const invitation = stage.querySelector('.gsub');
  if (invitation) invitation.textContent = 'The Channel Islands sit at the Atlantic Gateway. Tell us where you\u2019re sailing from and we\u2019ll show you the journey.';
  const globeCanvas = stage.querySelector('canvas');
  if (globeCanvas && matchMedia('(pointer:coarse)').matches) globeCanvas.style.touchAction = 'pan-y';
}

// --- departure chooser (4 Nov 2026, Simon): replaces the ship finder. Three departure points, an optional vessel name (Kinship if left blank), then "Start the journey".
// The choice lives in js/vessel.js (window.CIPS_VESSEL); the globe (beat.js) follows it: the route from that start and the vessel's card title. The chart tag, the enquiry
// form and the mini-games read it too. "Observe the Channel Islands" and the ship list went with the live traffic they were for.
function arrangeDeparture(stage, S) {
  const panel = stage.querySelector('[data-live="panel"]');
  const start = stage.querySelector('[data-g="voyageExample"]');
  const V = window.CIPS_VESSEL;
  if (!panel || !start || !V || panel.querySelector('.depart')) return;
  const group = document.createElement('div');
  group.className = 'depart'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Where are you sailing from?');
  for (const d of Object.values(V.departures)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'depart-opt'; b.dataset.dep = d.key; b.textContent = d.label;
    b.setAttribute('aria-pressed', d.key === V.departure ? 'true' : 'false');
    b.addEventListener('click', () => {
      V.set({ departure: d.key }, { focus: true });
      for (const o of group.querySelectorAll('.depart-opt')) o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
    });
    group.appendChild(b);
  }
  const nameBox = document.createElement('label');
  nameBox.className = 'depart-name';
  nameBox.innerHTML = '<span>Your vessel\u2019s name <em>(optional)</em></span><input type="text" maxlength="40" placeholder="Kinship" autocomplete="off" spellcheck="false">';
  const input = nameBox.querySelector('input');
  if (V.custom) input.value = V.name;
  input.addEventListener('input', () => V.set({ name: input.value }));
  start.before(group);
  start.before(nameBox);
  const style = document.createElement('style');
  style.textContent = `
    ${S} [data-live="panel"] [data-live="search"],${S} [data-live="panel"] [data-live="results"],${S} [data-live="panel"] [data-live="expand"],${S} [data-live="panel"] [data-live="status"],
    ${S} [data-live="panel"] [data-g="voyageMonitor"],${S} [data-live="panel"] [data-live="card"],${S} [data-live="panel"] .lactions{display:none!important}
    ${S} .depart{display:grid;gap:8px;margin:14px 0 4px}
    ${S} .depart-opt{position:relative;padding:12px 14px;border:1px solid rgba(255,255,255,.28);border-radius:0;background:rgba(6,10,18,.55);color:#fff;text-align:left;cursor:pointer;font:600 12px/1.2 'Jost',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;min-height:44px}
    ${S} .depart-opt:hover{border-color:#fff}
    ${S} .depart-opt[aria-pressed="true"]{border-color:#FF8A1E;color:#FF8A1E;background:rgba(255,138,30,.10)}
    ${S} .depart-name{display:block;margin:14px 0;color:rgba(255,255,255,.72);font:500 11px/1.3 'Jost',system-ui,sans-serif;letter-spacing:.08em}
    ${S} .depart-name em{font-style:normal;opacity:.7}
    ${S} .depart-name input{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:11px 12px;border:1px solid rgba(255,255,255,.28);border-radius:0;background:rgba(6,10,18,.6);color:#fff;font:500 14px 'Jost',system-ui,sans-serif;letter-spacing:.04em}
    ${S} .depart-name input:focus{outline:0;border-color:#FF8A1E}
    ${S} .depart-name input::placeholder{color:rgba(255,255,255,.45)}
    ${S}.voyage-mode .depart,${S}.voyage-mode .depart-name{display:none!important}
    @media(max-width:820px){
      ${S}:not(.globe-intro):not(.following) [data-live="panel"]{top:calc(env(safe-area-inset-top) + 160px)!important;max-height:calc(100vh - 190px);max-height:calc(100dvh - 190px)}
    }
  `;
  document.head.appendChild(style);
}

// --- Skip link (21 Sep 2026): a way past the whole opening sequence without choosing a voyage. Simon's scroll lock
// stays for everyone else; the link releases it as it jumps, or the visitor would land on About unable to scroll.
function addSkipLink(stage, R) {
  const cta = stage.querySelector('[data-g="voyageCta"]');
  if (!cta || cta.querySelector('.skip-globe')) return;
  const skip = document.createElement('a');
  skip.className = 'skip-globe';
  skip.href = '#about';
  skip.textContent = 'Skip to CIPS ↓';
  skip.addEventListener('click', event => {
    const target = document.getElementById('about');
    if (!target) return;
    event.preventDefault();
    document.body.style.overflow = '';
    const header = document.querySelector('header')?.offsetHeight || 0;
    window.scrollTo({top: (window.__cipsSkipTarget && window.__cipsSkipTarget()) ?? (target.getBoundingClientRect().top + window.scrollY - header), behavior: 'instant'});   // (index.html: lands where the finale lands, not inside its last sliver)
    if (window.__cipsArrive) window.__cipsArrive();   // the journey above is taken out at once
  });
  cta.appendChild(skip);
  const style = document.createElement('style');
  style.textContent = `${R} .skip-globe{position:relative;pointer-events:auto;margin:0;align-self:center;display:inline-block;padding:15px 26px;font:600 12.5px/1.2 'Jost',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#fff;text-decoration:none;white-space:nowrap;border:0;background:transparent;transition:background .2s}
    ${R} .skip-globe::before{content:'';position:absolute;inset:0;padding:1px;background:linear-gradient(100deg,#9a4dff,#4fb0e4 55%,#5fe0b5);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
    ${R} .skip-globe::after{content:'';position:absolute;left:0;bottom:-1px;height:3px;width:0;background:linear-gradient(100deg,#9a4dff,#4fb0e4 55%,#5fe0b5);transition:width .25s ease}
    ${R} .skip-globe:hover,${R} .skip-globe:focus-visible{background:rgba(255,255,255,.06);color:#fff}
    ${R} .skip-globe:hover::after,${R} .skip-globe:focus-visible::after{width:100%}
    @media(max-width:760px){${R} .skip-globe{padding:13px 20px;font-size:12px}}`;
  document.head.appendChild(style);
}

// --- Simon's nudge pulses, carried over to the revised chooser (21 Sep 2026) ---
// His rule: a scroll attempt that cannot go anywhere pulses the next thing to press, twice, in orange. His own code still
// does the Start button, the panel outline, the demo/Observe buttons and the Observe exits. This adds the same beat to the
// chooser's new parts (the ship list and its "Click a ship" line, then "Go to Ship"), and lets a phone swipe count as a
// scroll attempt (his nudges listen to the mouse wheel and keyboard only).
function extendNudges(stage, S) {
  const panel = stage.querySelector('[data-live="panel"]');
  if (!panel) return;
  const restart = el => {
    if (!el || !el.getClientRects().length) return;
    el.classList.remove('gate-pulse'); void el.offsetWidth; el.classList.add('gate-pulse');
  };
  let busy = false;
  new MutationObserver(() => {
    if (busy || !panel.classList.contains('gate-pulse')) return;   // his voyagePulse() just fired on the panel
    busy = true; setTimeout(() => { busy = false; }, 2800);         // same 2.8 s spacing as his
    if (stage.classList.contains('globe-ship-selected')) restart(stage.querySelector('.lvoyage .ltake') || stage.querySelector('[data-live="follow"]'));
    else restart(stage.querySelector('[data-g="voyageExample"]'));
  }).observe(panel, {attributes: true, attributeFilter: ['class']});

  // A swipe up on a phone is a scroll attempt too: hand it to his wheel listeners while scrolling is held
  // (the voyage lock, or Observe mode's limit). Nothing is dispatched once the page scrolls freely.
  let startY = null;
  window.addEventListener('touchstart', e => { startY = e.touches[0]?.clientY ?? null; }, {passive: true});
  window.addEventListener('touchmove', e => {
    if (startY == null) return;
    const dy = startY - (e.touches[0]?.clientY ?? startY);
    if (dy < 24) return;
    startY = null;
    const held = document.body.style.overflow === 'hidden' || !!stage.querySelector('[data-g="voyageMonitor"].armed');
    if (held) window.dispatchEvent(new WheelEvent('wheel', {deltaY: dy, cancelable: true}));
  }, {passive: true});

  const style = document.createElement('style');
  style.textContent = `
    ${S} [data-g="voyageExample"].gate-pulse{animation:voyageCtaPulse 1.4s ease-in-out 2}
    ${S} [data-live="follow"].gate-pulse{animation:voyageCtaPulse 1.4s ease-in-out 2}
    @keyframes chooseHintPulse{0%,100%{text-shadow:none;color:#FF8A1E}50%{text-shadow:0 0 12px rgba(255,138,30,.85);color:#ffb070}}
  `;
  document.head.appendChild(style);
}
