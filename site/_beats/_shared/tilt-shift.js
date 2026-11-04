/* Tilt-shift (16 Oct 2026, Simon: "lets use T throughout" - the miniature look): the top and bottom of the picture are softly blurred, the band across the middle (where Kinship is) stays sharp.
   Done with CSS backdrop-filter bands laid over the WebGL canvas and under the ship, labels and plotter, each band masked with a gradient so the blur fades in smoothly. Two layers per side
   (a broad light blur and a narrower stronger one) give a smooth falloff. Costs nothing in the scene itself; the browser blurs the finished frame. Where backdrop-filter is not supported
   it does nothing and the picture is simply sharp. Pass { tilt: false } in a beat's options to switch it off.
   20 Oct 2026: eased back (strength 1 -> 0.6, band 0.30 -> 0.27) now the land is sharper Wayback imagery: Simon, "pull back on the blur a bit". */
export function mountTiltShift(stage, { band = 0.27, strength = 0.6 } = {}) {
  const root = document.createElement('div'); root.className = 'tiltshift'; root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden';
  const mk = (top, heightPct, blurPx) => {
    const d = document.createElement('div'), dir = top ? 'to bottom' : 'to top', mask = 'linear-gradient(' + dir + ', #000 0%, rgba(0,0,0,.65) 38%, transparent 100%)', f = 'blur(' + (blurPx * strength).toFixed(1) + 'px)';
    d.style.cssText = 'position:absolute;left:0;right:0;' + (top ? 'top:0;' : 'bottom:0;') + 'height:' + heightPct + '%;backdrop-filter:' + f + ';-webkit-backdrop-filter:' + f + ';-webkit-mask-image:' + mask + ';mask-image:' + mask;
    return d; };
  const bandPct = band * 100;
  root.append(mk(true, bandPct + 18, 2.6), mk(true, bandPct - 6, 6.5), mk(false, bandPct + 18, 2.6), mk(false, bandPct - 6, 6.5));
  const canvas = stage.querySelector('canvas'); if (canvas && canvas.nextSibling) canvas.parentNode.insertBefore(root, canvas.nextSibling); else stage.appendChild(root);
  return { destroy() { root.remove(); } };
}
