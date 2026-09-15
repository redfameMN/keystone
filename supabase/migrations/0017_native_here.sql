-- "Is this native here?" — the plumbing + a trust-safe starter dataset.
-- Two tiers, so we only ever warn when we're confident and never mislabel a real
-- native as non-native:
--   1. plant_genus.native_us  — a coarse continental flag. false = no native US
--      species in the genus (unambiguous exotics/invasives) → a hard warning.
--   2. genus_native_state      — for genera native to the US, which states they're
--      native in. Absence of data = "unknown" (stay silent), never "not native".
-- Gardens gain a state, captured once, so a post inherits the place's location the
-- same way it inherits ecoregion and zone.

alter table garden add column state char(2) check (state ~ '^[A-Z]{2}$');

alter table plant_genus add column native_us boolean;   -- null = unknown

create table genus_native_state (
  genus text references plant_genus on delete cascade,
  state char(2),
  primary key (genus, state)
);
alter table genus_native_state enable row level security;
create policy "public read" on genus_native_state for select using (true);

-- Our controlled vocabulary is all native genera.
update plant_genus set native_us = true where genus in (
  'Quercus','Prunus','Salix','Betula','Populus','Acer','Vaccinium','Solidago',
  'Symphyotrichum','Helianthus','Rudbeckia','Eupatorium','Lupinus','Ceanothus',
  'Arctostaphylos','Asclepias','Echinacea','Monarda','Liatris','Schizachyrium');

-- A small, unambiguous set of non-native/invasive genera (each has NO native US
-- species, so a genus-level "not native" call is safe). These aren't in the
-- taggable vocabulary, but a user can reach them via plant search — seeding them
-- means the warning fires when one is tagged.
insert into plant_genus (genus, common_name, growth_form, source, native_us) values
  ('Nandina','Heavenly bamboo','shrub','reference',false),
  ('Ailanthus','Tree of heaven','tree','reference',false),
  ('Ligustrum','Privets','shrub','reference',false),
  ('Pyrus','Callery / Bradford pear','tree','reference',false),
  ('Miscanthus','Chinese silvergrass','grass','reference',false),
  ('Hedera','English ivy','vine','reference',false),
  ('Vinca','Periwinkle','vine','reference',false),
  ('Pueraria','Kudzu','vine','reference',false),
  ('Microstegium','Japanese stiltgrass','grass','reference',false),
  ('Alliaria','Garlic mustard','annual','reference',false)
on conflict (genus) do nothing;

-- Native-by-state for the genera that are native across the contiguous US. Seeded
-- for the lower 48 + DC (AK/HI omitted rather than guessed → those stay "unknown"
-- and silent). Regionally-restricted natives (Ceanothus, Echinacea, Eupatorium,
-- Liatris, Lupinus, Arctostaphylos) are left without state rows for now: native_us
-- keeps them from ever warning, and real state ranges can be ingested later.
insert into genus_native_state (genus, state)
select g.genus, s.st
from (values
  ('Quercus'),('Prunus'),('Salix'),('Populus'),('Betula'),('Acer'),('Solidago'),
  ('Symphyotrichum'),('Helianthus'),('Asclepias'),('Vaccinium'),('Rudbeckia'),
  ('Monarda'),('Schizachyrium')
) g(genus)
cross join (values
  ('AL'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('DC'),('FL'),('GA'),('ID'),
  ('IL'),('IN'),('IA'),('KS'),('KY'),('LA'),('ME'),('MD'),('MA'),('MI'),('MN'),
  ('MS'),('MO'),('MT'),('NE'),('NV'),('NH'),('NJ'),('NM'),('NY'),('NC'),('ND'),
  ('OH'),('OK'),('OR'),('PA'),('RI'),('SC'),('SD'),('TN'),('TX'),('UT'),('VT'),
  ('VA'),('WA'),('WV'),('WI'),('WY')
) s(st)
on conflict do nothing;
