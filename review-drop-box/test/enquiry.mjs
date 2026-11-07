// Tests for website enquiries (src/enquiry.js), run with:  node test/enquiry.mjs   (Node 20 or later, no installs)
import assert from 'node:assert/strict';
import { handle } from '../src/worker.js';
import { memoryKV } from '../dev/memory-kv.js';
import { trySend, runSchedule, TO } from '../src/enquiry.js';

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + (e && e.stack || e)); process.exitCode = 1; }
}

const ORIGIN = 'https://site.example', COLLECT = 'test-collect-secret';
const HOOK = 'test-brevo-webhook-token';
let clock = Date.parse('2026-11-10T12:00:00Z');
const env = (over = {}) => ({ BOX: memoryKV(() => clock), COLLECT_SECRET: COLLECT, ALLOWED_ORIGINS: ORIGIN, BREVO_API_KEY: 'xkeysib-test', BREVO_API: 'https://brevo.example/v3', BREVO_WEBHOOK_TOKEN: HOOK, ALERT_URL: 'https://alert.example/cips', ALERT_AFTER_MIN: '60', MAIL_FROM: 'CIPS website <website@send.cips.agency>', ...over });
const req = (method, path, { body, headers = {}, raw } = {}) =>
  new Request('https://box.example' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
const form = (over = {}) => ({ topic: 'port', name: 'Alex Smith', contact: 'alex@yacht.example', message: 'Fuel and a berth, please.', main: 'Kinship', fields: [{ l: 'Vessel or company', v: 'Kinship' }, { l: 'Arrival', v: '12 Nov' }], ms: 40000, ...over });

// a stand-in for Brevo (and the alert channel) that records what it is sent
function fakeNet({ brevoStatus = 201, keyStatus = 200 } = {}) {
  const sent = [], alerts = [], checks = [];
  const f = async (url, init) => {
    if (url.startsWith('https://alert.example')) { alerts.push(init.body); return new Response('ok'); }
    if (url.startsWith('https://brevo.example/v3/smtp/statistics/')) { checks.push(init.headers['api-key']); return new Response('{}', { status: keyStatus }); }
    if (url === 'https://brevo.example/v3/smtp/email') {
      if (brevoStatus !== 201) return new Response(JSON.stringify({ code: 'x', message: 'down' }), { status: brevoStatus });
      const m = JSON.parse(init.body); sent.push({ ...m, auth: init.headers['api-key'] });
      return new Response(JSON.stringify({ messageId: '<2026111012.' + sent.length + '@smtp-relay.mailin.fr>' }), { status: 201 });
    }
    throw new Error('unexpected address ' + url);
  };
  return { f, sent, alerts, checks };
}
const items = async (e) => (await (await handle(req('GET', '/api/enquiries', { headers: { Authorization: 'Bearer ' + COLLECT } }), e, clock)).json()).items;
const post = (e, body, headers = {}) => handle(req('POST', '/api/enquiry', { body, headers: { Origin: ORIGIN, ...headers } }), e, clock);
const report = (e, event, messageId, { token = HOOK, extra = {} } = {}) => {
  const body = { event, email: TO, id: 1, date: '2026-11-10 13:00:00', ts: Math.floor(clock / 1000), 'message-id': messageId, subject: 'x', ...extra };
  return handle(req('POST', '/api/brevo-webhook', { body, headers: token ? { Authorization: 'Bearer ' + token } : {} }), e, clock);
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
  assert.deepEqual(m.to, [{ email: TO, name: 'CIPS duty agent' }]); assert.deepEqual(m.replyTo, { email: 'alex@yacht.example', name: 'Alex Smith' }); assert.equal(m.auth, 'xkeysib-test');
  assert.deepEqual(m.sender, { name: 'CIPS website', email: 'website@send.cips.agency' });
  assert.match(m.subject, /^CIPS enquiry E-[0-9A-Z]{6} - Port call - Kinship$/);
  assert.match(m.textContent, /Vessel or company: Kinship/); assert.match(m.textContent, /Fuel and a berth/);
  const [it] = await items(e); assert.equal(it.status, 'sent'); assert.equal(it.ref, out.ref);
});
await t('the visitor cannot change who the email goes to, and lines cannot be slipped into the subject', async () => {
  net = fakeNet(); const e = env();
  await post(e, form({ to: 'victim@example.com', cc: 'x@example.com', main: 'Kinship\r\nBcc: victim@example.com', name: 'A\nB' }));
  const m = net.sent[0];
  assert.deepEqual(m.to, [{ email: TO, name: 'CIPS duty agent' }]); assert.equal(m.cc, undefined); assert.equal(m.bcc, undefined);
  assert.ok(!/[\r\n]/.test(m.subject)); assert.ok(!m.textContent.includes('Name: A\nB'));
});
await t('a phone number as contact: no Reply-To, and the email says how to reach them', async () => {
  net = fakeNet(); const e = env();
  await post(e, form({ contact: '+44 7797 000000' }));
  assert.equal(net.sent[0].replyTo, undefined); assert.match(net.sent[0].textContent, /contact Alex Smith on \+44 7797 000000/);
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
await t('Brevo down: still saved and "on its way"; the schedule retries with back-off and sends once it is back, once', async () => {
  net = fakeNet({ brevoStatus: 503 }); const e = env();
  const r = await post(e, form()); assert.equal(r.status, 200);
  let [it] = await items(e); assert.equal(it.status, 'saved'); assert.match(it.lastError, /Brevo 503/); assert.equal(it.tries, 1);
  await runSchedule(e, clock, net.f); [it] = await items(e); assert.equal(it.tries, 1, 'not before the back-off');
  clock += 61000; await runSchedule(e, clock, net.f); [it] = await items(e); assert.equal(it.tries, 2);
  net = fakeNet(); clock += 5 * 60000 + 1000; await runSchedule(e, clock, net.f);
  [it] = await items(e); assert.equal(it.status, 'sent'); assert.equal(net.sent.length, 1); assert.deepEqual(net.sent[0].tags, ['enq-' + it.id]);
  clock += 3600000; await runSchedule(e, clock, net.f); assert.equal(net.sent.length, 1, 'not sent twice');
});
await t('a "delivered" report with our token marks it delivered and no alert goes out', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  assert.equal((await report(e, 'delivered', it.messageId)).status, 200);
  assert.equal((await items(e))[0].status, 'delivered');
  clock += 2 * 3600000; await runSchedule(e, clock, net.f); assert.equal(net.alerts.length, 0);
});
await t('reports without our token, or with a wrong one, are refused', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  assert.equal((await report(e, 'delivered', it.messageId, { token: '' })).status, 401);
  assert.equal((await report(e, 'delivered', it.messageId, { token: 'wrong' })).status, 401);
  assert.equal((await report(e, 'delivered', it.messageId, { token: HOOK + 'x' })).status, 401);
  assert.equal((await items(e))[0].status, 'sent');
});
await t('a report is also matched by our tag if the message id is missing', async () => {
  net = fakeNet(); const e = env();
  await post(e, form()); const [it] = await items(e);
  await report(e, 'delivered', undefined, { extra: { tags: ['enq-' + it.id] } });
  assert.equal((await items(e))[0].status, 'delivered');
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
  await report(e, 'hardBounce', it.messageId, { extra: { reason: 'mailbox does not exist' } });
  await runSchedule(e, clock, net.f);
  assert.equal(net.alerts.length, 1); assert.equal((await items(e))[0].status, 'problem');
});
await t('no Brevo key set: saved, not lost, and the alert still goes out after an hour', async () => {
  net = fakeNet(); const e = env({ BREVO_API_KEY: '' });
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
await t('the Brevo key is used once a week so it never lapses after 90 quiet days', async () => {
  net = fakeNet(); const e = env();
  await runSchedule(e, clock, net.f); assert.equal(net.checks.length, 1); assert.equal(net.checks[0], 'xkeysib-test');
  clock += 6 * 86400000; await runSchedule(e, clock, net.f); assert.equal(net.checks.length, 1);
  clock += 1 * 86400000 + 60000; await runSchedule(e, clock, net.f); assert.equal(net.checks.length, 2);
  assert.equal(net.alerts.length, 0);
});
await t('a refused Brevo key raises the alert, then re-checks daily (not every 5 minutes)', async () => {
  net = fakeNet({ keyStatus: 401 }); const e = env();
  await runSchedule(e, clock, net.f); assert.equal(net.alerts.length, 1); assert.match(net.alerts[0], /refused/);
  clock += 5 * 60000; await runSchedule(e, clock, net.f); assert.equal(net.checks.length, 1); assert.equal(net.alerts.length, 1);
  clock += 86400000; await runSchedule(e, clock, net.f); assert.equal(net.checks.length, 2); assert.equal(net.alerts.length, 2);
});

globalThis.fetch = realFetch;
console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
