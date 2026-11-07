// Website enquiries (7 Nov 2026, Simon: "I want to make it work that way"): the home page and yachting page forms post here
// instead of opening the visitor's email app. The rule: SAVE FIRST, EMAIL SECOND.
//   1. POST /api/enquiry   the form's answers are checked and saved (KV, 30 days). Only then does the page say "received".
//   2. The box emails them to dutyagent@cips.agency through Resend (straight away, and again from the 5-minute schedule
//      if that fails, backing off). The visitor's address goes in Reply-To only; the box can send to no one else.
//   3. Resend calls POST /api/resend-webhook (signed) when the email is delivered or bounced.
//   4. The schedule raises an alert (ALERT_URL, a channel other than email) for any enquiry not confirmed delivered
//      after ALERT_AFTER_MIN minutes, or bounced.
//   GET /api/enquiries (Desk password) lists them with their state, so nothing depends on the email alone.
//
// Settings: RESEND_API_KEY (secret), RESEND_WEBHOOK_SECRET (secret, whsec_...), MAIL_FROM (variable), ALERT_URL (secret: it is
// an address anyone could post to), ALERT_AFTER_MIN (variable, default 60). RESEND_API is only changed for local tests.

import { makeCode } from './code.js';

export const TO = 'dutyagent@cips.agency'; // fixed in the code on purpose: the box can email no one else
export const TOPICS = { port: 'Port call', cargo: 'Cargo/Freight', project: 'Project', registry: 'Registry services', other: 'Other enquiry' };
const KEEP_DAYS = 30;
const MIN_FILL_MS = 2500; // quicker than a person can fill the form: a robot
const PER_IP_HOUR = 5;
const PER_DAY = 150; // all visitors together; above it the page offers the email-app route instead
const SEND_PER_DAY = 90; // Resend's free plan allows 100 a day; the rest wait for tomorrow (they are saved)
const BACKOFF_MIN = [1, 5, 15, 30, 60]; // then hourly
const RUN_BATCH = 15; // enquiries looked at per scheduled run (a Worker has 50 subrequests per run on the free plan)

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

export function emailFor(item, env) {
  const t = TOPICS[item.topic] || 'Enquiry';
  const lines = ['Enquiry about: ' + t, ''];
  for (const f of item.fields) lines.push(f.l + ': ' + f.v);
  lines.push('Name: ' + item.name, 'Contact: ' + item.contact, '', item.message || '(no message)', '',
    '--', 'Sent from the CIPS website on ' + item.at.replace('T', ' ').slice(0, 16) + ' UTC, reference ' + item.ref + '.',
    looksLikeEmail(item.contact) ? 'Reply to this email to answer ' + item.name + '.' : 'No email address given: contact ' + item.name + ' on ' + item.contact + '.');
  const mail = {
    from: String(env.MAIL_FROM || 'CIPS website <website@send.cips.agency>'),
    to: [TO],
    subject: ('CIPS enquiry ' + item.ref + ' - ' + t + ' - ' + (item.main || item.name)).slice(0, 180),
    text: lines.join('\n'),
  };
  if (looksLikeEmail(item.contact)) mail.reply_to = item.contact;
  return mail;
}

const put = (env, item) => env.BOX.put('enq:' + item.id, JSON.stringify(item), { expirationTtl: KEEP_DAYS * 86400 });
const get = async (env, id) => { const v = await env.BOX.get('enq:' + id); return v ? JSON.parse(v) : null; };
const day = (now) => new Date(now).toISOString().slice(0, 10);

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

// one attempt to hand the email to Resend. Updates and saves the item.
export async function trySend(env, item, now, fetcher = fetch) {
  if (item.status !== 'saved') return item;
  if (!env.RESEND_API_KEY) { item.lastError = 'no RESEND_API_KEY set'; item.nextAt = now + 15 * 60000; await put(env, item); return item; }
  if (!(await count(env, 'rl:enqsend:' + day(now), 2 * 86400, SEND_PER_DAY))) {
    item.lastError = 'daily sending limit reached; waiting for tomorrow';
    item.nextAt = Date.parse(day(now + 86400000) + 'T00:05:00Z');
    await put(env, item); return item;
  }
  item.tries++;
  try {
    const r = await fetcher(String(env.RESEND_API || 'https://api.resend.com') + '/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'enq-' + item.id },
      body: JSON.stringify(emailFor(item, env)),
      signal: AbortSignal.timeout(10000),
    });
    const out = await r.json().catch(() => ({}));
    if (r.ok && out && out.id) {
      item.status = 'sent'; item.sentAt = new Date(now).toISOString(); item.emailId = String(out.id).slice(0, 80); delete item.lastError;
      await env.BOX.put('enqm:' + item.emailId, item.id, { expirationTtl: KEEP_DAYS * 86400 });
    } else {
      item.lastError = 'Resend ' + r.status + (out && out.message ? ': ' + String(out.message).slice(0, 200) : '');
    }
  } catch (e) {
    item.lastError = 'could not reach Resend: ' + String(e && e.name || e).slice(0, 100);
  }
  if (item.status === 'saved') item.nextAt = now + (BACKOFF_MIN[item.tries - 1] || 60) * 60000;
  await put(env, item);
  return item;
}

// ---- Resend's delivery reports (signed the Svix way: https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests) ----
const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesB64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));

export async function signWebhook(secret, id, ts, body) { // also used by the local stand-in for Resend and the tests
  const key = await crypto.subtle.importKey('raw', b64bytes(String(secret).replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'v1,' + bytesB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + '.' + ts + '.' + body)));
}

export async function verifyWebhook(request, text, secret, now) {
  const id = request.headers.get('svix-id'), ts = request.headers.get('svix-timestamp'), sig = request.headers.get('svix-signature');
  if (!secret || !id || !ts || !sig) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false; // older than five minutes: a replay
  let want;
  try { want = await signWebhook(secret, id, ts, text); } catch (e) { return false; }
  return sig.split(' ').some((s) => {
    if (s.length !== want.length) return false;
    let d = 0; for (let i = 0; i < s.length; i++) d |= s.charCodeAt(i) ^ want.charCodeAt(i);
    return d === 0;
  });
}

// what a delivery report means for the enquiry
export async function onReport(env, event, now) {
  const type = event && event.type, emailId = event && event.data && event.data.email_id;
  if (typeof type !== 'string' || typeof emailId !== 'string') return false;
  const id = await env.BOX.get('enqm:' + emailId.slice(0, 80));
  const item = id && (await get(env, id));
  if (!item) return false;
  if (type === 'email.delivered') {
    item.status = 'delivered'; item.deliveredAt = new Date(now).toISOString();
    await put(env, item); await env.BOX.delete('enqp:' + item.id);
  } else if (type === 'email.bounced' || type === 'email.complained' || type === 'email.failed') {
    item.status = 'problem'; item.lastError = type.replace('email.', 'email ');
    await put(env, item);
  } else if (type === 'email.delivery_delayed') {
    item.lastError = 'delivery delayed'; await put(env, item);
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
  return { looked: listed.keys.length, late: late.length };
}

// the Desk's view: the newest first, up to 40
export async function listEnquiries(env) {
  const listed = await env.BOX.list({ prefix: 'enq:', limit: 1000 });
  const names = listed.keys.map((k) => k.name).sort().reverse().slice(0, 40);
  const items = [];
  for (const n of names) { const v = await env.BOX.get(n); if (v) items.push(JSON.parse(v)); }
  return items;
}
