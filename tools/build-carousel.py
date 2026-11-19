#!/usr/bin/env python3
"""Rebuild a desk page's photo carousel from the image picker's picks (19 Nov 2026, Simon).

    python tools/build-carousel.py yachting        (or cruise, offshore, shipping)

For each photo picked for that desk (tools/picker-picks.json, in the picker's order) it makes a copy for the website:
cropped to 4:3, 1120 x 840, about 125 KB, re-saved without the camera's hidden details (date, place, device), and named by
desk and place in the order: site/images/carousel/YACHTING_1.jpg, YACHTING_2.jpg ... The originals in Dropbox are only read,
never changed, and their file names never go into the website. Copies left over from a longer list are removed.
The descriptions (alt text) and any crop focus come from tools/carousel-notes.json; a photo with no note gets a plain one
and is listed at the end so a description can be added. Then the list of photos in site/sectors/<desk>.html is rewritten.
Afterwards: look at the page, run the check, commit, and push when Simon says so.
"""
import json, os, re, sys
from PIL import Image, ImageOps
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except Exception:
    print('pillow_heif is missing: HEIC photos cannot be read (pip install pillow-heif)')
Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
LIB = os.environ.get('CIPS_LIBRARY') or r'C:/Users/amity/Dropbox/AGENCY OPERATIONS/Business Development CIPS/Branding/CIPS Image Library'
OUT = os.path.join(REPO, 'site', 'images', 'carousel')
W, H = 1120, 840
DESKS = {'yachting': 'yachting', 'cruise': 'cruise', 'offshore': 'offshore', 'shipping': 'shipping'}

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in DESKS: sys.exit('Which desk? python tools/build-carousel.py yachting|cruise|offshore|shipping')
    desk = sys.argv[1]; tag = desk.upper()
    picks = json.load(open(os.path.join(HERE, 'picker-picks.json'), encoding='utf8')).get(desk, [])
    if not picks: sys.exit(f'No photos picked for the {desk} desk yet: pick some in the image picker first.')
    notes = json.load(open(os.path.join(HERE, 'carousel-notes.json'), encoding='utf8'))
    page = os.path.join(REPO, 'site', 'sectors', DESKS[desk] + '.html')
    html = open(page, encoding='utf8', newline='').read()
    m = re.search(r'(<div class="dgal"[^>]*>.*?<ul class="gt">)(.*?)(\n\s*</ul></div>)', html, re.S)
    if not m: sys.exit(f'{page} has no photo carousel yet (a <div class="dgal" data-gallery> like the yachting page): add it first.')
    os.makedirs(OUT, exist_ok=True)
    missing_notes, items = [], []
    for n, rel in enumerate(picks, 1):
        src = os.path.join(LIB, rel)
        if not os.path.isfile(src): sys.exit(f'Cannot find "{rel}" in the image library (moved or renamed?). Nothing was changed on the page.')
        note = notes.get(rel, {}); fx, fy = note.get('focus', [0.5, 0.5])
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')      # upright, and the hidden camera details are not carried over
        w, h = im.size
        cw, ch = (round(h * W / H), h) if w / h > W / H else (w, round(w * H / W))
        x0, y0 = round((w - cw) * fx), round((h - ch) * fy)
        im.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.LANCZOS).save(os.path.join(OUT, f'{tag}_{n}.jpg'), quality=80, optimize=True, progressive=True)
        alt = note.get('alt') or f'A CIPS {desk} port call, photo {n}'
        if not note.get('alt'): missing_notes.append(rel)
        alt = alt.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')
        items.append(f'        <li><img src="../images/carousel/{tag}_{n}.jpg" alt="{alt}" loading="lazy"></li>')
        print(f'{tag}_{n}.jpg  <-  {rel}')
    removed = 0
    for f in os.listdir(OUT):                                            # copies left from a longer list
        mm = re.fullmatch(tag + r'_(\d+)\.jpg', f)
        if mm and int(mm.group(1)) > len(picks): os.remove(os.path.join(OUT, f)); removed += 1
    html = html[:m.start(2)] + '\n' + '\n'.join(items) + html[m.start(3):]
    open(page, 'w', encoding='utf8', newline='').write(html)
    print(f'\n{len(picks)} photos in the {desk} carousel ({os.path.relpath(page, REPO)}); {removed} old copies removed.')
    if missing_notes:
        print('\nNo description yet for these (they got a plain one; add an "alt" in tools/carousel-notes.json and run again):')
        for r in missing_notes: print('  ' + r)

if __name__ == '__main__':
    main()
