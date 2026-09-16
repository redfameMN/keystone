# Resolve each park to its Minnesota watershed district / WMO from government data:
# BWSR "Watershed Management Districts and Organizations" (MN Geospatial Commons),
# NAD83 UTM 15N. Point-in-polygon on each park's centroid. No guessing.
# Writes watersheds.json = { park_username: {name, type, name_type} } for seed-watersheds.mjs.
# Run (from repo root): python scripts/resolve-watersheds.py <workdir>
import io, json, math, os, sys, urllib.request, zipfile
import shapefile

WORK = sys.argv[1] if len(sys.argv) > 1 else "."
URL = "https://resources.gisdata.mn.gov/pub/gdrs/data/pub/us_mn_state_bwsr/bdry_watershed_mgmt_dist_orgs/shp_bdry_watershed_mgmt_dist_orgs.zip"
PARKS = {  # centroid (lat, lon) — from Nominatim / iNaturalist
    "pinnacle_ojibway":     (44.9115, -92.9501),
    "pinnacle_carver_lake": (44.9026, -92.9739),
    "pinnacle_tamarack":    (44.9266, -92.9493),
    "pinnacle_colby_lake":  (44.9106, -92.9094),
}

def utm15n(lat, lon):
    # Transverse Mercator forward (GRS80), zone 15 (central meridian -93). Good to ~mm here.
    a, f, k0, lon0 = 6378137.0, 1 / 298.257222101, 0.9996, math.radians(-93.0)
    e2 = 2 * f - f * f; ep2 = e2 / (1 - e2)
    phi, lam = math.radians(lat), math.radians(lon)
    n = a / math.sqrt(1 - e2 * math.sin(phi) ** 2); t = math.tan(phi) ** 2; c = ep2 * math.cos(phi) ** 2
    A = math.cos(phi) * (lam - lon0)
    M = a * ((1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256) * phi - (3 * e2 / 8 + 3 * e2**2 / 32 + 45 * e2**3 / 1024) * math.sin(2 * phi)
             + (15 * e2**2 / 256 + 45 * e2**3 / 1024) * math.sin(4 * phi) - (35 * e2**3 / 3072) * math.sin(6 * phi))
    x = 500000 + k0 * n * (A + (1 - t + c) * A**3 / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * A**5 / 120)
    y = k0 * (M + n * math.tan(phi) * (A * A / 2 + (5 - t + 9 * c + 4 * c * c) * A**4 / 24 + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * A**6 / 720))
    return x, y

def inside(pt, rings):  # even-odd over all rings handles holes
    x, y = pt; hit = False
    for ring in rings:
        for i in range(len(ring)):
            (x1, y1), (x2, y2) = ring[i - 1], ring[i]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: hit = not hit
    return hit

zp = os.path.join(WORK, "wd.zip")
if not os.path.exists(zp):
    open(zp, "wb").write(urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "milkweed.garden"}), timeout=180).read())
z = zipfile.ZipFile(zp)
shp = next(n for n in z.namelist() if n.endswith(".shp"))
r = shapefile.Reader(shp=io.BytesIO(z.read(shp)), dbf=io.BytesIO(z.read(shp[:-4] + ".dbf")), shx=io.BytesIO(z.read(shp[:-4] + ".shx")))
fields = [f[0] for f in r.fields[1:]]
polys = []
for sr in r.shapeRecords():
    pts, parts = sr.shape.points, list(sr.shape.parts) + [len(sr.shape.points)]
    polys.append((dict(zip(fields, sr.record)), [pts[parts[i]:parts[i + 1]] for i in range(len(parts) - 1)]))

out = {}
for park, (lat, lon) in PARKS.items():
    pt = utm15n(lat, lon)
    hits = [rec for rec, rings in polys if inside(pt, rings)]
    hits.sort(key=lambda rec: 0 if rec["TYPE"] == "WD" else 1)  # prefer a district over an overlapping WMO
    rec = hits[0] if hits else None
    out[park] = {"name": rec["NAME"], "type": rec["TYPE"], "name_type": rec["NAME_TYPE"]} if rec else None
    print(f"{park:22} -> {rec['NAME_TYPE'] if rec else '(none)'}")
json.dump(out, open(os.path.join(WORK, "watersheds.json"), "w"), indent=1)
