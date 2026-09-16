// Featured place hubs and their memberships — about each entity, never as it
// (display "Featured by Milkweed · …", no logos). Memberships are many-to-many:
// a park is in its city AND its watershed district, which don't share borders.
// Idempotent. Run: node scripts/seed-city.mjs
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const HUBS = [
  { username: "pinnacle_woodbury", display: "Featured by Milkweed · City of Woodbury parks",
    members: ["pinnacle_ojibway", "pinnacle_carver_lake", "pinnacle_tamarack", "pinnacle_colby_lake"] },
  // Watershed districts are NOT seeded here — they're derived from BWSR boundary data:
  // python scripts/resolve-watersheds.py <dir> && node scripts/seed-watersheds.mjs <dir>/watersheds.json
];

async function ensureUser(username) {
  const email = `${username}@example.com`;
  const { data: created } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user) return created.user.id;
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return list?.users?.find((u) => u.email === email)?.id ?? null;
}
const idOf = async (username) => (await sb.from("profile").select("id").eq("username", username).maybeSingle()).data?.id ?? null;

for (const hub of HUBS) {
  const uid = await ensureUser(hub.username);
  if (!uid) { console.error("no auth user:", hub.username); continue; }
  await sb.from("profile").upsert({ id: uid, username: hub.username, display_name: hub.display, ecoregion_id: 8, parent_id: null }, { onConflict: "id" });
  const rows = [];
  for (const m of hub.members) { const mid = await idOf(m); if (mid) rows.push({ place_id: uid, member_id: mid }); else console.warn("missing member:", m); }
  // Replace this hub's membership list wholesale so the config is the source of truth.
  await sb.from("place_member").delete().eq("place_id", uid);
  const { error } = await sb.from("place_member").insert(rows);
  if (error) console.error(hub.username, error.message);
  else console.log(`${hub.username} ⊃ ${hub.members.join(", ")}`);
}
// The old single-parent links are superseded by memberships.
await sb.from("profile").update({ parent_id: null }).not("parent_id", "is", null);
