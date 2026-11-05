// Tests for the drop box, run with:  node test/run.mjs   (Node 20 or later, no installs)
import assert from 'node:assert/strict';
import { signLink, verifyLink, b64url } from '../src/link.js';
import { handle } from '../src/worker.js';
import { memoryKV } from '../dev/memory-kv.js';

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + (e && e.stack || e)); process.exitCode = 1; }
}

const SECRET = 'test-signing-secret';
const COLLECT = 'test-collect-secret';
const ORIGIN = 'https://site.example';
const NOW = Date.parse('2026-11-10T12:00:00Z');
const BOOKING = 'recABCDEFGHIJKLMN';
const payload = (over = {}) => ({ v: 1, b: BOOKING, ship: 'M/Y Test', port: 'St Helier, Jersey', arr: '1 Nov 2026', dep: '3 Nov 2026', svc: ['AGENCY', 'BUNKERS'], exp: '2026-12-31', ...over });
const env = () => ({ BOX: memoryKV(() => NOW), SIGNING_SECRET: SECRET, COLLECT_SECRET: COLLECT, ALLOWED_ORIGINS: ORIGIN + ',http://localhost:8080' });
const req = (method, path, { body, headers = {}, raw } = {}) =>
  new Request('https://box.example' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
const desk = { Authorization: 'Bearer ' + COLLECT };
const send = (e, r, now = NOW) => handle(r, e, now);
const good = async (over = {}, p) => ({ p: await signLink(p || payload(), SECRET), role: 'Captain', overall: 5, presence: 4, appoint: 'Yes', didWell: 'Great team.', quoteConsent: true, imp: { fuel: 5, airport: 4 }, ...over });

console.log('links');
await t('a signed link verifies and returns the payload', async () => {
  const r = await verifyLink(await signLink(payload(), SECRET), SECRET, NOW);
  assert.equal(r.ok, true); assert.equal(r.payload.b, BOOKING); assert.equal(r.payload.ship, 'M/Y Test');
});
await t('a link signed with another secret is refused', async () => {
  assert.equal((await verifyLink(await signLink(payload(), 'other'), SECRET, NOW)).reason, 'signature');
});
await t('an edited payload is refused', async () => {
  const [p, s] = (await signLink(payload(), SECRET)).split('.');
  const edited = b64url(new TextEncoder().encode(JSON.stringify(payload({ b: 'recZZZZZZZZZZZZZZ' }))));
  assert.equal((await verifyLink(edited + '.' + s, SECRET, NOW)).reason, 'signature');
});
await t('an expired link is refused, valid through the end of its last day', async () => {
  const link = await signLink(payload({ exp: '2026-11-10' }), SECRET);
  assert.equal((await verifyLink(link, SECRET, Date.parse('2026-11-10T23:59:00Z'))).ok, true);
  assert.equal((await verifyLink(link, SECRET, Date.parse('2026-11-11T00:00:01Z'))).reason, 'expired');
});
await t('rubbish is refused as malformed', async () => {
  for (const x of ['', 'abc', 'a.b.c', '.', 'a.', '.b', 123, null, 'x'.repeat(3000)]) assert.equal((await verifyLink(x, SECRET, NOW)).ok, false);
});
await t('accents in the ship name survive', async () => {
  const r = await verifyLink(await signLink(payload({ ship: 'M/Y Étoile du Nord' }), SECRET), SECRET, NOW);
  assert.equal(r.payload.ship, 'M/Y Étoile du Nord');
});

console.log('receiving answers');
await t('a good answer is stored and acknowledged with ok', async () => {
  const e = env();
  const res = await send(e, req('POST', '/api/review', { body: await good(), headers: { Origin: ORIGIN } }));
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await e.BOX.list({ prefix: 'q:' })).keys.length, 1);
});
await t('the stored item holds only the known fields and the booking from the link', async () => {
  const e = env();
  await send(e, req('POST', '/api/review', { body: await good({ evil: '<script>', booking: 'recXXXXXXXXXXXXXX', imp: { fuel: 5, bogus: 5 } }) }));
  const col = await (await send(e, req('GET', '/api/collect', { headers: desk }))).json();
  assert.equal(col.items.length, 1);
  const it = col.items[0];
  assert.equal(it.booking, BOOKING); assert.equal(it.evil, undefined); assert.equal(it.imp.bogus, undefined);
  assert.equal(it.overall, 5); assert.equal(it.role, 'Captain'); assert.equal(it.quoteConsent, true);
  assert.match(it.id, /^[0-9a-z]{9}-[0-9a-f-]{36}$/); assert.ok(it.at);
});
await t('a bad link is refused with 403 and nothing is stored', async () => {
  const e = env();
  const res = await send(e, req('POST', '/api/review', { body: await good({ p: 'nonsense.token' }) }));
  assert.equal(res.status, 403); assert.equal((await e.BOX.list({ prefix: 'q:' })).keys.length, 0);
});
await t('an expired link is refused with 403', async () => {
  const res = await send(env(), req('POST', '/api/review', { body: await good({}, payload({ exp: '2026-01-01' })) }));
  assert.equal(res.status, 403); assert.equal((await res.json()).reason, 'expired');
});
await t('a post from an unlisted website is refused', async () => {
  const res = await send(env(), req('POST', '/api/review', { body: await good(), headers: { Origin: 'https://evil.example' } }));
  assert.equal(res.status, 403);
});
await t('the hidden trap field: says thank you, keeps nothing', async () => {
  const e = env();
  const res = await send(e, req('POST', '/api/review', { body: await good({ website: 'http://spam' }) }));
  assert.equal(res.status, 200); assert.equal((await e.BOX.list({ prefix: 'q:' })).keys.length, 0);
});
await t('ratings out of range or not whole numbers are dropped; nothing real left means refused', async () => {
  const e = env();
  const res = await send(e, req('POST', '/api/review', { body: await good({ overall: 9, presence: 2.5, imp: { fuel: 0 }, other: '', didWell: '' }) }));
  assert.equal(res.status, 400);
});
await t('ratings sent as text digits are accepted; too-long text is cut at 2000', async () => {
  const e = env();
  await send(e, req('POST', '/api/review', { body: await good({ overall: '4', didWell: 'x'.repeat(5000) }) }));
  const it = (await (await send(e, req('GET', '/api/collect', { headers: desk }))).json()).items[0];
  assert.equal(it.overall, 4); assert.equal(it.didWell.length, 2000);
});
await t('the optional name is kept on one line, trimmed and cut at 80; absent when empty', async () => {
  const e = env();
  await send(e, req('POST', '/api/review', { body: await good({ name: '  Jane\n  Smith  ' + 'x'.repeat(200) }), headers: { 'CF-Connecting-IP': '192.0.2.50' } }));
  await send(e, req('POST', '/api/review', { body: await good({ name: '   ' }), headers: { 'CF-Connecting-IP': '192.0.2.51' } }));
  const items = (await (await send(e, req('GET', '/api/collect', { headers: desk }))).json()).items;
  const named = items.find((i) => i.name), unnamed = items.find((i) => !i.name);
  assert.ok(named.name.startsWith('Jane Smith xxx')); assert.equal(named.name.length, 80); assert.ok(unnamed);
});
await t('a priorities-only answer is accepted (no overall rating)', async () => {
  const res = await send(env(), req('POST', '/api/review', { body: await good({ overall: undefined, presence: undefined, imp: { tidal: 5 } }) }));
  assert.equal(res.status, 200);
});
await t('oversized and unreadable bodies are refused', async () => {
  const e = env();
  assert.equal((await send(e, req('POST', '/api/review', { raw: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await send(e, req('POST', '/api/review', { raw: '{nope' }))).status, 400);
});
await t('rate limit: the 7th answer from one address in an hour is turned away', async () => {
  const e = env(); const h = { 'CF-Connecting-IP': '203.0.113.9' };
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await send(e, req('POST', '/api/review', { body: await good(), headers: h }))).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 429]);
  assert.equal((await send(e, req('POST', '/api/review', { body: await good(), headers: { 'CF-Connecting-IP': '203.0.113.10' } }))).status, 200);
});
await t('rate limit: at most 12 answers for one booking, from any number of addresses', async () => {
  const e = env(); const codes = [];
  for (let i = 0; i < 14; i++) codes.push((await send(e, req('POST', '/api/review', { body: await good(), headers: { 'CF-Connecting-IP': '198.51.100.' + i } }))).status);
  assert.equal(codes.filter((c) => c === 200).length, 12); assert.equal(codes[13], 429);
});
await t('raw IP addresses are never stored', async () => {
  const e = env();
  await send(e, req('POST', '/api/review', { body: await good(), headers: { 'CF-Connecting-IP': '203.0.113.77' } }));
  const keys = (await e.BOX.list({ prefix: '' })).keys.map((k) => k.name).join(' ');
  assert.ok(!keys.includes('203.0.113.77'));
});

