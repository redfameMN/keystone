// Data layer over Supabase. Every function here assumes the client exists;
// App.jsx only calls in when hasSupabase, and runs on seed data otherwise.
import { supabase } from "./supabase.js";

// EPA Level I codes; must match supabase/migrations/0002_seed_storage.sql.
export const ECOREGION_IDS = {
  "Northwestern Forested Mountains": 6,
  "Marine West Coast Forest": 7,
  "Eastern Temperate Forests": 8,
  "Great Plains": 9,
  "North American Deserts": 10,
  "Mediterranean California": 11,
};

const ago = (ts) => {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const photoUrl = (path) => supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;

// post_card row -> the post shape App.jsx renders.
const toUiPost = (row) => ({
  id: row.id,
  authorId: row.author_id,
  user: row.username,
  region: row.ecoregion ?? "",
  project: row.project_type_id,
  stage: row.stage_id,
  plants: (row.plants ?? []).map((p) => p.genus),
  caption: row.caption ?? "",
  likes: row.like_count,
  ago: ago(row.created_at),
  srcs: (row.photos ?? []).map(photoUrl),
  garden: row.garden_name,
  zone: row.zone,
  projectId: row.project_id,
  projectName: row.project_name,
  pinned: row.pinned ?? false,
});

export async function fetchPosts() {
  const { data, error } = await supabase.from("post_card").select().order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data.map(toUiPost);
}

export async function sendMagicLink(email, username) {
  localStorage.setItem("keystone_username", username); // picked up by ensureProfile after the redirect
  // Origin alone is wrong when the app is served from a subpath (GitHub Pages /keystone/).
  const redirect = new URL(import.meta.env.BASE_URL || "/", window.location.origin).href;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// First sign-in creates the profile row; later ones just read it.
export async function ensureProfile(session) {
  const uid = session.user.id;
  const { data: existing } = await supabase.from("profile").select("id, username, is_admin").eq("id", uid).maybeSingle();
  if (existing) return { id: existing.id, name: existing.username, isAdmin: existing.is_admin };
  const stashed = (localStorage.getItem("keystone_username") || session.user.email?.split("@")[0] || "")
    .toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  const username = stashed.length >= 3 ? stashed : `gardener_${uid.slice(0, 6)}`;
  const { data, error } = await supabase.from("profile").insert({ id: uid, username }).select("id, username, is_admin").single();
  if (error) throw error;
  return { id: data.id, name: data.username, isAdmin: data.is_admin };
}

// My likes (post ids) and follows (usernames) so the UI can show state.
export async function fetchMyActivity(uid) {
  const [likes, follows] = await Promise.all([
    supabase.from("post_like").select("post_id").eq("user_id", uid),
    supabase.from("follow").select("followed:profile!follow_followed_id_fkey(username)").eq("follower_id", uid),
  ]);
  return {
    liked: Object.fromEntries((likes.data ?? []).map((l) => [l.post_id, true])),
    following: Object.fromEntries((follows.data ?? []).map((f) => [f.followed.username, true])),
  };
}

export async function fetchProfile(username) {
  const [{ data: prof }, postsRes] = await Promise.all([
    supabase.from("profile").select("id, username, display_name, created_at").eq("username", username).maybeSingle(),
    supabase.from("post_card").select().eq("username", username)
      .order("pinned", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (!prof) throw new Error("profile not found");
  const { count } = await supabase.from("follow").select("follower_id", { count: "exact", head: true }).eq("followed_id", prof.id);
  return { ...prof, followers: count ?? 0, posts: (postsRes.data ?? []).map(toUiPost) };
}

export async function setLike(postId, uid, on) {
  const { error } = on
    ? await supabase.from("post_like").insert({ post_id: postId, user_id: uid })
    : await supabase.from("post_like").delete().match({ post_id: postId, user_id: uid });
  if (error) throw error;
}

export async function setFollow(followedId, uid, on) {
  const { error } = on
    ? await supabase.from("follow").insert({ follower_id: uid, followed_id: followedId })
    : await supabase.from("follow").delete().match({ follower_id: uid, followed_id: followedId });
  if (error) throw error;
}

// --- Gardens & projects (a garden holds one or more projects) ---

export async function fetchMyGardens(uid) {
  const [gRes, pRes] = await Promise.all([
    supabase.from("garden").select("id, name, zone, ecoregion_id, state, country").eq("owner_id", uid).order("created_at"),
    supabase.from("garden_project").select("id, garden_id, name, project_type_id").eq("owner_id", uid).order("created_at"),
  ]);
  if (gRes.error) throw gRes.error;
  const projByGarden = {};
  for (const p of pRes.data ?? []) (projByGarden[p.garden_id] ??= []).push(p);
  return (gRes.data ?? []).map((g) => ({ ...g, projects: projByGarden[g.id] ?? [] }));
}

export async function createGarden(uid, name, zone, ecoregionId, state, country) {
  const { data, error } = await supabase.from("garden")
    .insert({ owner_id: uid, name: name.trim().slice(0, 80), zone: zone || null, ecoregion_id: ecoregionId ?? null, state: state || null, country: country || null })
    .select("id, name, zone, ecoregion_id, state, country").single();
  if (error) throw error;
  return { ...data, projects: [] };
}

// States we have genus-level native-range coverage for (matches the seed in
// migration 0017: contiguous US + DC). Outside these — AK, HI, territories — the
// state tier stays "unknown" instead of guessing, so we never warn that a plant
// native there (e.g. willow/birch in Alaska) isn't. Grow this as data is added.
const COVERED_STATES = new Set(["AL","AZ","AR","CA","CO","CT","DE","DC","FL","GA","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"]);

// Advisory native status for a set of genera at a location. Returns
// { [genus]: { nativeUs, inState } }: nativeUs is true/false/null (null=unknown);
// inState is true/false/null (null = no confident data → stay silent, never warn).
// Two tiers, same trust rule (only warn when confident):
//   - regionCodes (TDWG): the global tier (genus_native_region, Kew WCVP) — used
//     for non-US gardens (and any garden resolved to TDWG codes).
//   - state (US 2-letter): the US tier (genus_native_state), scoped to covered
//     states so a plant native in an uncovered state is never wrongly flagged.
export async function fetchNativeStatus(genera, { state = "", regionCodes = [] } = {}) {
  const list = [...new Set((genera ?? []).filter(Boolean))];
  if (!list.length) return {};

  if (regionCodes.length) {
    const [gRes, rRes] = await Promise.all([
      supabase.from("plant_genus").select("genus, native_us").in("genus", list),
      supabase.from("genus_native_region").select("genus, region_code").in("genus", list),
    ]);
    if (gRes.error) throw gRes.error;
    const regionsByGenus = {};
    for (const r of rRes.data ?? []) (regionsByGenus[r.genus] ??= new Set()).add(r.region_code);
    const want = regionCodes;
    const out = {};
    for (const g of list) {
      const set = regionsByGenus[g];
      const nativeUs = (gRes.data ?? []).find((x) => x.genus === g)?.native_us ?? null;
      out[g] = { nativeUs, inState: !set ? null : want.some((c) => set.has(c)) };
    }
    return out;
  }

  const covered = !!state && COVERED_STATES.has(state);
  const [gRes, nRes] = await Promise.all([
    supabase.from("plant_genus").select("genus, native_us").in("genus", list),
    covered ? supabase.from("genus_native_state").select("genus, state").in("genus", list)
            : Promise.resolve({ data: [] }),
  ]);
  if (gRes.error) throw gRes.error;
  const tracked = {}, here = {};
  for (const r of nRes.data ?? []) { tracked[r.genus] = true; if (r.state === state) here[r.genus] = true; }
  const out = {};
  for (const g of list) {
    const nativeUs = (gRes.data ?? []).find((x) => x.genus === g)?.native_us ?? null;
    out[g] = { nativeUs, inState: !covered ? null : tracked[g] ? !!here[g] : null };
  }
  return out;
}

export async function addProject(uid, gardenId, projectTypeId, name) {
  const { data, error } = await supabase.from("garden_project")
    .insert({ owner_id: uid, garden_id: gardenId, project_type_id: projectTypeId, name: name?.trim().slice(0, 80) || null })
    .select("id, garden_id, name, project_type_id").single();
  if (error) throw error;
  return data;
}

export async function publishPost({ user, files, ecoregionId, projectId, projectTypeId, stage, plants, caption }) {
  // Milkweed is a photo feed — a post with no photo is not allowed.
  if (!files?.length) throw new Error("Add at least one photo of your garden.");
  const paths = [];
  for (const file of files ?? []) {
    const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("photos").upload(path, file, { contentType: file.type });
    if (error) throw error;
    paths.push(path);
  }
  const { data: post, error } = await supabase.from("post").insert({
    author_id: user.id,
    project_id: projectId ?? null,
    project_type_id: projectTypeId ?? null,
    stage_id: stage,
    caption: caption || null,
    ecoregion_id: ecoregionId ?? null,
  }).select("id").single();
  if (error) throw error;
  if (paths.length) {
    const { error: e } = await supabase.from("post_photo").insert(paths.map((p, i) => ({ post_id: post.id, storage_path: p, position: i })));
    if (e) throw e;
  }
  const { error: tagErr } = await supabase.from("post_plant").insert(plants.map((genus) => ({ post_id: post.id, genus })));
  if (tagErr) throw tagErr;
  // Posts start 'hidden'; the scan function is the only automated path to 'live'.
  // If the scan can't run, the post safely stays in review.
  const { data: scan, error: scanErr } = await supabase.functions.invoke("scan-post", { body: { post_id: post.id } });
  return { id: post.id, status: scanErr ? "pending" : (scan?.status ?? "pending") };
}

// Downscale to ≤2000px JPEG before upload. Canvas re-encode also drops all
// EXIF metadata, including GPS — never upload the original bytes.
export const processPhoto = (file) => new Promise((resolve) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => {
      URL.revokeObjectURL(url);
      resolve(b ? new File([b], "photo.jpg", { type: "image/jpeg" }) : null);
    }, "image/jpeg", 0.85);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  img.src = url;
});

export async function setPinned(postId, on) {
  const { data, error } = await supabase.from("post").update({ pinned: on }).eq("id", postId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("not your post");
}

// Plant search via the iNaturalist taxa API (public, no key). Returns plants only,
// deduped by genus, for the composer's manual-tag search.
export async function searchPlants(term) {
  const q = term?.trim();
  if (!q || q.length < 2) return [];
  const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&rank=genus,species,subspecies&per_page=12&locale=en`);
  if (!r.ok) return [];
  const j = await r.json();
  const seen = new Set(); const out = [];
  for (const t of j.results ?? []) {
    if (t.iconic_taxon_name && t.iconic_taxon_name !== "Plantae") continue; // plants only
    const genus = t.rank === "genus" ? t.name : String(t.name).split(" ")[0];
    if (!genus || !/^[A-Z][a-z]+$/.test(genus) || seen.has(genus)) continue;
    seen.add(genus);
    out.push({ genus, name: t.name, common: t.preferred_common_name ?? null });
    if (out.length >= 6) break;
  }
  return out;
}

// Make sure a genus exists in the shared vocabulary before it's tagged (INSERT …
// ON CONFLICT DO NOTHING, so the seed genera are never overwritten).
export async function ensureGenus(genus, common) {
  const { error } = await supabase.from("plant_genus")
    .upsert({ genus, common_name: common ?? null, source: "user" }, { onConflict: "genus", ignoreDuplicates: true });
  if (error && error.code !== "23505") throw error;
}

export async function reportPost(postId, uid, reason, note) {
  const { error } = await supabase.from("report").insert({ post_id: postId, reporter_id: uid, reason, note: note || null });
  if (error) throw error;
}

// ---------- Moderator tools (rows only exist for is_admin profiles) ----------

export async function fetchModerationQueue() {
  const { data, error } = await supabase.from("moderation_queue").select().order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    ...row,
    photos: (row.photos ?? []).map((p) => ({ ...p, src: photoUrl(p.path) })),
  }));
}

// Child-safety incidents (admin only). Metadata only — the image itself lives in
// the private quarantine bucket and is never fetched into the browser.
export async function fetchIncidents() {
  const { data, error } = await supabase.from("safety_incident").select().eq("reported", false).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function markIncidentReported(id) {
  const { error } = await supabase.from("safety_incident").update({ reported: true }).eq("id", id);
  if (error) throw error;
}

export async function moderatePost(postId, action) { // 'approve' | 'remove'
  const { data, error } = await supabase.from("post")
    .update({ status: action === "approve" ? "live" : "removed" }).eq("id", postId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("no rows updated — missing moderator access?");
  await supabase.from("report").update({ resolved: true }).eq("post_id", postId);
}
