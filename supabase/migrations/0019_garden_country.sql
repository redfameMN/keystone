-- A garden can now be located by country (ISO-2), enabling the global native check
-- for gardens outside the US. US gardens keep using state (precise, state-level
-- native data); other countries resolve to their TDWG regions (see src/data/tdwg.js)
-- and check against genus_native_region.
alter table garden add column country char(2) check (country ~ '^[A-Z]{2}$');
