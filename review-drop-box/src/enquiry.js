// Website enquiries (7 Nov 2026, Simon: "I want to make it work that way"; Brevo chosen the same day, an EU provider): the home
// page and yachting page forms post here instead of opening the visitor's email app. The rule: SAVE FIRST, EMAIL SECOND.
//   1. POST /api/enquiry   the form's answers are checked and saved (KV, 30 days). Only then does the page say "on its way".
//   2. The box emails them to dutyagent@cips.agency through Brevo's transactional email API (straight away, and again from the
//      5-minute schedule if that fails, backing off). The visitor's address goes in Reply-To only; the box can send to no one else.
//   3. Brevo calls POST /api/brevo-webhook (with our token) when the email is delivered, bounced or blocked.
//   4. The schedule raises an alert (ALERT_URL, a channel other than email) for any enquiry not confirmed delivered
//      after ALERT_AFTER_MIN minutes, or bounced.
//   GET /api/enquiries (Desk password) lists them with their state, so nothing depends on the email alone.
//
// Settings: BREVO_API_KEY (secret), BREVO_WEBHOOK_TOKEN (secret: the bearer token Brevo's webhook sends), MAIL_FROM (variable,
// "Name <address>", a sender verified in Brevo; cips.agency is deliberately not authenticated there, Simon 7 Nov), ALERT_URL (secret: an address anyone could post to; channel still to
// choose), ALERT_AFTER_MIN (variable, default 60). BREVO_API is only changed for local tests.

import { makeCode } from './code.js';

export const TO = 'dutyagent@cips.agency'; // fixed in the code on purpose: the box can email no one else
export const TOPICS = { port: 'Port call', cargo: 'Cargo/Freight', project: 'Project', registry: 'Registry services', other: 'Other enquiry' };
const KEEP_DAYS = 30;
const MIN_FILL_MS = 2500; // quicker than a person can fill the form: a robot
const PER_IP_HOUR = 5;
const PER_DAY = 150; // all visitors together; above it the page offers the email-app route instead
const SEND_PER_DAY = 250; // Brevo's free plan allows 300 a day; the rest wait for tomorrow (they are saved)
const BACKOFF_MIN = [1, 5, 15, 30, 60]; // then hourly
const RUN_BATCH = 15; // enquiries looked at per scheduled run (a Worker has 50 subrequests per run on the free plan)
const PROBLEM = ['hardBounce', 'blocked', 'spam', 'invalid', 'error'];
const DELAYED = ['softBounce', 'deferred'];

const clean = (v, max, oneLine) => {
  if (typeof v !== 'string') return '';
  let s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (oneLine) s = s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  return s.trim().slice(0, max);
};
export const looksLikeEmail = (s) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(s);

// the form's body -> { ok, enquiry } | { ok:false, error } | { trap:true }
export function validateEnquiry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'bad request' };
  if (typeof body.website === 'string' && body.website.trim() !== '') return { trap: true }; // hidden field a person never fills in
  if (typeof body.ms === 'number' && body.ms < MIN_FILL_MS) return { trap: true };
  const topic = Object.prototype.hasOwnProperty.call(TOPICS, body.topic) ? body.topic : '';
  const name = clean(body.name, 80, true), contact = clean(body.contact, 120, true), message = clean(body.message, 4000, false);
  if (!topic || !name || !contact) return { ok: false, error: 'missing', need: 'topic, name, contact' };
  const fields = [];
  for (const f of Array.isArray(body.fields) ? body.fields.slice(0, 10) : []) {
    const l = clean(f && f.l, 40, true), v = clean(f && f.v, 200, true);
    if (l && v) fields.push({ l, v });
  }
  return { ok: true, enquiry: { topic, name, contact, message, fields, main: clean(body.main, 80, true) } };
}

function sender(env) {
  const m = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(String(env.MAIL_FROM || ''));
  return m ? { name: m[1] || 'CIPS website', email: m[2] } : { name: 'CIPS website', email: 'website@cips.agency' };
}

// the Brevo request body (https://developers.brevo.com/reference/sendtransacemail)
export function emailFor(item, env) {
  const t = TOPICS[item.topic] || 'Enquiry';
  const lines = ['Enquiry about: ' + t, ''];
  for (const f of item.fields) lines.push(f.l + ': ' + f.v);
  lines.push('Name: ' + item.name, 'Contact: ' + item.contact, '', item.message || '(no message)', '',
    '--', 'Sent from the CIPS website on ' + item.at.replace('T', ' ').slice(0, 16) + ' UTC, reference ' + item.ref + '.',
    looksLikeEmail(item.contact) ? 'Reply to this email to answer ' + item.name + '.' : 'No email address given: contact ' + item.name + ' on ' + item.contact + '.');
  const mail = {
    sender: sender(env),
    to: [{ email: TO, name: 'CIPS duty agent' }],
    subject: ('CIPS enquiry ' + item.ref + ' - ' + t + ' - ' + (item.main || item.name)).slice(0, 180),
    textContent: lines.join('\n'),
    tags: ['enq-' + item.id], // comes back in Brevo's reports, as well as the message id
  };
  if (looksLikeEmail(item.contact)) mail.replyTo = { email: item.contact, name: item.name };
  return mail;
}

