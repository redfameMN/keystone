// Featured showcase: the City of Woodbury (MN) parks — one curated account per
// park, badged "★ featured" (pinnacle_ prefix) with display name "Featured by
// Milkweed". This is ABOUT the parks, never AS the city: no city logo, no official
// label, free-licensed Commons photos. Gardens are Minnesota / Eastern Temperate
// Forests so keystone (★) and native checks apply. Idempotent; optional single
// account arg. Run: node scripts/seed-woodbury.mjs [pinnacle_ojibway]
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

const GENERA = [["Andropogon", "Bluestems", "grass"], ["Larix", "Tamaracks", "tree"]]; // not in the base vocab
const SERIES = "Featured by Milkweed · City of Woodbury parks.";

const PARKS = [
  { username: "pinnacle_ojibway", garden: "Ojibway Park", project: "prairie", stage: "established",
    plants: ["Quercus macrocarpa", "Andropogon gerardii", "Solidago rigida"],
    blurb: "Woodbury's flagship park — restored prairie and oak woodland threaded with trails.",
    searches: ["Ojibway Park Woodbury Minnesota", "Minnesota oak savanna prairie park"] },
  { username: "pinnacle_carver_lake", garden: "Carver Lake Park", project: "slope", stage: "established",
    plants: ["Asclepias incarnata", "Salix nigra", "Schizachyrium scoparium"],
    blurb: "Lakeshore buffers and native grasses along Carver Lake's trails.",
    searches: ["Carver Lake Park Woodbury", "swamp milkweed lakeshore Minnesota", "Minnesota lake shoreline native plants"] },
  { username: "pinnacle_tamarack", garden: "Tamarack Nature Preserve", project: "shade", stage: "established",
    plants: ["Larix laricina", "Betula papyrifera", "Vaccinium angustifolium"],
    blurb: "A rare tamarack bog and boardwalk in the middle of the suburbs.",
    searches: ["Tamarack Nature Preserve Woodbury Minnesota", "Larix laricina bog", "tamarack swamp boardwalk"] },
  { username: "pinnacle_colby_lake", garden: "Colby Lake Park", project: "prairie", stage: "y3",
    plants: ["Monarda fistulosa", "Liatris pycnostachya", "Rudbeckia hirta"],
    blurb: "Prairie plantings filling in around the lake loop.",
    searches: ["Monarda fistulosa prairie", "Minnesota prairie wildflowers park"] },
];

const only = process.argv[2];
const targets = only ? PARKS.filter((d) => d.username === only) : PARKS;
if (only && !targets.length) { console.error(`no park account named ${only}`); process.exit(1); }

await sb.from("plant_genus").upsert(
  GENERA.map(([genus, common_name, growth_form]) => ({ genus, common_name, growth_form, source: "reference", native_us: true })),
  { onConflict: "genus", ignoreDuplicates: true },
);

const pause = () => new Promise((r) => setTimeout(r, 1200));
async function commonsImage(term, attempt = 1) {
  await pause();
  try {
    const params = `generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}&gsrnamespace=6&gsrlimit=1`;
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=1600&${params}`);
    const info = Object.values((await r.json()).query?.pages ?? {})[0]?.imageinfo?.[0];
    if (!info) return null;
    const img = await fetch(info.thumburl ?? info.url);
    if (!img.ok) return null;
    const b = new Uint8Array(await img.arrayBuffer());
    // Only JPEG/PNG — anything else comes back "unscannable" from the screener.
    const jpeg = b[0] === 0xff && b[1] === 0xd8, png = b[0] === 0x89 && b[1] === 0x50;
    return jpeg || png ? b : null;
  } catch (e) {
    if (attempt >= 3) { console.warn("commons fetch failed:", e.cause?.code ?? e.message); return null; }
    await new Promise((r) => setTimeout(r, 12000 * attempt));
    return commonsImage(term, attempt + 1);
  }
}

let ok = 0;
for (const d of targets) {
  const email = `${d.username}@example.com`;
  let uid;
  const { data: created } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user) uid = created.user.id;
  else { const { data: list } = await sb.auth.admin.listUsers(); uid = list?.users?.find((u) => u.email === email)?.id; }
  if (!uid) { console.error(d.username, "no auth user"); continue; }
  await sb.from("profile").upsert({ id: uid, username: d.username, display_name: "Featured by Milkweed", ecoregion_id: 8 });

  const { count } = await sb.from("post").select("id", { count: "exact", head: true }).eq("author_id", uid);
  if (count > 0) { console.log(d.username, "already seeded, skipping"); continue; }

  const { data: g } = await sb.from("garden")
    .upsert({ owner_id: uid, name: d.garden, zone: "5a", ecoregion_id: 8, country: "US", state: "MN" }, { onConflict: "owner_id,name" })
    .select("id").single();
  const { data: gp } = await sb.from("garden_project")
    .insert({ owner_id: uid, garden_id: g?.id ?? null, project_type_id: d.project }).select("id").single();

  // A photo is "representative" (and the caption says so) unless its search term named the park.
  let bytes = null, representative = false;
  for (const term of d.searches) { bytes = await commonsImage(term); if (bytes) { representative = !term.includes(d.garden.split(" ")[0]); break; } }
  if (!bytes) { console.error(d.username, "no photo, skipping"); continue; }
  const path = `${uid}/${randomUUID()}.jpg`;
  const { error: upErr } = await sb.storage.from("photos").upload(path, bytes, { contentType: "image/jpeg" });
  if (upErr) { console.error(d.username, "upload:", upErr.message); continue; }

  const caption = `${SERIES} ${d.garden} — ${d.blurb} (${representative ? "representative photo" : "photo"}: Wikimedia Commons)`;
  const { data: post, error: postErr } = await sb.from("post").insert({
    author_id: uid, project_id: gp?.id ?? null, project_type_id: d.project, stage_id: d.stage, caption, ecoregion_id: 8,
  }).select("id").single();
  if (postErr) { console.error(d.username, postErr.message); continue; }
  await sb.from("post_photo").insert({ post_id: post.id, storage_path: path, position: 0 });
  await sb.from("post_plant").insert(d.plants.map((t) => ({ post_id: post.id, genus: t.split(" ")[0], species: t.includes(" ") ? t : "" })));

  const scan = await fetch(`${url}/functions/v1/scan-post`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: post.id }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log(`${d.username} (${d.garden}) → ${scan.status ?? JSON.stringify(scan)}${representative ? " · representative photo" : ""}`);
  if (scan.status === "live") ok++;
}
console.log(`done — ${ok}/${targets.length} live`);
