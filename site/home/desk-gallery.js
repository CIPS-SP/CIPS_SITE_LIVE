/* A desk page's photo carousel (19 Nov 2026, Simon): the photos sit side by side and snap into place; swipe or scroll sideways, or use the arrows,
   which step one photo at a time and grey out at either end. Markup: .dgal[data-gallery] (not .gal: that is the home page's own picture grid) > .gw > .gb[data-d], .gs > ul.gt > li > img (sectors/yachting.html). */
(function () {
  [].forEach.call(document.querySelectorAll('[data-gallery]'), function (box) {
    var gs = box.querySelector('.gs'), ul = box.querySelector('.gt'), btns = box.querySelectorAll('.gb'); if (!gs || !ul) return;
    function step() { var li = ul.firstElementChild; return li ? li.getBoundingClientRect().width + 16 : gs.clientWidth; }
    function ends() { var max = gs.scrollWidth - gs.clientWidth - 2; [].forEach.call(btns, function (b) { b.disabled = (+b.getAttribute('data-d') < 0) ? gs.scrollLeft <= 2 : gs.scrollLeft >= max; b.hidden = max <= 0; }); }
    [].forEach.call(btns, function (b) { b.addEventListener('click', function () { gs.scrollBy({ left: (+b.getAttribute('data-d')) * step(), behavior: 'smooth' }); }); });
    gs.addEventListener('scroll', ends, { passive: true }); addEventListener('resize', ends); ends();
    [].forEach.call(ul.querySelectorAll('img'), function (i) { i.addEventListener('load', ends); });
  });
})();
