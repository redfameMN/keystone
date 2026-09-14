# Data sources

Nothing in the plant vocabulary is hand-maintained long term. Everything traces to an existing list.

| Table | Source | How |
|---|---|---|
| `keystone_genus` | NWF Keystone Plants by Ecoregion (Tallamy lab host-plant rankings) | PDFs per EPA Level I ecoregion → `data/nwf-keystone.json`. Only ecoregions 8 (Eastern Temperate Forests) and 9 (Great Plains) are filled so far; add the rest from the guides. |
| `plant_genus`, `plant_species` | iNaturalist taxa API | `scripts/ingest-plants.mjs`; ≤1 request/sec |
| `species_native_state` | USDA PLANTS state distribution, or BONAP | Bulk download → CSV → upsert. Not yet scripted. |
| `ecoregion.geom` | EPA Level I ecoregion shapefile | `ogr2ogr` into PostGIS; derives a poster's ecoregion from coarse location |

Photo identification uses Plant.id (Kindwise) via the `identify` Edge Function. PictureThis has no public API.

# Journey taxonomy

`project_type` and `stage` are seeded in the migration. They came from how people already describe
their projects: r/NativePlantGardening flair and post titles, extension case studies (UMD, TNC), and
Minnesota BWSR / Blue Thumb program categories. "Sleep, creep, leap" is the community's own phrase
for years 1–3 of perennial establishment.
