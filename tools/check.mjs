#!/usr/bin/env node
// Self-containment check for the live site. Serves site/ on its own (nothing else), opens it in headless Chrome, scrolls the whole
// journey on desktop and on a phone, loads every other page, and reports:
//   - files the pages ask for that are missing (404)
//   - requests to ANYTHING outside the site (the review drop box named in site/review/config.js is the only exception)
//   - script errors and console errors
//   - files in site/ that were never requested (information: some load only on a click or in a state the scroll does not reach)
// Exit code 1 if anything is missing, outside, or throws.   Usage: node check.mjs [--desktop] [--phone] [--pages] [--chrome <path>]
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, readFileSync, statSync, readdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(here, '../site');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const only = flag('--desktop') || flag('--phone') || flag('--pages') || flag('--doors');
const want = (n) => !only || flag(n);
const CHROME = (() => { const i = args.indexOf('--chrome'); if (i >= 0) return args[i + 1]; for (const p of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) if (existsSync(p)) return p; throw new Error('Chrome not found: pass --chrome <path>'); })();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(SITE, p));
  if (!f.startsWith(SITE) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('not found'); return; }
  const size = statSync(f).size, type = TYPES[extname(f)] || 'application/octet-stream', range = req.headers.range;
  if (range) { const m = /bytes=(\d*)-(\d*)/.exec(range); const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1; res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 }); createReadStream(f, { start: a, end: b }).pipe(res); }
  else { res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }); createReadStream(f).pipe(res); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port, BASE = `http://127.0.0.1:${PORT}/`;
const apiHost = (() => { try { const m = /REVIEW_API\s*=\s*'([^']*)'/.exec(readFileSync(join(SITE, 'review/config.js'), 'utf8')); return m && m[1] ? new URL(m[1]).host : null; } catch (e) { return null; } })();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DBG = 9444;
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + DBG, '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'chk-')), '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
async function connect() { for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:' + DBG + '/json/new?about:blank', { method: 'PUT' })).json()).webSocketDebuggerUrl; } catch (e) { await sleep(500); } } throw new Error('Chrome did not start'); }

const requested = new Set(), problems = { missing: new Map(), outside: new Map(), errors: [] };
async function run(label, page, mobile, scroll, after) {
  const c = new WebSocket(await connect()); await new Promise((r) => (c.onopen = r));
  let id = 0; const pend = new Map(); const reqs = new Map();
  c.onmessage = (e) => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    const P = m.params || {};
    if (m.method === 'Network.requestWillBeSent') { reqs.set(P.requestId, P.request.url); const u = P.request.url;
      if (/^https?:/.test(u)) { const h = new URL(u).host; if (u.startsWith(BASE)) requested.add(decodeURIComponent(new URL(u).pathname.slice(1)) || 'index.html'); else if (h !== apiHost) { const k = h; (problems.outside.get(k) || problems.outside.set(k, new Set()).get(k)).add(label); } } }
    if (m.method === 'Network.responseReceived' && P.response.status >= 400 && P.response.url.startsWith(BASE)) { const k = new URL(P.response.url).pathname; (problems.missing.get(k) || problems.missing.set(k, new Set()).get(k)).add(label); }
    if (m.method === 'Network.loadingFailed' && !P.canceled) { const u = reqs.get(P.requestId) || ''; if (u.startsWith(BASE) && !/net::ERR_ABORTED/.test(P.errorText)) { const k = new URL(u).pathname; (problems.missing.get(k) || problems.missing.set(k, new Set()).get(k)).add(label + ' (' + P.errorText + ')'); } }
    if (m.method === 'Runtime.exceptionThrown') problems.errors.push(`${label}: exception ${(P.exceptionDetails.exception?.description || P.exceptionDetails.text).split('\n')[0].slice(0, 180)}`);
    if (m.method === 'Runtime.consoleAPICalled' && P.type === 'error') problems.errors.push(`${label}: console.error ${P.args.map((a) => a.value || a.description || '').join(' ').slice(0, 180)}`); };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); c.send(JSON.stringify({ id: i, method, params })); });
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  if (mobile) { await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true }); await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }); }
  else await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + page });
  await sleep(scroll ? 8000 : 5000);
  if (scroll) {
    const height = async () => (await send('Runtime.evaluate', { expression: 'Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)', returnByValue: true })).result.result.value;
    for (let i = 0; i < 90; i++) { if ((await height()) > 50000) break; await sleep(2000); }   // the journey builds its long page after load
    await send('Runtime.evaluate', { expression: "document.documentElement.style.scrollBehavior='auto'" });
    let y = 0, steps = 0, h = 0;
    while (steps < 2500) {
      h = (await send('Runtime.evaluate', { expression: `window.scrollTo({top:${y},behavior:"instant"}); Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)`, returnByValue: true })).result.result.value || h;
      if (y > h) { await sleep(3500); h = await height(); if (y > h) break; }
      y += 450; steps++; await sleep(steps % 25 === 0 ? 900 : 110);
    }
    console.log(`  ${label}: scrolled ${steps} steps, page height ${h}`);
    await sleep(4000);
  } else console.log('  ' + label + ': loaded');
  if (after) { await after(send); console.log('  ' + label + ': done'); }
  c.close();
}

