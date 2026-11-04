/* The home page enquiry form (24 Oct 2026, Simon: not only port calls). A topic first, then the fields that suit it; name, contact and a message are always there.
   It opens the visitor's email app with the answers laid out under the topic (single-file site, no backend yet). Fields for the other topics are hidden and disabled, so they are neither shown, required nor sent. */
(function () {
  var f = document.querySelector('form[data-enquiry]'); if (!f) return;
  var T = {
    port:    { label: 'Port call',                 lab: 'What do you need?',        ph: 'Clearance, bunkers, crew change, provisions…' },
    cargo:   { label: 'Cargo/Freight',              lab: 'Anything else we should know?', ph: 'Dimensions, weights, handling, deadlines…' },
    project: { label: 'Project',                    lab: 'Tell us about the project', ph: 'What is happening, where, and what support you need from us…' },
    registry:{ label: 'Registry services',      lab: 'How can we help?',          ph: 'Tell us about the vessel and what you would like to do…' },
    other:   { label: 'Other enquiry',             lab: 'How can we help?',          ph: 'Tell us what you need…' }
  };
  var topic = function () { return f.querySelector('input[name="topic"]:checked').value; };
  function sync() {
    var t = topic();
    f.querySelectorAll('[data-topic]').forEach(function (el) {
      var on = el.getAttribute('data-topic').split(' ').indexOf(t) > -1;
      el.hidden = !on;
      el.querySelectorAll('input,select,textarea').forEach(function (c) { c.disabled = !on; });
    });
    f.querySelector('label[for="message"]').textContent = T[t].lab; f.message.placeholder = T[t].ph;
  }
  f.addEventListener('change', function (e) { if (e.target.name === 'topic') sync(); });
  sync();
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = topic(), v = function (n) { return (f[n] && f[n].value || '').trim(); }, lines = ['Enquiry about: ' + T[t].label, ''], main = '';
    f.querySelectorAll('[data-topic]:not([hidden])').forEach(function (el) {
      var c = el.querySelector('input,select,textarea'), l = el.querySelector('label'), val = c && c.value.trim();
      if (!val) return; lines.push(l.textContent + ': ' + val); if (!main && el.hasAttribute('data-main')) main = val;
    });
    lines.push('Name: ' + v('name'), 'Contact: ' + v('email'), '', v('message'));
    var subject = 'CIPS enquiry - ' + T[t].label + ' - ' + (main || v('name'));
    window.location.href = 'mailto:dutyagent@cips.agency?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));
  });
})();
