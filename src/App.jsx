import { useState, useEffect, useRef, useMemo } from "react";
import { ECOREGIONS, GENERA, PALETTES, PROJECTS, STAGES, SEED_POSTS, genus, isKeystone, proj, stage } from "./data/taxonomy.js";
import { identifyPhoto } from "./lib/identify.js";
import { hasSupabase, supabase } from "./lib/supabase.js";
import { fetchPosts, sendMagicLink, signOut, ensureProfile, fetchMyActivity, setLike, setFollow, publishPost, processPhoto, reportPost, fetchModerationQueue, moderatePost, fetchProfile, setPinned, fetchIncidents, markIncidentReported, searchPlants, ensureGenus, fetchMyGardens, createGarden, addProject, fetchNativeStatus, tokenGenus, fetchPrompts, fetchQuestions, askQuestion, answerQuestion, searchPlaces, ensureSpecies, searchProfiles, ECOREGION_IDS } from "./lib/api.js";
import { COUNTRIES, gardenRegions, gardenPlaceLabel } from "./data/tdwg.js";
const COUNTRY_NAME = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));
// "Ask the gardener" prompts; mirrors question_prompt in the DB (seed-mode fallback).
const DEFAULT_PROMPTS = [
  { id: "how_long", text: "How long did it take to look like this?" }, { id: "prep", text: "How did you prep the site?" },
  { id: "source", text: "Where did you get the plants?" }, { id: "upkeep", text: "How much watering and upkeep does it need?" },
  { id: "wildlife", text: "What wildlife has shown up?" }, { id: "redo", text: "What would you do differently?" },
];

// Ecoregion id (stored on gardens/posts) -> display name, for keystone hints.
const REGION_NAME = Object.fromEntries(Object.entries(ECOREGION_IDS).map(([n, i]) => [i, n]));

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
  const p = PALETTES[tokenGenus(plants[0])] || ["#4b5b2a", "#7a8a4a", "#2e3a22"];
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
// US states + DC, for a garden's location (drives the "is this native here?" check).
const US_STATES = [["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","District of Columbia"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]];

// Brand wordmark: milkweed seed as the i, stained-glass monarch as the w.
// Dark-surface cut (cream borders); glyphs designed at 44px, scaled by `size`.
function Wordmark({ size = 22, plate = true }) {
  const s = size / 44;
  const word = { fontSize: size, lineHeight: 1, letterSpacing: -1, fontStyle: "italic" };
  const plateStyle = plate ? {
    padding: `${Math.round(size * 0.28)}px ${Math.round(size * 0.5)}px`,
    borderRadius: Math.round(size * 0.5),
    background: "linear-gradient(135deg, #1E3A29 0%, #14261B 100%)",
    border: "1px solid rgba(231,185,59,.3)",
    boxShadow: "0 2px 10px rgba(0,0,0,.35), inset 0 1px 0 rgba(241,235,221,.06)",
  } : {};
  return (
    <div style={{ display: "inline-flex", alignItems: "flex-end", ...plateStyle }} aria-label="Milkweed">
      <span style={word}>M</span>
      <svg width={15 * s} height={34 * s} viewBox="0 0 15 34" style={{ transform: "skewX(-8deg)", margin: "0 0 1px 1px" }}>
        <g stroke="#E7B93B" strokeWidth="1.4" strokeLinecap="round">
          <line x1="7.5" y1="17" x2="2" y2="3" /><line x1="7.5" y1="17" x2="7.5" y2="1" /><line x1="7.5" y1="17" x2="13" y2="3" />
        </g>
        <circle cx="2" cy="3" r="1.3" fill="#E7B93B" /><circle cx="7.5" cy="1" r="1.3" fill="#E7B93B" /><circle cx="13" cy="3" r="1.3" fill="#E7B93B" />
        <path d="M7.5 16 C 4.6 20, 4.6 27.5, 7.5 33.5 C 10.4 27.5, 10.4 20, 7.5 16 Z" fill="#F1EBDD" />
      </svg>
      <span style={word}>lk</span>
      <svg width={42 * s} height={34 * s} viewBox="0 0 60 48" style={{ transform: "skewX(-8deg)", margin: "0 -1px 1px 0" }}>
        <path d="M28 17 C 21 8, 8 0, 4 5 C 1 10, 8 21, 21 26 Z" fill="#E7893B" stroke="#F1EBDD" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M27 26 C 19 28, 13 36, 16 42 C 18.5 45.5, 25 41, 28 31 Z" fill="#E7893B" stroke="#F1EBDD" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M32 17 C 39 8, 52 0, 56 5 C 59 10, 52 21, 39 26 Z" fill="#E7893B" stroke="#F1EBDD" strokeWidth="3.4" strokeLinejoin="round" />
        <path d="M33 26 C 41 28, 47 36, 44 42 C 41.5 45.5, 35 41, 32 31 Z" fill="#E7893B" stroke="#F1EBDD" strokeWidth="3.4" strokeLinejoin="round" />
        <ellipse cx="30" cy="24" rx="2.8" ry="9.5" fill="#F1EBDD" />
        <circle cx="30" cy="12" r="3" fill="#F1EBDD" />
      </svg>
      <span style={word}>eed</span>
    </div>
  );
}

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

function Tag({ g, region, onClick, active, compact, common }) {
  const ks = isKeystone(tokenGenus(g), region);
  const name = common ?? genus(tokenGenus(g))?.common; // favor the common name; scientific stays, smaller
  const dot = compact ? 6 : 8;
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6, padding: compact ? "3px 8px" : "6px 10px", borderRadius: 999,
      border: `1.5px solid ${ks ? "#E7B93B" : "rgba(241,235,221,.35)"}`,
      background: active ? (ks ? "#E7B93B" : "#F1EBDD") : "rgba(16,26,20,.55)",
      color: active ? "#101A14" : "#F1EBDD", fontSize: compact ? 12 : 13, cursor: "pointer", backdropFilter: "blur(6px)",
    }}>
      {ks && <span title="Keystone in this ecoregion" style={{ width: dot, height: dot, borderRadius: 999, background: active ? "#101A14" : "#E7B93B", flexShrink: 0 }} />}
      {name ? <><span>{name}</span><em style={{ fontStyle: "italic", opacity: 0.65, fontSize: compact ? 11 : 12 }}>{g}</em></>
            : <em style={{ fontStyle: "italic" }}>{g}</em>}
    </button>
  );
}

