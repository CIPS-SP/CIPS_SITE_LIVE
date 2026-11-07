/* The home page enquiry form (24 Oct 2026, Simon: not only port calls). A topic first, then the fields that suit it; name, contact and a message are always there.
   Fields for the other topics are hidden and disabled, so they are neither shown, required nor sent.
   7 Nov 2026 (Simon: send from the site): the answers go to the CIPS drop box (window.REVIEW_API, set in review/config.js; same address as reviews),
   which SAVES them before it answers and then emails them to dutyagent@cips.agency through Brevo (review-drop-box/src/enquiry.js). So "Thank you,
   your enquiry is on its way to the CIPS team" is only shown once the box has it (Simon: not "sent", the email can take up to an hour if it has to be retried). If the box cannot be reached, the visitor is told so and offered their email app instead. */
(function () {
  var f = document.querySelector('form[data-enquiry]'); if (!f) return;
  var T = {
    port:    { label: 'Port call',                 lab: 'What do you need?',        ph: 'Clearance, bunkers, crew change, provisions…' },
    cargo:   { label: 'Cargo/Freight',              lab: 'Anything else we should know?', ph: 'Dimensions, weights, handling, deadlines…' },
    project: { label: 'Project',                    lab: 'Tell us about the project', ph: 'What is happening, where, and what support you need from us…' },
    registry:{ label: 'Registry services',      lab: 'How can we help?',          ph: 'Tell us about the vessel and what you would like to do…' },
    other:   { label: 'Other enquiry',             lab: 'How can we help?',          ph: 'Tell us what you need…' }
  };
  var PHONE = '+44 7797 720 723', opened = Date.now(), busy = false;
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

  // a field people never see or fill in; robots that fill in everything give themselves away
  var trap = document.createElement('div');
  trap.setAttribute('aria-hidden', 'true');
  trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
  trap.innerHTML = '<label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>';
  f.appendChild(trap);

  var btn = f.querySelector('button[type="submit"]'), btnText = btn.textContent;
  var status = document.createElement('div');
  status.setAttribute('role', 'status'); status.className = 'full'; status.style.cssText = 'margin:4px 0 0;color:var(--ink2);font-size:15px';
  btn.parentNode.parentNode.insertBefore(status, btn.parentNode.nextSibling);

  function gather() {
    var t = topic(), v = function (n) { return (f[n] && f[n].value || '').trim(); }, fields = [], main = '';
    f.querySelectorAll('[data-topic]:not([hidden])').forEach(function (el) {
      var c = el.querySelector('input,select,textarea'), l = el.querySelector('label'), val = c && c.value.trim();
      if (!val) return; fields.push({ l: l.textContent, v: val }); if (!main && el.hasAttribute('data-main')) main = val;
    });
    return { topic: t, fields: fields, main: main, name: v('name'), contact: v('email'), message: v('message'), website: (f.website && f.website.value) || '', ms: Date.now() - opened };
  }
  function mailto(d) {
    var lines = ['Enquiry about: ' + T[d.topic].label, ''];
    d.fields.forEach(function (x) { lines.push(x.l + ': ' + x.v); });
    lines.push('Name: ' + d.name, 'Contact: ' + d.contact, '', d.message);
    return 'mailto:dutyagent@cips.agency?subject=' + encodeURIComponent('CIPS enquiry - ' + T[d.topic].label + ' - ' + (d.main || d.name)) + '&body=' + encodeURIComponent(lines.join('\r\n'));
  }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function done(d, ref) {
    var box = document.createElement('div');
    box.className = 'full'; box.setAttribute('role', 'status'); box.tabIndex = -1;
    box.style.cssText = 'padding:22px 24px;border:1px solid var(--line, rgba(0,0,0,.12));border-radius:14px;background:var(--card, rgba(255,255,255,.6))';
    box.innerHTML = '<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:var(--ink, inherit)">Thank you, ' + esc(d.name.split(' ')[0]) + '. Your enquiry is on its way to the CIPS team.</p>' +
      '<p style="margin:0;color:var(--ink2);font-size:15px">Your reference is <b>' + esc(ref) + '</b>. Our duty agent will get back to you at ' + esc(d.contact) + '. ' +
      'If it is urgent, call or WhatsApp <a href="tel:+447797720723" style="color:inherit">' + PHONE + '</a>, 24/7.</p>';
    f.innerHTML = ''; f.appendChild(box); box.focus({ preventScroll: true });
  }
  function failed(d, why) {
    busy = false; btn.disabled = false; btn.textContent = btnText;
    status.innerHTML = '<span style="color:var(--ink, inherit)">' + why + '</span> <a href="' + esc(mailto(d)) + '" style="color:inherit;text-decoration:underline">Send it from your email app instead</a>, or call ' +
      '<a href="tel:+447797720723" style="color:inherit">' + PHONE + '</a>.';
  }

  f.addEventListener('submit', function (ev) {
    ev.preventDefault(); if (busy) return;
    var d = gather(); busy = true; btn.disabled = true; btn.textContent = 'Sending…'; status.textContent = '';
    var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    fetch((window.REVIEW_API || '') + '/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        clearTimeout(timer);
        if (o.s === 200 && o.j && o.j.ok && o.j.ref) return done(d, o.j.ref);
        failed(d, o.s === 429 ? 'We are receiving a lot of enquiries just now, so this one has not been sent.' : 'Sorry, this has not been sent.');
      })
      .catch(function () { clearTimeout(timer); failed(d, 'Sorry, we could not reach CIPS from here, so this has not been sent.'); });
  });
})();
