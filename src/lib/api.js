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

export async function publishPost({ user, files, region, project, stage, plants, caption, gardenName, zone }) {
  // A named garden (or one with a zone) becomes a garden_project row, reused by
  // owner+name so repeat posts build the garden's timeline.
  let projectId = null;
  if (gardenName || zone) {
    const name = (gardenName || "My garden").trim().slice(0, 80);
    const { data: existing } = await supabase.from("garden_project").select("id").eq("owner_id", user.id).eq("name", name).maybeSingle();
    if (existing) {
      projectId = existing.id;
      if (zone) await supabase.from("garden_project").update({ zone }).eq("id", projectId);
    } else {
      const { data: gp, error: gpErr } = await supabase.from("garden_project")
        .insert({ owner_id: user.id, name, project_type_id: project, zone: zone || null })
        .select("id").single();
      if (gpErr) throw gpErr;
      projectId = gp.id;
    }
  }
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
    project_id: projectId,
    project_type_id: project,
    stage_id: stage,
    caption: caption || null,
    ecoregion_id: ECOREGION_IDS[region] ?? null,
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

export async function moderatePost(postId, action) { // 'approve' | 'remove'
  const { data, error } = await supabase.from("post")
    .update({ status: action === "approve" ? "live" : "removed" }).eq("id", postId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("no rows updated — missing moderator access?");
  await supabase.from("report").update({ resolved: true }).eq("post_id", postId);
}
