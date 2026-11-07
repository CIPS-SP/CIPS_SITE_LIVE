// Tests for website enquiries (src/enquiry.js), run with:  node test/enquiry.mjs   (Node 20 or later, no installs)
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { memoryKV } from '../dev/memory-kv.js';
import { trySend, runSchedule, signWebhook, TO } from '../src/enquiry.js';

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + (e && e.stack || e)); process.exitCode = 1; }
}

const ORIGIN = 'https://site.example', COLLECT = 'test-collect-secret';
const HOOK = 'whsec_' + Buffer.from('a test webhook secret, 32 bytes!').toString('base64');
let clock = Date.parse('2026-11-10T12:00:00Z');
const env = (over = {}) => ({ BOX: memoryKV(() => clock), COLLECT_SECRET: COLLECT, ALLOWED_ORIGINS: ORIGIN, RESEND_API_KEY: 're_test', RESEND_API: 'https://resend.example', RESEND_WEBHOOK_SECRET: HOOK, ALERT_URL: 'https://alert.example/cips', ALERT_AFTER_MIN: '60', MAIL_FROM: 'CIPS website <website@send.cips.agency>', ...over });
const req = (method, path, { body, headers = {}, raw } = {}) =>
  new Request('https://box.example' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
const form = (over = {}) => ({ topic: 'port', name: 'Alex Smith', contact: 'alex@yacht.example', message: 'Fuel and a berth, please.', main: 'Kinship', fields: [{ l: 'Vessel or company', v: 'Kinship' }, { l: 'Arrival', v: '12 Nov' }], ms: 40000, ...over });

// a stand-in for Resend (and the alert channel) that records what it is sent
function fakeNet({ resendStatus = 200 } = {}) {
  const sent = [], alerts = [];
  const f = async (url, init) => {
    if (url.startsWith('https://alert.example')) { alerts.push(init.body); return new Response('ok'); }
    if (url === 'https://resend.example/emails') {
      if (resendStatus !== 200) return new Response(JSON.stringify({ message: 'down' }), { status: resendStatus });
      const m = JSON.parse(init.body); sent.push({ ...m, key: init.headers['Idempotency-Key'], auth: init.headers.Authorization });
      return new Response(JSON.stringify({ id: 'em_' + sent.length }), { status: 200 });
    }
    throw new Error('unexpected address ' + url);
  };
  return { f, sent, alerts };
}
const items = async (e) => (await (await handle(req('GET', '/api/enquiries', { headers: { Authorization: 'Bearer ' + COLLECT } }), e, clock)).json()).items;
const post = (e, body, headers = {}) => handle(req('POST', '/api/enquiry', { body, headers: { Origin: ORIGIN, ...headers } }), e, clock);
const report = async (e, type, emailId, { secret = HOOK, ts = Math.floor(clock / 1000) } = {}) => {
  const body = JSON.stringify({ type, created_at: new Date(clock).toISOString(), data: { email_id: emailId } });
  return handle(req('POST', '/api/resend-webhook', { raw: body, headers: { 'svix-id': 'msg_1', 'svix-timestamp': String(ts), 'svix-signature': await signWebhook(secret, 'msg_1', String(ts), body) } }), e, clock);
};

// handle() sends straight away using the global fetch; point it at the stand-in for these tests
const realFetch = globalThis.fetch;
let net = fakeNet();
globalThis.fetch = (u, i) => net.f(String(u), i);

console.log('enquiries');
await t('a good enquiry is saved, answered with a reference, and emailed to dutyagent@ only', async () => {
  net = fakeNet(); const e = env();
  const r = await post(e, form());
  assert.equal(r.status, 200); const out = await r.json();
  assert.equal(out.ok, true); assert.match(out.ref, /^E-[0-9A-Z]{6}$/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(net.sent.length, 1);
  const m = net.sent[0];
  assert.deepEqual(m.to, [TO]); assert.equal(m.reply_to, 'alex@yacht.example'); assert.equal(m.auth, 'Bearer re_test');
  assert.match(m.subject, /^CIPS enquiry E-[0-9A-Z]{6} - Port call - Kinship$/);
  assert.match(m.text, /Vessel or company: Kinship/); assert.match(m.text, /Fuel and a berth/);
  const [it] = await items(e); assert.equal(it.status, 'sent'); assert.equal(it.ref, out.ref);
});
await t('the visitor cannot change who the email goes to, and lines cannot be slipped into the subject', async () => {
  net = fakeNet(); const e = env();
  await post(e, form({ to: 'victim@example.com', cc: 'x@example.com', main: 'Kinship\r\nBcc: victim@example.com', name: 'A\nB' }));
  const m = net.sent[0];
  assert.deepEqual(m.to, [TO]); assert.equal(m.cc, undefined); assert.equal(m.bcc, undefined);
  assert.ok(!/[\r\n]/.test(m.subject)); assert.ok(!m.text.includes('Name: A\nB'));
});
await t('a phone number as contact: no Reply-To, and the email says how to reach them', async () => {
  net = fakeNet(); const e = env();
  await post(e, form({ contact: '+44 7797 000000' }));
  assert.equal(net.sent[0].reply_to, undefined); assert.match(net.sent[0].text, /contact Alex Smith on \+44 7797 000000/);
});
await t('name and contact are required, and the topic must be one of the five', async () => {
  net = fakeNet(); const e = env();
  assert.equal((await post(e, form({ name: '' }))).status, 400);
  assert.equal((await post(e, form({ contact: '  ' }))).status, 400);
  assert.equal((await post(e, form({ topic: 'spam' }))).status, 400);
  assert.equal(net.sent.length, 0); assert.equal((await items(e)).length, 0);
});
await t('robots: the trap field or a form filled in under 2.5 s is thanked and kept nowhere', async () => {
  net = fakeNet(); const e = env();
  assert.equal((await post(e, form({ website: 'http://spam' }))).status, 200);
  assert.equal((await post(e, form({ ms: 300 }))).status, 200);
  assert.equal(net.sent.length, 0); assert.equal((await items(e)).length, 0);
});
await t('another website cannot post, and a huge body is refused', async () => {
  net = fakeNet(); const e = env();
  assert.equal((await post(e, form(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(e, form({ message: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await items(e)).length, 0);
});
await t('five an hour from one address; others are not held up', async () => {
  net = fakeNet(); const e = env();
  for (let i = 0; i < 5; i++) assert.equal((await post(e, form(), { 'CF-Connecting-IP': '203.0.113.9' })).status, 200);
  assert.equal((await post(e, form(), { 'CF-Connecting-IP': '203.0.113.9' })).status, 429);
  assert.equal((await post(e, form(), { 'CF-Connecting-IP': '198.51.100.7' })).status, 200);
});
await t('Resend down: still saved and "received"; the schedule retries with back-off and sends once it is back, with the same idempotency key', async () => {
  net = fakeNet({ resendStatus: 503 }); const e = env();
  const r = await post(e, form()); assert.equal(r.status, 200);
  let [it] = await items(e); assert.equal(it.status, 'saved'); assert.match(it.lastError, /Resend 503/); assert.equal(it.tries, 1);
  await runSchedule(e, clock, net.f); [it] = await items(e); assert.equal(it.tries, 1, 'not before the back-off');
  clock += 61000; await runSchedule(e, clock, net.f); [it] = await items(e); assert.equal(it.tries, 2);
  net = fakeNet(); clock += 5 * 60000 + 1000; await runSchedule(e, clock, net.f);
  [it] = await items(e); assert.equal(it.status, 'sent'); assert.equal(net.sent.length, 1); assert.equal(net.sent[0].key, 'enq-' + it.id);
});
await t('a signed "delivered" report marks it delivered and no alert goes out', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  assert.equal((await report(e, 'email.delivered', it.emailId)).status, 200);
  assert.equal((await items(e))[0].status, 'delivered');
  clock += 2 * 3600000; await runSchedule(e, clock, net.f); assert.equal(net.alerts.length, 0);
});
await t('reports that are unsigned, wrongly signed or old are refused', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  assert.equal((await handle(req('POST', '/api/resend-webhook', { body: { type: 'email.delivered', data: { email_id: it.emailId } } }), e, clock)).status, 401);
  assert.equal((await report(e, 'email.delivered', it.emailId, { secret: 'whsec_' + Buffer.from('another secret, also thirty-two!').toString('base64') })).status, 401);
  assert.equal((await report(e, 'email.delivered', it.emailId, { ts: Math.floor(clock / 1000) - 3600 })).status, 401);
  assert.equal((await items(e))[0].status, 'sent');
});
await t('not confirmed delivered after an hour: one alert, with the reference and how to reach them; not repeated', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  clock += 59 * 60000; await runSchedule(e, clock, net.f); assert.equal(net.alerts.length, 0);
  clock += 2 * 60000; await runSchedule(e, clock, net.f);
  assert.equal(net.alerts.length, 1); assert.ok(net.alerts[0].includes(it.ref)); assert.ok(net.alerts[0].includes('alex@yacht.example'));
  clock += 5 * 60000; await runSchedule(e, clock, net.f); assert.equal(net.alerts.length, 1);
});
await t('a bounce raises the alert at once', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  await report(e, 'email.bounced', it.emailId);
  await runSchedule(e, clock, net.f);
  assert.equal(net.alerts.length, 1); assert.equal((await items(e))[0].status, 'problem');
});
await t('no Resend key set: saved, not lost, and the alert still goes out after an hour', async () => {
  net = fakeNet(); const e = env({ RESEND_API_KEY: '' });
  assert.equal((await post(e, form())).status, 200);
  clock += 61 * 60000; await runSchedule(e, clock, net.f);
  assert.equal(net.sent.length, 0); assert.equal(net.alerts.length, 1);
});
await t('the list of enquiries needs the Desk password', async () => {
  const e = env();
  assert.equal((await handle(req('GET', '/api/enquiries'), e, clock)).status, 401);
  assert.equal((await handle(req('GET', '/api/enquiries', { headers: { Authorization: 'Bearer wrong' } }), e, clock)).status, 401);
});
await t('trySend leaves an already-sent enquiry alone', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  assert.equal(net.sent.length, 1);
  await trySend(e, it, clock, net.f); assert.equal(net.sent.length, 1);
});

globalThis.fetch = realFetch;
console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
