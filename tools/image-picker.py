#!/usr/bin/env python3
"""Image picker (19 Nov 2026, Simon: "a picker tool where we can look through the image library and mark pictures to include in the carousel").

Runs on this PC only: python tools/image-picker.py   then open http://localhost:8095
It shows every picture in the CIPS Image Library (Dropbox) and its subfolders, HEIC included, as a grid by folder.
New pictures added to the library show when the page is reloaded.
Click a picture to see it large; press P (or the button) to mark it for the chosen desk's carousel. The marks are saved
as you go in tools/picker-picks.json, which Claude reads to build the carousels. Nothing is uploaded anywhere; the
library is only read. Small copies for the grid are kept in tools/.picker-cache (safe to delete).
"""
import json, os, sys, hashlib, threading, mimetypes, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from io import BytesIO
from PIL import Image, ImageOps
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except Exception:
    print('pillow_heif is missing: HEIC pictures will not show (pip install pillow-heif)')
Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get('CIPS_LIBRARY') or r'C:/Users/amity/Dropbox/AGENCY OPERATIONS/Business Development CIPS/Branding/CIPS Image Library'
CACHE = os.path.join(HERE, '.picker-cache')
PICKS = os.path.join(HERE, 'picker-picks.json')
PORT = int(sys.argv[sys.argv.index('--port') + 1]) if '--port' in sys.argv else 8095
EXT = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff'}
DESKS = ['yachting', 'cruise', 'offshore', 'shipping']
os.makedirs(CACHE, exist_ok=True)
lock = threading.Lock()

def scan():
    out = []
    for root, dirs, files in os.walk(LIB):
        dirs.sort()
        for f in sorted(files):
            if os.path.splitext(f)[1].lower() in EXT:
                rel = os.path.relpath(os.path.join(root, f), LIB).replace('\\', '/')
                out.append({'path': rel, 'folder': os.path.dirname(rel) or '(top level)', 'name': f})
    return out

def load_picks():
    try:
        with open(PICKS, encoding='utf8') as fh: p = json.load(fh)
    except Exception: p = {}
    for d in DESKS: p.setdefault(d, [])
    return p

def save_picks(p):
    with lock:
        with open(PICKS, 'w', encoding='utf8') as fh: json.dump(p, fh, indent=1)

def sized(rel, size):
    src = os.path.normpath(os.path.join(LIB, rel))
    if not src.startswith(os.path.normpath(LIB)) or not os.path.isfile(src): return None
    key = hashlib.sha1(f'{rel}|{size}|{os.path.getmtime(src)}'.encode()).hexdigest()
    dst = os.path.join(CACHE, key + '.jpg')
    if not os.path.exists(dst):
        im = Image.open(src)
        try: im.draft('RGB', (size, size))
        except Exception: pass
        im = ImageOps.exif_transpose(im).convert('RGB'); im.thumbnail((size, size))
        im.save(dst, quality=82)
    with open(dst, 'rb') as fh: return fh.read()

