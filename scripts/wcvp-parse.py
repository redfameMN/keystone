# Bulk-parse Kew's World Checklist of Vascular Plants (wcvp.zip) into native TDWG
# level-3 region maps at both genus and species level, across all accepted species.
# Native = a distribution row that is not introduced, not extinct, not doubtful.
# Writes genus-native.json and species-native.json for the Node loaders. No API calls.
import csv, io, json, sys, time, zipfile
csv.field_size_limit(10_000_000)

ZIP = sys.argv[1] if len(sys.argv) > 1 else "wcvp.zip"
OUT = sys.argv[2] if len(sys.argv) > 2 else "genus-native.json"
OUT_SP = sys.argv[3] if len(sys.argv) > 3 else "species-native.json"

t0 = time.time()
z = zipfile.ZipFile(ZIP)
names_f = next(n for n in z.namelist() if "names" in n.lower() and n.lower().endswith((".csv", ".txt")))
dist_f  = next(n for n in z.namelist() if "distribution" in n.lower() and n.lower().endswith((".csv", ".txt")))
print(f"names: {names_f}  distribution: {dist_f}")

# plant_name_id -> (genus, binomial), only for ACCEPTED species (skip synonyms/hybrids/infra).
info_by_id = {}
with z.open(names_f) as fh:
    r = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="|")
    for row in r:
        if row.get("taxon_status") != "Accepted":
            continue
        if row.get("taxon_rank") not in ("Species",):
            continue
        g = (row.get("genus") or "").strip()
        sp = (row.get("species") or "").strip()
        if not g or not sp or (row.get("genus_hybrid") or "").strip() or (row.get("species_hybrid") or "").strip():
            continue
        info_by_id[row["plant_name_id"]] = (g, f"{g} {sp}")
print(f"accepted species mapped: {len(info_by_id):,}")

# genus -> {code: name} and species(binomial) -> {code: name} for native occurrences.
native, native_sp = {}, {}
rows = 0
with z.open(dist_f) as fh:
    r = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8", errors="replace"), delimiter="|")
    for row in r:
        rows += 1
        if row.get("introduced") == "1" or row.get("extinct") == "1" or row.get("location_doubtful") == "1":
            continue
        info = info_by_id.get(row.get("plant_name_id"))
        if not info:
            continue
        code = (row.get("area_code_l3") or "").strip()
        if not code:
            continue
        name = (row.get("area") or "").strip()
        g, binomial = info
        native.setdefault(g, {})[code] = name
        native_sp.setdefault(binomial, {})[code] = name

print(f"distribution rows scanned: {rows:,}")
print(f"genera with native range: {len(native):,}  (genus x region rows: {sum(len(v) for v in native.values()):,})")
print(f"species with native range: {len(native_sp):,}  (species x region rows: {sum(len(v) for v in native_sp.values()):,})")
json.dump(native, open(OUT, "w", encoding="utf-8"))
json.dump(native_sp, open(OUT_SP, "w", encoding="utf-8"))
print(f"wrote {OUT} + {OUT_SP} in {time.time()-t0:.1f}s")
