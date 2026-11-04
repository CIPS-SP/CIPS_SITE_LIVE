/* Dev aid (24 Oct 2026, Simon: "a toggle to switch between desktop and mobile, at all stages, which we can use during dev and testing").
   Load it first in a page's <head>. On a dev host (localhost, 127.0.0.1, file://) or after ?dev it adds a small "Phone" pill at the bottom centre
   (or press Ctrl+Shift+M). Phone mode puts the SAME page in a phone-sized frame, so the width media queries (and the games' own phone controls) behave as they
   would on a real phone; the bar above the frame switches between portrait, landscape and back to desktop, and desktop comes back on the page the frame was showing.
   Limits: a frame cannot fake `pointer:coarse` or real touch, so anything keyed only to that stays desktop-like; test it on a phone as well.
   ?dev switches the aid on for a hosted copy (remembered); ?dev=0 switches it off; ?device=phone opens straight into phone mode. Nothing shows on the live site without ?dev. */
(function () {
  if (window.top !== window) {   // inside the frame: only pass the keyboard shortcut up to the outer page
    addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) { try { top.postMessage('cips-device-toggle', '*'); } catch (x) {} } });
    return;
  }
  var KEY = 'cipsDevice', DEVKEY = 'cipsDev';
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  var sget = function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } };   // the chosen view lives only as long as the tab: a new tab or a restarted browser opens on desktop
  var sset = function (k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} };
  set('cipsDevice', null);   // (an earlier version kept the view for good, which could trap a page in phone view)
  var q = location.search;
  if (/[?&]dev=0\b/.test(q)) set(DEVKEY, null); else if (/[?&]dev\b/.test(q)) set(DEVKEY, '1');
  var local = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) || /\.localhost$/.test(location.hostname);
  if (!(local || get(DEVKEY) === '1') || /[?&]dev=0\b/.test(q)) return;
  if (/[?&]device=phone\b/.test(q)) sset(KEY, 'p'); if (/[?&]device=desktop\b/.test(q)) sset(KEY, 'd');   // ?device=desktop always gets you out
  var SIZES = { p: [390, 844, 'Phone upright'], l: [667, 375, 'Phone sideways'] };   // an iPhone-ish upright, and an SE-sized landscape (still under the 760px phone breakpoint)
  var mode = sget(KEY);

  function css(el, o) { for (var k in o) el.style[k] = o[k]; return el; }
  function make(tag, o, text) { var e = document.createElement(tag); if (o) css(e, o); if (text) e.textContent = text; return e; }

  if (mode === 'p' || mode === 'l') {
    var href = location.href.replace(/([?&])device=phone&?/, '$1').replace(/[?&]$/, '');
    try { window.stop(); } catch (e) {}   // the page's own parser stops here: the frame loads the page, this document becomes the shell
    var root = document.documentElement; while (root.firstChild) root.removeChild(root.firstChild);
    var head = root.appendChild(document.createElement('head')), body = root.appendChild(document.createElement('body'));
    head.appendChild(make('meta')).setAttribute('charset', 'utf-8'); head.appendChild(make('meta')).setAttribute('name', 'viewport'); head.lastChild.setAttribute('content', 'width=device-width,initial-scale=1'); head.appendChild(make('title', null, 'Phone view'));
    css(document.documentElement, { height: '100%', background: '#12161b' });
    css(body, { margin: '0', height: '100%', overflow: 'hidden', background: '#12161b', font: '600 12px/1 system-ui,sans-serif', color: '#dbe3ea', display: 'flex', flexDirection: 'column' });
    var bar = css(make('div'), { flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 12px', background: '#0b0e12', borderBottom: '1px solid #26303a' });
    var stage = css(make('div'), { flex: '1 1 auto', minHeight: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    var holder = css(make('div'), { position: 'relative', borderRadius: '30px', background: '#000', boxShadow: '0 0 0 9px #000,0 0 0 11px #3a4652,0 20px 60px rgba(0,0,0,.6)', overflow: 'hidden' });
    var frame = css(make('iframe'), { border: '0', display: 'block', background: '#fff', transformOrigin: '0 0' });
    frame.setAttribute('allow', 'autoplay; fullscreen; clipboard-write; geolocation'); frame.src = href;
    holder.appendChild(frame); stage.appendChild(holder); body.appendChild(bar); body.appendChild(stage);
    var btns = {}, info = css(make('span'), { opacity: '.6', margin: '0 6px', fontWeight: '500' });
    var btn = function (label, on) { var b = css(make('button', null, label), { font: 'inherit', padding: '7px 12px', borderRadius: '7px', border: '1px solid #3a4652', background: '#18202a', color: '#dbe3ea', cursor: 'pointer' }); b.addEventListener('click', on); bar.appendChild(b); return b; };
    var fit = function () {
      var s = SIZES[mode], w = s[0], h = s[1], availH = (window.innerHeight || 700) - ((bar.offsetHeight || 49) + 40), availW = (window.innerWidth || 1000) - 40, k = Math.max(0.2, Math.min(1, availH / h, availW / w));
      css(frame, { width: w + 'px', height: h + 'px', transform: 'scale(' + k + ')' }); css(holder, { width: Math.round(w * k) + 'px', height: Math.round(h * k) + 'px' });
      for (var m in btns) css(btns[m], { background: m === mode ? '#2a5fb0' : '#18202a', borderColor: m === mode ? '#6f9be0' : '#3a4652' });
      info.textContent = w + ' × ' + h + (k < 1 ? '  (shown at ' + Math.round(k * 100) + '%)' : '');
    };
    frame.addEventListener('load', function () { try { head.lastChild.textContent = (frame.contentDocument.title || 'CIPS') + ' (phone view)'; } catch (e) {} });
    btn('Desktop', function () { var t = href; try { t = frame.contentWindow.location.href; } catch (e) {} sset(KEY, 'd'); location.href = t; });
    btns.p = btn('Phone upright', function () { mode = 'p'; sset(KEY, 'p'); fit(); }); btns.l = btn('Phone sideways', function () { mode = 'l'; sset(KEY, 'l'); fit(); });
    btn('Reload', function () { try { frame.contentWindow.location.reload(); } catch (e) { frame.src = frame.src; } });
    bar.appendChild(info); addEventListener('resize', fit); fit(); requestAnimationFrame(fit); setTimeout(fit, 300); frame.addEventListener('load', fit);   // refit once the window has really laid out
    addEventListener('message', function (e) { if (e.data === 'cips-device-toggle') bar.firstChild.click(); });
    addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) bar.firstChild.click(); });
    return;
  }

  /* desktop: a quiet pill, and the shortcut */
  var go = function () { sset(KEY, 'p'); location.reload(); };
  addEventListener('keydown', function (e) { if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) go(); });
  addEventListener('message', function (e) { if (e.data === 'cips-device-toggle') go(); });
  var add = function () {
    if (!document.body) return;
    var b = css(make('button', null, '▯ Phone view'), { position: 'fixed', left: '50%', bottom: '6px', transform: 'translateX(-50%)', zIndex: '2147483000', font: '600 11px/1 system-ui,sans-serif', padding: '6px 10px', borderRadius: '14px', border: '1px solid rgba(255,255,255,.35)', background: 'rgba(8,14,20,.72)', color: '#fff', cursor: 'pointer', opacity: '.5' });
    b.title = 'Show this page in a phone-sized frame (Ctrl+Shift+M)'; b.setAttribute('data-dev-device', '');
    b.addEventListener('mouseenter', function () { b.style.opacity = '1'; }); b.addEventListener('mouseleave', function () { b.style.opacity = '.5'; }); b.addEventListener('click', go);
    document.body.appendChild(b);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