PAGE = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CIPS image picker</title><style>
:root{--ink:#14181f;--ink2:#5b6472;--line:#e3e1dc;--bg:#f7f6f2;--acc:#0a7cc2;--pick:#e8a400}
*{box-sizing:border-box}body{margin:0;font:15px/1.4 system-ui,Segoe UI,sans-serif;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
header h1{font-size:17px;margin:0 8px 0 0}select,input,button{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:#fff}
button{cursor:pointer}button.on{background:var(--ink);color:#fff;border-color:var(--ink)}.count{color:var(--ink2)}
.desk{font-weight:600}main{padding:8px 16px 60px}h2{font-size:15px;margin:22px 0 8px;color:var(--ink2);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.t{position:relative;aspect-ratio:4/3;background:#ddd;border-radius:8px;overflow:hidden;cursor:zoom-in;border:3px solid transparent}
.t img{width:100%;height:100%;object-fit:cover;display:block}.t.p{border-color:var(--pick)}
.t .s{position:absolute;top:6px;right:6px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(255,255,255,.9);font-size:17px;line-height:30px;padding:0;text-align:center;cursor:pointer}
.t.p .s{background:var(--pick);color:#fff}.t .n{position:absolute;left:0;right:0;bottom:0;padding:3px 6px;font-size:11px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.6));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t .o{position:absolute;top:6px;left:6px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,.55);border-radius:4px;padding:1px 5px}
#big{position:fixed;inset:0;background:rgba(10,12,16,.94);display:none;z-index:10;align-items:center;justify-content:center;flex-direction:column}
#big.on{display:flex}#big img{max-width:94vw;max-height:80vh;border-radius:6px}#big .bar{color:#fff;margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center}
#big .bar button{background:#2a2f38;color:#fff;border-color:#444}#big .bar button.pk{background:var(--pick);border-color:var(--pick);color:#111;font-weight:600}
#big .nm{color:#bbb;font-size:13px;max-width:80vw;text-align:center}.help{color:var(--ink2);font-size:13px}
</style></head><body>
<header><h1>CIPS image picker</h1>
<label>Picking for <select id="desk"></select></label><span class="count" id="cnt"></span>
<select id="folder"><option value="">All folders</option></select>
<input id="q" placeholder="Search names" size="14"><button id="only">Show picks only</button>
<span class="help">Click a picture to see it large. &#9733; or P marks it. Arrow keys move. Saved as you go.</span></header>
<main id="m">Loading the library&hellip;</main>
<div id="big"><img id="bi" alt=""><div class="bar"><button id="bp">&#8249; Back</button><button id="bk" class="pk">&#9733; Pick</button><button id="bn">Next &#8250;</button><button id="bx">Close (Esc)</button></div><div class="nm" id="bnm"></div></div>
<script>
const DESKS = {yachting:'Yachting desk', cruise:'Cruise desk', offshore:'Offshore desk', shipping:'Shipping desk'};
let all = [], picks = {}, desk = localStorage.getItem('pdesk') || 'yachting', onlyPicks = false, shown = [], cur = -1;
const $ = s => document.querySelector(s), esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const img = (p, s) => '/img?s=' + s + '&p=' + encodeURIComponent(p);
Object.entries(DESKS).forEach(([k, v]) => $('#desk').add(new Option(v, k, false, k === desk)));
const others = p => Object.keys(DESKS).filter(d => d !== desk && (picks[d] || []).includes(p)).map(d => d[0].toUpperCase()).join(' ');
function isP(p){ return (picks[desk] || []).includes(p); }
function count(){ $('#cnt').textContent = (picks[desk] || []).length + ' picked'; }
async function toggle(p){ const l = picks[desk] = picks[desk] || []; const i = l.indexOf(p); if (i < 0) l.push(p); else l.splice(i, 1);
  document.querySelectorAll('.t').forEach(t => { if (t.dataset.p === p) t.classList.toggle('p', isP(p)); });
  if (cur >= 0) $('#bk').innerHTML = isP(shown[cur].path) ? '&#9733; Picked (P to unpick)' : '&#9734; Pick (P)';
  count(); await fetch('/api/picks', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(picks)}); }
function render(){
  const f = $('#folder').value, q = $('#q').value.toLowerCase();
  shown = all.filter(x => (!f || x.folder === f) && (!q || x.path.toLowerCase().includes(q)) && (!onlyPicks || isP(x.path)));
  if (onlyPicks) shown.sort((a, b) => picks[desk].indexOf(a.path) - picks[desk].indexOf(b.path));
  let h = '', last = null;
  shown.forEach((x, i) => { if (!onlyPicks && x.folder !== last) { if (last !== null) h += '</div>'; h += '<h2>' + esc(x.folder) + '</h2><div class="grid">'; last = x.folder; } else if (onlyPicks && i === 0) h += '<h2>Picked for the ' + DESKS[desk] + ', in order</h2><div class="grid">';
    const o = others(x.path);
    h += '<div class="t' + (isP(x.path) ? ' p' : '') + '" data-i="' + i + '" data-p="' + esc(x.path) + '"><img loading="lazy" src="' + img(x.path, 360) + '" alt=""><button class="s" title="Pick (P)">&#9733;</button>' + (o ? '<span class="o" title="Also picked for">' + o + '</span>' : '') + '<span class="n">' + esc(x.name) + '</span></div>'; });
  $('#m').innerHTML = shown.length ? h + '</div>' : '<p>Nothing to show.</p>'; count(); }
function open(i){ if (i < 0 || i >= shown.length) return; cur = i; const x = shown[i]; $('#bi').src = img(x.path, 1600); $('#bnm').textContent = (i + 1) + ' / ' + shown.length + '  ·  ' + x.path;
  $('#bk').innerHTML = isP(x.path) ? '&#9733; Picked (P to unpick)' : '&#9734; Pick (P)'; $('#big').classList.add('on'); }
function close(){ $('#big').classList.remove('on'); cur = -1; }
$('#m').addEventListener('click', e => { const t = e.target.closest('.t'); if (!t) return; if (e.target.closest('.s')) toggle(t.dataset.p); else open(+t.dataset.i); });
$('#bp').onclick = () => open(cur - 1); $('#bn').onclick = () => open(cur + 1); $('#bx').onclick = close; $('#bk').onclick = () => toggle(shown[cur].path);
$('#big').addEventListener('click', e => { if (e.target.id === 'big') close(); });
addEventListener('keydown', e => { if (cur < 0 || e.target.tagName === 'INPUT') return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') open(cur - 1); else if (e.key === 'ArrowRight') open(cur + 1); else if (e.key.toLowerCase() === 'p' || e.key === ' ') { e.preventDefault(); toggle(shown[cur].path); } });
$('#desk').onchange = () => { desk = $('#desk').value; try { localStorage.setItem('pdesk', desk); } catch (e) {} render(); };
$('#folder').onchange = render; $('#q').oninput = render; $('#only').onclick = () => { onlyPicks = !onlyPicks; $('#only').classList.toggle('on', onlyPicks); render(); };
Promise.all([fetch('/api/list').then(r => r.json()), fetch('/api/picks').then(r => r.json())]).then(([l, p]) => { all = l; picks = p;
  [...new Set(all.map(x => x.folder))].forEach(f => $('#folder').add(new Option(f + ' (' + all.filter(x => x.folder === f).length + ')', f))); render(); });
</script></body></html>'''

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store' if 'json' in ctype or 'html' in ctype else 'max-age=86400'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        if u.path == '/': return self.send(200, PAGE.encode(), 'text/html; charset=utf-8')
        if u.path == '/api/list': return self.send(200, json.dumps(scan()).encode(), 'application/json')   # looked at afresh each time: new pictures show on a reload
        if u.path == '/api/picks': return self.send(200, json.dumps(load_picks()).encode(), 'application/json')
        if u.path == '/img':
            try: b = sized(q['p'][0], max(64, min(2400, int(q.get('s', ['360'])[0]))))
            except Exception as e: b = None; print('could not open', q.get('p'), e)
            return self.send(200, b, 'image/jpeg') if b else self.send(404, b'not found', 'text/plain')
        self.send(404, b'not found', 'text/plain')
    def do_POST(self):
        if self.path != '/api/picks': return self.send(404, b'', 'text/plain')
        n = int(self.headers.get('Content-Length', 0)); p = json.loads(self.rfile.read(n) or b'{}')
        clean = {d: [x for x in p.get(d, []) if isinstance(x, str)] for d in DESKS}
        save_picks(clean); self.send(200, b'{"ok":true}', 'application/json')

if __name__ == '__main__':
    if not os.path.isdir(LIB): sys.exit('Cannot find the image library: ' + LIB)
    LIST = scan()
    print(f'{len(LIST)} pictures in the library. Open http://localhost:{PORT}  (Ctrl+C to stop)')
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
