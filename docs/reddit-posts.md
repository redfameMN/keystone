# Reddit launch posts

Drafts for sharing milkweed.garden. Reddit norms: post as yourself, disclose you
built it, never post the same text twice, and check each sub's self-promo rules
first (some only allow it in weekly threads). Reply to every comment the first
day — that's what keeps a post alive.

---

## r/NativePlantGardening

**Title:** I built a free photo feed just for native gardens — keystone plants
flagged by ecoregion, and you can filter by "year 1 sleep" vs "year 3 leap"

**Body:**

I got tired of garden progress photos being buried in general-purpose feeds, so
I built a small free site: https://milkweed.garden

What it does:

- Every post is tagged with the plants in it, and a genus gets a gold dot when
  it's a keystone plant for that poster's ecoregion (based on the NWF keystone
  plant guides / Tallamy's host-plant research)
- You can filter the feed by project (lawn conversion, rain garden, boulevard,
  prairie…) **and** stage — so if you're in week 5 under a tarp, you can look at
  other people's tarps, or skip ahead to what year 3 looks like
- Browsing needs no account; posting is a magic-link email, no password
- Photos get EXIF/GPS stripped automatically before upload, so your garden
  photos can't be located
- No ads, no algorithm — just newest first

It's brand new, so the feed is mostly labeled demo content right now. I'd
genuinely love feedback from this sub — what would make you actually post your
garden somewhere?

---

## r/NoLawns

**Title:** Made a free site where lawn conversions get documented start to
finish — filter by stage, from "before" to "established"

**Body:**

The best part of this sub is watching a lawn die and a garden replace it over
three years. I built a little free site around exactly that:
https://milkweed.garden

You tag each post with a project type and a stage ("before", "site prep",
"planting day", "year 1 · sleep", "year 2 · creep", "year 3 · leap"…), and give
your garden a name — so your conversion accumulates as one story instead of
scattered posts. There's a filter for browsing everyone else at your same
stage, which is great motivation when your year-1 planting looks like dirt.

Free, no ads, no account needed to browse. It's new (the current content is
labeled demo posts), so early feedback would shape it a lot.

---

## r/Permaculture

**Title:** I built a free photo feed for habitat gardens — the featured account
is a tribute to Brad Lancaster's curb-cut water harvesting

**Body:**

Weekend project that got out of hand: https://milkweed.garden — a public photo
feed only for gardens, with plant tags, ecoregions, and project timelines
(rain gardens, boulevard plantings, prairie seedings…).

The first "featured" account on it celebrates Brad Lancaster's public
water-harvesting work in Tucson — curb cuts routing street runoff into sunken
basins, planted streetscapes — with CC-licensed photos and full credit. If
this community has other pioneers who deserve a featured spot (with properly
licensed photos), I'd love suggestions.

Free, no ads, browse without an account. Feedback very welcome — it's early.

---

## r/SideProject (or r/webdev)

**Title:** Built a TikTok-style feed for native gardens — Supabase, magic
links, and every photo screened by an LLM before it goes live

**Body:**

https://milkweed.garden — a vertical photo feed where people document turning
lawns into native gardens over years.

The stack, for the curious: React/Vite on GitHub Pages, Supabase (Postgres +
RLS + magic-link auth + storage + Edge Functions). The part I'm happiest with
is the safety pipeline: every post is quarantined at insert (enforced by a DB
trigger, not app code), photos are EXIF/GPS-stripped client-side, then an Edge
Function has an LLM classify each image (is it a garden? any unsafe content?)
before anything goes public — ~a tenth of a cent per photo. Suspected child
content is moved to a private evidence bucket and logged rather than deleted;
posting is rate-limited; there's a moderation queue for uncertain cases. I also
red-teamed my own RLS policies and found two real holes (a privilege-escalation
and a NULL-logic bug that let the quarantine fail open) — happy to talk through
those, they're good cautionary tales.

Feedback on the product or the stack welcome — it's about a week old.
