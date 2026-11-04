#!/usr/bin/env node
// Looks at the live site on your own computer: serves the site/ folder at http://localhost:8080 and opens it in your browser.
//   node serve.mjs [--port 8080] [--no-open]
// Nothing is changed, nothing is cached (so you always see the current files), and video can be skipped through.
// Only this folder is served; the site itself never talks to anything else.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(here, '../site');
const args = process.argv.slice(2);
const wantPort = Number((args.includes('--port') && args[args.indexOf('--port') + 1]) || 8080);
if (!existsSync(join(SITE, 'index.html'))) { console.error('Cannot find site/index.html next to the tools folder.'); process.exit(1); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end('bad request'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(SITE, p));
  if (!f.startsWith(SITE) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + p); return; }
  const size = statSync(f).size, type = TYPES[extname(f).toLowerCase()] || 'application/octet-stream', range = req.headers.range;
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const a = m && m[1] ? Number(m[1]) : 0, b = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (a > b || a >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
    createReadStream(f, { start: a, end: b }).pipe(res);
  } else {
    res.writeHead(200, { ...base, 'Content-Length': size });
    createReadStream(f).pipe(res);
  }
});

function listen(port, tries = 0) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries < 10) listen(port + 1, tries + 1);
    else { console.error('Could not start the server: ' + e.message); process.exit(1); }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log('');
    console.log('  CIPS site (the live version): ' + url);
    console.log('  Leave this window open while you look. Close it, or press Ctrl+C, to stop.');
    console.log('');
    if (!args.includes('--no-open')) {
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true }).unref();
      else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  });
}
listen(wantPort);
