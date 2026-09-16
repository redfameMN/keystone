// Featured city hub: pinnacle_woodbury groups the Woodbury park accounts (its
// profile lists them and rolls up their posts). About the city, never as it —
// display name "Featured by Milkweed", no logo. Idempotent.
// Run: node scripts/seed-city.mjs
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CITY = { username: "pinnacle_woodbury", display: "Featured by Milkweed · City of Woodbury parks" };
const PARKS = ["pinnacle_ojibway", "pinnacle_carver_lake", "pinnacle_tamarack", "pinnacle_colby_lake"];

const email = `${CITY.username}@example.com`;
let uid;
const { data: created, error: cErr } = await sb.auth.admin.createUser({ email, email_confirm: true });
if (created?.user) uid = created.user.id;
else {
  if (cErr) console.warn("createUser:", cErr.message);
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  uid = list?.users?.find((u) => u.email === email)?.id;
}
if (!uid) { console.error("no auth user for city"); process.exit(1); }
await sb.from("profile").upsert({ id: uid, username: CITY.username, display_name: CITY.display, ecoregion_id: 8 });

const { data, error } = await sb.from("profile").update({ parent_id: uid }).in("username", PARKS).select("username");
if (error) { console.error(error.message); process.exit(1); }
console.log(`${CITY.username} ← ${data.map((p) => p.username).join(", ")}`);
