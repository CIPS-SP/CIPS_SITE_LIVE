// Local test server: the drop box (in-memory queue) plus the website, on one address, so the pages
// and the box are the same origin like a real setup. Not for production. Nothing here reaches Brevo or the internet.
//   node dev/dev-server.mjs            then open the link that  node tools/make-test-link.mjs  prints (reviews),
//                                      or http://localhost:8787/#contact (enquiries)
// Enquiries (7 Nov 2026): a stand-in for Brevo answers at /__brevo; what it "sent" is listed at /__outbox, and it reports
// "delivered" back to the box 2 s later with the webhook token, like Brevo. /__brevo/down and /__brevo/up make it fail or work,
// /__brevo/silent stops the delivered reports (to see the alert), /__alerts lists the alerts. The schedule runs every 20 s here
// and the alert comes after ALERT_AFTER_MIN (2 minutes here).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../src/worker.js';
import { runSchedule } from '../src/enquiry.js';
import { memoryKV } from './memory-kv.js';

const PORT = Number(process.env.PORT || 8787);
const here = fileURLToPath(new URL('.', import.meta.url));
const SITE = resolve(here, '../../site');
const BASE = `http://localhost:${PORT}`;
const HOOK = 'local-brevo-webhook-token';
const env = {
  BOX: memoryKV(),
  SIGNING_SECRET: process.env.SIGNING_SECRET || 'dev-signing-secret',
  COLLECT_SECRET: process.env.COLLECT_SECRET || 'dev-collect-secret',
  ALLOWED_ORIGINS: `${BASE},http://127.0.0.1:${PORT},http://localhost:8080`,
  BREVO_API_KEY: 'xkeysib-local-stand-in',
  BREVO_API: BASE + '/__brevo',
  BREVO_WEBHOOK_TOKEN: HOOK,
  ALERT_URL: BASE + '/__alerts',
  ALERT_AFTER_MIN: process.env.ALERT_AFTER_MIN || '2',
  MAIL_FROM: 'CIPS website <website@cips.agency>',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

const outbox = [], alerts = [];
let brevoDown = false, brevoSilent = false;
const page = (title, rows) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:14px system-ui;margin:24px;max-width:900px"><h1>${title}</h1>` +
  (rows.length ? rows.join('') : '<p>Nothing yet.</p>') + '<p><a href="/__outbox">outbox</a> · <a href="/__alerts">alerts</a> · <a href="/__brevo/down">make Brevo fail</a> · <a href="/__brevo/up">make it work</a> · <a href="/__brevo/silent">stop delivered reports</a></p>';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const readBody = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });

async function report(messageId, tags) { // what Brevo does once the email has arrived
  const body = JSON.stringify({ event: 'delivered', email: 'dutyagent@cips.agency', id: 1, date: new Date().toISOString(), ts: Math.floor(Date.now() / 1000), 'message-id': messageId, tags });
  await fetch(BASE + '/api/brevo-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + HOOK }, body });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  try {
    if (url.pathname === '/__quit') { res.end('bye'); setTimeout(() => process.exit(0), 50); return; } // test helper: stops this server
    // ---- the stand-in for Brevo and the alert channel ----
    if (url.pathname === '/__brevo/smtp/email' && req.method === 'POST') {
      const m = JSON.parse((await readBody(req)).toString('utf8'));
      if (brevoDown) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"code":"unavailable","message":"stand-in is down"}'); return; }
      const id = '<local.' + (outbox.length + 1) + '@smtp-relay.mailin.fr>';
      outbox.push({ id, at: new Date().toISOString(), ...m });
      console.log(`[brevo stand-in] "sent" ${id} to ${m.to.map((x) => x.email)}: ${m.subject}`);
      if (!brevoSilent) setTimeout(() => report(id, m.tags).catch((e) => console.log('report failed', e)), 2000);
      res.writeHead(201, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ messageId: id })); return;
    }
    if (url.pathname === '/__brevo/down') { brevoDown = true; res.end('The Brevo stand-in now fails every email.'); return; }
    if (url.pathname === '/__brevo/up') { brevoDown = false; brevoSilent = false; res.end('The Brevo stand-in now works, with delivered reports.'); return; }
    if (url.pathname === '/__brevo/silent') { brevoSilent = true; res.end('The Brevo stand-in now sends no delivered reports.'); return; }
    if (url.pathname === '/__alerts' && req.method === 'POST') {
      const text = (await readBody(req)).toString('utf8'); alerts.push({ at: new Date().toISOString(), title: req.headers.title, text });
      console.log('[alert stand-in]\n' + text); res.end('ok'); return;
    }
    if (url.pathname === '/__alerts') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page('Alerts (stand-in)', alerts.map((a) => `<h3>${esc(a.at)} · ${esc(a.title)}</h3><pre>${esc(a.text)}</pre>`))); return; }
    if (url.pathname === '/__outbox') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Outbox (Brevo stand-in: nothing really sent)', outbox.slice().reverse().map((m) => `<h3>${esc(m.subject)}</h3><p>From ${esc(m.sender.name + ' <' + m.sender.email + '>')} · to ${esc(m.to.map((x) => x.email).join(', '))} · reply to ${esc(m.replyTo ? m.replyTo.email : '(none)')} · ${esc(m.at)}</p><pre style="background:#f3f3f3;padding:12px;white-space:pre-wrap">${esc(m.textContent)}</pre>`)));
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
