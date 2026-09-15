-- SPIKE / experimental — NOT wired into the app UI yet. This is the proof of the
-- global tier for "is this native here?": native range worldwide from Kew's World
-- Checklist of Vascular Plants (WCVP), accessed via GBIF, keyed to TDWG WGSRPD
-- level-3 botanical regions (~370 worldwide: GB, JAP, CHC, CAL, …) instead of US
-- states. Populated by scripts/spike-native-global.mjs.
--
-- Coverage model differs from the US genus_native_state tier: WCVP is a
-- comprehensive global checklist, so a genus present here is "tracked globally"
-- and a region absent from its rows means genuinely not-native there — no
-- "covered states" caveat. (The one caveat is our own species sampling; the
-- ingest samples a few species per genus for the spike, all in production.)
create table genus_native_region (
  genus       text not null,
  region_code text not null,     -- TDWG level 3, e.g. GB=Great Britain, JAP=Japan
  region_name text,
  primary key (genus, region_code)
);
alter table genus_native_region enable row level security;
create policy "public read" on genus_native_region for select using (true);
