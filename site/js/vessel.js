/* The visitor's vessel (4 Nov 2026, Simon): where they are sailing from (Mediterranean, Northern Europe or Caribbean) and an optional name.
   Kinship, from the Mediterranean, is the default, so a visitor who skips the choice sees exactly the journey the site always had.
   One small shared state, read by: the globe (the route and the vessel's card), the chart scene's tag, the enquiry form (prefills the
   vessel field when a name was typed) and the mini-games (the pilot and the coastguard use the name). Kept for the browser session.
   window.CIPS_VESSEL = { name, title, custom, departure, dep:{key,label,place,lat,lng}, set(partial, opts) }; every change fires
   a 'cips:vessel' event on window with the state in event.detail. */
(function () {
  var KEY = 'cips.vessel';
  var DEPARTURES = {
    med:   { key: 'med',   label: 'Mediterranean',   place: 'Monaco',     lat: 43.7384, lng: 7.4246 },
    north: { key: 'north', label: 'Northern Europe', place: 'Rotterdam',  lat: 51.95,   lng: 4.14 },
    carib: { key: 'carib', label: 'Caribbean',       place: 'St Maarten', lat: 18.04,   lng: -63.05 }
  };
  var DEFAULT_NAME = 'Kinship';

  // a name as typed: letters, numbers, spaces, apostrophes, ampersands, dots, hyphens and a leading M/Y, S/Y or M/V; at most 32 characters
  function parse(raw) {
    var s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    var m = /^(m\/y|s\/y|m\/v)\s+/i.exec(s), prefix = 'M/Y';
    if (m) { prefix = m[1].toUpperCase(); s = s.slice(m[0].length); }
    s = s.replace(/[^\p{L}\p{N} '’&.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return { name: s, prefix: prefix };
  }

  var state = { departure: 'med', name: DEFAULT_NAME, prefix: 'M/Y', custom: false };
  try {
    var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (saved && DEPARTURES[saved.departure]) state.departure = saved.departure;
    if (saved && saved.custom && saved.name) { state.name = saved.name; state.prefix = saved.prefix || 'M/Y'; state.custom = true; }
  } catch (e) { /* no storage: the defaults */ }

  function publish() {
    var v = window.CIPS_VESSEL;
    v.name = state.name; v.custom = state.custom; v.departure = state.departure; v.dep = DEPARTURES[state.departure];
    v.title = (state.prefix + ' ' + state.name).toUpperCase();
    try { sessionStorage.setItem(KEY, JSON.stringify({ departure: state.departure, name: state.name, prefix: state.prefix, custom: state.custom })); } catch (e) {}
  }

  window.CIPS_VESSEL = {
    departures: DEPARTURES,
    // set({ departure:'carib' }) and/or set({ name:'Lalabe' }); an empty name goes back to Kinship. opts.focus asks the globe to turn to the departure.
    set: function (partial, opts) {
      partial = partial || {};
      if (partial.departure && DEPARTURES[partial.departure]) state.departure = partial.departure;
      if ('name' in partial) {
        var p = parse(partial.name);
        if (p.name) { state.name = p.name; state.prefix = p.prefix; state.custom = true; }
        else { state.name = DEFAULT_NAME; state.prefix = 'M/Y'; state.custom = false; }
      }
      publish();
      try { window.dispatchEvent(new CustomEvent('cips:vessel', { detail: Object.assign({ focus: !!(opts && opts.focus) }, window.CIPS_VESSEL) })); } catch (e) {}
    }
  };
  publish();

  // the enquiry form's vessel field: filled with the typed name (never with the default), until the visitor types there themselves
  function prefill() {
    var el = document.getElementById('vessel'), v = window.CIPS_VESSEL;
    if (!el || !v.custom) return;
    if (!el.value || el.dataset.auto === '1') { el.value = v.name; el.dataset.auto = '1'; }
  }
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('vessel');
    if (el) el.addEventListener('input', function () { el.dataset.auto = '0'; });
    prefill();
  });
  window.addEventListener('cips:vessel', prefill);
})();
