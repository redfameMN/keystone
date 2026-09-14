# Roadmap

Done
- Feed prototype: browse without account, sign-in only on like/follow/post
- Plant tags from genus list with per-ecoregion keystone flag
- Journey filters (project type × stage), chips on posts, composer pickers
- Plant.id suggestion → confirm-to-tag flow
- Postgres schema with RLS, project timelines, reports/blocks
- App.jsx wired to Supabase (`post_card` feed, magic-link auth, likes/follows, photo upload),
  falling back to seed data when `.env` is absent
- Safety pipeline: photos resized + EXIF/GPS-stripped client-side; posts quarantined
  (`status='hidden'`, DB-enforced) until the `scan-post` Edge Function clears them
  (Claude vision screening — garden-relevance + safety — or manual review without a key);
  rejected images deleted from storage; report button with auto-hide at 3 reporters;
  admin moderation queue (`profile.is_admin`)

Next
3. Project timeline view on profiles (`project_timeline`)
4. Fill `data/nwf-keystone.json` for all ecoregions; script USDA native-range import
5. CSAM hash-matching (PhotoDNA / Cloudflare CSAM tool) + NCMEC reporting before public launch;
   caption/text screening
6. Expo/React Native wrapper for app stores — or ship as a PWA first
