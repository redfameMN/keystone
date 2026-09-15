// Delete a demo account's posts and storage objects so seed-demo.mjs can re-seed it.
// Usage: node scripts/reset-demo.mjs <username>   (secrets from .env.scripts)
import "./_env.mjs";
import { createClient } from "@supabase/supabase-js";

const username = process.argv[2];
if (!username?.match(/^(demo_|pinnacle_)/)) { console.error("usage: reset-demo.mjs <demo_*|pinnacle_* username>"); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prof } = await sb.from("profile").select("id").eq("username", username).single();
if (!prof) { console.error("no such profile"); process.exit(1); }
const { data: objs } = await sb.storage.from("photos").list(prof.id, { limit: 100 });
if (objs?.length) await sb.storage.from("photos").remove(objs.map((o) => `${prof.id}/${o.name}`));
const { error } = await sb.from("post").delete().eq("author_id", prof.id);
console.log(username, "cleaned:", objs?.length ?? 0, "storage objects", error?.message ?? "");