const put = (env, item) => env.BOX.put('enq:' + item.id, JSON.stringify(item), { expirationTtl: KEEP_DAYS * 86400 });
const get = async (env, id) => { const v = await env.BOX.get('enq:' + id); return v ? JSON.parse(v) : null; };
const day = (now) => new Date(now).toISOString().slice(0, 10);
const idOk = (id) => typeof id === 'string' && /^[0-9a-z]{9}-[0-9a-f-]{36}$/.test(id);
const msgKey = (m) => 'enqm:' + String(m).replace(/[<>\s]/g, '').slice(0, 200);

async function count(env, key, ttl, limit) {
  const n = parseInt((await env.BOX.get(key)) || '0', 10);
  if (n >= limit) return false;
  await env.BOX.put(key, String(n + 1), { expirationTtl: ttl });
  return true;
}

// saves a checked enquiry; returns the stored item, or null when the box is too busy
export async function saveEnquiry(env, enquiry, ipKey, now) {
  const hour = Math.floor(now / 3600000);
  if (!(await count(env, 'rl:enq:' + ipKey + ':' + hour, 7200, PER_IP_HOUR))) return null;
  if (!(await count(env, 'rl:enqday:' + day(now), 2 * 86400, PER_DAY))) return null;
  const id = now.toString(36).padStart(9, '0') + '-' + crypto.randomUUID();
  const item = { id, ref: 'E-' + makeCode().slice(0, 6), at: new Date(now).toISOString(), ...enquiry, status: 'saved', tries: 0, nextAt: now };
  await put(env, item);
  await env.BOX.put('enqp:' + id, '1', { expirationTtl: KEEP_DAYS * 86400 }); // the "not yet confirmed delivered" list
  return item;
}

// one attempt to hand the email to Brevo. Updates and saves the item.
export async function trySend(env, item, now, fetcher = fetch) {
  if (item.status !== 'saved') return item;
  if (!env.BREVO_API_KEY) { item.lastError = 'no BREVO_API_KEY set'; item.nextAt = now + 15 * 60000; await put(env, item); return item; }
  if (!(await count(env, 'rl:enqsend:' + day(now), 2 * 86400, SEND_PER_DAY))) {
    item.lastError = 'daily sending limit reached; waiting for tomorrow';
    item.nextAt = Date.parse(day(now + 86400000) + 'T00:05:00Z');
    await put(env, item); return item;
  }
  item.tries++;
  try {
    const r = await fetcher(String(env.BREVO_API || 'https://api.brevo.com/v3') + '/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(emailFor(item, env)),
      signal: AbortSignal.timeout(10000),
    });
    const out = await r.json().catch(() => ({}));
    if (r.ok && out && out.messageId) {
      item.status = 'sent'; item.sentAt = new Date(now).toISOString(); item.messageId = String(out.messageId).slice(0, 200); delete item.lastError;
      await env.BOX.put(msgKey(item.messageId), item.id, { expirationTtl: KEEP_DAYS * 86400 });
    } else {
      item.lastError = 'Brevo ' + r.status + (out && out.message ? ': ' + String(out.message).slice(0, 200) : '');
    }
  } catch (e) {
    item.lastError = 'could not reach Brevo: ' + String(e && e.name || e).slice(0, 100);
  }
  if (item.status === 'saved') {
    item.nextAt = now + (BACKOFF_MIN[item.tries - 1] || 60) * 60000;
    // shown in Cloudflare's logs for the Worker: the reference and Brevo's reason only, never the visitor's details or the key
    console.log('enquiry ' + item.ref + ' not sent (try ' + item.tries + '): ' + item.lastError);
  }
  await put(env, item);
  return item;
}

