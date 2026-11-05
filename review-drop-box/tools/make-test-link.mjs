// Prints a signed review link for testing (stand-in for what the Desk will do).
//   node tools/make-test-link.mjs [base] [--expired] [--ship "M/Y Name"] [--svc AGENCY,BUNKERS,...]
// base defaults to http://localhost:8787/review/ ; secret from SIGNING_SECRET (default: the dev one).
import { signLink } from '../src/link.js';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const base = args.find((a) => /^https?:/.test(a)) || 'http://localhost:8787/review/';
const exp = args.includes('--expired') ? '2026-01-01' : new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
const payload = {
  v: 1,
  b: flag('--booking') || 'recTESTBOOKING001',
  ship: flag('--ship') || 'M/Y Test Voyager',
  port: 'St Helier, Jersey',
  arr: '12 Aug 2026',
  dep: '14 Aug 2026',
  svc: (flag('--svc') || 'AGENCY,TRANSFER,PORT/TECH,HOTEL,BUNKERS').split(','),
  exp,
};
const p = await signLink(payload, process.env.SIGNING_SECRET || 'dev-signing-secret');
console.log(base + '?p=' + p);
