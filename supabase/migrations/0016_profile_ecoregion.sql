-- Close schema drift: profile.ecoregion_id exists in the live database (set by
-- seed-demo and reserved for a future profile-level "home region" default) but no
-- migration created it, so a fresh rebuild from migrations was missing it.
-- IF NOT EXISTS makes this a no-op on the live DB and correct on a clean build.
alter table profile add column if not exists ecoregion_id smallint references ecoregion;
