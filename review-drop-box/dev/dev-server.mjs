// Local test server: the drop box (in-memory queue) plus the review page, on one address, so the page
// and the box are the same origin like a real setup. Not for production.
//   node dev/dev-server.mjs            then open the link that  node tools/make-test-link.mjs  prints
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../src/worker.js';
import { memoryKV } from './memory-kv.js';

const PORT = Number(process.env.PORT || 8787);
const here = fileURLToPath(new URL('.', import.meta.url));
const SITE = resolve(here, '../../site');
const env = {
  BOX: memoryKV(),
  SIGNING_SECRET: process.env.SIGNING_SECRET || 'dev-signing-secret',
  COLLECT_SECRET: process.env.COLLECT_SECRET || 'dev-collect-secret',
  ALLOWED_ORIGINS: `http://localhost:${PORT},http://127.0.0.1:${PORT},http://localhost:8080`,
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/__quit') { res.end('bye'); setTimeout(() => process.exit(0), 50); return; } // test helper: stops this server
    if (url.pathname.startsWith('/api/')) {
      const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : await new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
      const headers = { ...req.headers, 'cf-connecting-ip': req.socket.remoteAddress || '' };
      const out = await handle(new Request(url, { method: req.method, headers, body }), env);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    // the review page (and its small files) straight from the site folder
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(SITE, rel));
    if (!file.startsWith(join(SITE, 'review')) ) { res.writeHead(404); res.end('not found'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end(e.code === 'ENOENT' ? 'not found' : 'error');
  }
}).listen(PORT, () => console.log(`drop box + review page on http://localhost:${PORT}/review/`));
