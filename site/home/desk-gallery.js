/* A desk page's photo carousel (19 Nov 2026, Simon): the photos sit side by side and snap into place; swipe or scroll sideways, or use the arrows,
   which step one photo at a time. They go round: Next on the last photo rolls back to the first, Back on the first goes to the last (Simon).
   Markup: .dgal[data-gallery] (not .gal: that is the home page's own picture grid) > .gw > .gb[data-d], .gs > ul.gt > li > img (sectors/yachting.html). */
(function () {
  [].forEach.call(document.querySelectorAll('[data-gallery]'), function (box) {
    var gs = box.querySelector('.gs'), ul = box.querySelector('.gt'), btns = box.querySelectorAll('.gb'); if (!gs || !ul) return;
    function step() { var li = ul.firstElementChild; return li ? li.getBoundingClientRect().width + 16 : gs.clientWidth; }
    function max() { return gs.scrollWidth - gs.clientWidth; }
    function show() { [].forEach.call(btns, function (b) { b.hidden = max() <= 2; }); }
    [].forEach.call(btns, function (b) { b.addEventListener('click', function () {
      var d = +b.getAttribute('data-d');
      if (d > 0 && gs.scrollLeft >= max() - 4) gs.scrollTo({ left: 0, behavior: 'smooth' });          // past the last: back to the first
      else if (d < 0 && gs.scrollLeft <= 4) gs.scrollTo({ left: max(), behavior: 'smooth' });          // before the first: round to the last
      else gs.scrollBy({ left: d * step(), behavior: 'smooth' });
    }); });
    addEventListener('resize', show); show();
    [].forEach.call(ul.querySelectorAll('img'), function (i) { i.addEventListener('load', show); });
  });
})();
