/* The mini-games' leaderboard on the end cards (24 Nov 2026, Simon: points for every game, stars still the main measure; leaderboard option B).
   Under a game's points: "Add your score": three initials (A to Z) and the kind of vessel, then the top 10 this week and all time. Nothing else is sent:
   no name, no address. The scores are kept by the CIPS drop box (review-drop-box/src/board.js; Simon can hide an entry from its /stats page).
   This visit's points per game are kept in sessionStorage ('cips.scores'): once all three games have been played, the card also offers the
   Port Call Score (out of 3,000). The initials and vessel type last used are remembered in this browser only ('cips.initials'), to save typing.
   If the drop box cannot be reached (or on the local preview), the card says so and the game carries on. */

const VT = [['yacht', 'Yacht'], ['cruise', 'Cruise'], ['offshore', 'Offshore'], ['shipping', 'Shipping'], ['other', 'Other']];
const NAMES = { approaches: 'The Approaches', line: 'Hold the Line', berth: 'The Berthing', journey: 'Port Call Score' };
const api = () => { try { if (typeof window.REVIEW_API === 'string') return window.REVIEW_API; if (window.parent !== window && typeof window.parent.REVIEW_API === 'string') return window.parent.REVIEW_API; } catch (e) {} return ''; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { return JSON.parse(sessionStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const keep = { get() { try { return JSON.parse(localStorage.getItem('cips.initials') || 'null') || {}; } catch (e) { return {}; } }, set(v) { try { localStorage.setItem('cips.initials', JSON.stringify(v)); } catch (e) {} } };

let styled = false;
function style() {
  if (styled) return; styled = true;
  const st = document.createElement('style');
  st.textContent = `
  .cips-lb{margin:14px 0 4px;padding:12px 0 0;border-top:1px solid rgba(127,127,127,.35);text-align:left;font:400 13px/1.45 Inter,system-ui,sans-serif;color:inherit}
  .cips-lb h4{margin:0 0 8px;font:600 11px/1.3 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
  .cips-lb form{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .cips-lb input,.cips-lb select{font:600 14px Inter,system-ui,sans-serif;padding:7px 8px;border:1px solid rgba(127,127,127,.55);border-radius:0;background:rgba(255,255,255,.08);color:inherit}
  .cips-lb input{width:4.6em;text-transform:uppercase;letter-spacing:.18em;text-align:center}
  .cips-lb select option{color:#14181f}
  .cips-lb button{font:600 12px Inter,system-ui,sans-serif;letter-spacing:.06em;padding:8px 12px;border:1px solid #FF8A1E;background:#FF8A1E;color:#14181f;cursor:pointer;border-radius:0}
  .cips-lb button.ghost{background:transparent;color:inherit;border-color:rgba(127,127,127,.55)}
  .cips-lb .msg{margin:6px 0 0;font-size:12px;color:inherit;opacity:.9}
  .cips-lb form[hidden],.cips-lb .tabs[hidden]{display:none}
  .cips-lb p,.cips-lb li,.cips-lb span,.cips-lb b{color:inherit;opacity:1}.cips-lb li.me,.cips-lb li.me *{color:#FF8A1E}
  .cips-lb .tabs{display:flex;gap:6px;margin:10px 0 6px}
  .cips-lb .tabs button{padding:5px 9px;font-size:11px}
  .cips-lb .tabs button[aria-pressed="false"]{background:transparent;color:inherit;border-color:rgba(127,127,127,.55)}
  .cips-lb ol{margin:0;padding:0;list-style:none;counter-reset:r}
  .cips-lb li{display:grid;grid-template-columns:1.6em 3.4em 1fr auto;gap:8px;padding:3px 0;border-bottom:1px solid rgba(127,127,127,.18);font-variant-numeric:tabular-nums}
  .cips-lb li::before{counter-increment:r;content:counter(r);opacity:.6}
  .cips-lb li.me{color:#FF8A1E;font-weight:600}
  .cips-lb .pcs{margin:12px 0 0;padding:10px 12px;border:1px solid #FF8A1E}
  .cips-lb .pcs b{font-size:16px}`;
  document.head.appendChild(st);
}

function list(el, rows, meId) {
  el.innerHTML = rows.length ? '<ol>' + rows.map(r => `<li class="${r.id === meId ? 'me' : ''}"><b>${esc(r.initials)}</b><span>${esc((VT.find(v => v[0] === r.vtype) || [, ''])[1])}</span><b>${r.score}</b></li>`).join('') + '</ol>' : '<p class="msg">No scores yet. Be the first.</p>';
}

function block(host, game, score, secs) {
  const el = document.createElement('div'); el.className = 'cips-lb';
  const k = keep.get();
  el.innerHTML = `<h4>Leaderboard · ${esc(NAMES[game])}</h4>
    <form><input name="i" maxlength="3" autocomplete="off" spellcheck="false" placeholder="ABC" aria-label="Your initials, three letters" value="${esc(k.i || '')}">
    <select name="v" aria-label="Your kind of vessel">${VT.map(([v, l]) => `<option value="${v}"${k.v === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <button type="submit">Add my ${score} points</button> <button type="button" class="ghost" data-see>See the board</button></form>
    <p class="msg" data-msg>Initials and vessel type only: nothing else is kept.</p>
    <div class="tabs" hidden><button type="button" data-t="week" aria-pressed="true">This week</button><button type="button" data-t="all" aria-pressed="false">All time</button></div><div data-list></div>`;
  host.appendChild(el);
  const form = el.querySelector('form'), msg = el.querySelector('[data-msg]'), tabs = el.querySelector('.tabs'), out = el.querySelector('[data-list]');
  let data = null, meId = null, tab = 'week';
  const show = () => { if (!data) return; tabs.hidden = false; tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === tab ? 'true' : 'false')); list(out, data[tab] || [], meId); };
  tabs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; show(); } });
  // the game's own keys must not take the letters typed here
  for (const t of ['keydown', 'keyup', 'pointerdown', 'wheel']) el.addEventListener(t, e => e.stopPropagation());
  const fail = () => { msg.textContent = 'The leaderboard cannot be reached just now. Your points still count for this visit.'; };
  el.querySelector('[data-see]').addEventListener('click', async () => {
    try { const r = await fetch(api() + '/api/leaderboard?game=' + game, { cache: 'no-store' }); if (!r.ok) return fail(); data = await r.json(); show(); } catch (e) { fail(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const initials = form.i.value.toUpperCase().replace(/[^A-Z]/g, ''), vtype = form.v.value;
    if (initials.length !== 3) { msg.textContent = 'Three letters, please (A to Z).'; form.i.focus(); return; }
    keep.set({ i: initials, v: vtype });
    const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; msg.textContent = 'Adding…';
    try {
      const r = await fetch(api() + '/api/score', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ game, score, initials, vtype, secs: Math.round(secs) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { btn.disabled = false; msg.textContent = j.error === 'initials' ? 'Those initials cannot go on the board. Try others.' : j.error === 'busy' ? 'That is a lot of scores in an hour. Try again later.' : j.error === 'quick' ? 'That was quicker than the game allows, so it cannot go on the board.' : 'The leaderboard cannot take that score just now.'; return; }
      data = j; meId = j.id; form.hidden = true;
      const pos = (j.week || []).findIndex(x => x.id === j.id);
      msg.textContent = pos >= 0 ? `On the board: number ${pos + 1} this week.` : 'Added. Not in this week\'s top 10 yet: have another go.';
      show();
    } catch (err) { btn.disabled = false; fail(); }
  });
  return el;
}

/* Called by each game's end card: game 'approaches' | 'line' | 'berth', its points (0 to 1,000) and the seconds it took. */
export function mountLeaderboard(host, { game, score, secs }) {
  if (!host) return;
  style();
  host.querySelectorAll(':scope > .cips-lb').forEach(n => n.remove());
  const best = store.get('cips.scores', {}); const prev = best[game];
  if (!prev || score > prev.score) best[game] = { score, secs }; store.set('cips.scores', best);
  block(host, game, score, secs);
  const all = ['approaches', 'line', 'berth'];
  if (all.every(g => best[g])) {
    const total = all.reduce((s, g) => s + best[g].score, 0), tsecs = all.reduce((s, g) => s + (best[g].secs || 0), 0);
    const p = document.createElement('div'); p.className = 'cips-lb pcs';
    p.innerHTML = `<p style="margin:0 0 6px">All three games played this visit. <b>Port Call Score: ${total}</b> of 3,000.</p>`;
    host.appendChild(p); block(p, 'journey', total, tsecs);
  }
}
