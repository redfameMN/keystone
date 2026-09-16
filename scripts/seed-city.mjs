// Featured place hierarchy — governmental nesting, about each entity, never as it
// (display "Featured by Milkweed · …", no logos). A place's profile lists its
// child places and rolls up their posts two levels deep:
//   watershed district → city → parks
// Idempotent; existing park accounts only get their parent set. Run: node scripts/seed-city.mjs
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TREE = {
  username: "pinnacle_swwd", display: "Featured by Milkweed · South Washington Watershed District",
  children: [{
    username: "pinnacle_woodbury", display: "Featured by Milkweed · City of Woodbury parks",
    children: ["pinnacle_ojibway", "pinnacle_carver_lake", "pinnacle_tamarack", "pinnacle_colby_lake"].map((username) => ({ username })),
  }],
};

async function ensureUser(username) {
  const email = `${username}@example.com`;
  const { data: created } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user) return created.user.id;
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return list?.users?.find((u) => u.email === email)?.id ?? null;
}

async function seed(node, parentId = null, depth = 0) {
  const uid = await ensureUser(node.username);
  if (!uid) { console.error("no auth user:", node.username); return; }
  const row = { id: uid, username: node.username, parent_id: parentId };
  if (node.display) Object.assign(row, { display_name: node.display, ecoregion_id: 8 });
  const { error } = await sb.from("profile").upsert(row, { onConflict: "id" });
  if (error) { console.error(node.username, error.message); return; }
  console.log(`${"  ".repeat(depth)}${node.username}${parentId ? "" : " (root)"}`);
  for (const child of node.children ?? []) await seed(child, uid, depth + 1);
}
await seed(TREE);
