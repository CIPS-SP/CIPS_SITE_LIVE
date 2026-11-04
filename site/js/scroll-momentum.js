/* Scroll momentum for the globe journey (22 Oct 2026, Simon).
   A mouse wheel moves the page in steps and stops dead when you let go. This gives a quick flick of the wheel some carry:
   the page, and so the ship, keeps travelling a little after the last notch and slows down by itself, like a desk globe.
   - Only a flick (three or more notches close together) coasts. A single notch or a slow scroll behaves exactly as before.
   - Only on a mouse wheel. Trackpads and touch screens already coast by themselves, so they are left alone.
   - Only in the journey, above the home page. Below that, scrolling is untouched.
   - Any new wheel, key, touch or click stops it at once, and it gives up if something (the globe's scroll hold, say) blocks the page.
   Dials: FRICTION (closer to 1 coasts longer), GAIN (how much of the flick speed it keeps), MAX_VEL (the fastest it can coast).
   Add ?nomomentum to the address to switch it off and compare. */
(function(){
  if (location.search.indexOf('nomomentum') >= 0) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var FRICTION = 0.955, GAIN = 0.65, MAX_VEL = 65, MIN_NOTCHES = 3;   // 23 Oct 2026, Simon: "a bit freer" (was 0.94, 0.5, 55): the page, and so the ship, carries further after a flick
  var hist = [], timer = 0, raf = 0, vel = 0, lastT = 0, startY = 0;

  function journeyEnd(){ var q = document.querySelector('.qr'); return q ? q.getBoundingClientRect().top + window.scrollY - 40 : Infinity; }
  function stop(){ vel = 0; cancelAnimationFrame(raf); }

  function coast(now){
    var f = lastT ? Math.min(3, (now - lastT) / 16.666) : 1; lastT = now;
    var before = window.scrollY, step = vel * f;
    window.scrollTo({ top: before + step, behavior: 'instant' });
    var moved = window.scrollY - before;
    if (Math.abs(moved) < Math.abs(step) * 0.4 || window.scrollY >= journeyEnd()) { stop(); return; }   // blocked (the globe's hold, the top, the end of the journey)
    vel *= Math.pow(FRICTION, f);
    if (Math.abs(vel) < 0.6) { stop(); return; }
    raf = requestAnimationFrame(coast);
  }

  function release(){
    var n = hist.length; if (n < MIN_NOTCHES) { hist.length = 0; return; }
    var last = hist[n - 1].t, sum = 0, recent = 0;
    for (var i = 0; i < n; i++) { sum += hist[i].dy; if (last - hist[i].t <= 200) recent += hist[i].dy; }
    var travelled = window.scrollY - startY; hist.length = 0;
    if (Math.abs(travelled) < Math.abs(sum) * 0.3) return;      // the page did not follow the wheel (held back): nothing to carry
    if (window.scrollY >= journeyEnd() || window.scrollY <= 0) return;
    vel = Math.max(-MAX_VEL, Math.min(MAX_VEL, (recent / 200) * 16.666 * GAIN));
    if (Math.abs(vel) < 4) { vel = 0; return; }
    lastT = 0; raf = requestAnimationFrame(coast);
  }

  addEventListener('wheel', function(e){
    stop(); clearTimeout(timer);
    var dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (e.ctrlKey || Math.abs(dy) < 50) { hist.length = 0; return; }       // pinch zoom, and trackpads (small steady deltas)
    var now = performance.now();
    if (hist.length && now - hist[hist.length - 1].t > 250) hist.length = 0;
    if (!hist.length) startY = window.scrollY;
    hist.push({ t: now, dy: dy });
    timer = setTimeout(release, 90);
  }, { passive: true });

  ['pointerdown', 'touchstart', 'keydown'].forEach(function(ev){ addEventListener(ev, function(){ stop(); clearTimeout(timer); hist.length = 0; }, { passive: true }); });
})();
