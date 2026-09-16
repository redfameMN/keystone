// Openly-licensed photos for the Woodbury park showcase, from iNaturalist.
// Only CC0 / CC-BY photos (never NC/ND), research-grade, native plants; each post
// stores credit + license + source link on the photo and shows them. Posts go on
// the park's featured account. Idempotent (keyed by observation URL). Legal basis:
// the photographer chose an open license; we attribute exactly as iNat states.
// Run: node scripts/ingest-inat-parks.mjs [pinnacle_ojibway]
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);
const PER_PARK = 4;

const PARKS = [
  { username: "pinnacle_ojibway",     garden: "Ojibway Park",            bbox: [44.9064, -92.9587, 44.9165, -92.9416] },
  { username: "pinnacle_carver_lake", garden: "Carver Lake Park",        bbox: [44.8927, -92.9844, 44.9125, -92.9634] },
  { username: "pinnacle_tamarack",    garden: "Tamarack Nature Preserve", place_id: 121172 },
  { username: "pinnacle_colby_lake",  garden: "Colby Lake Park",         bbox: [44.9016, -92.9154, 44.9197, -92.9035] },
];
const LICENSE = { cc0: "CC0", "cc-by": "CC BY" };

const only = process.argv[2];
const targets = only ? PARKS.filter((p) => p.username === only) : PARKS;

const inat = (params) => fetch(`https://api.inaturalist.org/v1/observations?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(30000) })
  .then((r) => r.json()).catch((e) => { console.warn("inat query failed:", e.cause?.code ?? e.message); return { results: [] }; });
// Flaky S3 connects happen; time out and retry rather than crash the run.
async function getBytes(u, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return new Uint8Array(await r.arrayBuffer()); }
    catch { await new Promise((res) => setTimeout(res, 3000 * (i + 1))); }
  }
  return null;
}
// Native in Minnesota per our WCVP tables. A species WCVP knows is judged at species
// level (no MIN row = not native, e.g. common buckthorn); only an unknown species
// falls back to its genus.
async function nativeMN(species, genus) {
  const { data: rows } = await sb.from("species_native_region").select("region_code").eq("species", species);
  if (rows?.length) return rows.some((r) => r.region_code === "MIN");
  const g = await sb.from("genus_native_region").select("genus").eq("genus", genus).eq("region_code", "MIN").maybeSingle();
  return !!g.data;
}

let made = 0;
for (const park of targets) {
  const { data: prof } = await sb.from("profile").select("id").eq("username", park.username).maybeSingle();
  if (!prof) { console.error(park.username, "missing — run seed-woodbury first"); continue; }
  const { data: gp } = await sb.from("garden_project").select("id, project_type_id").eq("owner_id", prof.id).limit(1).maybeSingle();

  const base = { iconic_taxa: "Plantae", photo_license: "cc0,cc-by", quality_grade: "research", per_page: 40, order_by: "votes" };
  const q = park.place_id ? { ...base, place_id: park.place_id }
    : { ...base, swlat: park.bbox[0], swlng: park.bbox[1], nelat: park.bbox[2], nelng: park.bbox[3] };
  const { results = [] } = await inat(q);

  let n = 0;
  for (const o of results) {
    if (n >= PER_PARK) break;
    const ph = o.photos?.[0]; const t = o.taxon;
    if (!ph || !LICENSE[ph.license_code] || !t?.name || t.rank !== "species") continue;
    const species = t.name, genus = species.split(" ")[0];
    if (!(await nativeMN(species, genus))) continue;
    const { data: dup } = await sb.from("post_photo").select("id").eq("source_url", o.uri).limit(1);
    if (dup?.length) continue;

    const bytes = await getBytes(ph.url.replace("square", "large"));
    if (!bytes || !(bytes[0] === 0xff && bytes[1] === 0xd8)) continue; // JPEG only
    const path = `${prof.id}/${randomUUID()}.jpg`;
    if ((await sb.storage.from("photos").upload(path, bytes, { contentType: "image/jpeg" })).error) continue;

    await sb.from("plant_genus").upsert({ genus, source: "inaturalist" }, { onConflict: "genus", ignoreDuplicates: true });
    if (t.preferred_common_name) await sb.from("species_name").upsert({ species, common: t.preferred_common_name }, { onConflict: "species", ignoreDuplicates: true });

    const who = o.user?.name || o.user?.login || "an iNaturalist member";
    const caption = `Featured by Milkweed · City of Woodbury parks. ${t.preferred_common_name ? `${t.preferred_common_name} (${species})` : species} at ${park.garden}, observed by ${who} on iNaturalist.`;
    const { data: post, error } = await sb.from("post").insert({
      author_id: prof.id, project_id: gp?.id ?? null, project_type_id: gp?.project_type_id ?? "prairie",
      stage_id: "established", caption, ecoregion_id: 8,
    }).select("id").single();
    if (error) { console.error(park.username, error.message); continue; }
    await sb.from("post_photo").insert({ post_id: post.id, storage_path: path, position: 0,
      credit: ph.attribution || who, license: LICENSE[ph.license_code], source_url: o.uri });
    await sb.from("post_plant").insert({ post_id: post.id, genus, species });
    const scan = await fetch(`${url}/functions/v1/scan-post`, { method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ post_id: post.id }) })
      .then((r) => r.json()).catch(() => ({}));
    n++; if (scan.status === "live") made++;
    console.log(`  ${park.garden}: ${species} by ${who} [${LICENSE[ph.license_code]}] → ${scan.status ?? "?"}`);
  }
  console.log(`${park.username}: ${n} added from ${results.length} candidates`);
}
console.log(`done — ${made} live`);
