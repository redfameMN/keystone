// Seed clearly-labeled demo accounts with posts, exercising the REAL publish
// pipeline: photos uploaded to storage, posts inserted 'hidden', then scan-post
// screens each one (so this doubles as an end-to-end safety-pipeline test —
// the last account posts a non-garden photo that should be held for review).
//
// Photos come from Wikimedia Commons (free-licensed by policy); captions say so.
// Demo accounts use @example.com emails with no password, so nobody can log
// into them, and every username starts with demo_ (the app badges those).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Idempotent: skips an account
// that already has posts. Run: npm run seed:demo
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key);

const DEMO = [
  {
    username: "demo_prairie_pat", region: 9, project: "prairie", stage: "y3",
    plants: ["Solidago", "Symphyotrichum", "Schizachyrium"], garden: "Back forty strip", zone: "5a",
    caption: "Demo account. Third fall for this seeded strip — finally reads as prairie. (photo: Wikimedia Commons)",
    searches: ["tallgrass prairie wildflowers"],
  },
  {
    username: "demo_rain_rita", region: 8, project: "rain", stage: "planting",
    plants: ["Liatris", "Monarda"], garden: "Downspout basin", zone: "6b",
    caption: "Demo account. Basin dug, plugs in, held the whole storm. (photos: Wikimedia Commons)",
    searches: ["rain garden", "perennial flower bed", "garden mulch bed"], // 3 photos → tests the photo strip
  },
  {
    username: "demo_oak_owen", region: 8, project: "lawn", stage: "established",
    plants: ["Quercus", "Asclepias"], garden: "Front yard", zone: "5b",
    caption: "Demo account. The oak I planted as a whip, now shading the milkweed. (photo: Wikimedia Commons)",
    searches: ["oak tree lawn"],
  },
  {
    username: "demo_flagged_fred", region: 9, project: "boulevard", stage: "before",
    plants: ["Rudbeckia"], garden: null, zone: null,
    caption: "Demo account. Deliberately NOT a garden — this post should be held by the screener for the moderation queue.",
    searches: ["parking lot cars"], // should land in review, not the feed
  },
  {
    // Curated "pinnacle" account: Keystone's own voice showcasing Brad Lancaster's
    // public water-harvesting work in Tucson — ABOUT him, never AS him. Photos are
    // CC BY-SA 4.0 from Wikimedia Commons (attributed in the caption).
    username: "pinnacle_dryland", display: "Featured by Keystone",
    region: 10, project: "boulevard", stage: "established",
    plants: ["Helianthus", "Populus"], garden: "Dunbar/Spring streetscape", zone: "9b",
    caption: "Featured by Keystone. The granddaddy of this movement: Brad Lancaster's Tucson neighborhood routes street runoff through curb cuts into sunken basins — plant the basin, not the berm — turning desert streets into shaded food forests. Photos: Jengod et al., Wikimedia Commons, CC BY-SA 4.0.",
    files: [
      "File:Dunbar Spring traffic circle, Tucson, Arizona.jpg",
      "File:Bioswale and curb extension with cutouts (38067594726).jpg",
      "File:Bioswale Demonstration (14961556522).jpg",
    ],
  },
];

const pause = () => new Promise((r) => setTimeout(r, 1200)); // Commons rate limit

async function fetchInfo(params, attempt = 1) {
  await pause();
  try {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=1600&${params}`);
    const pages = Object.values((await r.json()).query?.pages ?? {});
    const info = pages[0]?.imageinfo?.[0];
    if (!info) return null;
    const img = await fetch(info.thumburl ?? info.url);
    if (!img.ok) return null;
    return new Uint8Array(await img.arrayBuffer());
  } catch (e) {
    if (attempt >= 3) { console.warn("commons fetch failed:", e.cause?.code ?? e.message); return null; }
    await new Promise((r) => setTimeout(r, 15000 * attempt)); // back off, Commons throttles
    return fetchInfo(params, attempt + 1);
  }
}

const commonsImage = (term) =>
  fetchInfo(`generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}&gsrnamespace=6&gsrlimit=1`);
const commonsFile = (title) => fetchInfo(`titles=${encodeURIComponent(title)}`);

for (const d of DEMO) {
  const email = `${d.username}@example.com`;
  let uid;
  const { data: created } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user) uid = created.user.id;
  else {
    const { data: list } = await sb.auth.admin.listUsers();
    uid = list?.users?.find((u) => u.email === email)?.id;
  }
  if (!uid) { console.error(d.username, "no auth user"); continue; }
  await sb.from("profile").upsert({ id: uid, username: d.username, display_name: d.display ?? "Demo account", ecoregion_id: d.region });

  const { count } = await sb.from("post").select("id", { count: "exact", head: true }).eq("author_id", uid);
  if (count > 0) { console.log(d.username, "already seeded, skipping"); continue; }

  let projectId = null;
  if (d.garden) {
    const { data: gp } = await sb.from("garden_project")
      .insert({ owner_id: uid, name: d.garden, project_type_id: d.project, zone: d.zone }).select("id").single();
    projectId = gp?.id ?? null;
  }

  const paths = [];
  const sources = d.files ? d.files.map((f) => [f, commonsFile]) : d.searches.map((s) => [s, commonsImage]);
  for (const [term, get] of sources) {
    const bytes = await get(term);
    if (!bytes) { console.warn(d.username, "no image for:", term); continue; }
    const path = `${uid}/${randomUUID()}.jpg`;
    const { error } = await sb.storage.from("photos").upload(path, bytes, { contentType: "image/jpeg" });
    if (error) { console.warn(d.username, "upload failed:", error.message); continue; }
    paths.push(path);
  }
  if (!paths.length) { console.error(d.username, "no photos uploaded, skipping post"); continue; }

  const { data: post, error: postErr } = await sb.from("post").insert({
    author_id: uid, project_id: projectId, project_type_id: d.project, stage_id: d.stage,
    caption: d.caption, ecoregion_id: d.region,
  }).select("id, status").single();
  if (postErr) { console.error(d.username, postErr.message); continue; }
  await sb.from("post_photo").insert(paths.map((p, i) => ({ post_id: post.id, storage_path: p, position: i })));
  await sb.from("post_plant").insert(d.plants.map((genus) => ({ post_id: post.id, genus })));

  const scan = await fetch(`${url}/functions/v1/scan-post`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: post.id }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log(d.username, `${paths.length} photo(s)`, "→ scan:", JSON.stringify(scan));
}
console.log("done");
