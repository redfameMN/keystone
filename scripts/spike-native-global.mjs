// SPIKE: populate genus_native_region (the global "is this native here?" tier)
// from Kew's World Checklist of Vascular Plants, accessed via the GBIF API.
//
// How native is encoded in WCVP-via-GBIF: a species' distribution rows sourced
// from "The World Checklist of Vascular Plants (WCVP)" and keyed to a TDWG level-3
// region are NATIVE when establishmentMeans is absent, INTRODUCED when it says so,
// and cultivated when "MANAGED". We aggregate to genus level: a genus is native in
// a region if any of its sampled species is native there.
//
// This samples a few representative species per genus (bounded API calls for a
// spike); production would enumerate all accepted species per genus — and ideally
// tag at species level, since a genus can be native via one species and invasive
// via another (Wisteria: native W. frutescens in the US vs. invasive W. sinensis).
//
// Run: node scripts/spike-native-global.mjs
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// genus -> representative species to sample.
const GENERA = {
  Quercus: ["Quercus robur", "Quercus alba", "Quercus agrifolia"],
  Acer: ["Acer palmatum", "Acer saccharum", "Acer rubrum"],
  Asclepias: ["Asclepias syriaca", "Asclepias tuberosa"],
  Ceanothus: ["Ceanothus americanus", "Ceanothus thyrsiflorus"],
  Lupinus: ["Lupinus polyphyllus", "Lupinus perennis"],
  Nandina: ["Nandina domestica"],
  Wisteria: ["Wisteria sinensis", "Wisteria frutescens"],
  Ailanthus: ["Ailanthus altissima"],
  Pyrus: ["Pyrus calleryana"],
  Hedera: ["Hedera helix"],
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
  console.log(`${genus}: ${rows.length} native regions (${species.length} species sampled)`);
}
console.log(`\ndone — ${total} genus×region rows`);
