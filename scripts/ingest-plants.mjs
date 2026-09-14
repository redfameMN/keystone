// Populate plant_genus / keystone_genus / plant_species from existing online lists.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Idempotent (upserts).
//
// Sources:
//   1. NWF keystone plant guides → data/nwf-keystone.json (extracted from the per-ecoregion PDFs).
//   2. iNaturalist taxa API → genus family/common name, species under each genus (North America).
//   3. USDA PLANTS / BONAP state distribution → species_native_state. Bulk download; see docs/data-sources.md.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const keystone = JSON.parse(await readFile(new URL("../data/nwf-keystone.json", import.meta.url)));
const genera = [...new Set(keystone.map((k) => k.genus))];

for (const genus of genera) {
  const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${genus}&rank=genus&per_page=1`);
  const t = (await r.json()).results?.[0];
  await sb.from("plant_genus").upsert({
    genus, family: t?.ancestors?.find((a) => a.rank === "family")?.name ?? null,
    common_name: t?.preferred_common_name ?? null, source: "inaturalist",
  });
  const sp = await fetch(`https://api.inaturalist.org/v1/taxa?taxon_id=${t?.id}&rank=species&place_id=97394&per_page=200`);
  const rows = ((await sp.json()).results ?? []).map((x) => ({ id: x.id, genus, scientific: x.name, common_name: x.preferred_common_name ?? null }));
  if (rows.length) await sb.from("plant_species").upsert(rows);
  await new Promise((r) => setTimeout(r, 1100)); // iNat asks for ≤1 req/s
  console.log(genus, rows.length, "species");
}

await sb.from("keystone_genus").upsert(keystone);
console.log("keystone rows:", keystone.length);
