# Keystone

A public, gardens-only photo feed for native gardening. Browse without an account; sign in to post,
like, or follow. Every post is tagged with the plants in it, flagged **keystone** when the genus is a
top caterpillar host for the poster's ecoregion, and placed on a journey (project type × stage) so
someone under a tarp in week 5 can find other tarps — and skip ahead to year 3.

## Layout

```
src/            Vite + React app (mobile-first, single feed)
  App.jsx       feed, plants directory, composer, sign-in sheet, filters
  data/         plant vocabulary + journey taxonomy (prototype seed)
  lib/          identify (Plant.id), supabase client
supabase/
  migrations/   0001_init.sql — full schema, RLS, views, seeds
  functions/    identify — Edge Function that holds the Plant.id key
scripts/        ingest-plants.mjs — fills plant tables from NWF / iNaturalist
data/           nwf-keystone.json — keystone genera by ecoregion
docs/           data-sources.md, roadmap.md
```

## Run

```
npm install
cp .env.example .env      # optional; the app runs on seed data without it
npm run dev
```

## Backend

```
supabase init && supabase link --project-ref <ref>
npm run db:push
supabase secrets set PLANT_ID_KEY=...
npm run fn:deploy
supabase functions deploy scan-post
supabase secrets set ANTHROPIC_API_KEY=...   # enables automatic image screening
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run ingest
```

Every post starts `hidden`; the `scan-post` function screens each photo with Claude
(garden-relevance + safety) and is the only automated path to `live`. Without an
`ANTHROPIC_API_KEY` secret, posts wait for manual approval in the in-app moderation
queue (visible to profiles with `is_admin = true`). Rejected images are deleted from
storage. Reports from 3 distinct users auto-hide a live post.

With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in `.env`, the app reads the feed from
the `post_card` view, signs in with magic links (add your dev URL, e.g. `http://localhost:5173`,
under Auth → URL Configuration in the dashboard), and publishes posts with photo upload to the
`photos` bucket. Without them it falls back to the in-memory seed data.
