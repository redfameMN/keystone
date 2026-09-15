// Give demo_oak_owen's "Front yard" a multi-stage journey so the profile timeline
// has something to show. Reuses an existing photo; each post runs through scan-post.
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, service);

const { data: prof } = await sb.from("profile").select("id").eq("username", "demo_oak_owen").maybeSingle();
if (!prof) { console.error("no demo_oak_owen — run `node scripts/seed-demo.mjs` first"); process.exit(1); }
const uid = prof.id;
// Find the "Front yard" garden, then a project inside it (seed-demo makes one).
const { data: garden } = await sb.from("garden").select("id").eq("owner_id", uid).eq("name", "Front yard").maybeSingle();
if (!garden) { console.error("no 'Front yard' garden — run `node scripts/seed-demo.mjs` first"); process.exit(1); }
const { data: projs } = await sb.from("garden_project").select("id").eq("garden_id", garden.id).order("created_at").limit(1);
const proj = projs?.[0];
if (!proj) { console.error("'Front yard' has no project"); process.exit(1); }

// reuse an existing photo's bytes
const { data: objs } = await sb.storage.from("photos").list(uid, { limit: 1 });
const { data: blob } = await sb.storage.from("photos").download(`${uid}/${objs[0].name}`);
const bytes = new Uint8Array(await blob.arrayBuffer());

// A full before → established arc — the hero format on r/NativePlantGardening and
// r/NoLawns. Beats mirror what those communities actually post: sheet-mulch prep,
// the "cues to care" edging, the year-one "looks like dirt" sleep stage nobody
// shares, sleep→creep→leap, and the first-visitor payoff. Plant tags are real
// keystones for this ecoregion (Eastern Temperate Forests); milkweed appears at
// "first visitor" as the monarch host. before/prep carry no tags — nothing's
// planted yet. (All stages reuse one photo; swap in real before/after shots when
// there are distinct images to upload.)
const STEPS = [
  { stage: "before", plants: [], caption: "Demo account. The lawn as it was — thirsty fescue, zero bugs." },
  { stage: "prep", plants: [], caption: "Demo account. Sheet-mulched the whole front strip last fall: cardboard, 4\" of wood chips, no digging." },
  { stage: "planting", plants: ["Quercus", "Solidago", "Symphyotrichum"], caption: "Demo account. Planting day. Bur oak whip, goldenrod and aster plugs in; steel edging so it reads as intentional." },
  { stage: "y1", plants: ["Solidago", "Symphyotrichum"], caption: "Demo account. Year one — sleep. Looks like dirt with sticks. This is the stage nobody posts; it's normal." },
  { stage: "y2", plants: ["Solidago", "Symphyotrichum", "Helianthus"], caption: "Demo account. Year two — creep. Goldenrod and asters knitting together, first real blooms." },
  { stage: "y3", plants: ["Quercus", "Solidago", "Symphyotrichum", "Helianthus"], caption: "Demo account. Year three — leap. Finally reads as a garden and not a weed patch." },
  { stage: "visitor", plants: ["Asclepias"], caption: "Demo account. First monarch caterpillar on the milkweed. This is why we do it." },
  { stage: "established", plants: ["Quercus", "Solidago", "Asclepias"], caption: "Demo account. Four seasons in — self-sowing, full of bees, the oak finally shading the bed." },
];
for (const s of STEPS) {
  // skip if a post already exists at this stage for this garden
  const { count } = await sb.from("post").select("id", { count: "exact", head: true }).eq("project_id", proj.id).eq("stage_id", s.stage);
  if (count > 0) { console.log(s.stage, "exists, skip"); continue; }
  const path = `${uid}/${randomUUID()}.jpg`;
  await sb.storage.from("photos").upload(path, bytes, { contentType: "image/jpeg" });
  const { data: post } = await sb.from("post").insert({
    author_id: uid, project_id: proj.id, project_type_id: "lawn", stage_id: s.stage, caption: s.caption, ecoregion_id: 8,
  }).select("id").single();
  await sb.from("post_photo").insert({ post_id: post.id, storage_path: path, position: 0 });
  if (s.plants.length) await sb.from("post_plant").insert(s.plants.map((genus) => ({ post_id: post.id, genus })));
  const scan = await fetch(`${url}/functions/v1/scan-post`, {
    method: "POST", headers: { Authorization: `Bearer ${service}`, apikey: service, "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: post.id }),
  }).then((r) => r.json());
  console.log(s.stage, "→", JSON.stringify(scan));
}
console.log("journey seeded");
