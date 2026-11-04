"""Provenance: how site/_beats/globe-live/assets/tiles was made (4 Nov 2026). Run only if the globe's tile boxes change; the site itself never calls these servers.
Usage: python bake-tiles.py ../site/_beats/globe-live/assets/tiles
Downloads, once, exactly the map tiles the globe's night mosaic asks for (same box maths as globe-live/beat.js buildNightPatch):
  Esri World Imagery: z7 over the Channel box and z9 over the islands box;  NASA GIBS VIIRS Black Marble: z7 for the Channel box, z8 parents for the z9 box.
Saved as <out>/esri/{z}/{y}/{x}.jpg and <out>/nasa/{z}/{y}/{x}.png"""
import math, os, sys, urllib.request, time
OUT = sys.argv[1]
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
NASA = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'
D2R = math.pi / 180
def box_tiles(z, lon_min, lon_max, lat_min, lat_max):
    n = 2 ** z
    tx = lambda lon: (lon + 180) / 360 * n
    ty = lambda lat: (1 - math.log(math.tan(lat * D2R) + 1 / math.cos(lat * D2R)) / math.pi) / 2 * n
    x0, x1 = math.floor(tx(lon_min)), math.floor(tx(lon_max)); y0, y1 = math.floor(ty(lat_max)), math.floor(ty(lat_min))
    return [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
channel = (-8.5, 5.5, 46.8, 53.2); islands = (-3.7, -1.1, 48.35, 50.25)
esri = [(7, x, y) for x, y in box_tiles(7, *channel)] + [(9, x, y) for x, y in box_tiles(9, *islands)]
nasa = {(7, x, y) for x, y in box_tiles(7, *channel)} | {(8, x // 2, y // 2) for x, y in box_tiles(9, *islands)}
print('esri tiles', len(esri), '| nasa tiles', len(nasa))
def get(url):
    for k in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30).read()
        except Exception as e:
            err = e; time.sleep(1.5)
    raise err
tot = 0
for z, x, y in esri:
    p = os.path.join(OUT, 'esri', str(z), str(y), str(x) + '.jpg'); os.makedirs(os.path.dirname(p), exist_ok=True)
    d = get(ESRI.format(z=z, x=x, y=y)); open(p, 'wb').write(d); tot += len(d)
for z, x, y in sorted(nasa):
    p = os.path.join(OUT, 'nasa', str(z), str(y), str(x) + '.png'); os.makedirs(os.path.dirname(p), exist_ok=True)
    d = get(NASA.format(z=z, x=x, y=y)); open(p, 'wb').write(d); tot += len(d)
print('saved', len(esri) + len(nasa), 'tiles,', round(tot / 1048576, 2), 'MB ->', OUT)
