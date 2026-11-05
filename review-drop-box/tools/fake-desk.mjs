// A stand-in for the Desk's collector, for testing the box. Collects waiting answers, prints them,
// acknowledges them. It does NOT write to Airtable. The real Desk does that.
//   node tools/fake-desk.mjs [boxUrl] [--keep]      (--keep: show without acknowledging)
//   COLLECT_SECRET defaults to the dev one.
const args = process.argv.slice(2);
const box = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:8787').replace(/\/$/, '');
const auth = { Authorization: 'Bearer ' + (process.env.COLLECT_SECRET || 'dev-collect-secret') };

const res = await fetch(box + '/api/collect', { headers: auth });
if (!res.ok) { console.log('collect failed:', res.status, await res.text()); process.exit(1); }
const { items, more } = await res.json();
console.log(items.length + ' answer(s) waiting' + (more ? ' (more after these)' : ''));
for (const it of items) console.log(JSON.stringify(it, null, 1));
if (items.length && !args.includes('--keep')) {
  const ack = await fetch(box + '/api/ack', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: items.map((i) => i.id) }) });
  console.log('acknowledged:', await ack.text());
}
