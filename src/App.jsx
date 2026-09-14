import { useState, useEffect, useRef, useMemo } from "react";
import { ECOREGIONS, GENERA, PALETTES, PROJECTS, STAGES, SEED_POSTS, genus, isKeystone, proj, stage } from "./data/taxonomy.js";
import { identifyPhoto } from "./lib/identify.js";
import { hasSupabase, supabase } from "./lib/supabase.js";
import { fetchPosts, sendMagicLink, signOut, ensureProfile, fetchMyActivity, setLike, setFollow, publishPost, processPhoto, reportPost, fetchModerationQueue, moderatePost, fetchProfile } from "./lib/api.js";

/*
  Milkweed — a public, gardens-only photo feed.
  Anyone can browse. An account is only needed to post, like, or follow.

  PLANT DATA (prototype seed). In the real build the tag vocabulary comes
  from existing online lists rather than anything hand-maintained:
    - NWF Keystone Plant Guides by ecoregion (Tallamy host-plant research)
      → the keystone genera + which ecoregion they're keystone in
    - iNaturalist taxa API  → species autocomplete + accepted names
    - USDA PLANTS / BONAP    → native-range check by state/county
  Genera below are from the NWF guides; "keystone" is per ecoregion.
*/

function PlantPhoto({ plants, src }) {
  const p = PALETTES[plants[0]] || ["#4b5b2a", "#7a8a4a", "#2e3a22"];
  if (src) return <img src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
  return (
    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 90% at 30% 25%, ${p[1]} 0%, ${p[0]} 45%, ${p[2]} 100%)` }}>
      <svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.35 }}>
        {[...Array(14)].map((_, i) => (
          <path key={i} d={`M${20 + i * 28} 700 Q ${40 + i * 30} ${420 - (i % 5) * 40} ${60 + i * 26} ${300 - (i % 3) * 60}`} stroke={p[1]} strokeWidth="3" fill="none" />
        ))}
      </svg>
    </div>
  );
}

const ZONES = Array.from({ length: 13 }, (_, i) => [`${i + 1}a`, `${i + 1}b`]).flat(); // USDA 1a–13b

function Monarch({ size = 46 }) {
  const wing = (
    <>
      <path d="M33 30 C 44 12, 58 8, 60 16 C 62 24, 48 32, 38 33 C 50 34, 58 40, 55 48 C 52 55, 40 50, 34 40 Z"
        fill="#E7893B" stroke="#1a120b" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M36 31 C 44 22, 51 16, 58 15 M37 33 C 46 34, 52 38, 55 45" stroke="#1a120b" strokeWidth="1.6" fill="none" />
      <circle cx="56" cy="13" r="1.6" fill="#F1EBDD" />
      <circle cx="59.5" cy="19.5" r="1.3" fill="#F1EBDD" />
      <circle cx="54" cy="47" r="1.4" fill="#F1EBDD" />
    </>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {/* mirror lives on the outer group: the flap animation's CSS transform would override an attribute transform */}
      <g transform="scale(-1,1) translate(-64,0)"><g className="monarch-wing">{wing}</g></g>
      <g className="monarch-wing">{wing}</g>
      <ellipse cx="32" cy="34" rx="2.6" ry="9" fill="#1a120b" />
      <circle cx="32" cy="24" r="3" fill="#1a120b" />
      <path d="M30 22 C 27 17, 25 15, 22 14 M34 22 C 37 17, 39 15, 42 14" stroke="#1a120b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function PhotoStrip({ plants, srcs }) {
  const strip = useRef(null);
  const [idx, setIdx] = useState(0);
  if (!srcs || srcs.length <= 1) return <PlantPhoto plants={plants} src={srcs?.[0]} />;
  const go = (d) => strip.current?.scrollBy({ left: d * strip.current.clientWidth, behavior: "smooth" });
  const arrow = (side) => ({ position: "absolute", [side]: 10, top: "50%", transform: "translateY(-50%)", zIndex: 4, width: 34, height: 34, borderRadius: 999, border: "none", background: "rgba(16,26,20,.55)", color: "#F1EBDD", fontSize: 18, cursor: "pointer", backdropFilter: "blur(6px)" });
  return (
    <>
      <div ref={strip} onScroll={(e) => setIdx(Math.round(e.target.scrollLeft / e.target.clientWidth))}
        style={{ position: "absolute", inset: 0, display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
        {srcs.map((s, i) => (
          <img key={i} src={s} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", flex: "0 0 100%", scrollSnapAlign: "start" }} />
        ))}
      </div>
      {idx > 0 && <button onClick={() => go(-1)} style={arrow("left")}>‹</button>}
      {idx < srcs.length - 1 && <button onClick={() => go(1)} style={arrow("right")}>›</button>}
      <div style={{ position: "absolute", top: 100, right: 14, zIndex: 4, padding: "4px 9px", borderRadius: 999, background: "rgba(16,26,20,.6)", color: "#F1EBDD", fontSize: 12, backdropFilter: "blur(6px)" }}>
        {idx + 1} / {srcs.length}
      </div>
    </>
  );
}

function Tag({ g, region, onClick, active }) {
  const ks = isKeystone(g, region);
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999,
      border: `1.5px solid ${ks ? "#E7B93B" : "rgba(241,235,221,.35)"}`,
      background: active ? (ks ? "#E7B93B" : "#F1EBDD") : "rgba(16,26,20,.55)",
      color: active ? "#101A14" : "#F1EBDD", fontSize: 13, cursor: "pointer", backdropFilter: "blur(6px)",
    }}>
      {ks && <span title="Keystone in this ecoregion" style={{ width: 8, height: 8, borderRadius: 999, background: active ? "#101A14" : "#E7B93B" }} />}
      <em style={{ fontStyle: "italic" }}>{g}</em>
      <span style={{ opacity: 0.75 }}>{genus(g)?.common}</span>
    </button>
  );
}

export default function App() {
  const [posts, setPosts] = useState(hasSupabase ? [] : SEED_POSTS);
  const [user, setUser] = useState(null);
  const [liked, setLiked] = useState({});
  const [following, setFollowing] = useState({});
  const [filter, setFilter] = useState({ plant: null, project: null, stage: null, author: null });
  const [profile, setProfile] = useState(null); // data for view === "profile"
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState("feed"); // feed | plants | post
  const [authOpen, setAuthOpen] = useState(false);
  const [pending, setPending] = useState(false); // an action is waiting on sign-in
  const pendingRef = useRef(null);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [queue, setQueue] = useState([]);
  const [draft, setDraft] = useState({ region: "Eastern Temperate Forests", project: null, stage: null, plants: [], caption: "", srcs: [], gardenName: "", zone: "" });
  const fileRef = useRef();

  useEffect(() => {
    if (!hasSupabase) return;
    fetchPosts().then(setPosts).catch((e) => console.error("feed", e));
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    const onSession = async (session) => {
      try {
        const u = await ensureProfile(session);
        setUser(u);
        const a = await fetchMyActivity(u.id);
        setLiked(a.liked);
        setFollowing(a.following);
        setAuthOpen(false);
        resumePending(u);
        // An action started before sign-in survives the magic-link redirect here.
        try {
          const raw = localStorage.getItem("keystone_pending");
          if (raw) {
            localStorage.removeItem("keystone_pending");
            const act = JSON.parse(raw);
            if (act.type === "follow" && act.authorId && act.authorId !== u.id) {
              setFollowing((f) => ({ ...f, [act.username]: true }));
              await setFollow(act.authorId, u.id, true);
              setNotice(`Signed in — you're now following @${act.username}.`);
            } else if (act.type === "like" && act.id) {
              setLiked((l) => ({ ...l, [act.id]: true }));
              await setLike(act.id, u.id, true);
              setPosts(await fetchPosts());
              setNotice("Signed in — your like was saved.");
            } else if (act.type === "post") {
              setView("post");
            }
          }
        } catch (e) { console.error("pending", e); }
      } catch (e) { console.error("auth", e); }
    };
    supabase.auth.getSession().then(({ data }) => data.session && onSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // defer: supabase-js deadlocks if other client calls run inside this callback
      if (event === "SIGNED_IN" && session) setTimeout(() => onSession(session), 0);
      if (event === "SIGNED_OUT") setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const visible = useMemo(() => posts.filter((p) =>
    (!filter.plant || p.plants.includes(filter.plant)) &&
    (!filter.project || p.project === filter.project) &&
    (!filter.stage || p.stage === filter.stage) &&
    (!filter.author || p.user === filter.author)), [posts, filter]);
  const activeFilters = Object.values(filter).filter(Boolean).length;

  // intent survives the magic-link redirect via localStorage (see onSession)
  const requireAccount = (fn, intent) => {
    if (user) return fn(user);
    pendingRef.current = fn;
    if (hasSupabase && intent) {
      try { localStorage.setItem("keystone_pending", JSON.stringify(intent)); } catch {}
    }
    setPending(true);
    setAuthOpen(true);
  };
  const resumePending = (u) => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    setPending(false);
    if (fn) fn(u);
  };

  const toggleLike = (id) => requireAccount((u) => {
    const on = !liked[id];
    setLiked((l) => ({ ...l, [id]: on }));
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, likes: p.likes + (on ? 1 : -1) } : p)));
    if (hasSupabase && u?.id) setLike(id, u.id, on).catch((e) => console.error("like", e));
  }, { type: "like", id });
  const toggleFollow = (p) => requireAccount((u) => {
    if (hasSupabase && u?.id && p.authorId === u.id) return; // no self-follow
    const on = !following[p.user];
    setFollowing((f) => ({ ...f, [p.user]: on }));
    if (hasSupabase && u?.id && p.authorId) setFollow(p.authorId, u.id, on).catch((e) => console.error("follow", e));
  }, { type: "follow", authorId: p.authorId, username: p.user });
  const startPost = () => requireAccount(() => setView("post"), { type: "post" });

  const openProfile = async (username) => {
    try {
      if (hasSupabase) setProfile(await fetchProfile(username));
      else setProfile({ id: null, username, display_name: null, followers: 0, posts: posts.filter((x) => x.user === username) });
      setView("profile");
    } catch (e) { console.error("profile", e); }
  };

  const publish = async () => {
    if (!draft.plants.length || publishing) return;
    if (hasSupabase && user?.id) {
      setPublishing(true);
      try {
        const res = await publishPost({ user, files: fileObjs.current, region: draft.region, project: draft.project, stage: draft.stage, plants: draft.plants, caption: draft.caption, gardenName: draft.gardenName, zone: draft.zone });
        setPosts(await fetchPosts());
        if (res.status === "rejected") setNotice("That photo can't be posted here — it didn't pass screening.");
        else if (res.status !== "live") setNotice("Your garden is in review — it'll appear in the feed once approved.");
      } catch (e) {
        console.error("publish", e);
        alert(`Couldn't publish: ${e.message ?? e}`);
        return;
      } finally {
        setPublishing(false);
      }
    } else {
      setPosts((ps) => [{ id: Date.now(), user: user.name, region: draft.region, project: draft.project, stage: draft.stage, plants: draft.plants, caption: draft.caption, likes: 0, ago: "now", srcs: draft.srcs, garden: draft.gardenName || null, zone: draft.zone || null }, ...ps]);
    }
    fileObjs.current = [];
    setDraft({ region: draft.region, project: null, stage: null, plants: [], caption: "", srcs: [], gardenName: "", zone: "" });
    setView("feed");
  };

  const [idKey, setIdKey] = useState("");
  const [idState, setIdState] = useState({ status: "idle", suggestions: [] });
  const fileB64 = useRef(null);
  const fileObjs = useRef([]);

  const onFile = async (e) => {
    const picked = Array.from(e.target.files ?? []).slice(0, 6); // ≤6 photos per post
    if (!picked.length) return;
    // Canvas re-encode: resized to ≤2000px and every EXIF field (incl. GPS) dropped.
    const cleaned = (await Promise.all(picked.map(processPhoto))).map((c, i) => c || picked[i]);
    fileObjs.current = cleaned;
    setDraft((d) => ({ ...d, srcs: cleaned.map((f) => URL.createObjectURL(f)) }));
    setIdState({ status: "idle", suggestions: [] });
    const r = new FileReader();
    r.onload = () => (fileB64.current = String(r.result).split(",")[1]);
    r.readAsDataURL(cleaned[0]); // plant ID runs on the first photo
  };

  const identify = async () => {
    if (!fileB64.current) return;
    setIdState({ status: "loading", suggestions: [] });
    try {
      const s = await identifyPhoto(fileB64.current, idKey);
      setIdState({ status: "done", suggestions: s });
    } catch (err) {
      setIdState({ status: "error", suggestions: [], msg: String(err.message) });
    }
  };

  const acceptSuggestion = (name) => {
    const g = name.split(" ")[0];
    if (!genus(g)) { setIdState((s) => ({ ...s, msg: `${g} isn't in the native list yet — tag manually.` })); return; }
    setDraft((d) => ({ ...d, plants: d.plants.includes(g) ? d.plants : [...d.plants, g] }));
    setIdState((s) => ({ ...s, suggestions: s.suggestions.filter((x) => x.name !== name) }));
  };

  const shell = { fontFamily: "Georgia, 'Iowan Old Style', serif", background: "#101A14", color: "#F1EBDD", height: "100vh", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" };

  return (
    <div style={shell}>
      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "linear-gradient(rgba(16,26,20,.85), rgba(16,26,20,0))" }}>
        <div style={{ fontSize: 22, letterSpacing: -0.5 }}>Milkweed</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {user?.isAdmin && (
            <button onClick={async () => { setView("mod"); try { setQueue(await fetchModerationQueue()); } catch (e) { console.error("queue", e); } }} style={btn(view === "mod")}>Queue</button>
          )}
          <button onClick={() => setView(view === "plants" ? "feed" : "plants")} style={btn(view === "plants")}>Plants</button>
          {user
            ? <button onClick={() => { if (hasSupabase && window.confirm("Sign out?")) signOut(); }} style={{ ...btn(false), border: "none", opacity: 0.8, fontSize: 13 }}>@{user.name}</button>
            : <button onClick={() => setAuthOpen(true)} style={btn(false)}>Sign in</button>}
        </div>
      </div>

      {view === "feed" && (
        <div style={{ position: "absolute", top: 56, left: 0, right: 0, zIndex: 5, padding: "0 16px", display: "flex", gap: 8, alignItems: "center", overflowX: "auto" }}>
          <button onClick={() => setFiltersOpen(true)} style={btn(activeFilters > 0)}>{activeFilters ? `Filters · ${activeFilters}` : "Browse by journey"}</button>
          {filter.project && <button onClick={() => setFilter({ ...filter, project: null })} style={chip}>{proj(filter.project).name} ×</button>}
          {filter.stage && <button onClick={() => setFilter({ ...filter, stage: null })} style={chip}>{stage(filter.stage).name} ×</button>}
          {filter.plant && <button onClick={() => setFilter({ ...filter, plant: null })} style={chip}><em>{filter.plant}</em> ×</button>}
          {filter.author && <button onClick={() => setFilter({ ...filter, author: null })} style={chip}>@{filter.author} ×</button>}
        </div>
      )}

      {filtersOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(16,26,20,.7)", display: "flex", alignItems: "flex-end" }} onClick={() => setFiltersOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "85%", overflowY: "auto", background: "#F1EBDD", color: "#101A14", borderRadius: "18px 18px 0 0", padding: "22px 20px 30px" }}>
            <div style={{ fontSize: 20, marginBottom: 2 }}>Where are you in yours?</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>See gardens at the same point — or skip ahead to where it's going.</div>

            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>Stage</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {STAGES.map((st) => (
                <button key={st.id} onClick={() => setFilter({ ...filter, stage: filter.stage === st.id ? null : st.id })} style={pick(filter.stage === st.id)} title={st.blurb}>
                  {st.name}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>Project</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {PROJECTS.map((pr) => (
                <button key={pr.id} onClick={() => setFilter({ ...filter, project: filter.project === pr.id ? null : pr.id })} style={pick(filter.project === pr.id)} title={pr.blurb}>
                  {pr.name}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setFilter({ plant: null, project: null, stage: null, author: null })} style={{ ...btn(false), color: "#101A14", borderColor: "rgba(16,26,20,.3)" }}>Clear</button>
              <button onClick={() => setFiltersOpen(false)} style={{ ...btn(true), flex: 1 }}>Show {visible.length} garden{visible.length === 1 ? "" : "s"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      {view === "feed" && (
        <div style={{ height: "100%", overflowY: "auto", scrollSnapType: "y mandatory" }}>
          {visible.length === 0 && (
            <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 32, textAlign: "center" }}>
              <div>No gardens match those filters yet. <button onClick={startPost} style={btn(true)}>Post the first one</button></div>
            </div>
          )}
          {visible.map((p) => (
            <article key={p.id} style={{ height: "100%", position: "relative", scrollSnapAlign: "start" }}>
              <PhotoStrip plants={p.plants} srcs={p.srcs ?? (p.src ? [p.src] : [])} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(rgba(16,26,20,0) 45%, rgba(16,26,20,.9))", pointerEvents: "none" }} />

              {/* Right rail */}
              <div style={{ position: "absolute", right: 14, bottom: 120, display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
                <button onClick={() => toggleLike(p.id)} style={rail}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill={liked[p.id] ? "#E7B93B" : "none"} stroke={liked[p.id] ? "#E7B93B" : "#F1EBDD"} strokeWidth="1.8"><path d="M12 21s-7-4.6-9.3-9.2C1 8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.6 0 6 3.5 4.3 7.3C19 16.4 12 21 12 21z" /></svg>
                  <span style={{ fontSize: 12 }}>{p.likes}</span>
                </button>
                <button onClick={() => { const own = user?.id && p.authorId === user.id; own ? openProfile(p.user) : toggleFollow(p); }} style={rail}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: "#E7B93B", color: "#101A14", display: "grid", placeItems: "center", fontSize: 16 }}>{p.user[0].toUpperCase()}</div>
                  <span style={{ fontSize: 12 }}>{user?.id && p.authorId === user.id ? "You" : following[p.user] ? "Following" : "Follow"}</span>
                </button>
                <button onClick={() => requireAccount(() => setReportFor(p.id))} style={rail} title="Report this post">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F1EBDD" strokeWidth="1.8"><path d="M5 21V4h13l-2.5 4L18.5 12H5" /></svg>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>Report</span>
                </button>
              </div>

              {/* Caption block */}
              <div style={{ position: "absolute", left: 16, right: 80, bottom: 28 }}>
                <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 4 }}>
                  <button onClick={() => openProfile(p.user)} style={{ background: "none", border: "none", padding: 0, color: "inherit", fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(241,235,221,.35)" }}>@{p.user}</button>
                  {p.user.startsWith("demo_") && <span title="Seed content posted by the Milkweed team, not a real gardener" style={{ margin: "0 2px 0 6px", padding: "1px 8px", borderRadius: 999, background: "#E7B93B", color: "#101A14", fontSize: 11, verticalAlign: "1px" }}>demo</span>}
                  {p.user.startsWith("pinnacle_") && <span title="Curated by the Milkweed team, celebrating a pioneer of this movement" style={{ margin: "0 2px 0 6px", padding: "1px 8px", borderRadius: 999, background: "#F1EBDD", color: "#101A14", fontSize: 11, verticalAlign: "1px" }}>★ featured</span>}
                  {" "}· {p.region} · {p.ago}
                  {p.garden && <> · <em>{p.garden}</em></>}{p.zone && <> · zone {p.zone}</>}
                </div>
                {(p.project || p.stage) && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {p.project && <button onClick={() => setFilter({ ...filter, project: p.project })} style={chip}>{proj(p.project).name}</button>}
                    {p.stage && <button onClick={() => setFilter({ ...filter, stage: p.stage })} style={chip}>{stage(p.stage).name}</button>}
                  </div>
                )}
                <p style={{ fontSize: 17, lineHeight: 1.35, margin: "0 0 12px" }}>{p.caption}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.plants.map((g) => <Tag key={g} g={g} region={p.region} onClick={() => setFilter({ ...filter, plant: g })} />)}
                </div>
                {p.plants.some((g) => isKeystone(g, p.region)) && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#E7B93B" }}>● keystone genus for {p.region} — a top host plant for caterpillars, which feed most nesting birds</div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Plants directory */}
      {view === "plants" && (
        <div style={{ height: "100%", overflowY: "auto", padding: "70px 16px 100px" }}>
          <p style={{ fontSize: 15, lineHeight: 1.45, opacity: 0.85, margin: "0 0 16px" }}>Keystone plants are the handful of genera that host most of a region's caterpillars. Gold-dotted tags are keystone in the post's ecoregion. Tap a plant to see only those gardens.</p>
          {["tree", "shrub", "perennial", "grass"].map((t) => (
            <div key={t} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8, textTransform: "capitalize" }}>{t}s</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {GENERA.filter((x) => x.type === t).map((x) => (
                  <Tag key={x.g} g={x.g} region={x.ks[0] || ""} onClick={() => { setFilter({ ...filter, plant: x.g }); setView("feed"); }} />
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, opacity: 0.55, lineHeight: 1.5 }}>Genera from the National Wildlife Federation keystone plant guides. Species names and native ranges will come from iNaturalist and USDA PLANTS.</div>
        </div>
      )}

      {/* Profile */}
      {view === "profile" && profile && (
        <div style={{ height: "100%", overflowY: "auto", padding: "70px 16px 100px" }}>
          <button onClick={() => setView("feed")} style={btn(false)}>‹ Feed</button>
          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "18px 0 10px" }}>
            <div style={{ width: 64, height: 64, borderRadius: 999, background: "#E7B93B", color: "#101A14", display: "grid", placeItems: "center", fontSize: 28, flexShrink: 0 }}>{profile.username[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 20 }}>
                @{profile.username}
                {profile.username.startsWith("demo_") && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 999, background: "#E7B93B", color: "#101A14", fontSize: 11, verticalAlign: "3px" }}>demo</span>}
                {profile.username.startsWith("pinnacle_") && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 999, background: "#F1EBDD", color: "#101A14", fontSize: 11, verticalAlign: "3px" }}>★ featured</span>}
              </div>
              {profile.display_name && <div style={{ fontSize: 14, opacity: 0.7 }}>{profile.display_name}</div>}
              <div style={{ fontSize: 13, opacity: 0.6 }}>{profile.posts.length} post{profile.posts.length === 1 ? "" : "s"} · {profile.followers} follower{profile.followers === 1 ? "" : "s"}</div>
            </div>
          </div>
          {user?.name !== profile.username && (
            <button onClick={() => toggleFollow({ user: profile.username, authorId: profile.id })} style={{ ...btn(!following[profile.username]), marginBottom: 14 }}>
              {following[profile.username] ? "Following" : "Follow"}
            </button>
          )}
          {(() => {
            const gardens = [...new Map(profile.posts.filter((p) => p.garden).map((p) => [p.garden, p.zone])).entries()];
            return gardens.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {gardens.map(([g, z]) => <span key={g} style={{ ...chip, cursor: "default" }}><em>{g}</em>{z ? ` · zone ${z}` : ""}</span>)}
              </div>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {profile.posts.map((p) => (
              <button key={p.id} onClick={() => { setFilter({ ...filter, author: profile.username }); setView("feed"); }}
                style={{ position: "relative", aspectRatio: "3/4", borderRadius: 10, overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: "#1A2A20" }}>
                {p.srcs?.[0]
                  ? <img src={p.srcs[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : <PlantPhoto plants={p.plants} />}
                {p.stage && <span style={{ position: "absolute", left: 6, bottom: 6, padding: "2px 7px", borderRadius: 999, background: "rgba(16,26,20,.7)", color: "#F1EBDD", fontSize: 10 }}>{stage(p.stage)?.name}</span>}
              </button>
            ))}
          </div>
          {profile.posts.length === 0 && <div style={{ opacity: 0.6, fontSize: 14 }}>No gardens posted yet.</div>}
        </div>
      )}

      {/* Moderation queue (admins only) */}
      {view === "mod" && (
        <div style={{ height: "100%", overflowY: "auto", padding: "70px 16px 100px" }}>
          <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 14px" }}>Posts waiting on review, flagged by the scanner, or reported by the community.</p>
          {queue.length === 0 && <div style={{ opacity: 0.7 }}>Queue is clear.</div>}
          {queue.map((q) => (
            <div key={q.id} style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: "#1A2A20" }}>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>@{q.username} · {q.status}</div>
              {(q.photos ?? []).map((p) => (
                <div key={p.path} style={{ marginBottom: 8 }}>
                  {p.scan !== "rejected" && <img src={p.src} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />}
                  <div style={{ fontSize: 12, opacity: 0.7 }}>scan: {p.scan}{p.labels?.reason ? ` · ${p.labels.reason}` : ""}</div>
                </div>
              ))}
              {q.caption && <p style={{ fontSize: 15, lineHeight: 1.4, margin: "6px 0" }}>{q.caption}</p>}
              {(q.open_reports ?? []).map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: "#E7B93B", marginTop: 4 }}>⚑ {r.reason}{r.note ? ` — ${r.note}` : ""}</div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {["approve", "remove"].map((action) => (
                  <button key={action} style={btn(action === "approve")} onClick={async () => {
                    try {
                      await moderatePost(q.id, action);
                      setQueue(await fetchModerationQueue());
                      setPosts(await fetchPosts());
                    } catch (e) {
                      console.error("moderate", e);
                      setNotice(`Couldn't ${action}: ${e.message ?? e}`);
                    }
                  }}>{action === "approve" ? "Approve" : "Remove"}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post composer */}
      {view === "post" && (
        <div style={{ height: "100%", overflowY: "auto", padding: "70px 16px 100px" }}>
          <div onClick={() => fileRef.current.click()} style={{ height: 220, borderRadius: 14, position: "relative", overflow: "hidden", cursor: "pointer", border: draft.srcs.length ? "none" : "1.5px dashed rgba(241,235,221,.4)", display: "grid", placeItems: "center" }}>
            {draft.srcs.length ? <PlantPhoto plants={draft.plants.length ? draft.plants : ["x"]} src={draft.srcs[0]} /> : <span style={{ opacity: 0.75 }}>Add photos of your garden (up to 6)</span>}
          </div>
          {draft.srcs.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
              {draft.srcs.map((s, i) => (
                <img key={i} src={s} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: i === 0 ? "2px solid #E7B93B" : "none" }} />
              ))}
              <span style={{ fontSize: 12, opacity: 0.6, alignSelf: "center", whiteSpace: "nowrap" }}>tap above to re-pick</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFile} style={{ display: "none" }} />

          {draft.srcs.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={identify} disabled={idState.status === "loading"} style={btn(false)}>
                  {idState.status === "loading" ? "Looking…" : "Suggest plants from photo"}
                </button>
                <input placeholder="Plant.id key (optional, demo without)" value={idKey} onChange={(e) => setIdKey(e.target.value)} style={{ ...input, marginTop: 0, fontSize: 13, flex: 1 }} />
              </div>
              {idState.suggestions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>Tap to confirm — nothing is tagged until you do</div>
                  {idState.suggestions.map((s) => {
                    const g = s.name.split(" ")[0];
                    const ks = isKeystone(g, draft.region);
                    const common = s.common ?? genus(g)?.common; // species name from the identifier, else our genus vocabulary
                    return (
                      <button key={s.name} onClick={() => acceptSuggestion(s.name)} style={{ ...btn(false), display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6, borderRadius: 10, borderColor: ks ? "#E7B93B" : undefined }}>
                        <span style={{ textAlign: "left" }}>
                          {common && <span style={{ display: "block", fontSize: 15 }}>{common}</span>}
                          <span style={{ opacity: common ? 0.7 : 1, fontSize: common ? 12 : undefined }}><em>{s.name}</em></span>
                          {ks && <span style={{ color: "#E7B93B", fontSize: 12 }}> · keystone here</span>}
                        </span>
                        <span style={{ opacity: 0.6, whiteSpace: "nowrap" }}>{Math.round(s.prob * 100)}%</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {idState.msg && <div style={{ fontSize: 13, color: "#E7B93B", marginTop: 6 }}>{idState.msg}</div>}
            </div>
          )}

          <label style={lbl}>What kind of project?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PROJECTS.map((pr) => <button key={pr.id} onClick={() => setDraft({ ...draft, project: draft.project === pr.id ? null : pr.id })} style={pickDark(draft.project === pr.id)}>{pr.name}</button>)}
          </div>

          <label style={lbl}>Where is it at?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {STAGES.map((st) => <button key={st.id} onClick={() => setDraft({ ...draft, stage: draft.stage === st.id ? null : st.id })} style={pickDark(draft.stage === st.id)}>{st.name}</button>)}
          </div>

          <label style={lbl}>Ecoregion</label>
          <select value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} style={input}>
            {ECOREGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>

          <label style={lbl}>Garden name & zone (optional) — posts with the same name build one timeline</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="e.g. Front yard" value={draft.gardenName} onChange={(e) => setDraft({ ...draft, gardenName: e.target.value })} style={{ ...input, marginTop: 0, flex: 2 }} />
            <select value={draft.zone} onChange={(e) => setDraft({ ...draft, zone: e.target.value })} style={{ ...input, marginTop: 0, flex: 1 }}>
              <option value="">Zone</option>
              {ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>

          <label style={lbl}>What's growing in it? (required)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {GENERA.map((x) => (
              <Tag key={x.g} g={x.g} region={draft.region} active={draft.plants.includes(x.g)}
                onClick={() => setDraft((d) => ({ ...d, plants: d.plants.includes(x.g) ? d.plants.filter((y) => y !== x.g) : [...d.plants, x.g] }))} />
            ))}
          </div>

          <label style={lbl}>Caption (optional)</label>
          <textarea value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} rows={3} style={input} placeholder="How long has it been in? What showed up?" />

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setView("feed")} style={btn(false)}>Cancel</button>
            <button onClick={publish} disabled={!draft.plants.length || publishing} style={{ ...btn(true), opacity: draft.plants.length && !publishing ? 1 : 0.4 }}>{publishing ? "Publishing…" : "Publish"}</button>
          </div>
        </div>
      )}

      {notice && (
        <div onClick={() => setNotice(null)} style={{ position: "absolute", bottom: 74, left: 16, right: 16, zIndex: 6, padding: "10px 14px", borderRadius: 12, background: "#F1EBDD", color: "#101A14", fontSize: 14, cursor: "pointer" }}>
          {notice}
        </div>
      )}

      {/* Report sheet */}
      {reportFor && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(16,26,20,.7)", display: "flex", alignItems: "flex-end" }} onClick={() => setReportFor(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "#F1EBDD", color: "#101A14", borderRadius: "18px 18px 0 0", padding: "22px 20px 30px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>Report this post</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 14 }}>Reported posts are hidden automatically once a few people flag them.</div>
            {[["not_a_garden", "Not a garden"], ["spam", "Spam"], ["harassment", "Harassment"], ["other", "Something else"]].map(([id, name]) => (
              <button key={id} style={{ ...pick(false), display: "block", width: "100%", textAlign: "left", marginBottom: 8 }}
                onClick={async () => {
                  const postId = reportFor;
                  setReportFor(null);
                  try {
                    if (hasSupabase && user?.id) await reportPost(postId, user.id, id);
                    setNotice("Thanks — reported. A moderator will take a look.");
                  } catch (e) { console.error("report", e); }
                }}>{name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Post button — a monarch fluttering in the corner */}
      <style>{`
        @keyframes monarch-bob { 0%, 100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(5deg); } }
        @keyframes monarch-flap { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(0.72); } }
        .monarch-fly { display: block; animation: monarch-bob 3.4s ease-in-out infinite; }
        .monarch-wing { transform-origin: 32px 32px; transform-box: view-box; animation: monarch-flap 2.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .monarch-fly, .monarch-wing { animation: none; } }
      `}</style>
      {view !== "post" && view !== "mod" && (
        <button onClick={startPost} aria-label="Post a garden" title="Post a garden"
          style={{ position: "absolute", bottom: 16, right: 12, zIndex: 5, background: "none", border: "none", padding: 6, cursor: "pointer", fontFamily: "inherit", filter: "drop-shadow(0 4px 8px rgba(0,0,0,.5))" }}>
          <span className="monarch-fly"><Monarch /></span>
          <span style={{ display: "block", fontSize: 11, color: "#F1EBDD", opacity: 0.85, marginTop: 1 }}>Post</span>
        </button>
      )}

      {/* Auth sheet — only appears when an action needs it */}
      {authOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(16,26,20,.7)", display: "flex", alignItems: "flex-end" }} onClick={() => setAuthOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "#F1EBDD", color: "#101A14", borderRadius: "18px 18px 0 0", padding: "22px 20px 30px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>Sign in to {pending ? "do that" : "post and follow"}</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>Browsing never needs an account.</div>
            <AuthForm onDone={(u) => { setUser(u); setAuthOpen(false); resumePending(u); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function AuthForm({ onDone }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [msg, setMsg] = useState("");
  const ok = name.trim().length > 2 && email.includes("@");

  const submit = async () => {
    if (!hasSupabase) return onDone({ name }); // demo sign-in when no backend is configured
    setStatus("sending");
    try {
      await sendMagicLink(email, name);
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setMsg(String(e.message ?? e));
    }
  };

  if (status === "sent") {
    return <div style={{ fontSize: 15, lineHeight: 1.5 }}>Check <b>{email}</b> for a sign-in link. Open it on this device and you'll come back signed in.</div>;
  }
  return (
    <div>
      <input placeholder="Username" value={name} onChange={(e) => setName(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase())} style={{ ...input, background: "#fff", color: "#101A14", marginTop: 0 }} />
      <input placeholder="Email — we'll send a sign-in link" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...input, background: "#fff", color: "#101A14" }} />
      <button disabled={!ok || status === "sending"} onClick={submit} style={{ ...btn(true), opacity: ok && status !== "sending" ? 1 : 0.4, width: "100%", marginTop: 12 }}>
        {status === "sending" ? "Sending…" : hasSupabase ? "Email me a sign-in link" : "Continue"}
      </button>
      {status === "error" && <div style={{ fontSize: 13, color: "#8a2d2d", marginTop: 8 }}>{msg}</div>}
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 10 }}>
        {hasSupabase ? "Magic link — no password to store or forget." : "Demo sign-in; set VITE_SUPABASE_* in .env for real magic links."}
      </div>
    </div>
  );
}

const btn = (primary) => ({ padding: "8px 14px", borderRadius: 999, border: primary ? "none" : "1.5px solid rgba(241,235,221,.4)", background: primary ? "#E7B93B" : "transparent", color: primary ? "#101A14" : "#F1EBDD", fontFamily: "inherit", fontSize: 14, cursor: "pointer" });
const rail = { background: "none", border: "none", color: "#F1EBDD", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" };
const lbl = { display: "block", fontSize: 13, opacity: 0.7, margin: "18px 0 6px" };
const input = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(241,235,221,.25)", background: "#1A2A20", color: "#F1EBDD", fontFamily: "inherit", fontSize: 15, marginTop: 8, boxSizing: "border-box" };
const chip = { padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(241,235,221,.35)", background: "rgba(16,26,20,.55)", color: "#F1EBDD", fontFamily: "inherit", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", backdropFilter: "blur(6px)" };
const pick = (on) => ({ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#101A14" : "rgba(16,26,20,.25)"}`, background: on ? "#101A14" : "transparent", color: on ? "#F1EBDD" : "#101A14", fontFamily: "inherit", fontSize: 14, cursor: "pointer" });
const pickDark = (on) => ({ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#E7B93B" : "rgba(241,235,221,.3)"}`, background: on ? "#E7B93B" : "transparent", color: on ? "#101A14" : "#F1EBDD", fontFamily: "inherit", fontSize: 14, cursor: "pointer" });