const PAGES = ['sectors/yachting.html', 'sectors/cruise.html', 'sectors/offshore.html', 'sectors/shipping.html', 'desk-live.html', 'desk-live-login.html', 'reviews.html', 'all-reviews.html', 'review/index.html'];
try {
  if (want('--desktop')) await run('home desktop', 'index.html', false, true);
  if (want('--phone')) await run('home phone', 'index.html', true, true);
  if (want('--pages')) for (const p of PAGES) await run(p, p, false, false);
  // the doors that open on a click: the seaway game (its modules, pictures and sounds load in an overlay)
  if (want('--doors')) await run('door: Play the arrival', 'index.html?goto=seaway-wake:0.04', false, false, async (send) => {
    await sleep(12000);
    await send('Runtime.evaluate', { expression: "(()=>{const b=document.querySelector('[data-play]'); if(b){ b.hidden=false; b.click(); return 'clicked'; } return 'no button'; })()" });
    await sleep(18000);
    const r = await send('Runtime.evaluate', { expression: "(()=>{const f=document.querySelector('.splay-overlay iframe'); return f ? 'overlay open, game frame ' + (f.contentDocument ? f.contentDocument.title : '?') : 'no overlay'; })()", returnByValue: true });
    console.log('  game: ' + r.result.result.value);
  });
} finally { chrome.kill(); server.close(); }

// ---- report ----
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const all = walk(SITE).map((p) => relative(SITE, p).replace(/\\/g, '/'));
const unused = all.filter((f) => !requested.has(f) && f !== '_headers' && f !== 'robots.txt');
if (!apiHost) for (const k of ['/api/reviews']) problems.missing.delete(k);   // until the drop box has an address, the review sections use their placeholder quotes: expected
const bad = problems.missing.size + problems.outside.size + problems.errors.length;
console.log('\n=== CHECK REPORT ===');
console.log('files in site/:', all.length, '| requested during the run:', requested.size, '| never requested:', unused.length);
console.log('MISSING (asked for, not in site/):', problems.missing.size || 'none'); for (const [k, v] of problems.missing) console.log('   ' + k + '   [' + [...v].join(', ') + ']');
console.log('OUTSIDE the site:', problems.outside.size || 'none', apiHost ? `(review drop box ${apiHost} allowed)` : '(no review drop box address set yet)'); for (const [k, v] of problems.outside) console.log('   ' + k + '   [' + [...v].join(', ') + ']');
const errs = [...new Set(problems.errors)]; console.log('ERRORS:', errs.length || 'none'); errs.slice(0, 20).forEach((e) => console.log('   ' + e));
writeFileSync(join(here, 'check-report.json'), JSON.stringify({ missing: [...problems.missing.keys()], outside: [...problems.outside.keys()], errors: errs, unused }, null, 1));
console.log('\nNever requested (first 60; full list in tools/check-report.json):'); unused.slice(0, 60).forEach((f) => console.log('   ' + f));
process.exit(bad ? 1 : 0);
