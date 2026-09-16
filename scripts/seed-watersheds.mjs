// Turn resolve-watersheds.py's output into featured watershed hubs + memberships.
// Data-driven: one hub per district/WMO the parks actually fall in; each hub's
// membership list is replaced wholesale. About each entity, never as it.
// Run: node scripts/seed-watersheds.mjs <path/to/watersheds.json>
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const map = JSON.parse(readFileSync(process.argv[2] || "watersheds.json", "utf8"));
const ALIASES = { "South Washington WD": "pinnacle_swwd" };   // keep the account we already made
const LONG = { WD: "Watershed District", WMO: "Watershed Management Organization" };
// Usernames are capped at 24 chars, so use an acronym: "Ramsey-Washington Metro WD" -> pinnacle_rwmwd.
const slug = (s) => "pinnacle_" + s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w, i, a) => (i === a.length - 1 ? w : w[0])).join("").slice(0, 15);

async function ensureUser(username) {
  const email = `${username}@example.com`;
  const { data: created } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user) return created.user.id;
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return list?.users?.find((u) => u.email === email)?.id ?? null;
}
const idOf = async (u) => (await sb.from("profile").select("id").eq("username", u).maybeSingle()).data?.id ?? null;

// group parks by district
const byDistrict = {};
for (const [park, d] of Object.entries(map)) if (d) (byDistrict[d.name_type] ??= { ...d, parks: [] }).parks.push(park);

for (const [nameType, d] of Object.entries(byDistrict)) {
  const username = ALIASES[nameType] ?? slug(nameType);
  const pretty = d.name.replace(/[A-Za-z]+/g, (w) => w[0] + w.slice(1).toLowerCase()); // "RAMSEY-WASHINGTON" -> "Ramsey-Washington"
  const uid = await ensureUser(username);
  if (!uid) { console.error("no auth user:", username); continue; }
  const { error: pErr } = await sb.from("profile").upsert({ id: uid, username, display_name: `Featured by Milkweed · ${pretty} ${LONG[d.type] ?? d.type}`, ecoregion_id: 8 }, { onConflict: "id" });
  if (pErr) { console.error(`${username}: profile ${pErr.message}`); continue; }
  const rows = [];
  for (const p of d.parks) { const mid = await idOf(p); if (mid) rows.push({ place_id: uid, member_id: mid }); }
  await sb.from("place_member").delete().eq("place_id", uid);
  const { error } = await sb.from("place_member").insert(rows);
  console.log(error ? `${username}: ${error.message}` : `${username} (${nameType}) ⊃ ${d.parks.join(", ")}`);
}
