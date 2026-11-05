// CIPS review drop box. A tiny public service that holds captains' review answers in a queue until the
// Desk collects them, and serves the approved-reviews list the Desk publishes. It has NO Airtable key.
// Cloudflare Worker + one KV namespace (binding BOX). See README.md and CIPS-TAG/CIPS/DOCS/SPEC-reviews.md section 4D.
//
//   POST /api/review    public   a captain's answers (needs a valid signed link)   -> queue
//   GET  /api/collect   Desk     waiting answers (up to 40)                        <- queue
//   POST /api/ack       Desk     {ids:[...]} remove answers the Desk has written
//   PUT  /api/reviews   Desk     the approved list for the website
//   GET  /api/reviews   public   that list (cached 5 min)
//   GET  /api/health    public   "ok"
//
// Settings (Cloudflare dashboard, never in the page or the repo):
//   SIGNING_SECRET   secret   shared with the Desk, signs the review links
//   COLLECT_SECRET   secret   shared with the Desk, opens collect / ack / publish
//   ALLOWED_ORIGINS  variable comma list of website addresses allowed to post and read, e.g. https://cips.agency

import { verifyLink } from './link.js';
import { validateAnswers, sanitizePublic } from './validate.js';

const MAX_BODY = 16 * 1024; // review answers
const MAX_PUBLISH = 256 * 1024; // the approved list
const COLLECT_BATCH = 40; // KV reads count against a Worker's per-request limit (50 on the free plan)
const IP_PER_HOUR = 6;
const PER_BOOKING = 12;
const QUEUE_DAYS = 30;
const EMPTY_LIST = { reviews: [], averages: {}, priorities: {}, count: 0 };

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra },
  });

function origins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsFor(request, env, methods) {
  const o = request.headers.get('Origin');
  if (o && origins(env).includes(o)) {
    return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': methods, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  }
  return { Vary: 'Origin' };
}

async function sha256Hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// constant-time comparison of two secrets (compares their SHA-256 digests)
async function sameSecret(a, b) {
  if (!a || !b) return false;
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function isDesk(request, env) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') && (await sameSecret(h.slice(7), env.COLLECT_SECRET));
}

async function readJson(request, max) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > max) return { error: 'too large', status: 413 };
  const text = await request.text();
  if (text.length > max) return { error: 'too large', status: 413 };
  try {
    return { body: JSON.parse(text) };
  } catch (e) {
    return { error: 'bad request', status: 400 };
  }
}

// counts in KV are approximate (not atomic); good enough to stop floods, not meant as accounting
async function bump(env, key, ttl, limit) {
  const n = parseInt((await env.BOX.get(key)) || '0', 10);
  if (n >= limit) return false;
  await env.BOX.put(key, String(n + 1), { expirationTtl: ttl });
  return true;
}

export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsFor(request, env, 'GET, POST, PUT, OPTIONS') });
  }

  if (path === '/api/health' && method === 'GET') return json({ ok: true });

  // ---- public: the approved list ----
  if (path === '/api/reviews' && method === 'GET') {
    const stored = await env.BOX.get('pub:reviews');
    return new Response(stored || JSON.stringify(EMPTY_LIST), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        ...corsFor(request, env, 'GET'),
      },
    });
  }

  // ---- public: a captain's answers ----
  if (path === '/api/review' && method === 'POST') {
    const cors = corsFor(request, env, 'POST');
    const origin = request.headers.get('Origin');
    if (origin && !origins(env).includes(origin)) return json({ error: 'not allowed' }, 403, cors);
    const got = await readJson(request, MAX_BODY);
    if (got.error) return json({ error: got.error }, got.status, cors);
    const body = got.body;
    if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 400, cors);

    // hidden trap field: a person never fills it in. Say thank you and keep nothing.
    if (typeof body.website === 'string' && body.website.trim() !== '') return json({ ok: true }, 200, cors);

    const link = await verifyLink(body.p, env.SIGNING_SECRET, now);
    if (!link.ok) return json({ error: 'link', reason: link.reason }, 403, cors);
    const checked = validateAnswers(body);
    if (!checked.ok) return json({ error: checked.error }, 400, cors);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const hour = Math.floor(now / 3600000);
    const ipKey = 'rl:ip:' + (await sha256Hex(ip)).slice(0, 24) + ':' + hour; // the address itself is never stored
    if (!(await bump(env, ipKey, 7200, IP_PER_HOUR))) return json({ error: 'busy' }, 429, cors);
    if (!(await bump(env, 'rl:bk:' + link.payload.b, 90 * 86400, PER_BOOKING))) return json({ error: 'busy' }, 429, cors);

    const id = now.toString(36).padStart(9, '0') + '-' + crypto.randomUUID();
    const item = { id, at: new Date(now).toISOString(), booking: link.payload.b, ...checked.answers };
    await env.BOX.put('q:' + id, JSON.stringify(item), { expirationTtl: QUEUE_DAYS * 86400 });
    return json({ ok: true }, 200, cors);
  }

  // ---- Desk only ----
  if (path === '/api/collect' || path === '/api/ack' || path === '/api/reviews') {
    if (!(await isDesk(request, env))) return json({ error: 'unauthorised' }, 401);

    if (path === '/api/collect' && method === 'GET') {
      const listed = await env.BOX.list({ prefix: 'q:', limit: COLLECT_BATCH });
      const items = [];
      for (const k of listed.keys) {
        const v = await env.BOX.get(k.name);
        if (v) items.push(JSON.parse(v));
      }
      return json({ items, more: !listed.list_complete });
    }

    if (path === '/api/ack' && method === 'POST') {
      const got = await readJson(request, MAX_BODY);
      if (got.error) return json({ error: got.error }, got.status);
      const ids = got.body && Array.isArray(got.body.ids) ? got.body.ids : null;
      if (!ids || ids.length > COLLECT_BATCH) return json({ error: 'bad request' }, 400);
      let removed = 0;
      for (const id of ids) {
        if (typeof id === 'string' && /^[0-9a-z]{9}-[0-9a-f-]{36}$/.test(id)) {
          await env.BOX.delete('q:' + id);
          removed++;
        }
      }
      return json({ ok: true, removed });
    }

    if (path === '/api/reviews' && method === 'PUT') {
      const got = await readJson(request, MAX_PUBLISH);
      if (got.error) return json({ error: got.error }, got.status);
      const list = sanitizePublic(got.body);
      if (!list) return json({ error: 'bad request' }, 400);
      await env.BOX.put('pub:reviews', JSON.stringify(list));
      return json({ ok: true, count: list.count });
    }
  }

  return json({ error: 'not found' }, 404);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
