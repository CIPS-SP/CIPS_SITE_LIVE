/* A desk page's photo gallery in the top panel (19 Nov 2026, Simon): one large photo with arrows, a strip of thumbnails under it, the panel's
   title bar showing what the photo is. It moves on by itself every 5 seconds; it waits while the pointer is over it, for 12 seconds after
   someone chooses a photo, while it is off screen or the tab is hidden, and never for people who ask for reduced motion. Swipe on a phone.
   The markup is written by tools/build-carousel.py between the hero-gallery markers in sectors/<desk>.html (from the image picker's picks). */
(function () {
  [].forEach.call(document.querySelectorAll('[data-hero-gallery]'), function (box) {
    var main = box.querySelector('.hm'), cap = box.querySelector('.hcap'), num = box.querySelector('.hn'), strip = box.querySelector('.hth');
    var th = [].slice.call(box.querySelectorAll('.hth button')), n = th.length; if (!main || !n) return;
    var prefix = cap ? (cap.getAttribute('data-prefix') || '') : '', i = 0, holdUntil = 0, over = false, seen = true, swap = 0;
    var still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    function mark() {
      th.forEach(function (t, j) { t.classList.toggle('on', j === i); t.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      if (cap && cap.hasAttribute('data-prefix')) cap.textContent = prefix + th[i].getAttribute('data-alt');   /* the description in the title bar only when the page asks for it (data-prefix); 19 Nov 2026, Simon: off for now */
      if (num) num.textContent = (i + 1) + ' / ' + n;
      var b = th[i], left = b.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2;   // keep the chosen thumbnail in view (the strip only, not the page)
      if (strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
    function show(k, byHand) {
      i = (k + n) % n; if (byHand) holdUntil = Date.now() + 12000; mark();
      var b = th[i], src = b.getAttribute('data-src'), alt = b.getAttribute('data-alt'), mine = ++swap, pre = new Image();
      pre.onload = pre.onerror = function () { if (mine !== swap) return; main.classList.add('fade');
        setTimeout(function () { if (mine !== swap) return; main.src = src; main.alt = alt; main.classList.remove('fade'); }, still ? 0 : 220); };
      pre.src = src;
      new Image().src = th[(i + 1) % n].getAttribute('data-src');                     // the next one ready in the background
    }
    [].forEach.call(box.querySelectorAll('.hb'), function (b) { b.addEventListener('click', function () { show(i + (+b.getAttribute('data-d')), true); }); });
    th.forEach(function (b, j) { b.addEventListener('click', function () { show(j, true); }); });
    box.addEventListener('mouseenter', function () { over = true; }); box.addEventListener('mouseleave', function () { over = false; });
    box.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') { show(i - 1, true); e.preventDefault(); } else if (e.key === 'ArrowRight') { show(i + 1, true); e.preventDefault(); } });
    var x0 = null, stage = main.parentNode;
    stage.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; holdUntil = Date.now() + 12000; }, { passive: true });
    stage.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1), true); }, { passive: true });
    strip.addEventListener('touchstart', function () { holdUntil = Date.now() + 12000; }, { passive: true });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }).observe(box);
    mark(); new Image().src = th[1 % n].getAttribute('data-src');
    if (!still && n > 1) setInterval(function () { if (over || !seen || document.hidden || Date.now() < holdUntil) return; show(i + 1, false); }, 5000);
  });
})();
