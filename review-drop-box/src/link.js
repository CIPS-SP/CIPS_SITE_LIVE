// Signed review links. The Desk SIGNS them, the drop box VERIFIES them. Same code both sides (plain
// WebCrypto, so it runs in Node 20+, Cloudflare Workers and browsers).
//
// A link looks like  https://<site>/review/?p=<payload>.<signature>
//   payload   = base64url( JSON {v:1, b, ship, port, arr, dep, svc:[...], exp} )
//   signature = base64url( HMAC-SHA256(payload text, SIGNING_SECRET) )
// See CIPS-TAG/CIPS/DOCS/SPEC-reviews.md section 4B.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

const BOOKING_ID = /^rec[A-Za-z0-9]{14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Checks the shape of a payload (not the signature). Returns a clean copy, or null.
export function cleanPayload(p) {
  if (!p || typeof p !== 'object' || p.v !== 1) return null;
  if (typeof p.b !== 'string' || !BOOKING_ID.test(p.b)) return null;
  if (typeof p.exp !== 'string' || !DATE.test(p.exp)) return null;
  const text = (v) => (typeof v === 'string' ? v.slice(0, 80) : '');
  const svc = Array.isArray(p.svc)
    ? p.svc.filter((c) => typeof c === 'string' && /^[A-Za-z0-9\/\- ]{1,24}$/.test(c)).slice(0, 20)
    : [];
  return { v: 1, b: p.b, ship: text(p.ship), port: text(p.port), arr: text(p.arr), dep: text(p.dep), svc, exp: p.exp };
}

// Valid through the end of the expiry day (UTC).
export function isExpired(payload, now = Date.now()) {
  return now >= Date.parse(payload.exp + 'T00:00:00Z') + 86400000;
}

export async function signLink(payload, secret) {
  const clean = cleanPayload(payload);
  if (!clean) throw new Error('bad link payload');
  const p = b64url(enc.encode(JSON.stringify(clean)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(p)));
  return p + '.' + b64url(sig);
}

// -> { ok:true, payload } or { ok:false, reason:'malformed'|'signature'|'expired' }
export async function verifyLink(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2000) return { ok: false, reason: 'malformed' };
  const dot = token.indexOf('.');
  if (dot < 1 || dot !== token.lastIndexOf('.')) return { ok: false, reason: 'malformed' };
  const p = token.slice(0, dot);
  let sig, payload;
  try {
    sig = fromB64url(token.slice(dot + 1));
    payload = cleanPayload(JSON.parse(dec.decode(fromB64url(p))));
  } catch (e) {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload) return { ok: false, reason: 'malformed' };
  const good = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), sig, enc.encode(p));
  if (!good) return { ok: false, reason: 'signature' };
  if (isExpired(payload, now)) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
