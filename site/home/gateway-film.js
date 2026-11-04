// The Atlantic Gateway band on the home page (1 Nov 2026, Simon): the still picture with a "Watch the film" play button. Nothing is downloaded until the band is wanted.
// 2 Nov 2026, Simon: once at least half the band is in view the film starts by itself, silent and looping, filling the band (.live); an Expand button (shown on mouseover) or a click opens the band out to the film's own shape with the player's controls (.playing, then .full).
// Reduced-motion and data-saver / slow connections keep the still with the "Watch the film" button instead. The film is cut from the video picker's list S7 (_beats/tools/site-directions/cut-gateway-film.py) into videos/gateway/.
// When the expanded film ends, or the cross is pressed, the band closes back to the quiet loop (or to the still where autoplay is off).
// 3 Nov 2026, Simon: on phones the Expand button (and Watch the film) go full screen, see theatre() below.
(function () {
  var band = document.getElementById('gwband'); if (!band) return;
  var film = band.querySelector('video'), btn = band.querySelector('.gwwatch'), x = band.querySelector('.gwx'), ex = band.querySelector('.gwe'); if (!film || !btn) return;
  var DIR = 'videos/gateway/';
  fetch(DIR + 'meta.json').then(function (r) { return r.json(); }).then(function (m) {
    var t = btn.querySelector('span'), d = m && m.film && m.film.duration; if (!t || !d) return;
    t.textContent = Math.floor(d / 60) + ':' + ('0' + Math.round(d % 60)).slice(-2);
  }).catch(function () {});
  function lean() { var c = navigator.connection || {}; return !!(c.saveData || /(^|-)2g$/.test(c.effectiveType || '') || c.effectiveType === '3g'); }
  var calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), auto = !calm && !lean();
  var expanded = false, held = false, ratio = 0, fullT;   // held: paused by a click, so scrolling back into view does not restart it
  film.removeAttribute('controls');
  function load() {
    if (film.getAttribute('src')) return;
    var small = (window.matchMedia && matchMedia('(max-width: 820px)').matches) || lean();
    film.src = DIR + (small ? 'atlantic-gateway-film-720.mp4' : 'atlantic-gateway-film.mp4');   // 2 Nov 2026, Simon: the 1080p film (29 MB) on desktop, the 720p film (15 MB) on phones, data-saver and slow connections
  }
  function play() { var p = film.play(); if (p && p.catch) p.catch(function () {}); }
  function goLive() { load(); film.muted = true; film.loop = true; if (!held) play(); }
  film.addEventListener('playing', function () { if (!expanded && auto) band.classList.add('live'); });
  function expand(fromStart) {
    load(); expanded = true; held = false; clearTimeout(fullT);
    band.classList.remove('live', 'held'); band.classList.add('playing');
    film.loop = false; film.controls = true; film.tabIndex = 0;
    if (fromStart) film.currentTime = 0;
    play();
    fullT = setTimeout(function () { band.classList.add('full'); }, 700);   // once the band has grown to the film's shape the picture is shown whole instead of filling
    var r = band.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight) setTimeout(function () { band.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
  }
  function collapse() {
    expanded = false; clearTimeout(fullT);
    band.classList.remove('full', 'playing'); film.controls = false; film.tabIndex = -1; film.loop = true;
    if (auto) { band.classList.add('live'); if (ratio >= .15) play(); else film.pause(); (ex || btn).focus({ preventScroll: true }); }
    else { film.pause(); btn.focus({ preventScroll: true }); }
  }
  // 3 Nov 2026, Simon: on phones (up to 820 px wide) Expand opens the film full screen instead of growing the band (which would shrink it to the film's 16:9 shape, smaller than the 460 px band): the player's own controls, landscape where the phone allows it, and back to the quiet loop when full screen is left or the film ends. If the browser has no full-screen for video, the band expands in place as on a wide screen.
  var fs = false;
  function phone() { return !!(window.matchMedia && matchMedia('(max-width: 820px)').matches); }
  function fsNow() { return !!(document.fullscreenElement || document.webkitFullscreenElement || film.webkitDisplayingFullscreen); }
  function leaveFs() {
    if (!fs) return; fs = false;
    try { screen.orientation.unlock(); } catch (e) {}
    film.controls = false; film.loop = true;
    if (auto) { band.classList.add('live'); if (ratio >= .15) play(); else film.pause(); }
    else film.pause();
  }
  function theatre(fromStart) {
    var f = film.requestFullscreen ? 'requestFullscreen' : film.webkitRequestFullscreen ? 'webkitRequestFullscreen' : film.webkitEnterFullscreen ? 'webkitEnterFullscreen' : ''; if (!f) return false;
    load(); fs = true; held = false; band.classList.remove('held');
    film.loop = false; film.controls = true; if (fromStart) film.currentTime = 0; play();
    var r; try { r = film[f](); } catch (e) { fs = false; film.controls = false; film.loop = true; return false; }
    if (r && r.then) r.then(function () { try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }, function () { leaveFs(); expand(fromStart); });
    return true;
  }
  function fsChange() { if (fs && !fsNow()) leaveFs(); }
  document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);
  film.addEventListener('webkitendfullscreen', function () { if (fs) leaveFs(); });
  btn.addEventListener('click', function () { if (phone() && theatre(true)) return; expand(true); });
  if (ex) ex.addEventListener('click', function (e) { e.stopPropagation(); if (phone() && theatre(false)) return; expand(false); });
  film.addEventListener('click', function () {
    if (fs || expanded || !band.classList.contains('live')) return;
    held = !film.paused; band.classList.toggle('held', held);   // 2 Nov 2026, Simon: a click pauses or resumes the loop; only the Expand button expands
    if (held) film.pause(); else play();
  });
  film.addEventListener('ended', function () {
    if (fs) {   // the film has finished in full screen: leave it (fsChange then puts the band back to the loop)
      film.currentTime = 0;
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (film.webkitExitFullscreen) film.webkitExitFullscreen();
      else leaveFs();
      return;
    }
    if (!expanded) return; film.currentTime = 0; collapse();
  });
  if (x) x.addEventListener('click', collapse);
  band.addEventListener('keydown', function (e) { if (e.key === 'Escape' && expanded) collapse(); });
  if (auto && 'IntersectionObserver' in window) new IntersectionObserver(function (es) {
    ratio = es[es.length - 1].intersectionRatio;
    if (ratio >= .5) { if (!expanded && !fs) goLive(); }
    else if (ratio < .15 && !film.paused && !fs) film.pause();   // (full screen covers the band, so it must not count as scrolled away)
  }, { threshold: [0, .15, .5] }).observe(band);
})();