function Footer({ setView }) {
  const sha = import.meta.env.VITE_BUILD_SHA;
  const build = sha ? `build ${sha} · ${import.meta.env.VITE_BUILD_DATE}` : "dev build";
  const link = { color: "#8a6420", textDecoration: "none", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit", fontSize: 13, padding: 0 };
  return (
    <div style={{ width: "100%", maxWidth: 360, marginTop: 36, paddingTop: 18, borderTop: "1px solid rgba(241,235,221,.15)", textAlign: "center" }}>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setView("how")} style={link}>How it works</button>
        <a href="https://github.com/redfameMN/keystone" target="_blank" rel="noopener noreferrer" style={link}>Source</a>
        <a href="https://github.com/redfameMN/keystone/issues" target="_blank" rel="noopener noreferrer" style={link}>Feedback</a>
      </div>
      <div style={{ fontSize: 12, opacity: 0.5, lineHeight: 1.7 }}>
        © {new Date().getFullYear()} Milkweed · milkweed.garden<br />
        v0.1.0 · {build}
      </div>
    </div>
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
  // Account search: type a name, open a profile.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState([]);
  const searchTimerRef = useRef(null);
  const onSearch = (v) => {
    setSearchQ(v);
    clearTimeout(searchTimerRef.current);
    if (v.trim().length < 2) { setSearchHits([]); return; }
    if (!hasSupabase) { const q = v.trim().toLowerCase(); setSearchHits([...new Set(posts.map((p) => p.user))].filter((u) => u.includes(q)).map((u) => ({ id: u, username: u }))); return; }
    searchTimerRef.current = setTimeout(async () => {
      try { setSearchHits(await searchProfiles(v)); } catch (e) { console.error("search", e); }
    }, 250);
  };
  const [askFor, setAskFor] = useState(null);       // post open in the "Ask the gardener" sheet
  const [qList, setQList] = useState([]);
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS);
  const [answerDraft, setAnswerDraft] = useState({});
  const openAsk = (post) => {
    setAskFor(post);
    if (hasSupabase) fetchQuestions(post.id).then(setQList).catch((e) => console.error("questions", e)); else setQList([]);
  };
  const [queue, setQueue] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [capExpanded, setCapExpanded] = useState({}); // post id -> caption expanded
  const [myGardens, setMyGardens] = useState([]); // this user's gardens + their projects
  const [newGardenForm, setNewGardenForm] = useState(null); // {name, zone} inline in composer
  const [newProjectForm, setNewProjectForm] = useState(null); // {type, name} inline in composer
  const [setupGarden, setSetupGarden] = useState(null); // {name, zone} on profile
  const [setupProjectFor, setSetupProjectFor] = useState(null); // gardenId adding a project on profile
  const [setupProject, setSetupProject] = useState({ type: "", name: "" });
  const [draft, setDraft] = useState({ stage: null, plants: [], caption: "", srcs: [], gardenId: "", projectId: "", places: [] });
  const [nativeStatus, setNativeStatus] = useState({}); // genus -> { nativeUs, inState }
  const refreshGardens = (uid) => fetchMyGardens(uid).then(setMyGardens).catch((e) => console.error("gardens", e));
  const fileRef = useRef();
  const scrollToRef = useRef(null); // post id to jump to when returning to the feed

  useEffect(() => {
    if (!hasSupabase) return;
    fetchPosts().then(setPosts).catch((e) => console.error("feed", e));
    fetchPrompts().then((p) => p.length && setPrompts(p)).catch((e) => console.error("prompts", e));
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    const onSession = async (session) => {
      try {
        const u = await ensureProfile(session);
        setUser(u);
        // Admins: prefetch the moderation queue so the header can show "Queue · n" only when there's work.
        if (u.isAdmin) Promise.all([fetchModerationQueue(), fetchIncidents()]).then(([q, inc]) => { setQueue(q); setIncidents(inc); }).catch((e) => console.error("queue", e));
        const a = await fetchMyActivity(u.id);
        setLiked(a.liked);
        setFollowing(a.following);
        refreshGardens(u.id);
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

  useEffect(() => {
    if (view === "feed" && scrollToRef.current) {
      document.getElementById(`post-${scrollToRef.current}`)?.scrollIntoView();
      scrollToRef.current = null;
    }
  }, [view, visible]);

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

  const selectedProject = () => {
    for (const g of myGardens) { const p = g.projects.find((x) => x.id === draft.projectId); if (p) return p; }
    return null;
  };
  // The composer's region for keystone hints comes from the chosen garden.
  const composerRegion = REGION_NAME[myGardens.find((x) => x.id === draft.gardenId)?.ecoregion_id] ?? "";
  const composerGarden = myGardens.find((x) => x.id === draft.gardenId);
  const composerState = composerGarden?.state ?? "";
  const composerRegionCodes = gardenRegions(composerGarden || {});
  const composerPlaceLabel = gardenPlaceLabel(composerGarden || {});

  // "Is this native here?" — look up native status for the tagged plants against
  // the garden's location (US state, or TDWG regions for other countries) whenever
  // either changes. Advisory only; never blocks a post.
  useEffect(() => {
    if (!hasSupabase || !draft.plants.length) { setNativeStatus({}); return; }
    let live = true;
    fetchNativeStatus(draft.plants, { state: composerState, regionCodes: composerRegionCodes })
      .then((s) => { if (live) setNativeStatus(s); }).catch((e) => console.error("native", e));
    return () => { live = false; };
  }, [draft.plants.join(","), composerState, composerRegionCodes.join(",")]);

  const publish = async () => {
    // A photo is the whole point — no photo, no post.
    if (!draft.srcs.length || !draft.plants.length || publishing) return;
    if (hasSupabase && user?.id) {
      setPublishing(true);
      try {
        const proj = selectedProject();
        const g = myGardens.find((x) => x.id === draft.gardenId);
        const res = await publishPost({ user, files: fileObjs.current, ecoregionId: g?.ecoregion_id ?? null, projectId: proj?.id ?? null, projectTypeId: proj?.project_type_id ?? null, stage: draft.stage, plants: draft.plants, caption: draft.caption, places: draft.places.map((x) => x.id) });
        setPosts(await fetchPosts());
        if (res.status === "rejected") setNotice("That photo can't be posted here — it didn't pass screening.");
        else if (res.status !== "live") setNotice("Your garden is in review — it'll appear in the feed once approved.");
      } catch (e) {
        console.error("publish", e);
        // Server messages (rate limits, etc.) are written for humans — show as-is.
        setNotice(e.message ?? "Couldn't publish — please try again.");
        return;
      } finally {
        setPublishing(false);
      }
    } else {
      const proj = selectedProject();
      const g = myGardens.find((x) => x.id === draft.gardenId);
      setPosts((ps) => [{ id: Date.now(), user: user.name, region: REGION_NAME[g?.ecoregion_id] ?? "", project: proj?.project_type_id, stage: draft.stage, plants: draft.plants, caption: draft.caption, likes: 0, ago: "now", srcs: draft.srcs, garden: g?.name || null, zone: g?.zone || null, projectId: proj?.id, projectName: proj?.name }, ...ps]);
    }
    fileObjs.current = [];
    setDraft({ stage: null, plants: [], caption: "", srcs: [], gardenId: draft.gardenId, projectId: "", places: [] });
    setView("feed");
  };

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
    r.readAsDataURL(cleaned[0]); // plant ID runs on the first photo (always a JPEG after processPhoto)
  };

  const identify = async () => {
    if (!fileB64.current) return;
    setIdState({ status: "loading", suggestions: [] });
    try {
      const s = await identifyPhoto(fileB64.current, "jpg");
      setIdState({ status: s.length ? "done" : "empty", suggestions: s });
    } catch (err) {
      setIdState({ status: "error", suggestions: [], msg: String(err.message) });
    }
  };

  // Selected-plant helpers. draft.plants holds tag tokens (a bare genus like
  // "Quercus", or a binomial like "Wisteria sinensis"); plantMeta caches common
  // names for tokens outside the built-in vocabulary (from search / ID).
  const plantMeta = useRef({});
  const [plantQuery, setPlantQuery] = useState("");
  const [plantResults, setPlantResults] = useState([]);
  const searchTimer = useRef(null);
  const plantLabel = (g) => genus(g)?.common ?? plantMeta.current[g] ?? null;

  const addPlant = async (g, common) => {
    if (!g) return;
    if (common) plantMeta.current[g] = common;
    // One tag per genus per post (post_plant PK). Picking a species replaces the
    // genus's existing tag (genus → species, or one species → another).
    const gen0 = tokenGenus(g);
    setDraft((d) => d.plants.includes(g) ? d : { ...d, plants: [...d.plants.filter((t) => tokenGenus(t) !== gen0), g] });
    setPlantQuery(""); setPlantResults([]);
    // Ensure the genus row exists (post_plant.genus FKs plant_genus), whether the
    // tag is a bare genus or a "Genus species" token.
    const gen = tokenGenus(g);
    if (hasSupabase && !genus(gen)) { try { await ensureGenus(gen, genus(gen)?.common ?? null); } catch (e) { console.error("genus", e); } }
    if (hasSupabase && common) { try { await ensureSpecies(g, common); } catch (e) { console.error("species", e); } }
  };
  const removePlant = (g) => setDraft((d) => ({ ...d, plants: d.plants.filter((y) => y !== g) }));

  const onPlantSearch = (v) => {
    setPlantQuery(v);
    clearTimeout(searchTimer.current);
    if (v.trim().length < 2) { setPlantResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try { setPlantResults(await searchPlants(v)); } catch (e) { console.error("search", e); }
    }, 350);
  };

  // Place tags (featured park accounts): search-as-you-type, then chips on the draft.
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState([]);
  const placeTimer = useRef(null);
  const onPlaceSearch = (v) => {
    setPlaceQuery(v);
    clearTimeout(placeTimer.current);
    if (!hasSupabase || v.trim().length < 2) { setPlaceResults([]); return; }
    placeTimer.current = setTimeout(async () => {
      try { setPlaceResults(await searchPlaces(v)); } catch (e) { console.error("places", e); }
    }, 300);
  };
  const addPlace = (pl) => {
    setDraft((d) => (d.places.some((x) => x.id === pl.id) ? d : { ...d, places: [...d.places, pl] }));
    setPlaceQuery(""); setPlaceResults([]);
  };

  const acceptSuggestion = (s) => {
    // Keep the identifier's binomial when it gives one (enables the species-level
    // native check); fall back to the genus otherwise.
    const token = /^[A-Z][a-z]+ [a-z]+/.test(s.name) ? s.name.split(" ").slice(0, 2).join(" ") : s.name.split(" ")[0];
    addPlant(token, s.common ?? genus(tokenGenus(token))?.common);
    setIdState((st) => ({ ...st, suggestions: st.suggestions.filter((x) => x.name !== s.name) }));
  };

  // 100dvh (dynamic viewport height) tracks the *visible* area on mobile, so the
  // feed and the corner Post button aren't hidden behind the browser toolbar.
  const shell = { fontFamily: "Georgia, 'Iowan Old Style', serif", background: "#101A14", color: "#F1EBDD", height: "100dvh", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" };

  return (
    <div style={shell}>
      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "14px 16px", background: "linear-gradient(rgba(16,26,20,.85), rgba(16,26,20,0))" }}>
        <Wordmark size={24} />
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {user?.isAdmin && (queue.length + incidents.length > 0 || view === "mod") && (
            <button onClick={async () => { setView("mod"); try { const [q, inc] = await Promise.all([fetchModerationQueue(), fetchIncidents()]); setQueue(q); setIncidents(inc); } catch (e) { console.error("queue", e); } }} style={btn(view === "mod")}>Queue · {queue.length + incidents.length}</button>
          )}
          <button onClick={() => { setSearchOpen(true); setSearchQ(""); setSearchHits([]); }} style={{ ...btn(false), display: "inline-flex", alignItems: "center", gap: 6 }} title="Search accounts, parks and places" aria-label="Search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.6-4.6" /></svg>
          </button>
          <button onClick={() => setView(view === "plants" ? "feed" : "plants")} style={btn(view === "plants")}>Plants</button>
          <button onClick={() => setView(view === "about" ? "feed" : "about")} style={btn(view === "about")} title="About & support">♡</button>
          {user
            ? <button onClick={() => { if (hasSupabase && window.confirm("Sign out?")) signOut(); }} style={{ ...btn(false), border: "none", opacity: 0.8, fontSize: 13 }}>@{user.name}</button>
            : <button onClick={() => setAuthOpen(true)} style={btn(false)}>Sign in</button>}
        </div>
      {/* Filter row lives inside the header's flow (full-width second row), so it always
          sits below the nav however many lines the nav wraps to. */}
      {view === "feed" && (
        <div style={{ flexBasis: "100%", display: "flex", gap: 8, alignItems: "center", overflowX: "auto", scrollbarWidth: "none" }}>
          <button onClick={() => setFiltersOpen(true)} style={btn(activeFilters > 0)}>{activeFilters ? `Filters · ${activeFilters}` : "Browse by journey"}</button>
          {filter.project && <button onClick={() => setFilter({ ...filter, project: null })} style={chip}>{proj(filter.project).name} ×</button>}
          {filter.stage && <button onClick={() => setFilter({ ...filter, stage: null })} style={chip}>{stage(filter.stage).name} ×</button>}
          {filter.plant && <button onClick={() => setFilter({ ...filter, plant: null })} style={chip}><em>{filter.plant}</em> ×</button>}
          {filter.author && <button onClick={() => setFilter({ ...filter, author: null })} style={chip}>@{filter.author} ×</button>}
        </div>
      )}
      </div>

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
              <button onClick={() => setFilter({ plant: null, project: null, stage: null, author: null })} style={{ ...btn(false), background: "transparent", backdropFilter: "none", boxShadow: "none", color: "#101A14", borderColor: "rgba(16,26,20,.3)" }}>Clear</button>
              <button onClick={() => setFiltersOpen(false)} style={{ ...btn(true), flex: 1 }}>Show {visible.length} garden{visible.length === 1 ? "" : "s"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      {view === "feed" && (
        <div style={{ height: "100%", overflowY: "auto", scrollSnapType: "y mandatory", overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" }}>
          {visible.length === 0 && (
            <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 32, textAlign: "center" }}>
              <div>No gardens match those filters yet. <button onClick={startPost} style={btn(true)}>Post the first one</button></div>
            </div>
          )}
          {visible.map((p) => (
            <article key={p.id} id={`post-${p.id}`} style={{ height: "100%", position: "relative", scrollSnapAlign: "start" }}>
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
                {user?.id && p.authorId === user.id ? (
                  <button style={rail} title={p.pinned ? "Unpin from your profile" : "Pin to the top of your profile"}
                    onClick={async () => {
                      try {
                        await setPinned(p.id, !p.pinned);
                        setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, pinned: !p.pinned } : x)));
                      } catch (e) { console.error("pin", e); }
                    }}>
                    <span style={{ fontSize: 20, filter: p.pinned ? "none" : "grayscale(1) opacity(.75)" }}>📌</span>
                    <span style={{ fontSize: 11, opacity: 0.8, color: p.pinned ? "#E7B93B" : "#F1EBDD" }}>{p.pinned ? "Pinned" : "Pin"}</span>
                  </button>
                ) : (
                  <button onClick={() => requireAccount(() => setReportFor(p.id))} style={rail} title="Report this post">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F1EBDD" strokeWidth="1.8"><path d="M5 21V4h13l-2.5 4L18.5 12H5" /></svg>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>Report</span>
                  </button>
                )}
              </div>

              {/* Caption block */}
              <div style={{ position: "absolute", left: 16, right: 80, bottom: 28 }}>
                <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 4 }}>
                  <button onClick={() => openProfile(p.user)} style={{ background: "none", border: "none", padding: 0, color: "inherit", fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(241,235,221,.35)" }}>@{p.user}</button>
                  {p.user.startsWith("demo_") && <span title="Seed content posted by the Milkweed team, not a real gardener" style={{ margin: "0 2px 0 6px", padding: "1px 8px", borderRadius: 999, background: "#E7B93B", color: "#101A14", fontSize: 11, verticalAlign: "1px" }}>demo</span>}
                  {p.user.startsWith("pinnacle_") && <span title="Curated by the Milkweed team — a showcase, not the subject's own account" style={{ margin: "0 2px 0 6px", padding: "1px 8px", borderRadius: 999, background: "#F1EBDD", color: "#101A14", fontSize: 11, verticalAlign: "1px" }}>★ featured</span>}
                  {(p.region || p.country) && <>{" "}· {p.region || COUNTRY_NAME[p.country] || p.country}</>} · {p.ago}
                  {p.garden && <> · <em>{p.garden}</em></>}{p.zone && <> · zone {p.zone}</>}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {p.project && <button onClick={() => setFilter({ ...filter, project: p.project })} style={chip}>{proj(p.project).name}</button>}
                  {p.stage && <button onClick={() => setFilter({ ...filter, stage: p.stage })} style={chip}>{stage(p.stage).name}</button>}
                  <button onClick={() => openAsk(p)} style={chip} title="Ask the gardener a question">Ask</button>
                  {(p.tagged ?? []).map((u) => <button key={u} onClick={() => openProfile(u)} style={chip} title="Tagged place">📍 @{u}</button>)}
                </div>
                {p.caption && (() => {
                  const open = capExpanded[p.id];
                  const longCap = p.caption.length > 90;
                  return (
                    <div style={{ margin: "0 0 12px" }}>
                      <p style={{ fontSize: 16, lineHeight: 1.35, margin: 0, textShadow: "0 1px 3px rgba(0,0,0,.5)",
                        ...(open || !longCap ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>
                        {p.caption}
                      </p>
                      {longCap && (
                        <button onClick={() => setCapExpanded((c) => ({ ...c, [p.id]: !open }))}
                          style={{ background: "none", border: "none", padding: 0, marginTop: 2, color: "#E7B93B", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                          {open ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  );
                })()}
                {p.credits?.length > 0 && (
                  <div style={{ fontSize: 11, opacity: 0.7, margin: "0 0 6px", textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>
                    Photo: {p.credits[0].credit}{p.credits[0].license && !p.credits[0].credit.includes(p.credits[0].license) ? ` · ${p.credits[0].license}` : ""}
                    {p.credits[0].url && <> · <a href={p.credits[0].url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>source</a></>}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.plants.map((g) => <Tag key={g} g={g} region={p.region} common={p.plantCommon?.[g]} onClick={() => setFilter({ ...filter, plant: g })} />)}
                </div>
                {p.plants.some((g) => isKeystone(tokenGenus(g), p.region)) && (
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
              {profile.parents?.length > 0 && (
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>Part of {profile.parents.map((u, i) => (
                  <span key={u}>{i > 0 && " · "}<button onClick={() => openProfile(u)} style={{ background: "none", border: "none", padding: 0, color: "#E7B93B", fontFamily: "inherit", fontSize: "inherit", cursor: "pointer" }}>@{u}</button></span>
                ))}</div>
              )}
              {profile.places?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>Parks &amp; places</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {profile.places.map((pl) => (
                      <button key={pl.id} onClick={() => openProfile(pl.username)} style={chip}>📍 @{pl.username}{pl.count ? ` · ${pl.count}` : ""}</button>
                    ))}
                  </div>
                </div>
              )}
              {profile.username.startsWith("pinnacle_") && (
                <div style={{ fontSize: 13, color: "#E7B93B", marginTop: 8, lineHeight: 1.4 }}>
                  {profile.places?.length
                    ? <>Navigate the beauty of our parks digitally, then in person — pick a place above, visit, post, and tag the park to add your photo.</>
                    : <>Navigate the beauty of our parks digitally, then in person — visit, post, and tag <b>@{profile.username}</b> to add your photo here.</>}
                </div>
              )}
            </div>
          </div>
          {user?.name !== profile.username && (
            <button onClick={() => toggleFollow({ user: profile.username, authorId: profile.id })} style={{ ...btn(!following[profile.username]), marginBottom: 14 }}>
              {following[profile.username] ? "Following" : "Follow"}
            </button>
          )}
          {/* Own-profile: set up gardens and the projects inside them */}
          {user?.name === profile.username && hasSupabase && (
            <div style={{ marginBottom: 20, padding: 14, borderRadius: 12, background: "#1A2A20" }}>
              <div style={{ fontSize: 15, marginBottom: 8 }}>My gardens</div>
              {myGardens.length === 0 && <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>Name a garden (a place — “Front yard”), then add the projects you're working on in it.</div>}
              {myGardens.map((g) => (
                <div key={g.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontStyle: "italic" }}>{g.name}{g.zone ? <span style={{ opacity: 0.6, fontStyle: "normal", fontSize: 12 }}> · zone {g.zone}</span> : null}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                    {g.projects.map((p) => <span key={p.id} style={{ ...chip, cursor: "default" }}>{p.name || proj(p.project_type_id)?.name || "Project"}</span>)}
                    <button onClick={() => { setSetupProjectFor(g.id); setSetupProject({ type: "", name: "" }); }} style={{ ...chip, borderStyle: "dashed" }}>＋ project</button>
                  </div>
                  {setupProjectFor === g.id && (
                    <div style={{ marginTop: 8 }}>
                      <select value={setupProject.type} onChange={(e) => setSetupProject({ ...setupProject, type: e.target.value })} style={{ ...input, marginTop: 0 }}>
                        <option value="">Project type…</option>{PROJECTS.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                      </select>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input placeholder="Label (optional)" value={setupProject.name} onChange={(e) => setSetupProject({ ...setupProject, name: e.target.value })} style={{ ...input, marginTop: 0, flex: 2 }} />
                        <button style={{ ...btn(true), opacity: setupProject.type ? 1 : 0.4 }} disabled={!setupProject.type}
                          onClick={async () => { try { await addProject(user.id, g.id, setupProject.type, setupProject.name); await refreshGardens(user.id); setProfile(await fetchProfile(profile.username)); setSetupProjectFor(null); } catch (e) { setNotice(e.message ?? "Couldn't add project"); } }}>Add</button>
                        <button style={btn(false)} onClick={() => setSetupProjectFor(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {setupGarden ? (
                <div style={{ marginTop: 6 }}>
                  <input placeholder="Garden name (e.g. Front yard)" value={setupGarden.name} onChange={(e) => setSetupGarden({ ...setupGarden, name: e.target.value })} style={{ ...input, marginTop: 0 }} />
                  <select value={setupGarden.country} onChange={(e) => setSetupGarden({ ...setupGarden, country: e.target.value })} style={{ ...input, marginTop: 8 }}>
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                  {setupGarden.country === "US" && (
                    <select value={setupGarden.region} onChange={(e) => setSetupGarden({ ...setupGarden, region: e.target.value })} style={{ ...input, marginTop: 8 }}>
                      <option value="">Ecoregion…</option>{ECOREGIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {setupGarden.country === "US" && (
                      <select value={setupGarden.state} onChange={(e) => setSetupGarden({ ...setupGarden, state: e.target.value })} style={{ ...input, marginTop: 0, flex: 1 }}>
                        <option value="">State (for native check)…</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                      </select>
                    )}
                    <select value={setupGarden.zone} onChange={(e) => setSetupGarden({ ...setupGarden, zone: e.target.value })} style={{ ...input, marginTop: 0, flex: 1 }}>
                      <option value="">Zone (optional)</option>{ZONES.map((z) => <option key={z}>{z}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={{ ...btn(true), flex: 1, opacity: setupGarden.name.trim().length > 1 && (setupGarden.country !== "US" || setupGarden.region) ? 1 : 0.4 }} disabled={setupGarden.name.trim().length < 2 || (setupGarden.country === "US" && !setupGarden.region)}
                      onClick={async () => { try { const us = setupGarden.country === "US"; await createGarden(user.id, setupGarden.name, setupGarden.zone || null, us ? ECOREGION_IDS[setupGarden.region] : null, us ? (setupGarden.state || null) : null, setupGarden.country); await refreshGardens(user.id); setSetupGarden(null); } catch (e) { setNotice(e.message ?? "Couldn't create garden"); } }}>Create</button>
                    <button style={btn(false)} onClick={() => setSetupGarden(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setSetupGarden({ name: "", zone: "", region: "", state: "", country: "US" })} style={{ ...btn(false), marginTop: 4 }}>＋ New garden</button>
              )}
            </div>
          )}
          {(() => {
            // Group posts into gardens, then projects within each garden, each project
            // ordered as a journey (before → prep → year 1 → … → established).
            const stageIdx = (s) => { const i = STAGES.findIndex((x) => x.id === s); return i < 0 ? 99 : i; };
            const order = []; const byGarden = {}; const loose = [];
            for (const p of profile.posts) {
              if (p.garden) {
                const gk = p.garden;
                if (!byGarden[gk]) { byGarden[gk] = { name: gk, zone: p.zone, projOrder: [], byProj: {} }; order.push(byGarden[gk]); }
                const g = byGarden[gk];
                const pk = p.projectId || p.projectName || p.project || "_";
                if (!g.byProj[pk]) { g.byProj[pk] = { label: p.projectName || proj(p.project)?.name || null, posts: [] }; g.projOrder.push(g.byProj[pk]); }
                g.byProj[pk].posts.push(p);
              } else loose.push(p);
            }
            order.forEach((g) => g.projOrder.forEach((pr) => pr.posts.sort((a, b) => stageIdx(a.stage) - stageIdx(b.stage) || (a.id > b.id ? 1 : -1))));

            const openPost = (p) => { scrollToRef.current = p.id; setFilter({ ...filter, author: profile.username }); setView("feed"); };
            const thumb = (p, opts = {}) => (
              <button key={p.id} onClick={() => openPost(p)}
                style={{ position: "relative", width: opts.w ?? "100%", flexShrink: 0, aspectRatio: "3/4", borderRadius: 10, overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: "#1A2A20" }}>
                {p.srcs?.[0]
                  ? <img src={p.srcs[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : <PlantPhoto plants={p.plants} />}
                {p.pinned && <span style={{ position: "absolute", left: 5, top: 5, padding: "2px 6px", borderRadius: 999, background: "#E7B93B", color: "#101A14", fontSize: 10 }}>📌</span>}
                {p.stage && <span style={{ position: "absolute", left: 5, bottom: 5, padding: "2px 6px", borderRadius: 999, background: "rgba(16,26,20,.78)", color: "#F1EBDD", fontSize: 10 }}>{stage(p.stage)?.name}</span>}
              </button>
            );

            return (
              <>
                {order.map((g) => (
                  <div key={g.name} style={{ marginBottom: 22 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 17, fontStyle: "italic" }}>{g.name}</span>
                      {g.zone && <span style={{ fontSize: 12, opacity: 0.6 }}>zone {g.zone}</span>}
                    </div>
                    {g.projOrder.map((pr, i) => (
                      <div key={i} style={{ marginBottom: 12 }}>
                        {(g.projOrder.length > 1 || pr.label) && <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 5 }}>{pr.label || "Project"} · {pr.posts.length} in the journey</div>}
                        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                          {pr.posts.map((p) => thumb(p, { w: 116 }))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {loose.length > 0 && (
                  <>
                    {order.length > 0 && <div style={{ fontSize: 13, opacity: 0.6, margin: "6px 0 8px" }}>Other posts</div>}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                      {loose.map((p) => thumb(p))}
                    </div>
                  </>
                )}
                {profile.posts.length === 0 && <div style={{ opacity: 0.6, fontSize: 14 }}>No gardens posted yet.</div>}
              </>
            );
          })()}
        </div>
      )}

      {/* About & support the creator */}
      {view === "about" && (
        <div style={{ height: "100%", overflowY: "auto", padding: "80px 24px 100px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <Wordmark size={34} />
          <p style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.85, margin: "22px 0 6px", maxWidth: 340 }}>
            Milkweed is a free, ad-free feed for native gardens — built by one gardener who thinks
            lawns make better prairies. Every post feeds the map of habitat coming back, yard by yard.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.7, margin: "0 0 22px", maxWidth: 340 }}>
            If Milkweed helped your garden grow, you can help keep the servers watered.
          </p>
          <a href="https://venmo.com/u/PugsPlantsPrints" target="_blank" rel="noopener noreferrer"
            style={{ ...btn(true), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", fontSize: 15 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#101A14" strokeWidth="1.8"><path d="M17 8h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM7 2v3M11 2v3M15 2v3" /></svg>
            Buy me a coffee
          </a>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 10 }}>Venmo · @PugsPlantsPrints</div>
          <button onClick={() => setView("how")} style={{ ...btn(false), marginTop: 28 }}>How Milkweed handles your data →</button>
          <div style={{ fontSize: 12, opacity: 0.5, lineHeight: 1.6, marginTop: 24, maxWidth: 360 }}>
            Keystone plant data from the National Wildlife Federation's ecoregion guides (Tallamy host-plant research).
            Demo photos from Wikimedia Commons contributors (CC). Every photo you upload is stripped of location
            data before it leaves your device.
          </div>
          <Footer setView={setView} />
        </div>
      )}

      {/* How it works / privacy */}
      {view === "how" && (
        <div style={{ height: "100%", overflowY: "auto", padding: "80px 20px 100px" }}>
          <div style={{ maxWidth: 400, margin: "0 auto" }}>
            <button onClick={() => setView("about")} style={btn(false)}>‹ Back</button>
            <h1 style={{ fontSize: 26, fontWeight: "normal", fontStyle: "italic", margin: "18px 0 6px" }}>How Milkweed works</h1>
            <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.75, margin: "0 0 24px" }}>
              A garden feed shouldn't spy on you. Here's exactly what happens with your data — no fine print.
            </p>
            {[
              { t: "Browse without an account", d: "Look at every garden without signing up and without anything following you around. There are no ads, no cookies, and no advertising trackers. To see how many people visit, we use Cloudflare's privacy-first analytics — it counts page views without cookies, without personal data, and without tracking you across other sites.",
                i: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 100-6 3 3 0 000 6z" },
              { t: "Your location stays yours", d: "Before a photo ever leaves your device, your browser re-saves it and drops all its hidden metadata — including the GPS coordinates phones bury in photos. We only ever store the broad region you pick from a list, never where the photo was actually taken.",
                i: "M12 21s-6-5.7-6-10a6 6 0 1112 0c0 4.3-6 10-6 10z M12 11a2 2 0 100-4 2 2 0 000 4z" },
              { t: "AI, only where we tell you", d: "We use AI in exactly two places, both on purpose: (1) plant suggestions run only when you tap “Suggest plants” — never automatically; (2) every uploaded photo is automatically checked for safety before it can go public, which is how the feed stays gardens-only and safe. Images sent for either purpose are used only for that check — never to profile you, build an ad profile, or train models.",
                i: "M12 3l1.9 4.8L19 9l-4.8 1.9L12 16l-1.9-5.1L5 9l5.1-1.2z M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" },
              { t: "What we keep — and only this", d: "To post, we store your email (to sign you in), your username, and the gardens you choose to share. That's the whole list. We never sell it, rent it, or hand it to advertisers, because there are no advertisers.",
                i: "M6 10V8a6 6 0 1112 0v2 M5 10h14v10H5z M12 14v3" },
              { t: "No passwords to steal", d: "Signing in sends a one-time link to your email — there's no password to forget, reuse, or leak. Nothing sensitive is stored on our side.",
                i: "M4 8h16v12H4z M8 8V6a4 4 0 018 0v2 M12 13v3" },
            ].map((row) => (
              <div key={row.t} style={{ display: "flex", gap: 14, marginBottom: 20, alignItems: "flex-start" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#E7B93B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d={row.i} /></svg>
                <div>
                  <div style={{ fontSize: 16, marginBottom: 3 }}>{row.t}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, opacity: 0.8 }}>{row.d}</div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 12, opacity: 0.55, lineHeight: 1.6, marginTop: 26, paddingTop: 16, borderTop: "1px solid rgba(241,235,221,.15)" }}>
              Milkweed is open source — the code that does all of this is public at github.com/redfameMN/keystone, so you don't have to take our word for any of it.
            </div>
          </div>
        </div>
      )}

      {/* Moderation queue (admins only) */}
      {view === "mod" && (
        <div style={{ height: "100%", overflowY: "auto", padding: "70px 16px 100px" }}>
          {incidents.length > 0 && (
            <div style={{ marginBottom: 18, padding: 14, borderRadius: 12, border: "1.5px solid #a63244", background: "rgba(166,50,68,.12)" }}>
              <div style={{ fontSize: 15, color: "#e79aa4", marginBottom: 6 }}>⚠ {incidents.length} child-safety incident{incidents.length === 1 ? "" : "s"} — action required</div>
              <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.5, marginBottom: 10 }}>
                Suspected child sexual content was detected and removed from public view. The image is preserved
                privately as evidence — <b>do not attempt to view it</b>. US law requires reporting to NCMEC
                (report.cybertip.org). See docs/safety-csam.md. Mark reported once you have filed.
              </div>
              {incidents.map((inc) => (
                <div key={inc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 0", borderTop: "1px solid rgba(241,235,221,.15)" }}>
                  <span>#{inc.id} · {new Date(inc.created_at).toLocaleDateString()} · author {String(inc.author_id).slice(0, 8)}</span>
                  <button onClick={async () => { try { await markIncidentReported(inc.id); setIncidents(await fetchIncidents()); } catch (e) { console.error("incident", e); } }} style={{ ...btn(false), fontSize: 12, padding: "5px 10px" }}>Mark reported</button>
                </div>
              ))}
            </div>
          )}
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

      {/* Post composer — scrolling form with a permanently-docked action bar */}
      {view === "post" && (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "70px 16px 12px" }}>
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
              <button onClick={identify} disabled={idState.status === "loading"} style={btn(false)}>
                {idState.status === "loading" ? "Looking at your photo…" : "Suggest plants from photo"}
              </button>
              {idState.status === "empty" && <div style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>No plants recognized — tag them by hand below.</div>}
              {idState.suggestions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>Tap to confirm — nothing is tagged until you do</div>
                  {idState.suggestions.map((s) => {
                    const g = s.name.split(" ")[0];
                    const ks = isKeystone(g, composerRegion);
                    const common = s.common ?? genus(g)?.common; // species name from the identifier, else our genus vocabulary
                    return (
                      <button key={s.name} onClick={() => acceptSuggestion(s)} style={{ ...btn(false), display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6, borderRadius: 10, borderColor: ks ? "#E7B93B" : undefined }}>
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

          <label style={lbl}>Which garden?</label>
          <select value={newGardenForm ? "__new" : draft.gardenId}
            onChange={(e) => { const v = e.target.value; if (v === "__new") setNewGardenForm({ name: "", zone: "", region: "", state: "", country: "US" }); else { setNewGardenForm(null); setDraft({ ...draft, gardenId: v, projectId: "" }); } }} style={input}>
            <option value="">No garden — just a post</option>
            {myGardens.map((g) => <option key={g.id} value={g.id}>{g.name}{g.zone ? ` · zone ${g.zone}` : ""}</option>)}
            <option value="__new">＋ New garden…</option>
          </select>
          {newGardenForm && (
            <div style={{ marginTop: 8 }}>
              <input placeholder="Garden name (e.g. Front yard)" value={newGardenForm.name} onChange={(e) => setNewGardenForm({ ...newGardenForm, name: e.target.value })} style={{ ...input, marginTop: 0 }} />
              <select value={newGardenForm.country} onChange={(e) => setNewGardenForm({ ...newGardenForm, country: e.target.value })} style={{ ...input, marginTop: 8 }}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              {newGardenForm.country === "US" && (
                <select value={newGardenForm.region} onChange={(e) => setNewGardenForm({ ...newGardenForm, region: e.target.value })} style={{ ...input, marginTop: 8 }}>
                  <option value="">Ecoregion…</option>{ECOREGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {newGardenForm.country === "US" && (
                  <select value={newGardenForm.state} onChange={(e) => setNewGardenForm({ ...newGardenForm, state: e.target.value })} style={{ ...input, marginTop: 0, flex: 1 }}>
                    <option value="">State (for native check)…</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                  </select>
                )}
                <select value={newGardenForm.zone} onChange={(e) => setNewGardenForm({ ...newGardenForm, zone: e.target.value })} style={{ ...input, marginTop: 0, flex: 1 }}>
                  <option value="">Zone (optional)</option>{ZONES.map((z) => <option key={z}>{z}</option>)}
                </select>
              </div>
              <button style={{ ...btn(true), width: "100%", marginTop: 8, opacity: newGardenForm.name.trim().length > 1 && (newGardenForm.country !== "US" || newGardenForm.region) ? 1 : 0.4 }} disabled={newGardenForm.name.trim().length < 2 || (newGardenForm.country === "US" && !newGardenForm.region)}
                onClick={async () => { try { const us = newGardenForm.country === "US"; const g = await createGarden(user.id, newGardenForm.name, newGardenForm.zone || null, us ? ECOREGION_IDS[newGardenForm.region] : null, us ? (newGardenForm.state || null) : null, newGardenForm.country); await refreshGardens(user.id); setDraft({ ...draft, gardenId: g.id, projectId: "" }); setNewGardenForm(null); } catch (e) { setNotice(e.message ?? "Couldn't create garden"); } }}>Create garden</button>
            </div>
          )}

          {draft.gardenId && (() => {
            const g = myGardens.find((x) => x.id === draft.gardenId);
            return (
              <>
                <label style={lbl}>Which project?</label>
                <select value={newProjectForm ? "__new" : draft.projectId}
                  onChange={(e) => { const v = e.target.value; if (v === "__new") setNewProjectForm({ type: "", name: "" }); else { setNewProjectForm(null); setDraft({ ...draft, projectId: v }); } }} style={input}>
                  <option value="">Pick a project</option>
                  {(g?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name || proj(p.project_type_id)?.name || "Project"}</option>)}
                  <option value="__new">＋ New project…</option>
                </select>
                {newProjectForm && (
                  <div style={{ marginTop: 8 }}>
                    <select value={newProjectForm.type} onChange={(e) => setNewProjectForm({ ...newProjectForm, type: e.target.value })} style={{ ...input, marginTop: 0 }}>
                      <option value="">Project type…</option>{PROJECTS.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                    </select>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input placeholder="Label (optional, e.g. North bed)" value={newProjectForm.name} onChange={(e) => setNewProjectForm({ ...newProjectForm, name: e.target.value })} style={{ ...input, marginTop: 0, flex: 2 }} />
                      <button style={{ ...btn(true), opacity: newProjectForm.type ? 1 : 0.4 }} disabled={!newProjectForm.type}
                        onClick={async () => { try { const p = await addProject(user.id, draft.gardenId, newProjectForm.type, newProjectForm.name); await refreshGardens(user.id); setDraft({ ...draft, projectId: p.id }); setNewProjectForm(null); } catch (e) { setNotice(e.message ?? "Couldn't add project"); } }}>Add</button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          <label style={lbl}>Where is it at?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {STAGES.map((st) => <button key={st.id} onClick={() => setDraft({ ...draft, stage: draft.stage === st.id ? null : st.id })} style={pickDark(draft.stage === st.id)}>{st.name}</button>)}
          </div>
          {draft.gardenId && (composerRegion || composerPlaceLabel) && <div style={{ fontSize: 12, opacity: 0.55, marginTop: 8 }}>{composerRegion ? `Region: ${composerRegion}` : "Location"}{composerGarden?.zone ? ` · zone ${composerGarden.zone}` : ""}{composerPlaceLabel ? ` · ${composerPlaceLabel}` : ""} (from your garden)</div>}

          <label style={lbl}>What's growing in it? (required)</label>
          {draft.plants.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {draft.plants.map((g) => (
                <button key={g} onClick={() => removePlant(g)} title="Remove"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: "none", background: "#E7B93B", color: "#101A14", fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>
                  {plantLabel(g) ? <><span>{plantLabel(g)}</span><em style={{ opacity: 0.7 }}>{g}</em></> : <em>{g}</em>}
                  <span style={{ fontWeight: "bold" }}>×</span>
                </button>
              ))}
            </div>
          )}
          {(() => {
            // Native-status advisories for the tagged plants. Trust-safe: only shown
            // when we're confident (curated non-native, or a state we have data for).
            const warns = draft.plants.map((g) => {
              const s = nativeStatus[g];
              if (!s) return null;
              // Backed by complete genus-level WCVP data (every accepted species,
              // all genera), so a genus absent from the place's native list can be
              // trusted as non-native. inState === true (e.g. English ivy in the UK)
              // means native here → no warning; null means we have no data → silent.
              if (s.inState === false) {
                const bad = s.nativeUs === false; // a known invasive → stronger styling
                return { g, bad, msg: `${g} isn't recorded as native in ${composerPlaceLabel || "your area"}${bad ? " — likely introduced or invasive" : ""}.` };
              }
              return null;
            }).filter(Boolean);
            if (!warns.length) return null;
            return (
              <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {warns.map((w) => (
                  <div key={w.g} style={{ fontSize: 12, lineHeight: 1.4, padding: "8px 10px", borderRadius: 10,
                    background: w.bad ? "rgba(201,118,95,.16)" : "rgba(231,185,59,.14)",
                    border: `1px solid ${w.bad ? "rgba(201,118,95,.5)" : "rgba(231,185,59,.45)"}`, color: "#F1EBDD" }}>
                    {w.bad ? "⚠ " : "◔ "}{w.msg} You can still post it — this is just a heads-up.
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{ position: "relative" }}>
            <input value={plantQuery} onChange={(e) => onPlantSearch(e.target.value)} placeholder="Search any plant by name…" style={{ ...input, marginTop: 0 }} />
            {plantResults.length > 0 && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 8, background: "#1A2A20", border: "1px solid rgba(241,235,221,.25)", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 20px rgba(0,0,0,.5)" }}>
                {plantResults.map((r) => (
                  <button key={r.token} onClick={() => addPlant(r.token, r.common)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", borderBottom: "1px solid rgba(241,235,221,.1)", color: "#F1EBDD", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                    {r.common ? <span>{r.common} · <em style={{ opacity: 0.7, fontSize: 12 }}>{r.token}</em></span> : <em>{r.token}</em>}
                    {r.rank === "genus" && <span style={{ opacity: 0.5, fontSize: 11 }}> · whole genus</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, margin: "10px 0 6px" }}>Or tap a common native:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {GENERA.map((x) => (
              <Tag key={x.g} g={x.g} region={composerRegion} active={draft.plants.includes(x.g)} compact
                onClick={() => (draft.plants.includes(x.g) ? removePlant(x.g) : addPlant(x.g, genus(x.g)?.common))} />
            ))}
          </div>

          <label style={lbl}>Tag a place (optional)</label>
          {draft.places.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {draft.places.map((pl) => (
                <button key={pl.id} onClick={() => setDraft({ ...draft, places: draft.places.filter((x) => x.id !== pl.id) })} title="Remove"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, border: "none", background: "#F1EBDD", color: "#101A14", fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>
                  📍 @{pl.username}<span style={{ fontWeight: "bold" }}>×</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ position: "relative" }}>
            <input value={placeQuery} onChange={(e) => onPlaceSearch(e.target.value)} placeholder="Posting from a park? Tag it — e.g. Ojibway" style={{ ...input, marginTop: 0 }} />
            {placeResults.length > 0 && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 8, background: "#1A2A20", border: "1px solid rgba(241,235,221,.25)", borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 20px rgba(0,0,0,.5)" }}>
                {placeResults.map((pl) => (
                  <button key={pl.id} onClick={() => addPlace(pl)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", borderBottom: "1px solid rgba(241,235,221,.1)", color: "#F1EBDD", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                    📍 @{pl.username}{pl.display_name && <span style={{ opacity: 0.6, fontSize: 12 }}> · {pl.display_name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label style={lbl}>Caption (optional)</label>
          <textarea value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} rows={3} style={input} placeholder="How long has it been in? What showed up?" />
        </div>
        {/* Docked action bar — always visible, no scrolling needed */}
        <div style={{ flexShrink: 0, display: "flex", gap: 10, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "#101A14", borderTop: "1px solid rgba(241,235,221,.12)" }}>
          <button onClick={() => setView("feed")} style={btn(false)}>Cancel</button>
          <button onClick={publish} disabled={!draft.srcs.length || !draft.plants.length || publishing} style={{ ...btn(true), flex: 1, opacity: draft.srcs.length && draft.plants.length && !publishing ? 1 : 0.4 }}>{publishing ? "Publishing…" : `Publish${!draft.srcs.length ? " · add a photo" : !draft.plants.length ? " · pick a plant" : ""}`}</button>
        </div>
        </div>
      )}

      {notice && (
        <div onClick={() => setNotice(null)} style={{ position: "absolute", bottom: 74, left: 16, right: 16, zIndex: 6, padding: "10px 14px", borderRadius: 12, background: "#F1EBDD", color: "#101A14", fontSize: 14, cursor: "pointer" }}>
          {notice}
        </div>
      )}

      {/* Report sheet */}
      {/* Account search sheet — usernames, display names, parks and places. */}
      {searchOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(16,26,20,.7)", display: "flex", alignItems: "flex-end" }} onClick={() => setSearchOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "82%", overflowY: "auto", background: "#F1EBDD", color: "#101A14", borderRadius: "18px 18px 0 0", padding: "22px 20px 30px" }}>
            <div style={{ fontSize: 20, marginBottom: 10 }}>Search</div>
            <input autoFocus value={searchQ} onChange={(e) => onSearch(e.target.value)} placeholder="Username, park, city, watershed…"
              style={{ ...input, marginTop: 0, background: "#fff", color: "#101A14", border: "1px solid rgba(16,26,20,.25)" }} />
            <div style={{ marginTop: 10 }}>
              {searchHits.map((h) => (
                <button key={h.id} onClick={() => { setSearchOpen(false); openProfile(h.username); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 4px", background: "none", border: "none", borderTop: "1px solid rgba(16,26,20,.12)", color: "#101A14", fontFamily: "inherit", fontSize: 15, cursor: "pointer" }}>
                  @{h.username}
                  {h.username.startsWith("pinnacle_") && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 999, background: "#101A14", color: "#F1EBDD", fontSize: 11 }}>★ featured</span>}
                  {h.username.startsWith("demo_") && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 999, background: "#E7B93B", fontSize: 11 }}>demo</span>}
                  {h.display_name && <div style={{ fontSize: 13, opacity: 0.65 }}>{h.display_name}</div>}
                </button>
              ))}
              {searchQ.trim().length >= 2 && !searchHits.length && <div style={{ fontSize: 14, opacity: 0.6, padding: "10px 4px" }}>No accounts match.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Ask the gardener — structured prompts in, one answer from the author out. Flat, no threads. */}
      {askFor && (() => {
        const mine = !!user?.id && askFor.authorId === user.id;
        const asked = new Set(qList.filter((q) => q.asker === user?.name).map((q) => q.prompt_id));
        const promptText = (id) => prompts.find((x) => x.id === id)?.text ?? id;
        const field = { ...input, marginTop: 0, background: "#fff", color: "#101A14", border: "1px solid rgba(16,26,20,.25)" };
        return (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(16,26,20,.7)", display: "flex", alignItems: "flex-end" }} onClick={() => setAskFor(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "82%", overflowY: "auto", background: "#F1EBDD", color: "#101A14", borderRadius: "18px 18px 0 0", padding: "22px 20px 30px" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>Ask the gardener</div>
              <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 14 }}>{mine ? "Questions on your garden. Answer the ones you like." : `Pick a question for @${askFor.user} — they'll answer when they can.`}</div>
              {qList.map((q) => (
                <div key={q.id} style={{ padding: "10px 0", borderTop: "1px solid rgba(16,26,20,.12)" }}>
                  <div style={{ fontSize: 14 }}><span style={{ opacity: 0.6 }}>@{q.asker} asked:</span> {promptText(q.prompt_id)}</div>
                  {q.answer ? <div style={{ fontSize: 15, marginTop: 6, lineHeight: 1.4 }}>{q.answer}</div>
                    : mine ? (
                      <div style={{ marginTop: 6 }}>
                        <textarea value={answerDraft[q.id] ?? ""} onChange={(e) => setAnswerDraft({ ...answerDraft, [q.id]: e.target.value })} rows={2} maxLength={600} placeholder="Your answer…" style={field} />
                        <button style={{ ...btn(true), marginTop: 6 }} disabled={!(answerDraft[q.id] ?? "").trim()}
                          onClick={async () => { try { await answerQuestion(q.id, answerDraft[q.id]); setQList(await fetchQuestions(askFor.id)); } catch (e) { setNotice(e.message ?? "Couldn't save your answer"); } }}>Answer</button>
                      </div>
                    ) : <div style={{ fontSize: 13, opacity: 0.55, marginTop: 4 }}>Waiting for an answer</div>}
                </div>
              ))}
              {!mine && (
                <div style={{ marginTop: qList.length ? 14 : 0 }}>
                  {prompts.map((pr) => (
                    <button key={pr.id} disabled={asked.has(pr.id)} style={{ ...pick(false), display: "block", width: "100%", textAlign: "left", marginBottom: 8, opacity: asked.has(pr.id) ? 0.45 : 1 }}
                      onClick={() => requireAccount(async () => {
                        try {
                          if (!hasSupabase) { setNotice("Asking works on milkweed.garden — this is the offline demo."); return; }
                          await askQuestion(askFor.id, pr.id, user.id);
                          setQList(await fetchQuestions(askFor.id));
                        } catch (e) { setNotice(e.message ?? "Couldn't send that question"); }
                      })}>{pr.text}{asked.has(pr.id) ? " · asked" : ""}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
          style={{ position: "absolute", bottom: "calc(18px + env(safe-area-inset-bottom))", right: 14, zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ width: 60, height: 60, borderRadius: 999, background: "rgba(16,26,20,.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,.5)" }}><span className="monarch-fly"><Monarch size={40} /></span></span>
          <span style={{ fontSize: 11, color: "#F1EBDD", textShadow: "0 1px 3px rgba(0,0,0,.7)" }}>Post</span>
        </button>
      )}

      {/* Auth sheet — only appears when an action needs it */}
      {authOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(16,26,20,.7)", display: "flex", alignItems: "flex-end" }} onClick={() => setAuthOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "#F1EBDD", color: "#101A14", borderRadius: "18px 18px 0 0", padding: "22px 20px 30px" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>Sign in to {pending ? "do that" : "post and follow"}</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>Browsing never needs an account.</div>
            <AuthForm onDone={(u) => { setUser(u); setAuthOpen(false); resumePending(u); }} />
            <button onClick={() => { setAuthOpen(false); setView("how"); }} style={{ background: "none", border: "none", padding: 0, marginTop: 12, color: "#8a6420", fontFamily: "inherit", fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>
              What Milkweed does with your data →
            </button>
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

// Branded controls: a deep-green "glass" pill with a monarch-gold hairline and a
// soft lift, so buttons read on any photo instead of dissolving into it. Primary
// is the solid gold pill. Both use the serif brand face (inherited).
const btn = (primary) => ({
  padding: "8px 15px", borderRadius: 999,
  border: primary ? "1px solid #E7B93B" : "1px solid rgba(231,185,59,.55)",
  background: primary ? "#E7B93B" : "rgba(16,26,20,.62)",
  color: primary ? "#101A14" : "#F1EBDD",
  fontFamily: "inherit", fontSize: 14, letterSpacing: 0.2, cursor: "pointer",
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  boxShadow: primary ? "0 2px 12px rgba(231,185,59,.4)" : "0 2px 10px rgba(0,0,0,.45)",
});
const rail = { background: "none", border: "none", color: "#F1EBDD", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "inherit", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.75))" };
const lbl = { display: "block", fontSize: 13, opacity: 0.7, margin: "18px 0 6px" };
const input = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(241,235,221,.25)", background: "#1A2A20", color: "#F1EBDD", fontFamily: "inherit", fontSize: 15, marginTop: 8, boxSizing: "border-box" };
const chip = { padding: "5px 11px", borderRadius: 999, border: "1px solid rgba(231,185,59,.5)", background: "rgba(16,26,20,.62)", color: "#F1EBDD", fontFamily: "inherit", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(0,0,0,.4)" };
const pick = (on) => ({ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#101A14" : "rgba(16,26,20,.25)"}`, background: on ? "#101A14" : "transparent", color: on ? "#F1EBDD" : "#101A14", fontFamily: "inherit", fontSize: 14, cursor: "pointer" });
const pickDark = (on) => ({ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#E7B93B" : "rgba(241,235,221,.3)"}`, background: on ? "#E7B93B" : "transparent", color: on ? "#101A14" : "#F1EBDD", fontFamily: "inherit", fontSize: 14, cursor: "pointer" });
