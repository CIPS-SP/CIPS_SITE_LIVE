/* Journey counts (17 Nov 2026, Simon: "how many people did the journey, how many skipped to CIPS etc."). At each milestone the page sends
   one word to the CIPS drop box (the same address as reviews and enquiries, window.REVIEW_API from review/config.js), which keeps only a
   total per day (review-drop-box/src/counts.js; the totals at its /stats page). Each milestone is sent once per visit (this browser tab):
   no cookies, no identifiers, nothing about the visitor. On this PC (localhost) the notes go nowhere. */
(() => {
  const opening = document.getElementById('openingAct');
  if (!opening) return;
  const root = document.documentElement, KEY = 'cips.counted';
  let sent = new Set(); try { sent = new Set(JSON.parse(sessionStorage.getItem(KEY) || '[]')); } catch (e) { /* private window: counted per page load instead */ }
  const send = (ev) => {
    if (sent.has(ev)) return; sent.add(ev);
    try { sessionStorage.setItem(KEY, JSON.stringify([...sent])); } catch (e) {}
    const url = (window.REVIEW_API || '') + '/api/count';
    try { if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([ev], { type: 'text/plain' })))) fetch(url, { method: 'POST', body: ev, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {}); } catch (e) {}
  };
  // a scene is on screen when its stage is shown (the runtime hides the scenes not in play) and it overlaps the window
  const shown = (sel) => { const el = opening.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && getComputedStyle(el).visibility === 'visible'; };
  const check = () => {
    if (document.hidden) return;
    const main = root.classList.contains('main-collapsed') || root.classList.contains('on-cips-main');
    if (!main) send('open');
    const globe = opening.querySelector('.beat-globe-live > .beat-stage');
    if (globe && globe.classList.contains('voyage-mode')) send('start');
    if (!main && shown('.beat-seaway-wake')) send('sea');
    if (!main && shown('.beat-noirmont-transit')) send('coast');
    if (!main && shown('.beat-st-helier-approach')) send('harbour');
    if (root.classList.contains('cips-quay')) send('quay');
    if (opening.querySelector('.beat-st-helier-approach .vm-full.on') || root.classList.contains('cips-fin-end')) send('film');
    if (main) { send('main'); if (sent.has('film') && !sent.has('skip_journey')) send('finished'); }
    const tu = document.getElementById('turnUpright'); if (tu && !tu.hidden) send('sideways');
  };
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('#skipToCips, .skip-globe, #turnUpright button') : null;
    if (t) send(sent.has('start') || sent.has('sea') ? 'skip_journey' : 'skip_globe');
  }, true);
  addEventListener('cips:count', (e) => { if (e && typeof e.detail === 'string') send(e.detail); });
  setInterval(check, 700); check();
})();
