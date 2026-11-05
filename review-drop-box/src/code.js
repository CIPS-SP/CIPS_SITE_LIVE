// Short review links (5 Nov 2026, Simon: "can we make the link look nicer? a much shorter code, or vessel name then a code").
// Instead of carrying the booking's details in the link (signed, ~290 characters), the Desk hands the details to the drop box,
// which keeps them under a short random code until the link expires. The link is then just
//   https://<site>/review/?<vessel>-<CODE>        e.g.  https://cips.agency/review/?kinship-7KQ4M2XD
// The vessel part is only for the captain's eye; the code alone finds the details.
//
// CODE: 8 characters of Crockford base32 (0-9 and A-Z without I, L, O, U), so about 1.1 million million possibilities, read
// case-insensitively, with O read as 0 and I/L as 1, so a link copied by hand still works.

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LEN = 8;
const CODE_RE = new RegExp('^[' + ALPHABET + ']{' + CODE_LEN + '}$');

export function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  let s = '';
  for (const b of bytes) s += ALPHABET[b & 31]; // 256 is a multiple of 32: every character equally likely
  return s;
}

// Tidies a code as typed or copied; returns it, or '' if it cannot be a code.
export function normCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').trim();
  return CODE_RE.test(s) ? s : '';
}

// The code from what follows the ? of a link: 'kinship-7KQ4M2XD' -> '7KQ4M2XD' (also a bare code, or one with stray spaces).
export function codeFromRef(ref) {
  let s = String(ref || '');
  try { s = decodeURIComponent(s); } catch (e) { /* keep as is */ }
  s = s.replace(/\s+/g, '');
  return normCode(s.slice(s.lastIndexOf('-') + 1));
}

// 'M/Y Étoile du Nord' -> 'etoile-du-nord'. Leading M/Y, S/Y, MY, SY, M/V and similar are dropped; at most 24 characters.
export function slugFor(ship) {
  return String(ship || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/^\s*(m\s*\/\s*[ysv]|s\s*\/\s*y|[ms][\s.]*y\.?|m\s*\.\s*[ysv]\.?)\s+/i, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 24).replace(/-+$/g, '');
}
