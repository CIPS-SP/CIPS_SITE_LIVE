// A stand-in for the Durable Object that keeps the journey counts (src/counts.js), for the local test server only.
import { parseEvents, parseProblem } from '../src/counts.js';
export function memoryCounter() {
  const t = new Map();   // 'day|ev' -> n
  const pt = new Map();   // problems: JSON [day, kind, browser, err] -> n
  const stub = { async fetch(u) {
    const url = new URL(u);
    if (url.pathname === '/add') { const day = url.searchParams.get('day'); for (const ev of parseEvents(url.searchParams.get('evs'))) t.set(day + '|' + ev, (t.get(day + '|' + ev) || 0) + 1); return new Response('ok'); }
    if (url.pathname === '/problem') { const pr = parseProblem(url.searchParams.get('p')); if (!pr) return new Response('bad', { status: 400 }); const k = JSON.stringify([url.searchParams.get('day'), pr.kind, pr.browser, pr.err]); pt.set(k, (pt.get(k) || 0) + 1); return new Response('ok'); }
    if (url.pathname === '/problems') return Response.json([...pt].map(([k, n]) => { const [day, kind, browser, err] = JSON.parse(k); return { day, kind, browser, err, n }; }));
    if (url.pathname === '/list') { const since = url.searchParams.get('since') || ''; return Response.json([...t].map(([k, n]) => { const [day, ev] = k.split('|'); return { day, ev, n }; }).filter((r) => r.day >= since).sort((a, b) => (a.day < b.day ? -1 : 1))); }
    return new Response('not found', { status: 404 });
  } };
  return { idFromName: () => 'journey', get: () => stub };
}
