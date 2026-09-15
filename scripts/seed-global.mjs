// Seed clearly-labeled demo gardens OUTSIDE the US, to show the global native check
// and non-US locations. Each account gets a garden located by country (no US
// ecoregion/state), a project, and one post tagging species that are native there.
// Photos come from Wikimedia Commons (free-licensed). Idempotent: skips an account
// that already has posts. Run: node scripts/seed-global.mjs
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

// Genera these gardens tag; make sure each exists in plant_genus (post_plant FK).
const GENERA = [
  ["Quercus", "Oaks", "tree"], ["Acer", "Maples", "tree"], ["Betula", "Birches", "tree"],
  ["Hedera", "Ivies", "vine"], ["Eucalyptus", "Eucalypts", "tree"], ["Fagus", "Beeches", "tree"],
];

const DEMO = [
  {
    username: "demo_uk_cottage", country: "GB", project: "foundation", stage: "established",
    garden: "Cottage border", zone: null,
    plants: ["Quercus robur", "Hedera helix"], // both native to Great Britain
    caption: "Demo account · United Kingdom. Native oak and ivy along the old wall — ivy's a keystone for pollinators here, though it's invasive back in the US. (photo: Wikimedia Commons)",
    searches: ["english cottage garden oak"],
  },
  {
    username: "demo_jp_niwa", country: "JP", project: "shade", stage: "established",
    garden: "Tsuboniwa courtyard", zone: null,
    plants: ["Acer palmatum"], // Japanese maple, native to Japan
    caption: "Demo account · Japan. Momiji in the courtyard garden — Acer palmatum is native right here. (photo: Wikimedia Commons)",
    searches: ["japanese maple garden kyoto"],
  },
  {
    username: "demo_de_hof", country: "DE", project: "shade", stage: "y3",
    garden: "Innenhof", zone: null,
    plants: ["Betula pendula", "Fagus sylvatica"], // silver birch + European beech, native to Germany
    caption: "Demo account · Germany. Silver birch and beech settling into the courtyard, third year. (photo: Wikimedia Commons)",
    searches: ["silver birch garden germany"],
  },
  {
    username: "demo_au_verge", country: "AU", project: "slope", stage: "established",
    garden: "Verge garden", zone: null,
    plants: ["Eucalyptus marginata"], // jarrah, native to Western Australia
    caption: "Demo account · Australia. Jarrah and understorey on the verge — local natives, no reticulation since winter. (photo: Wikimedia Commons)",
    searches: ["australian native garden eucalyptus"],
  },
];

// Seed (or re-seed) one account by name: node scripts/seed-global.mjs demo_jp_niwa
const only = process.argv[2];
const targets = only ? DEMO.filter((d) => d.username === only) : DEMO;
if (only && !targets.length) { console.error(`no global demo named ${only}`); process.exit(1); }

// Ensure genera exist (native_us=false for the non-US ones is harmless; the region
// tiers are what the check reads).
await sb.from("plant_genus").upsert(
  GENERA.map(([genus, common_name, growth_form]) => ({ genus, common_name, growth_form, source: "reference" })),
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
    return img.ok ? new Uint8Array(await img.arrayBuffer()) : null;
  } catch (e) {
    if (attempt >= 3) { console.warn("commons fetch failed:", e.cause?.code ?? e.message); return null; }
    await new Promise((r) => setTimeout(r, 12000 * attempt));
    return commonsImage(term, attempt + 1);
  }
}

for (const d of targets) {
  const email = `${d.username}@example.com`;
  let uid;
  const { data: created } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user) uid = created.user.id;
  else { const { data: list } = await sb.auth.admin.listUsers(); uid = list?.users?.find((u) => u.email === email)?.id; }
  if (!uid) { console.error(d.username, "no auth user"); continue; }
  await sb.from("profile").upsert({ id: uid, username: d.username, display_name: "Demo account" });

  const { count } = await sb.from("post").select("id", { count: "exact", head: true }).eq("author_id", uid);
  if (count > 0) { console.log(d.username, "already seeded, skipping"); continue; }

  // Non-US garden: located by country, no ecoregion/state.
  const { data: g } = await sb.from("garden")
    .upsert({ owner_id: uid, name: d.garden, zone: d.zone, country: d.country }, { onConflict: "owner_id,name" })
    .select("id").single();
  const { data: gp } = await sb.from("garden_project")
    .insert({ owner_id: uid, garden_id: g?.id ?? null, project_type_id: d.project }).select("id").single();

  const bytes = await commonsImage(d.searches[0]);
  if (!bytes) { console.error(d.username, "no photo, skipping"); continue; }
  const path = `${uid}/${randomUUID()}.jpg`;
  const { error: upErr } = await sb.storage.from("photos").upload(path, bytes, { contentType: "image/jpeg" });
  if (upErr) { console.error(d.username, "upload:", upErr.message); continue; }

  const { data: post, error: postErr } = await sb.from("post").insert({
    author_id: uid, project_id: gp?.id ?? null, project_type_id: d.project, stage_id: d.stage,
    caption: d.caption, ecoregion_id: null, // non-US
  }).select("id").single();
  if (postErr) { console.error(d.username, postErr.message); continue; }
  await sb.from("post_photo").insert({ post_id: post.id, storage_path: path, position: 0 });
  await sb.from("post_plant").insert(d.plants.map((t) => ({ post_id: post.id, genus: t.split(" ")[0], species: t.includes(" ") ? t : "" })));

  const scan = await fetch(`${url}/functions/v1/scan-post`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: post.id }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log(`${d.username} [${d.country}] → scan:`, JSON.stringify(scan));
}
console.log("done");
