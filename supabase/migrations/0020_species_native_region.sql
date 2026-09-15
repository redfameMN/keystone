-- Half A of species-level native status: the DATA only (no tagging change yet).
-- Species-level native range from Kew's WCVP, keyed to TDWG level-3 regions. This
-- is finer than genus_native_region: it can tell an invasive species (Wisteria
-- sinensis) from a native one (W. frutescens) in the same place. Loaded in bulk by
-- scripts/wcvp-load-species.mjs from the same wcvp.zip — no API calls.
create table species_native_region (
  species     text not null,     -- accepted scientific binomial, e.g. "Wisteria sinensis"
  genus       text not null,     -- first word of species, for grouping/fallback
  region_code text not null,     -- TDWG level 3
  region_name text,
  primary key (species, region_code)
);
create index species_native_region_genus_idx on species_native_region (genus);
alter table species_native_region enable row level security;
create policy "public read" on species_native_region for select using (true);
