// Local test server: the drop box (in-memory queue) plus the website, on one address, so the pages
// and the box are the same origin like a real setup. Not for production. Nothing here reaches Resend or the internet.
//   node dev/dev-server.mjs            then open the link that  node tools/make-test-link.mjs  prints (reviews),
//                                      or http://localhost:8787/#contact (enquiries)
// Enquiries (7 Nov 2026): a stand-in for Resend answers at /__resend; what it "sent" is listed at /__outbox, and it reports
// "delivered" back to the box 2 s later, signed like Resend. /__resend/down and /__resend/up make it fail or work,
// /__resend/silent stops the delivered reports (to see the alert), /__alerts lists the alerts. The schedule runs every 20 s here
// and the alert comes after ALERT_AFTER_MIN (2 minutes here).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../src/worker.js';
import { runSchedule, signWebhook } from '../src/enquiry.js';
import { memoryKV } from './memory-kv.js';

const PORT = Number(process.env.PORT || 8787);
const here = fileURLToPath(new URL('.', import.meta.url));
const SITE = resolve(here, '../../site');
const BASE = `http://localhost:${PORT}`;
const HOOK = 'whsec_' + Buffer.from('local test webhook secret, 32 b!').toString('base64');
const env = {
  BOX: memoryKV(),
  SIGNING_SECRET: process.env.SIGNING_SECRET || 'dev-signing-secret',
  COLLECT_SECRET: process.env.COLLECT_SECRET || 'dev-collect-secret',
  ALLOWED_ORIGINS: `${BASE},http://127.0.0.1:${PORT},http://localhost:8080`,
  RESEND_API_KEY: 're_local_stand_in',
  RESEND_API: BASE + '/__resend',
  RESEND_WEBHOOK_SECRET: HOOK,
  ALERT_URL: BASE + '/__alerts',
  ALERT_AFTER_MIN: process.env.ALERT_AFTER_MIN || '2',
  MAIL_FROM: 'CIPS website <website@send.cips.agency>',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

const outbox = [], alerts = [];
let resendDown = false, resendSilent = false;
const page = (title, rows) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:14px system-ui;margin:24px;max-width:900px"><h1>${title}</h1>` +
  (rows.length ? rows.join('') : '<p>Nothing yet.</p>') + '<p><a href="/__outbox">outbox</a> · <a href="/__alerts">alerts</a> · <a href="/__resend/down">make Resend fail</a> · <a href="/__resend/up">make it work</a> · <a href="/__resend/silent">stop delivered reports</a></p>';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const readBody = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });

async function report(emailId) { // what Resend does once the email has arrived
  const body = JSON.stringify({ type: 'email.delivered', created_at: new Date().toISOString(), data: { email_id: emailId } });
  const id = 'msg_' + Date.now(), ts = String(Math.floor(Date.now() / 1000));
  await fetch(BASE + '/api/resend-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': await signWebhook(HOOK, id, ts, body) }, body });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  try {
    if (url.pathname === '/__quit') { res.end('bye'); setTimeout(() => process.exit(0), 50); return; } // test helper: stops this server
    // ---- the stand-in for Resend and the alert channel ----
    if (url.pathname === '/__resend/emails' && req.method === 'POST') {
      const m = JSON.parse((await readBody(req)).toString('utf8'));
      if (resendDown) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"message":"stand-in is down"}'); return; }
      const id = 'em_local_' + (outbox.length + 1);
      outbox.push({ id, at: new Date().toISOString(), key: req.headers['idempotency-key'], ...m });
      console.log(`[resend stand-in] "sent" ${id} to ${m.to}: ${m.subject}`);
      if (!resendSilent) setTimeout(() => report(id).catch((e) => console.log('report failed', e)), 2000);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id })); return;
    }
    if (url.pathname === '/__resend/down') { resendDown = true; res.end('The Resend stand-in now fails every email.'); return; }
    if (url.pathname === '/__resend/up') { resendDown = false; resendSilent = false; res.end('The Resend stand-in now works, with delivered reports.'); return; }
    if (url.pathname === '/__resend/silent') { resendSilent = true; res.end('The Resend stand-in now sends no delivered reports.'); return; }
    if (url.pathname === '/__alerts' && req.method === 'POST') {
      const text = (await readBody(req)).toString('utf8'); alerts.push({ at: new Date().toISOString(), title: req.headers.title, text });
      console.log('[alert stand-in]\n' + text); res.end('ok'); return;
    }
    if (url.pathname === '/__alerts') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Alerts (stand-in)', alerts.map((a) => `<h3>${esc(a.at)} · ${esc(a.title)}</h3><pre>${esc(a.text)}</pre>`))); return; }
    if (url.pathname === '/__outbox') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Outbox (Resend stand-in: nothing really sent)', outbox.slice().reverse().map((m) => `<h3>${esc(m.subject)}</h3><p>From ${esc(m.from)} · to ${esc(m.to)} · reply to ${esc(m.reply_to || '(none)')} · ${esc(m.at)}</p><pre style="background:#f3f3f3;padding:12px;white-space:pre-wrap">${esc(m.text)}</pre>`)));
      return;
    }
    // ---- the box ----
    if (url.pathname.startsWith('/api/')) {
      const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : await readBody(req);
      const headers = { ...req.headers, 'cf-connecting-ip': req.socket.remoteAddress || '' };
      const out = await handle(new Request(url, { method: req.method, headers, body }), env);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    // ---- the website, straight from the site folder ----
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(SITE, rel));
    if (!file.startsWith(SITE + sep)) { res.writeHead(404); res.end('not found'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500); res.end(e.code === 'ENOENT' ? 'not found' : 'error');
  }
}).listen(PORT, () => console.log(`drop box + website on ${BASE}/  (review page ${BASE}/review/, enquiry form ${BASE}/#contact, outbox ${BASE}/__outbox)`));

setInterval(() => runSchedule(env, Date.now()).catch((e) => console.log('schedule failed', e)), 20000);
