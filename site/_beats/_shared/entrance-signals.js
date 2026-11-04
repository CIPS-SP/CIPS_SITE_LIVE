/* _beats/_shared/entrance-signals.js — the St Helier harbour entrance traffic signals (an easter egg), shared by noirmont-transit and st-helier-approach.
   4 Oct 2026, Simon: IALA-style signals on the two northern tips of the SOUTHERN pier head (Victoria Pier) — one on the north-west tip facing out to sea, one on the north-east tip
   facing into the harbour. They show as soon as the pier heads are in view: "2 green over 1 white" (clear) until the vessel is abeam of Platte Beacon, then "3 red" (stop, vessel
   arriving). Small at the wide framing (sized from the real size of the signal against the land, so they grow as the view zooms in), a tiny detail for those who spot it.
   Each beat does its own projection (its own camera); this module owns the lamps, the colours and the rule for when they change. */
export const SIGNAL_TIPS = [
  [49.176167, -2.114750],   // north-west tip (faces out to sea)
  [49.176210, -2.114212],   // north-east tip (faces into the harbour)
];
export const PLATTE_BEACON = [49.1693333, -2.1224333];

// true once the vessel has come abeam of Platte Beacon (the beacon is on, or has fallen behind, her beam)
export function abeamPlatte(shipLatLng, headingDeg) {
  const cosLat = Math.cos(shipLatLng[0] * Math.PI / 180), dN = (PLATTE_BEACON[0] - shipLatLng[0]) * 60, dE = (PLATTE_BEACON[1] - shipLatLng[1]) * 60 * cosLat, h = headingDeg * Math.PI / 180;
  return dN * Math.cos(h) + dE * Math.sin(h) <= 0;   // component of the way to the beacon along her heading: ahead > 0, abeam = 0, astern < 0
}

const SIGNAL_REAL_HEIGHT_M = 12;   // the lamp board's real height, for sizing against the land

export function createEntranceSignals(stage) {
  if (!document.getElementById('cips-esig-style')) {
    const st = document.createElement('style'); st.id = 'cips-esig-style';
    st.textContent = `.cips-esig{position:absolute;z-index:4;width:0;height:0;opacity:0;pointer-events:none;transition:opacity .4s}
.cips-esig .bd{position:absolute;left:calc(var(--s)*-.23);top:calc(var(--s)*-.5);width:calc(var(--s)*.46);height:var(--s);box-sizing:border-box;border-radius:calc(var(--s)*.1);background:#12161a;border:1px solid #4a525a;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;padding:calc(var(--s)*.05) 0}
.cips-esig .lp{display:block;width:calc(var(--s)*.17);height:calc(var(--s)*.17);border-radius:50%;background:var(--c);box-shadow:0 0 calc(var(--s)*.28) calc(var(--s)*.05) var(--c);transition:background .6s,box-shadow .6s}`;
    document.head.appendChild(st);
  }
  const els = SIGNAL_TIPS.map(() => {
    const el = document.createElement('div'); el.className = 'cips-esig'; el.innerHTML = '<i class="bd"><b class="lp"></b><b class="lp"></b><b class="lp"></b></i>'; stage.appendChild(el);
    return { el, lamps: [...el.querySelectorAll('.lp')], state: '' };
  });
  const GO = ['#2fe36d', '#2fe36d', '#f3f6ff'], STOP = ['#ff3b30', '#ff3b30', '#ff3b30'];
  return {
    // items: [{x, y, on}] in stage pixels for each tip (same order as SIGNAL_TIPS); stop: red or clear; pxPerM: pixels per real metre at the signal
    place(items, stop, pxPerM) {
      const size = Math.max(8, Math.min(70, SIGNAL_REAL_HEIGHT_M * pxPerM));
      els.forEach((s, i) => {
        const it = items[i]; if (!it || !it.on) { s.el.style.opacity = '0'; return; }
        s.el.style.opacity = '1'; s.el.style.left = it.x.toFixed(1) + 'px'; s.el.style.top = it.y.toFixed(1) + 'px'; s.el.style.setProperty('--s', size.toFixed(1) + 'px');
        const want = stop ? 'stop' : 'go'; if (s.state !== want) { s.state = want; (stop ? STOP : GO).forEach((c, k) => s.lamps[k].style.setProperty('--c', c)); }
      });
    },
    destroy() { els.forEach(s => s.el.remove()); },
  };
}
