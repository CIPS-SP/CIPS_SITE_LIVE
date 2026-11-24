// Journey counts (17 Nov 2026, Simon: "how many people did the journey, how many skipped to CIPS"). The home page sends a one-word note at
// each milestone (site/js/journey-counts.js); the box keeps nothing but a total per day per milestone. No cookies, no addresses, nothing
// about the visitor. The totals live in a Durable Object with its own small SQLite table, not in the BOX store: the free plan allows only
// about 1,000 BOX writes a day for everything (reviews, enquiries), and a busy day of visits must not use them up.
//
//   POST /api/count   public   text body, milestone names separated by commas, e.g. "open,start" (from the site's own addresses only)
//   GET  /stats       Simon    the totals as a page; the browser asks for a password: any user name, the STATS_KEY secret as the password

export const EVENTS = {
  open: 'Saw the globe',
  start: 'Started the journey',
  skip_globe: 'Skipped to CIPS at the globe',
  sea: 'Reached the open sea',
  coast: 'Reached the Jersey coast',
  harbour: 'Reached St Helier harbour',
  quay: 'Reached the quay',
  film: 'Saw the closing film',
  skip_journey: 'Skipped to CIPS during the journey',
  finished: 'Went on to the main site after the film',
  main: 'Reached the main site (any way)',
  sideways: 'Saw "Turn your phone upright"',
  enquiry: 'Sent an enquiry',
};
const ORDER = Object.keys(EVENTS);
import { GAMES, VTYPES, PER_HOUR, parseScore } from './board.js';

