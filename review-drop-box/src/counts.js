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

// the day in Jersey (the same as London's)
export function dayOf(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }

export function parseEvents(text) { return [...new Set(String(text || '').slice(0, 300).split(/[\s,]+/).filter((e) => Object.prototype.hasOwnProperty.call(EVENTS, e)))].slice(0, 13); }

// the Durable Object: one instance ("journey") holds every total
export class Counter {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS c (day TEXT NOT NULL, ev TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, ev))');
  }
  async fetch(request) {
    const u = new URL(request.url);
    if (u.pathname === '/add') {
      const day = u.searchParams.get('day') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Response('bad day', { status: 400 });
      for (const ev of parseEvents(u.searchParams.get('evs'))) this.sql.exec('INSERT INTO c (day, ev, n) VALUES (?, ?, 1) ON CONFLICT (day, ev) DO UPDATE SET n = n + 1', day, ev);
      return new Response('ok');
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
export function statsPage(rows, now) {
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
    '<div class="wrap"><table>' + head + body + '</table></div><h1 style="font-size:18px">Day by day (last 30 days with visits)</h1><div class="wrap"><table>' + dhead + (dbody || '<tr><td colspan="14">Nothing yet.</td></tr>') + '</table></div></html>';
}
