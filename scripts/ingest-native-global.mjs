// Populate genus_native_region (the global "is this native here?" tier) from Kew's
// World Checklist of Vascular Plants, accessed via the GBIF API, for the app's full
// plant vocabulary plus the tracked non-native/invasive genera.
//
// Native encoding in WCVP-via-GBIF: a species distribution row sourced from "The
// World Checklist of Vascular Plants (WCVP)" and keyed to a TDWG level-3 region is
// NATIVE when establishmentMeans is absent (INTRODUCED / MANAGED = not native).
// Aggregated to genus: native in a region if any sampled species is native there.
//
// Species are sampled per genus (a handful of representative natives spanning the
// genus's real range); production would enumerate all accepted species and,
// ideally, tag at species level. Run: node scripts/ingest-native-global.mjs
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GENERA = {
  Quercus: ["Quercus robur", "Quercus alba", "Quercus agrifolia", "Quercus macrocarpa"],
  Prunus: ["Prunus serotina", "Prunus virginiana", "Prunus americana"],
  Salix: ["Salix nigra", "Salix discolor", "Salix exigua"],
  Betula: ["Betula nigra", "Betula papyrifera", "Betula alleghaniensis"],
  Populus: ["Populus tremuloides", "Populus deltoides", "Populus balsamifera"],
  Acer: ["Acer saccharum", "Acer rubrum", "Acer palmatum", "Acer macrophyllum"],
  Vaccinium: ["Vaccinium corymbosum", "Vaccinium angustifolium", "Vaccinium ovatum"],
  Solidago: ["Solidago canadensis", "Solidago rigida", "Solidago virgaurea"],
  Symphyotrichum: ["Symphyotrichum novae-angliae", "Symphyotrichum laeve", "Symphyotrichum ericoides"],
  Helianthus: ["Helianthus annuus", "Helianthus divaricatus", "Helianthus maximiliani"],
  Rudbeckia: ["Rudbeckia hirta", "Rudbeckia laciniata", "Rudbeckia fulgida"],
  Eupatorium: ["Eupatorium perfoliatum", "Eupatorium serotinum"],
  Lupinus: ["Lupinus polyphyllus", "Lupinus perennis", "Lupinus texensis"],
  Ceanothus: ["Ceanothus americanus", "Ceanothus thyrsiflorus", "Ceanothus cuneatus"],
  Arctostaphylos: ["Arctostaphylos uva-ursi", "Arctostaphylos manzanita", "Arctostaphylos patula"],
  Asclepias: ["Asclepias syriaca", "Asclepias tuberosa", "Asclepias fascicularis"],
  Echinacea: ["Echinacea purpurea", "Echinacea angustifolia", "Echinacea pallida"],
  Monarda: ["Monarda fistulosa", "Monarda didyma", "Monarda punctata"],
  Liatris: ["Liatris spicata", "Liatris aspera", "Liatris punctata"],
  Schizachyrium: ["Schizachyrium scoparium"],
  // Non-native / invasive genera (native range is elsewhere on the globe).
  Nandina: ["Nandina domestica"],
  Ailanthus: ["Ailanthus altissima"],
  Ligustrum: ["Ligustrum sinense", "Ligustrum vulgare"],
  Pyrus: ["Pyrus calleryana"],
  Miscanthus: ["Miscanthus sinensis"],
  Hedera: ["Hedera helix"],
  Vinca: ["Vinca minor", "Vinca major"],
  Pueraria: ["Pueraria montana"],
  Microstegium: ["Microstegium vimineum"],
  Alliaria: ["Alliaria petiolata"],
};

const api = (path) => fetch(`https://api.gbif.org/v1/${path}`).then((r) => r.json());

async function nativeRegions(species) {
  const m = await api(`species/match?name=${encodeURIComponent(species)}`);
  if (!m.usageKey) return {};
  const { results = [] } = await api(`species/${m.usageKey}/distributions?limit=1000`);
  const out = {};
  for (const d of results) {
    if (String(d.source || "").startsWith("The World Checklist of Vascular Plants")
      && String(d.locationId || "").startsWith("TDWG:")
      && d.establishmentMeans == null) {
      out[d.locationId.split(":")[1]] = d.locality ?? null;
    }
  }
  return out;
}

let total = 0;
for (const [genus, species] of Object.entries(GENERA)) {
  const agg = {};
  for (const s of species) Object.assign(agg, await nativeRegions(s));
  const rows = Object.entries(agg).map(([region_code, region_name]) => ({ genus, region_code, region_name }));
  if (rows.length) {
    const { error } = await sb.from("genus_native_region").upsert(rows, { onConflict: "genus,region_code" });
    if (error) { console.error(genus, error.message); continue; }
  }
  total += rows.length;
  console.log(`${genus}: ${rows.length} native regions`);
}
console.log(`\ndone — ${total} genus×region rows across ${Object.keys(GENERA).length} genera`);