console.log('the Desk: collect, acknowledge');
await t('collect needs the secret', async () => {
  const e = env();
  assert.equal((await send(e, req('GET', '/api/collect'))).status, 401);
  assert.equal((await send(e, req('GET', '/api/collect', { headers: { Authorization: 'Bearer wrong' } }))).status, 401);
  assert.equal((await send(e, req('GET', '/api/collect', { headers: desk }))).status, 200);
});
await t('collect returns waiting items; ack removes them; a second collect is empty', async () => {
  const e = env();
  for (let i = 0; i < 3; i++) await send(e, req('POST', '/api/review', { body: await good({ overall: 3 + (i % 3) }), headers: { 'CF-Connecting-IP': '192.0.2.' + i } }));
  const col = await (await send(e, req('GET', '/api/collect', { headers: desk }))).json();
  assert.equal(col.items.length, 3); assert.equal(col.more, false);
  // not acknowledged: still there
  assert.equal((await (await send(e, req('GET', '/api/collect', { headers: desk }))).json()).items.length, 3);
  const ack = await (await send(e, req('POST', '/api/ack', { body: { ids: col.items.map((i) => i.id) }, headers: desk }))).json();
  assert.equal(ack.removed, 3);
  assert.equal((await (await send(e, req('GET', '/api/collect', { headers: desk }))).json()).items.length, 0);
});
await t('ack without the secret, with junk ids, or too many ids is refused or ignored', async () => {
  const e = env();
  assert.equal((await send(e, req('POST', '/api/ack', { body: { ids: ['x'] } }))).status, 401);
  assert.equal((await (await send(e, req('POST', '/api/ack', { body: { ids: ['../../pub:reviews', 'q:x'] }, headers: desk }))).json()).removed, 0);
  assert.equal((await send(e, req('POST', '/api/ack', { body: { ids: new Array(41).fill('a') }, headers: desk }))).status, 400);
});
await t('answers wait in the queue for 30 days then expire', async () => {
  const clock = { t: NOW }; const e = { ...env(), BOX: memoryKV(() => clock.t) };
  await send(e, req('POST', '/api/review', { body: await good() }));
  clock.t = NOW + 29 * 86400000;
  assert.equal((await e.BOX.list({ prefix: 'q:' })).keys.length, 1);
  clock.t = NOW + 31 * 86400000;
  assert.equal((await e.BOX.list({ prefix: 'q:' })).keys.length, 0);
});

