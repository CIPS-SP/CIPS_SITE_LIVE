// Makes a short review link the way the Desk will (5 Nov 2026): hands the booking's details to the box, prints the link it gets back.
//   node tools/make-short-link.mjs [boxUrl] [--page https://site/review/] [--ship "M/Y Name"] [--svc AGENCY,BUNKERS,...] [--booking recXXXXXXXXXXXXXX] [--exp YYYY-MM-DD]
// boxUrl defaults to the local test server (http://localhost:8787, page http://localhost:8787/review/). COLLECT_SECRET defaults to the dev one.
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const box = (args.find((a) => /^https?:/.test(a) && args[args.indexOf(a) - 1] !== '--page') || 'http://localhost:8787').replace(/\/$/, '');
const res = await fetch(box + '/api/links', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + (process.env.COLLECT_SECRET || 'dev-collect-secret'), 'Content-Type': 'application/json' },
  body: JSON.stringify({
    b: flag('--booking') || 'recTESTBOOKING001',
    ship: flag('--ship') || 'M/Y Test Voyager',
    port: 'St Helier, Jersey', arr: '12 Aug 2026', dep: '14 Aug 2026',
    svc: (flag('--svc') || 'AGENCY,TRANSFER,PORT/TECH,HOTEL,BUNKERS').split(','),
    ...(flag('--exp') ? { exp: flag('--exp') } : {}),
  }),
});
const j = await res.json().catch(() => ({}));
if (!res.ok) { console.log('failed:', res.status, JSON.stringify(j)); process.exit(1); }
const page = flag('--page') || (j.link ? '' : box + '/review/');
console.log(page ? page.replace(/\/?$/, '/') + '?' + j.ref : j.link);
console.log('code ' + j.code + ', valid until ' + j.exp);
