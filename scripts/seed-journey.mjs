// Give demo_oak_owen's "Front yard" a multi-stage journey so the profile timeline
// has something to show. Reuses an existing photo; each post runs through scan-post.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, service);

const { data: prof } = await sb.from("profile").select("id").eq("username", "demo_oak_owen").single();
const uid = prof.id;
const { data: proj } = await sb.from("garden_project").select("id, name").eq("owner_id", uid).eq("name", "Front yard").maybeSingle();
if (!proj) { console.error("no Front yard project"); process.exit(1); }

// reuse an existing photo's bytes
const { data: objs } = await sb.storage.from("photos").list(uid, { limit: 1 });
const { data: blob } = await sb.storage.from("photos").download(`${uid}/${objs[0].name}`);
const bytes = new Uint8Array(await blob.arrayBuffer());

const STEPS = [
  { stage: "before", caption: "Demo account. The lawn as it was — thirsty fescue, zero bugs." },
  { stage: "prep", caption: "Demo account. Sheet-mulched the whole front strip last fall." },
  { stage: "y1", caption: "Demo account. Year one — plugs in, looks like dirt. Sleeping." },
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
  await sb.from("post_plant").insert({ post_id: post.id, genus: "Quercus" });
  const scan = await fetch(`${url}/functions/v1/scan-post`, {
    method: "POST", headers: { Authorization: `Bearer ${service}`, apikey: service, "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: post.id }),
  }).then((r) => r.json());
  console.log(s.stage, "→", JSON.stringify(scan));
}
console.log("journey seeded");