// Problem reports (21 Nov 2026, Simon: a friend's Chrome sat on "Loading the globe" for ever; Edge worked). When the globe cannot start, the home page
// sends what went wrong, the browser's name and version and the system (e.g. "Chrome 131 · Windows"), and the first line of the error. Nothing about
// the visitor: no address, no identifier. The box keeps a count per day for each different report, shown under the journey counts at /stats.
//   POST /api/problem   public   JSON {"kind":"no_webgl","browser":"Chrome 131 · Windows","err":"..."} (from the site's own addresses only)
export const PROBLEMS = {
  no_webgl: 'The browser cannot draw 3D (WebGL off or blocked)',
  globe_error: 'The globe failed while starting',
  slow: 'The globe was still not ready after 40 s',
};
const clean = (s, n) => String(s || '').replace(/[^\w .,:;()/'"+#·-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export function parseProblem(text) {
  let o; try { o = JSON.parse(String(text || '').slice(0, 1000)); } catch (e) { return null; }
  if (!o || !Object.prototype.hasOwnProperty.call(PROBLEMS, o.kind)) return null;
  return { kind: o.kind, browser: clean(o.browser, 60) || 'unknown', err: clean(o.err, 160) };
}

// the day in Jersey (the same as London's)
export function dayOf(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }

export function parseEvents(text) { return [...new Set(String(text || '').slice(0, 300).split(/[\s,]+/).filter((e) => Object.prototype.hasOwnProperty.call(EVENTS, e)))].slice(0, 13); }

// the Durable Object: one instance ("journey") holds every total
export class Counter {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS c (day TEXT NOT NULL, ev TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, ev))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS p (day TEXT NOT NULL, kind TEXT NOT NULL, browser TEXT NOT NULL, err TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, kind, browser, err))');
    // the leaderboard (24 Nov 2026, src/board.js): one row per score sent in; r: how many each connection (a hash, never the address) sent this hour
    this.sql.exec('CREATE TABLE IF NOT EXISTS s (id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, score INTEGER NOT NULL, initials TEXT NOT NULL, vtype TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS r (k TEXT NOT NULL, hour INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, hour))');
  }
  async fetch(request) {
    const u = new URL(request.url);
    if (u.pathname === '/add') {
      const day = u.searchParams.get('day') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Response('bad day', { status: 400 });
      for (const ev of parseEvents(u.searchParams.get('evs'))) this.sql.exec('INSERT INTO c (day, ev, n) VALUES (?, ?, 1) ON CONFLICT (day, ev) DO UPDATE SET n = n + 1', day, ev);
      return new Response('ok');
    }
    if (u.pathname === '/score/add') {
      const sc = parseScore(u.searchParams.get('s')), k = u.searchParams.get('k') || '', at = Number(u.searchParams.get('at')) || Date.now(), hour = Math.floor(at / 3600000);
      if (sc.error) return Response.json({ error: sc.error }, { status: 400 });
      const used = this.sql.exec('SELECT n FROM r WHERE k = ? AND hour = ?', k, hour).toArray()[0];
      if (used && used.n >= PER_HOUR) return Response.json({ error: 'busy' }, { status: 429 });
      this.sql.exec('INSERT INTO r (k, hour, n) VALUES (?, ?, 1) ON CONFLICT (k, hour) DO UPDATE SET n = n + 1', k, hour);
      this.sql.exec('DELETE FROM r WHERE hour < ?', hour - 2);
      this.sql.exec('INSERT INTO s (game, score, initials, vtype, day, at) VALUES (?, ?, ?, ?, ?, ?)', sc.game, sc.score, sc.initials, sc.vtype, dayOf(at), at);
      const id = this.sql.exec('SELECT last_insert_rowid() AS id').toArray()[0].id;
      return Response.json({ ok: true, id });
    }
    if (u.pathname === '/score/top') {
      const game = u.searchParams.get('game'); if (!GAMES[game]) return Response.json({ error: 'game' }, { status: 400 });
      const since = u.searchParams.get('since') || '0000-00-00';
      const q = (from) => this.sql.exec('SELECT id, score, initials, vtype, day FROM s WHERE game = ? AND hidden = 0 AND day >= ? ORDER BY score DESC, at ASC LIMIT 10', game, from).toArray();
      return Response.json({ week: q(since), all: q('0000-00-00') });
    }
    if (u.pathname === '/score/hide') {
      this.sql.exec('UPDATE s SET hidden = ? WHERE id = ?', u.searchParams.get('undo') ? 0 : 1, Number(u.searchParams.get('id')) || 0);
      return Response.json({ ok: true });
    }
    if (u.pathname === '/score/recent') return Response.json(this.sql.exec('SELECT id, game, score, initials, vtype, day, hidden FROM s ORDER BY id DESC LIMIT 60').toArray());
    if (u.pathname === '/problem') {
      const day = u.searchParams.get('day') || '', pr = parseProblem(u.searchParams.get('p'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !pr) return new Response('bad', { status: 400 });
      this.sql.exec('INSERT INTO p (day, kind, browser, err, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT (day, kind, browser, err) DO UPDATE SET n = n + 1', day, pr.kind, pr.browser, pr.err);
      return new Response('ok');
    }
    if (u.pathname === '/problems') {
      const since = u.searchParams.get('since') || '0000-00-00';
      return Response.json(this.sql.exec('SELECT day, kind, browser, err, n FROM p WHERE day >= ? ORDER BY day DESC, n DESC LIMIT 200', since).toArray());
    }
    if (u.pathname === '/list') {
      const since = u.searchParams.get('since') || '0000-00-00';
      return Response.json(this.sql.exec('SELECT day, ev, n FROM c WHERE day >= ? ORDER BY day', since).toArray());
    }
    return new Response('not found', { status: 404 });
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// the totals page: today, the last 7, 30, 90 and 365 days and all time per milestone (with the share of everyone who saw the globe), then day by day.
// Nothing is ever deleted: every day's totals are kept (a row per milestone per day, a few kilobytes a year).
export function statsPage(rows, now, problems = [], scores = []) {
  const days = [...new Set(rows.map((r) => r.day))].sort().reverse();
  const get = {}; for (const r of rows) (get[r.day] || (get[r.day] = {}))[r.ev] = r.n;
  const sum = (n, ev) => { const from = n ? dayOf(now - (n - 1) * 86400000) : ''; return rows.filter((r) => r.ev === ev && r.day >= from).reduce((a, r) => a + r.n, 0); };
  const first = days.length ? days[days.length - 1] : null;
  const spans = [[1, 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months'], [0, 'All time']];
  const pct = (a, b) => (b ? ' <small>' + Math.round((100 * a) / b) + '%</small>' : '');
  const head = '<tr><th>Milestone</th>' + spans.map(([, l]) => '<th>' + l + '</th>').join('') + '</tr>';
  const body = ORDER.map((ev) => '<tr><td>' + esc(EVENTS[ev]) + '</td>' + spans.map(([n]) => { const v = sum(n, ev), o = sum(n, 'open'); return '<td>' + v + (ev === 'open' ? '' : pct(v, o)) + '</td>'; }).join('') + '</tr>').join('');
  const dhead = '<tr><th>Day</th>' + ORDER.map((ev) => '<th title="' + esc(EVENTS[ev]) + '">' + esc(ev.replace('_', ' ')) + '</th>').join('') + '</tr>';
  const dbody = days.slice(0, 30).map((d) => '<tr><td>' + d + '</td>' + ORDER.map((ev) => '<td>' + ((get[d] || {})[ev] || '') + '</td>').join('') + '</tr>').join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>CIPS journey counts</title>' +
    '<style>body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#14202a;max-width:1100px}h1{font-size:22px;margin:0 0 4px}p{color:#56636e;margin:0 0 18px}' +
    'table{border-collapse:collapse;margin:0 0 28px;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid #e3e6ea;padding:7px 12px;text-align:right}th:first-child,td:first-child{text-align:left}' +
    'th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#56636e}small{color:#8a95a0}.wrap{overflow-x:auto}</style>' +
    '<h1>CIPS journey counts</h1><p>Each milestone counts once per visit (a browser tab). Percentages are of everyone who saw the globe. Days are Jersey time. No cookies, nothing about the visitor is kept.' + (first ? ' Counting since ' + first + '.' : '') + '</p>' +
    '<div class="wrap"><table>' + head + body + '</table></div><h1 style="font-size:18px">Day by day (last 30 days with visits)</h1><div class="wrap"><table>' + dhead + (dbody || '<tr><td colspan="14">Nothing yet.</td></tr>') + '</table></div>' +
    '<h1 style="font-size:18px">Problems (last 90 days)</h1><p>Visits where the globe could not start. The site then took the visitor straight to the main site. Browser and system as the browser reports them; no visitor details.</p>' +
    '<div class="wrap"><table><tr><th>Day</th><th>What happened</th><th>Browser</th><th>Error</th><th>Times</th></tr>' +
    (problems.length ? problems.map((r) => '<tr><td>' + esc(r.day) + '</td><td>' + esc(PROBLEMS[r.kind] || r.kind) + '</td><td>' + esc(r.browser) + '</td><td style="text-align:left">' + esc(r.err) + '</td><td>' + r.n + '</td></tr>').join('') : '<tr><td colspan="5">None.</td></tr>') +
    '</table></div>' +
    '<h1 style="font-size:18px">Leaderboard entries (latest 60)</h1><p>Scores the mini-games\' players chose to put on the leaderboard: three initials and a kind of vessel, nothing else. Hide any you do not want shown (it can be put back).</p>' +
    '<div class="wrap"><table><tr><th>Day</th><th>Game</th><th>Initials</th><th>Vessel</th><th>Score</th><th></th></tr>' +
    (scores.length ? scores.map((r) => '<tr' + (r.hidden ? ' style="color:#aab"' : '') + '><td>' + esc(r.day) + '</td><td style="text-align:left">' + esc((GAMES[r.game] || {}).name || r.game) + '</td><td>' + esc(r.initials) + '</td><td>' + esc(VTYPES[r.vtype] || r.vtype) + '</td><td>' + r.score + '</td><td><a href="/stats/hide?id=' + r.id + (r.hidden ? '&undo=1">Show again' : '">Hide') + '</a></td></tr>').join('') : '<tr><td colspan="6">None yet.</td></tr>') +
    '</table></div></html>';
}
