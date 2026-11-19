#!/usr/bin/env python3
"""Rebuild a desk page's photo gallery (the top panel: a large photo and a strip of thumbnails) from the image picker's picks (19 Nov 2026, Simon).

    python tools/build-carousel.py yachting        (or cruise, offshore, shipping)

For each photo picked for that desk (tools/picker-picks.json, in the picker's order) it makes a copy for the website:
cropped to 4:3, 1120 x 840, about 125 KB, re-saved without the camera's hidden details (date, place, device), and named by
desk and place in the order: site/images/carousel/YACHTING_1.jpg, YACHTING_2.jpg ... The originals in Dropbox are only read,
never changed, and their file names never go into the website. Each also gets a small thumbnail (carousel/thumbs/, 160 x 120) for
the strip. Copies left over from a longer list are removed. The first pick opens the gallery.
The descriptions (alt text) and any crop focus come from tools/carousel-notes.json; a photo with no note gets a plain one
and is listed at the end so a description can be added. Then the gallery between the hero-gallery markers in site/sectors/<desk>.html
is rewritten (home/hero-gallery.js runs it).
Afterwards: look at the page, run the check, commit, and push when Simon says so.
"""
import json, os, re, sys
from PIL import Image, ImageOps, ImageFilter, ImageDraw
try:
    import pillow_heif; pillow_heif.register_heif_opener()
except Exception:
    print('pillow_heif is missing: HEIC photos cannot be read (pip install pillow-heif)')
Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.dirname(HERE)
LIB = os.environ.get('CIPS_LIBRARY') or r'C:/Users/amity/Dropbox/AGENCY OPERATIONS/Business Development CIPS/Branding/CIPS Image Library'
OUT = os.path.join(REPO, 'site', 'images', 'carousel'); THUMBS = os.path.join(OUT, 'thumbs')
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
    m = re.search(r'(<!-- hero-gallery:start[^>]*-->\n)(.*?)(\s*<!-- hero-gallery:end -->)', html, re.S)
    if not m: sys.exit(f'{page} has no gallery markers yet (<!-- hero-gallery:start ... --> and <!-- hero-gallery:end --> where the top panel goes, as on the yachting page): add them first.')
    os.makedirs(THUMBS, exist_ok=True)
    missing_notes, items = [], []
    for n, rel in enumerate(picks, 1):
        src = os.path.join(LIB, rel)
        if not os.path.isfile(src): sys.exit(f'Cannot find "{rel}" in the image library (moved or renamed?). Nothing was changed on the page.')
        note = notes.get(rel, {}); fx, fy = note.get('focus', [0.5, 0.5])
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')      # upright, and the hidden camera details are not carried over
        w, h = im.size
        for bx in note.get('blur', []):                                  # areas to blur, such as a yacht's name: [x0, y0, x1, y1] as shares of the photo
            box = (round(bx[0] * w), round(bx[1] * h), round(bx[2] * w), round(bx[3] * h)); r = max(8, (box[2] - box[0]) // 10)
            part = im.crop(box).filter(ImageFilter.GaussianBlur(r)); mask = Image.new('L', part.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, part.size[0] - 1, part.size[1] - 1), radius=r, fill=255)
            im.paste(part, box[:2], mask.filter(ImageFilter.GaussianBlur(r // 2)))
        cw, ch = (round(h * W / H), h) if w / h > W / H else (w, round(w * H / W))
        x0, y0 = round((w - cw) * fx), round((h - ch) * fy)
        im = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{tag}_{n}.jpg'), quality=80, optimize=True, progressive=True)
        im.resize((160, 120), Image.LANCZOS).save(os.path.join(THUMBS, f'{tag}_{n}.jpg'), quality=72, optimize=True, progressive=True)
        alt = note.get('alt') or f'A CIPS {desk} port call, photo {n}'
        if not note.get('alt'): missing_notes.append(rel)
        alt = alt.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')
        items.append((n, alt))
        print(f'{tag}_{n}.jpg  <-  {rel}')
    removed = 0
    for folder in (OUT, THUMBS):                                         # copies left from a longer list
        for f in os.listdir(folder):
            mm = re.fullmatch(tag + r'_(\d+)\.jpg', f)
            if mm and int(mm.group(1)) > len(picks): os.remove(os.path.join(folder, f)); removed += folder == OUT
    first = items[0][1]; total = len(items)
    block = [f'          <div class="panel hgal" data-hero-gallery role="region" aria-roledescription="carousel" aria-label="Photos from CIPS {desk} port calls" tabindex="0">',
             # the title bar says only "<desk> desk" and the count (Simon, 19 Nov 2026); to show each photo's description there as well,
             # write <span class="hcap" data-prefix="{desk} desk · ">{desk} desk · {first}</span> instead
             f'            <div class="bar"><b></b><b></b><b></b><span class="hcap">{desk} desk</span><span class="hn">1 / {total}</span></div>',
             f'            <div class="hst"><img class="hm" src="../images/carousel/{tag}_1.jpg" alt="{first}" width="{W}" height="{H}" fetchpriority="high">'
             f'<button type="button" class="hb" data-d="-1" aria-label="Previous photo">&lsaquo;</button><button type="button" class="hb" data-d="1" aria-label="Next photo">&rsaquo;</button></div>',
             '            <ul class="hth">']
    for n, alt in items:
        block.append(f'              <li><button type="button" data-src="../images/carousel/{tag}_{n}.jpg" data-alt="{alt}" aria-label="Photo {n} of {total}: {alt}"{" class=\"on\"" if n == 1 else ""}>'
                     f'<img src="../images/carousel/thumbs/{tag}_{n}.jpg" alt="" width="160" height="120" loading="lazy"></button></li>')
    block += ['            </ul>', '          </div>']
    html = html[:m.start(2)] + '\n'.join(block) + html[m.start(3):]
    open(page, 'w', encoding='utf8', newline='').write(html)
    print(f'\n{len(picks)} photos in the {desk} carousel ({os.path.relpath(page, REPO)}); {removed} old copies removed.')
    if missing_notes:
        print('\nNo description yet for these (they got a plain one; add an "alt" in tools/carousel-notes.json and run again):')
        for r in missing_notes: print('  ' + r)

if __name__ == '__main__':
    main()
