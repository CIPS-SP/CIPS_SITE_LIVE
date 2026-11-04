/* CIPS Desk LIVE: click a concept screen to read it at full size.
   Works on the home page panel and the Desk LIVE page. Pictures marked data-lb form one set (data-cap is the caption);
   a button marked data-lb-open (the rotating panel) opens the slide that is showing; the example pictures open themselves.
   Esc closes, left and right arrows move between the screens, a click on the big picture toggles between "fit" and full size. */
(function(){
  var list = [], box, stage, big, cap, lastFocus = null, cur = 0, full = false;

  function collect(){
    var seen = {};
    [].forEach.call(document.querySelectorAll('img[data-lb]'), function(im){
      var src = im.getAttribute('src'); if (seen[src] !== undefined) return;
      seen[src] = list.length; list.push({ src: src, alt: im.getAttribute('alt') || '', cap: im.getAttribute('data-cap') || '' });
    });
    return seen;
  }

  function build(){
    var host = document.querySelector('.qr') || document.body;
    box = document.createElement('div'); box.className = 'lbx'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Concept screen, full size');
    box.innerHTML = '<div class="lbx-bar"><span class="lbx-cap"></span><span class="lbx-hint">Click the picture for full size</span><button type="button" class="lbx-x" aria-label="Close">×</button></div>' +
      '<button type="button" class="lbx-p" aria-label="Previous screen">‹</button><div class="lbx-stage"><img alt=""></div><button type="button" class="lbx-n" aria-label="Next screen">›</button>';
    host.appendChild(box);
    stage = box.querySelector('.lbx-stage'); big = stage.querySelector('img'); cap = box.querySelector('.lbx-cap');
    box.querySelector('.lbx-x').addEventListener('click', close);
    box.querySelector('.lbx-p').addEventListener('click', function(e){ e.stopPropagation(); go(-1); });
    box.querySelector('.lbx-n').addEventListener('click', function(e){ e.stopPropagation(); go(1); });
    big.addEventListener('click', function(e){ e.stopPropagation(); setFull(!full); });
    box.addEventListener('click', function(e){ if (e.target === box || e.target === stage) close(); });
    box.addEventListener('wheel', function(e){ e.stopPropagation(); if (!full) e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', function(e){
      if (box.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'Tab') { e.preventDefault(); box.querySelector('.lbx-x').focus(); }
    });
  }

  function setFull(on){ full = on; box.classList.toggle('full', on); stage.scrollTop = 0; stage.scrollLeft = on ? Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2) : 0; }
  function show(i){ cur = (i + list.length) % list.length; var it = list[cur]; big.src = it.src; big.alt = it.alt; cap.textContent = it.cap + '  ·  ' + (cur + 1) + ' of ' + list.length; setFull(false); }
  function go(d){ show(cur + d); }
  function open(i){ if (!box) build(); lastFocus = document.activeElement; box.hidden = false; show(i); box.querySelector('.lbx-x').focus(); }
  function close(){ box.hidden = true; big.removeAttribute('src'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }

  function init(){
    var idx = collect(); if (!list.length) return;
    // the rotating panel: opens the slide that is showing
    [].forEach.call(document.querySelectorAll('[data-lb-open]'), function(b){
      b.addEventListener('click', function(){ var on = b.querySelector('img.on') || b.querySelector('img'); open(idx[on.getAttribute('src')] || 0); });
    });
    // the example pictures: each opens itself
    [].forEach.call(document.querySelectorAll('img[data-lb]'), function(im){
      if (im.closest('[data-lb-open]')) return;
      im.setAttribute('tabindex', '0'); im.setAttribute('role', 'button'); im.setAttribute('aria-label', 'Enlarge: ' + (im.getAttribute('data-cap') || 'concept screen')); im.style.cursor = 'zoom-in';
      im.addEventListener('click', function(){ open(idx[im.getAttribute('src')] || 0); });
      im.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(idx[im.getAttribute('src')] || 0); } });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
