# Render an attributed trail map image per park from OpenStreetMap tiles (open data,
# ODbL) — we don't republish the city's own map image (its copyright); we link to it.
# Fetches ~12 tiles per park with a proper User-Agent (within OSM tile policy), caches
# them, stitches with PIL, stamps attribution. Writes <park>.jpg + park-maps.json.
# Run (repo root): python scripts/park-map.py <workdir>
import io, json, math, os, sys, urllib.request
from PIL import Image, ImageDraw

WORK = sys.argv[1] if len(sys.argv) > 1 else "."
UA = "milkweed.garden park-map seed (github.com/redfameMN/keystone)"
ZOOM, W, H = 16, 900, 640
PARKS = {  # centroid (lat, lon)
    "pinnacle_ojibway":     ("Ojibway Park",             44.9115, -92.9501),
    "pinnacle_carver_lake": ("Carver Lake Park",         44.9026, -92.9739),
    "pinnacle_tamarack":    ("Tamarack Nature Preserve", 44.9266, -92.9493),
    "pinnacle_colby_lake":  ("Colby Lake Park",          44.9106, -92.9094),
}

def tile_xy(lat, lon, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n

cache = os.path.join(WORK, "tiles"); os.makedirs(cache, exist_ok=True)
def tile(z, x, y):
    p = os.path.join(cache, f"{z}_{x}_{y}.png")
    if not os.path.exists(p):
        req = urllib.request.Request(f"https://tile.openstreetmap.org/{z}/{x}/{y}.png", headers={"User-Agent": UA})
        open(p, "wb").write(urllib.request.urlopen(req, timeout=30).read())
    return Image.open(p).convert("RGB")

out = {}
for user, (name, lat, lon) in PARKS.items():
    cx, cy = tile_xy(lat, lon, ZOOM)
    px, py = cx * 256, cy * 256                       # centre in world pixels
    x0, y0 = int(px - W / 2), int(py - H / 2)         # top-left of the window
    img = Image.new("RGB", (W, H))
    for tx in range(x0 // 256, (x0 + W) // 256 + 1):
        for ty in range(y0 // 256, (y0 + H) // 256 + 1):
            img.paste(tile(ZOOM, tx, ty), (tx * 256 - x0, ty * 256 - y0))
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, 0, W, 34], fill=(16, 26, 20, 200)); d.text((12, 10), f"{name} · trails & paths", fill=(241, 235, 221))  # PIL's default font has no em dash
    d.rectangle([0, H - 26, W, H], fill=(16, 26, 20, 200)); d.text((12, H - 19), "Map data © OpenStreetMap contributors (ODbL) · openstreetmap.org/copyright", fill=(241, 235, 221))
    path = os.path.join(WORK, f"{user}.jpg"); img.save(path, "JPEG", quality=88)
    out[user] = {"name": name, "file": path}
    print(f"{user:22} -> {path}")
json.dump(out, open(os.path.join(WORK, "park-maps.json"), "w"), indent=1)
