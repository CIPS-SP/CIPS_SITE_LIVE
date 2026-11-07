#!/usr/bin/env node
// Writes the site's security headers (Content-Security-Policy and friends) into site/_headers, between the
// "# --- security headers" markers, for Cloudflare Pages to send with every page (7 Nov 2026, SECURITY-PLAN.md A1).
//
// The policy lets the pages load only the site's own files, plus the review drop box for reviews and enquiries.
// Scripts written inside a page (inline <script> blocks) are allowed one by one by their SHA-256 fingerprint, so
// after editing any inline script, run:   node csp.mjs        (check.mjs fails until you do)
//   node csp.mjs --check   only reports whether _headers is up to date (exit 1 if not)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(here, '../site');
const HEADERS = join(SITE, '_headers');
const START = '# --- security headers (written by tools/csp.mjs; do not edit by hand) ---';
const END = '# --- end of security headers ---';

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

export function inlineScripts() {
  const out = [];
  for (const f of walk(SITE).filter((p) => p.endsWith('.html'))) {
    // the browser turns CRLF into LF before it hashes a script, so do the same
    const html = readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/i.test(m[1])) continue;
      if (/type\s*=\s*["']?application\/(ld\+)?json/i.test(m[1])) continue; // data, never run: needs no permission
      out.push({ file: relative(SITE, f).replace(/\\/g, '/'), hash: "'sha256-" + createHash('sha256').update(m[2], 'utf8').digest('base64') + "'" });
    }
  }
  return out;
}

function dropBox() {
  const m = /REVIEW_API\s*=\s*'([^']*)'/.exec(readFileSync(join(SITE, 'review/config.js'), 'utf8'));
  return m && m[1] ? new URL(m[1]).origin : null;
}

export function policy() {
  const hashes = [...new Set(inlineScripts().map((s) => s.hash))].sort();
  const box = dropBox();
  return [
    "default-src 'self'",
    "script-src 'self' " + hashes.join(' '),
    "style-src 'self' 'unsafe-inline'", // style="" attributes are used throughout; styles cannot run code
    "img-src 'self' data: blob:", // data: the CIPS mark in index.html; blob: pictures the globe and films make
    "media-src 'self' blob:", // the films are fetched and played from blob: addresses
    "font-src 'self'",
    "connect-src 'self'" + (box ? ' ' + box : ''),
    "frame-src 'self'", // the journey's scenes and the arrival game are the site's own pages in frames
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'", // no other website may show these pages inside its own
  ].join('; ');
}

export function block() {
  return [
    START,
    '# Every page: only our own files (and the drop box), no framing by other sites, no camera/microphone/location, no sniffing.',
    '/*',
    '  Content-Security-Policy: ' + policy(),
    '  X-Frame-Options: SAMEORIGIN',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    END,
  ].join('\n');
}

export function withBlock(text) {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a >= 0 && b > a) return text.slice(0, a) + block() + text.slice(b + END.length);
  return text.replace(/\s*$/, '\n\n') + block() + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const now = readFileSync(HEADERS, 'utf8');
  const next = withBlock(now);
  if (process.argv.includes('--check')) {
    console.log(now === next ? 'site/_headers is up to date' : 'site/_headers is OUT OF DATE: run  node csp.mjs');
    process.exit(now === next ? 0 : 1);
  }
  if (next.length > 1900 * 6) console.warn('warning: _headers is getting long');
  const line = next.split('\n').find((l) => l.includes('Content-Security-Policy'));
  if (line.length > 2000) { console.error('The CSP line is ' + line.length + ' characters; Cloudflare allows 2,000. Move some inline scripts into files.'); process.exit(1); }
  writeFileSync(HEADERS, next);
  console.log((now === next ? 'unchanged: ' : 'written: ') + 'site/_headers (' + inlineScripts().length + ' inline scripts, CSP line ' + line.length + ' characters)');
}