console.log('the approved list');
await t('empty list before anything is published', async () => {
  const res = await send(env(), req('GET', '/api/reviews'));
  assert.deepEqual(await res.json(), { reviews: [], averages: {}, priorities: {}, count: 0 });
});
await t('publishing needs the secret; the public list is cached and cut to the public fields', async () => {
  const e = env();
  const list = { reviews: [{ overall: 5, appoint: 'Yes', didWell: 'Lovely.', ship: 'M/Y Test', port: 'St Helier', when: 'Nov 2026', role: 'Chef', cost: 9999, contactEmail: 'a@b.c', booking: 'recABCDEFGHIJKLMN' }], averages: { overall: { label: 'Overall', value: 4.66, secret: 1 } }, priorities: { fuel: { label: 'Fuel', desc: 'd', stat: { avg: 4.5, pct: 80, n: 5 } } }, count: 99, stray: 'x' };
  assert.equal((await send(e, req('PUT', '/api/reviews', { body: list }))).status, 401);
  assert.equal((await send(e, req('PUT', '/api/reviews', { body: list, headers: desk }))).status, 200);
  const res = await send(e, req('GET', '/api/reviews', { headers: { Origin: ORIGIN } }));
  assert.match(res.headers.get('Cache-Control'), /max-age=300/);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const out = await res.json();
  assert.deepEqual(Object.keys(out.reviews[0]).sort(), ['appoint', 'didWell', 'overall', 'port', 'role', 'ship', 'when']);
  assert.equal(out.reviews[0].role, 'Chef'); assert.equal(out.count, 1); assert.equal(out.stray, undefined);
  assert.equal(out.averages.overall.value, 4.7); assert.equal(out.averages.overall.secret, undefined);
});
await t('a malformed publish is refused', async () => {
  assert.equal((await send(env(), req('PUT', '/api/reviews', { body: { nope: 1 }, headers: desk }))).status, 400);
});

console.log('other');
await t('health, unknown paths, wrong methods, preflight', async () => {
  const e = env();
  assert.equal((await send(e, req('GET', '/api/health'))).status, 200);
  assert.equal((await send(e, req('GET', '/api/nothing'))).status, 404);
  assert.equal((await send(e, req('GET', '/api/review'))).status, 404);
  const pre = await send(e, req('OPTIONS', '/api/review', { headers: { Origin: ORIGIN } }));
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
