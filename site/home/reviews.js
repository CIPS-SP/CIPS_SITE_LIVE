/* The Port Call Index and "What our clients say" (moved here from index.html on 19 Nov 2026 so the desk pages share them).
   Fills #homeReviewCards (score #pciScore, #pciStars, one review at a time) with the CIPS Form reviews and #voices with the Testimonial and Imported ones,
   from the drop box's /api/reviews (window.REVIEW_API, review/config.js). The page's own examples stay if the list cannot be reached. */
(function(){
      // Port Call Index: the live reviews replace the three illustrative ones as soon as there are real ones
      function esc(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
      // one review at a time; the arrows go round them all (6 Nov 2026, Simon)
      function stars(n){ n = Math.max(0, Math.min(5, Math.round(+n || 0))); return n ? '<span class="st" aria-label="' + n + ' out of 5">' + '★★★★★'.slice(0, n) + '<i>' + '★★★★★'.slice(n) + '</i></span>' : ''; }
      // the score's stars filled to the exact score: 4.5 = four full stars and half of the fifth (6 Nov 2026, Simon)
      function partStars(v){ v = Math.max(0, Math.min(5, +v || 0)); var h = ''; for (var k = 0; k < 5; k++) { var f = Math.max(0, Math.min(1, v - k)); h += '<span class="s"><i style="width:' + Math.round(f * 100) + '%">★</i>★</span>'; } return '<span class="stp" role="img" aria-label="' + (Math.round(v * 10) / 10) + ' out of 5">' + h + '</span>'; }
      function cycle(){
        var wrap = document.getElementById('homeReviewCards'); if (!wrap) return;
        var rows = [].slice.call(wrap.querySelectorAll('.rvs .row')), c = wrap.querySelector('.rvc'), i = 0, many = rows.length > 1;
        function show(n){ i = (n + rows.length) % rows.length; rows.forEach(function(r, k){ r.classList.toggle('on', k === i); r.setAttribute('aria-hidden', k === i ? 'false' : 'true'); }); if (c) c.textContent = many ? (i + 1) + ' / ' + rows.length : ''; }
        [].forEach.call(wrap.querySelectorAll('.rvb'), function(b){ b.hidden = !many; b.onclick = function(){ show(i + (+b.getAttribute('data-d'))); }; });
        if (rows.length) show(0);
      }
      cycle();
      // "What our clients say" (18 Nov 2026, Simon): the cards glide sideways like the partner logos (paused while the pointer or a finger is on them, and for a while after an arrow or a swipe), and the arrows step one card at a time; still for reduced motion
      function voices(list){
        var box = document.getElementById('voices'); if (!box || !list.length) return;
        var ul = box.querySelector('.vt'), vs = box.querySelector('.vs');
        function card(r, copy){
          var li = document.createElement('li'), via = '';
          if (r.source) via = r.sourceLink ? '<a href="' + esc(r.sourceLink) + '" target="_blank" rel="noopener">via ' + esc(r.source) + ' &#8599;</a>' : 'via ' + esc(r.source);
          li.innerHTML = '<p>&ldquo;' + esc(r.didWell.trim()) + '&rdquo;</p><small>' + esc(r.from || '') + (r.from && r.when ? ' &middot; ' : '') + esc(r.when || '') + '</small>' + (via ? '<span class="via">' + via + '</span>' : '');
          if (copy) { li.setAttribute('aria-hidden', 'true'); [].forEach.call(li.querySelectorAll('a'), function(a){ a.tabIndex = -1; }); }
          return li;
        }
        list = list.slice(0, 40);
        list.forEach(function(r){ ul.appendChild(card(r, false)); });
        var loop = list.length > 1; if (loop) list.forEach(function(r){ ul.appendChild(card(r, true)); });   // a second set, so the glide goes round without a gap
        box.hidden = false;
        // a review cut to six lines gets Read more, which opens it (and holds the glide while it is open)
        var opened = 0;
        requestAnimationFrame(function(){ [].forEach.call(ul.children, function(li){ var p = li.querySelector('p'); if (!p || p.scrollHeight <= p.clientHeight + 2) return;
          var b = document.createElement('button'); b.type = 'button'; b.className = 'more'; b.textContent = 'Read more'; if (li.getAttribute('aria-hidden') === 'true') b.tabIndex = -1;
          b.addEventListener('click', function(){ var on = li.classList.toggle('open'); b.textContent = on ? 'Show less' : 'Read more'; opened += on ? 1 : -1; hold(on ? 1e9 : 5000); if (!opened) hold(5000); });
          p.insertAdjacentElement('afterend', b); }); });
        var still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), pos = 0, last = 0, holdUntil = 0, seen = false, SPEED = 26;   // px a second
        var half = function(){ return ul.scrollWidth / 2; }, hold = function(ms){ holdUntil = performance.now() + ms; };
        [].forEach.call(box.querySelectorAll('.vb'), function(b){ b.hidden = !loop; b.addEventListener('click', function(){ var w = (ul.firstElementChild ? ul.firstElementChild.getBoundingClientRect().width : 300) + 18; hold(7000); vs.scrollBy({ left: (+b.getAttribute('data-d')) * w, behavior: 'smooth' }); }); });
        ['pointerdown', 'touchstart', 'wheel', 'focusin'].forEach(function(ev){ vs.addEventListener(ev, function(){ hold(7000); }, { passive: true }); });
        if ('IntersectionObserver' in window) new IntersectionObserver(function(es){ seen = es[0].isIntersecting; }).observe(box); else seen = true;
        function step(t){
          var dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
          if (Math.abs(vs.scrollLeft - pos) > 2) pos = vs.scrollLeft;   // moved by an arrow or a finger: carry on from there
          if (loop) { var h = half(); if (pos >= h) { pos -= h; vs.scrollLeft = pos; } else if (pos < 1 && t > holdUntil) { pos += h; vs.scrollLeft = pos; } }
          if (loop && !still && seen && t > holdUntil && !box.matches(':hover')) { pos += SPEED * dt; vs.scrollLeft = pos; }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
      fetch((window.REVIEW_API || '') + '/api/reviews').then(function(x){ return x.json(); }).then(function(data){
        var all = (data && data.reviews) ? data.reviews : [];
        // 18 Nov 2026, Simon: the Port Call Index (its score and its panel) is the CIPS review form only (Type CIPS Form); testimonials and reviews from other sites (Testimonial, Imported) go in the strip below it; anything without a type is not shown
        voices(all.filter(function(r){ return (r.type === 'Testimonial' || r.type === 'Imported') && r.didWell && r.didWell.trim(); }));
        var reviews = all.filter(function(r){ return r.type === 'CIPS Form'; }); if (!reviews.length) return;
        // 6 Nov 2026, Simon: the big score is the CIPS overall score: the average of the overall star rating of every published (verified) review
        var scores = reviews.map(function(r){ return +r.overall; }).filter(function(n){ return n >= 1 && n <= 5; });
        if (scores.length) {
          var avg = scores.reduce(function(a, b){ return a + b; }, 0) / scores.length, el = document.getElementById('pciScore'), st = document.getElementById('pciStars');
          if (el) el.textContent = (Math.round(avg * 10) / 10).toFixed(1);
          if (st) st.innerHTML = partStars(avg) + ' VERIFIED &middot; ' + scores.length + (scores.length === 1 ? ' REVIEW' : ' REVIEWS');
        }
        var wrap = document.querySelector('#homeReviewCards .rvs'); if (!wrap) return;
        wrap.querySelectorAll('.row').forEach(function(n){ n.remove(); });
        reviews.slice(0, 30).forEach(function(r){
          var who = (r.ship ? esc(r.ship) : 'Verified master'), when = [r.port, r.when].filter(Boolean).map(esc).join(' · ');
          // the line made from the review's own answers: its overall rating, and "Will appoint again." when they said yes (6 Nov 2026, Simon: shown under the quote too, not only when there is no quote)
          var rated = 'Rated ' + (r.overall||'-') + '/5 on the CIPS Port Call Index.' + (r.appoint === 'Yes' ? ' Will appoint again.' : '');
          var quoted = !!(r.didWell && r.didWell.trim());
          var body = quoted ? '<p>“' + esc(r.didWell) + '”</p><p class="rated">' + esc(rated) + '</p>' : '<p>' + esc(rated) + '</p>';
          var d = document.createElement('div'); d.className = 'row'; d.innerHTML = body + '<small>' + stars(r.overall) + who.toUpperCase() + (when ? ' · ' + when.toUpperCase() : '') + '</small>'; wrap.appendChild(d);
        });
        cycle();
      }).catch(function(){ /* keep the illustrative examples on any error */ });
})();
