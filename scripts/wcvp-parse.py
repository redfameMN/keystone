# Bulk-parse Kew's World Checklist of Vascular Plants (wcvp.zip) into a compact
# genus -> native TDWG level-3 regions map, aggregated across all accepted species.
# Native = a distribution row that is not introduced, not extinct, not doubtful.
# Writes genus-native.json for the Node loader. No API calls; one local pass.
import csv, io, json, sys, time, zipfile
csv.field_size_limit(10_000_000)

ZIP = sys.argv[1] if len(sys.argv) > 1 else "wcvp.zip"
OUT = sys.argv[2] if len(sys.argv) > 2 else "genus-native.json"

t0 = time.time()
z = zipfile.ZipFile(ZIP)
names_f = next(n for n in z.namelist() if "names" in n.lower() and n.lower().endswith((".csv", ".txt")))
dist_f  = next(n for n in z.namelist() if "distribution" in n.lower() and n.lower().endswith((".csv", ".txt")))
print(f"names: {names_f}  distribution: {dist_f}")

# plant_name_id -> genus, but only for ACCEPTED species (skip synonyms/hybrids/infra).
genus_by_id = {}
with z.open(names_f) as fh:
    r = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="|")
    for row in r:
        if row.get("taxon_status") != "Accepted":
            continue
        if row.get("taxon_rank") not in ("Species",):
            continue
        g = (row.get("genus") or "").strip()
        if not g or (row.get("genus_hybrid") or "").strip():
            continue
        genus_by_id[row["plant_name_id"]] = g
print(f"accepted species mapped to genus: {len(genus_by_id):,}")

# genus -> { area_code_l3: area_name } for native occurrences.
native = {}
rows = 0
with z.open(dist_f) as fh:
    r = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="|")
    for row in r:
        rows += 1
        if row.get("introduced") == "1" or row.get("extinct") == "1" or row.get("location_doubtful") == "1":
            continue
        g = genus_by_id.get(row.get("plant_name_id"))
        if not g:
            continue
        code = (row.get("area_code_l3") or "").strip()
        if not code:
            continue
        native.setdefault(g, {})[code] = (row.get("area") or "").strip()

pairs = sum(len(v) for v in native.values())
print(f"distribution rows scanned: {rows:,}")
print(f"genera with native range: {len(native):,}")
print(f"genus x region rows: {pairs:,}")
json.dump(native, open(OUT, "w", encoding="utf-8"))
print(f"wrote {OUT} in {time.time()-t0:.1f}s")
