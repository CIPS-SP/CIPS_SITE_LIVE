// The mini-games' leaderboard (24 Nov 2026): node test/board.mjs. Runs the real Counter on Node's SQLite (dev/memory-counter.js).
import assert from 'node:assert/strict';
import { memoryCounter } from '../dev/memory-counter.js';
import { handle } from '../src/worker.js';

const env = { COUNTER: memoryCounter(), ALLOWED_ORIGINS: 'https://www.cips.agency', STATS_KEY: 'k', SIGNING_SECRET: 's', BOX: { get: async () => null, put: async () => {} } };
const post = async (body, origin = 'https://www.cips.agency') => { const r = await handle(new Request('https://box/api/score', { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) }), env); return { status: r.status, json: await r.json() }; };
const top = async (game) => (await handle(new Request('https://box/api/leaderboard?game=' + game), env)).json();
let n = 0; const ok = (name, fn) => fn().then(() => { n++; console.log('  ok  ' + name); });

await ok('a score goes on the board and comes back in the top 10', async () => {
  const r = await post({ game: 'berth', score: 640, initials: 'abc', vtype: 'yacht', secs: 60 });
  assert.equal(r.status, 200); assert.equal(r.json.week[0].initials, 'ABC'); assert.equal(r.json.week[0].score, 640);
});
await ok('highest first, and the board is per game', async () => {
  await post({ game: 'berth', score: 900, initials: 'SPX', vtype: 'cruise', secs: 60 });
  const t = await top('berth'); assert.deepEqual(t.week.map((x) => x.score), [900, 640]); assert.equal((await top('line')).week.length, 0);
});
await ok('impossible scores, bad or blocked initials, unknown games and too-quick games are refused', async () => {
  assert.equal((await post({ game: 'berth', score: 1001, initials: 'ABC', vtype: 'yacht', secs: 60 })).status, 400);
  assert.equal((await post({ game: 'journey', score: 3001, initials: 'ABC', vtype: 'yacht', secs: 600 })).status, 400);
  assert.equal((await post({ game: 'berth', score: 10, initials: 'AB1', vtype: 'yacht', secs: 60 })).status, 400);
  assert.equal((await post({ game: 'berth', score: 10, initials: 'ASS', vtype: 'yacht', secs: 60 })).status, 400);
  assert.equal((await post({ game: 'golf', score: 10, initials: 'ABC', vtype: 'yacht', secs: 60 })).status, 400);
  assert.equal((await post({ game: 'approaches', score: 10, initials: 'ABC', vtype: 'yacht', secs: 5 })).status, 400);
  assert.equal((await post({ game: 'berth', score: 10, initials: 'ABC', vtype: 'submarine', secs: 60 })).status, 400);
});
await ok('only the site itself may send scores', async () => {
  assert.equal((await post({ game: 'berth', score: 10, initials: 'ABC', vtype: 'yacht', secs: 60 }, 'https://evil.example')).status, 403);
});
await ok('Simon can hide an entry (and show it again) with the /stats password, not without', async () => {
  const no = await handle(new Request('https://box/stats/hide?id=2'), env); assert.equal(no.status, 401);
  const au = { Authorization: 'Basic ' + btoa('x:k') };
  assert.equal((await handle(new Request('https://box/stats/hide?id=2', { headers: au }), env)).status, 303);
  assert.deepEqual((await top('berth')).week.map((x) => x.score), [640]);
  await handle(new Request('https://box/stats/hide?id=2&undo=1', { headers: au }), env);
  assert.deepEqual((await top('berth')).week.map((x) => x.score), [900, 640]);
});
await ok('no more than 12 scores an hour from one connection', async () => {
  let last; for (let i = 0; i < 14; i++) last = await post({ game: 'line', score: 100, initials: 'ZZZ', vtype: 'other', secs: 60 });
  assert.equal(last.status, 429);
});
console.log('\n' + n + ' passed');
