// Each park's FIRST card: a pinned "Trail map & hours" post — our OSM-rendered map
// (from park-map.py), the park's hours, and a link to the city's official trail
// map. Inserted live directly (our own generated image; nothing to screen).
// Idempotent per park. Run: node scripts/seed-park-info.mjs <workdir>/park-maps.json
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const maps = JSON.parse(readFileSync(process.argv[2] || "park-maps.json", "utf8"));
const MARK = "Trail map & hours";
// Woodbury: "All park sites are closed from 10 pm to 6 am" (city Parks & Trails Regulations).
const HOURS = "Open 6 am – 10 pm daily (all Woodbury park sites close 10 pm – 6 am).";
const OFFICIAL = "https://www.woodburymn.gov/DocumentCenter/View/4374/Parks-and-Trails-Map-PDF";
const EXTRA = { pinnacle_tamarack: " Friends group: tamaracknaturepreserve.org." };

for (const [username, m] of Object.entries(maps)) {
  const { data: prof } = await sb.from("profile").select("id").eq("username", username).maybeSingle();
  if (!prof) { console.warn(username, "missing — seed the park first"); continue; }
  const { data: existing } = await sb.from("post").select("id").eq("author_id", prof.id).ilike("caption", `${MARK}%`).limit(1);
  if (existing?.length) { console.log(username, "already has its info card"); continue; }

  const path = `${prof.id}/${randomUUID()}.jpg`;
  const bytes = readFileSync(m.file);
  const { error: upErr } = await sb.storage.from("photos").upload(path, bytes, { contentType: "image/jpeg" });
  if (upErr) { console.error(username, "upload:", upErr.message); continue; }

  const caption = `${MARK} · ${m.name}. ${HOURS} Official trail map & park info: woodburymn.gov (link below).${EXTRA[username] ?? ""}`;
  const { data: post, error } = await sb.from("post").insert({
    author_id: prof.id, caption, ecoregion_id: 8, status: "live", pinned: true,
  }).select("id").single();
  if (error) { console.error(username, error.message); continue; }
  await sb.from("post_photo").insert({ post_id: post.id, storage_path: path, position: 0,
    credit: "Map data © OpenStreetMap contributors", license: "ODbL", source_url: OFFICIAL });
  console.log(`${username}: info card live + pinned`);
}