// ---- Brevo's delivery reports (transactional webhook, "Authorization: Bearer <BREVO_WEBHOOK_TOKEN>") ----
export async function webhookAllowed(request, token) {
  const h = request.headers.get('Authorization') || '';
  if (!token || !h.startsWith('Bearer ')) return false;
  const enc = (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([enc(h.slice(7)), enc(token)]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// what a delivery report means for the enquiry. Found by Brevo's message id, or by our tag.
export async function onReport(env, ev, now) {
  if (!ev || typeof ev !== 'object' || typeof ev.event !== 'string') return false;
  let id = ev['message-id'] ? await env.BOX.get(msgKey(ev['message-id'])) : null;
  if (!id) {
    const tags = [].concat(ev.tags || [], ev.tag || []).map(String);
    const t = tags.find((x) => x.startsWith('enq-'));
    if (t && idOk(t.slice(4))) id = t.slice(4);
  }
  const item = id && (await get(env, id));
  if (!item) return false;
  if (ev.event === 'delivered') {
    item.status = 'delivered'; item.deliveredAt = new Date(now).toISOString(); delete item.lastError;
    await put(env, item); await env.BOX.delete('enqp:' + item.id);
  } else if (PROBLEM.includes(ev.event)) {
    item.status = 'problem'; item.lastError = 'Brevo reported ' + ev.event + (ev.reason ? ': ' + String(ev.reason).slice(0, 150) : '');
    await put(env, item);
  } else if (DELAYED.includes(ev.event)) {
    item.lastError = 'Brevo reported ' + ev.event + ' (it keeps trying)'; await put(env, item);
  }
  return true;
}

// ---- the 5-minute schedule: resend what failed, and raise the alarm for anything not confirmed delivered ----
export async function runSchedule(env, now, fetcher = fetch) {
  const after = (Number(env.ALERT_AFTER_MIN) || 60) * 60000;
  const listed = await env.BOX.list({ prefix: 'enqp:', limit: RUN_BATCH });
  const late = [];
  for (const k of listed.keys) {
    const id = k.name.slice(5);
    let item = await get(env, id);
    if (!item || item.status === 'delivered') { await env.BOX.delete(k.name); continue; }
    if (item.status === 'saved' && item.nextAt <= now) item = await trySend(env, item, now, fetcher);
    if (!item.alertedAt && (item.status === 'problem' || now - Date.parse(item.at) > after)) late.push(item);
  }
  if (late.length && env.ALERT_URL) {
    const text = late.length + (late.length === 1 ? ' website enquiry has' : ' website enquiries have') + ' not been confirmed delivered to ' + TO + '.\n\n' +
      late.map((i) => i.ref + ' · ' + (TOPICS[i.topic] || '') + ' · ' + i.name + ' · ' + i.contact + ' · ' + i.at.slice(0, 16).replace('T', ' ') + ' UTC · ' + (i.lastError || i.status)).join('\n') +
      '\n\nThey are safe in the drop box (30 days). Please contact them directly and check the email set-up.';
    try {
      const r = await fetcher(env.ALERT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: 'CIPS website: enquiry not delivered', Priority: 'high', Tags: 'warning' }, body: text, signal: AbortSignal.timeout(10000) });
      if (r.ok) for (const i of late) { i.alertedAt = new Date(now).toISOString(); await put(env, i); }
    } catch (e) { /* tried again on the next run */ }
  }
  const key = await keepKeyAlive(env, now, fetcher);
  return { looked: listed.keys.length, late: late.length, key };
}

// Brevo API keys stop working after 90 days unused, and a quiet spell on the site could leave the key unused that long.
// Once a week the box makes one harmless call with it (a day's sending figures), which keeps it alive and shows at once
// if it has been refused (expired or deleted): then the alert goes out, once a day until it works again.
const KEY_CHECK_DAYS = 7;
export async function keepKeyAlive(env, now, fetcher = fetch) {
  if (!env.BREVO_API_KEY) return 'no key';
  const last = JSON.parse((await env.BOX.get('brevo:check')) || '{}');
  const ok = last.ok !== false;
  if (now - (last.at || 0) < (ok ? KEY_CHECK_DAYS : 1) * 86400000) return 'not due';
  let refused = false, status = 0;
  try {
    const r = await fetcher(String(env.BREVO_API || 'https://api.brevo.com/v3') + '/smtp/statistics/aggregatedReport?days=1', {
      headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    status = r.status; refused = r.status === 401 || r.status === 403;
  } catch (e) { return 'unreachable'; } // Brevo down: try again on the next run, nothing recorded
  await env.BOX.put('brevo:check', JSON.stringify({ at: now, ok: !refused, status }));
  console.log('Brevo key check: ' + status + (refused ? ' (refused)' : ''));
  if (refused && env.ALERT_URL) {
    try {
      await fetcher(env.ALERT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: 'CIPS website: Brevo key refused', Priority: 'high', Tags: 'warning' },
        body: 'Brevo refused the drop box\'s API key (' + status + '). Website enquiries are being saved but cannot be emailed until a new key is stored (npx wrangler secret put BREVO_API_KEY).',
        signal: AbortSignal.timeout(10000) });
    } catch (e) { /* the daily re-check alerts again */ }
  }
  return refused ? 'refused' : 'ok';
}

// the Desk's view: the newest first, up to 40
export async function listEnquiries(env) {
  const listed = await env.BOX.list({ prefix: 'enq:', limit: 1000 });
  const names = listed.keys.map((k) => k.name).sort().reverse().slice(0, 40);
  const items = [];
  for (const n of names) { const v = await env.BOX.get(n); if (v) items.push(JSON.parse(v)); }
  return items;
}
