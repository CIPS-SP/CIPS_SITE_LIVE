// What the drop box accepts from the review form, and what it will publish. Fixed lists only:
// anything not named here is dropped. See CIPS-TAG/CIPS/DOCS/SPEC-reviews.md sections 4D and 5.

export const ROLES = ['Captain', 'Chef', 'Purser', 'Officer', 'Other'];
export const APPOINT = ['Yes', 'Probably', 'No'];
export const RATINGS = ['overall', 'presence', 'excellence', 'port', 'replenish', 'suppliers', 'fuel'];
export const IMPORTANCE = ['fuel', 'berths', 'airport', 'tidal', 'presence'];
const TEXT_MAX = 2000;

function star(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

function text(v) {
  if (typeof v !== 'string') return '';
  // strip control characters (keep newline and tab), trim, cap
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, TEXT_MAX);
}

// Body of POST /api/review -> { ok:true, answers } | { ok:false, error }
export function validateAnswers(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'bad request' };
  const a = {};
  for (const k of RATINGS) {
    const n = star(body[k]);
    if (n) a[k] = n;
  }
  const imp = {};
  const src = body.imp && typeof body.imp === 'object' ? body.imp : {};
  for (const k of IMPORTANCE) {
    const n = star(src[k]);
    if (n) imp[k] = n;
  }
  if (Object.keys(imp).length) a.imp = imp;
  if (APPOINT.includes(body.appoint)) a.appoint = body.appoint;
  if (ROLES.includes(body.role)) a.role = body.role;
  const name = text(body.name).replace(/\s+/g, ' ').slice(0, 80);
  if (name) a.name = name;
  const didWell = text(body.didWell);
  const couldImprove = text(body.couldImprove);
  const other = text(body.other);
  if (didWell) a.didWell = didWell;
  if (couldImprove) a.couldImprove = couldImprove;
  if (other) a.other = other;
  a.quoteConsent = body.quoteConsent === true;
  // the form must carry something real: an overall rating, a priority rating, or a priorities note
  if (!a.overall && !a.imp && !a.other) return { ok: false, error: 'nothing to save' };
  return { ok: true, answers: a };
}

// ---- the public list the Desk publishes (PUT /api/reviews), cut down to the public fields ----

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

export function sanitizePublic(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.reviews)) return null;
  const reviews = body.reviews.slice(0, 200).map((r) => ({
    overall: star(r && r.overall) || null,
    appoint: APPOINT.includes(r && r.appoint) ? r.appoint : '',
    didWell: str(r && r.didWell, TEXT_MAX),
    ship: str(r && r.ship, 80),
    port: str(r && r.port, 80),
    when: str(r && r.when, 20),
    role: ROLES.includes(r && r.role) ? r.role : '',
  }));
  const averages = {};
  for (const [k, v] of Object.entries(body.averages && typeof body.averages === 'object' ? body.averages : {}).slice(0, 12)) {
    averages[str(k, 24)] = { label: str(v && v.label, 60), value: num(v && v.value) };
  }
  const priorities = {};
  for (const [k, v] of Object.entries(body.priorities && typeof body.priorities === 'object' ? body.priorities : {}).slice(0, 12)) {
    const s = v && v.stat && typeof v.stat === 'object' ? { avg: num(v.stat.avg), pct: num(v.stat.pct), n: num(v.stat.n) } : null;
    priorities[str(k, 24)] = { label: str(v && v.label, 80), desc: str(v && v.desc, 300), stat: s };
  }
  return { reviews, averages, priorities, count: reviews.length };
}
