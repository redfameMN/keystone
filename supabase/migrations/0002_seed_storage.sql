-- Seeds the reference rows the app needs before the ingestion job has run,
-- and sets up the "photos" storage bucket.

-- Ecoregions (EPA Level I). Names must match src/lib/api.js ECOREGION_IDS and
-- the prototype taxonomy. geom stays null until the EPA shapefile is loaded.
insert into ecoregion (id, name) values
  (6, 'Northwestern Forested Mountains'),
  (7, 'Marine West Coast Forest'),
  (8, 'Eastern Temperate Forests'),
  (9, 'Great Plains'),
  (10, 'North American Deserts'),
  (11, 'Mediterranean California')
on conflict (id) do nothing;

-- Prototype genus vocabulary (mirrors src/data/taxonomy.js) so post_plant's FK
-- holds before scripts/ingest-plants.mjs fills the real tables. The ingest job
-- upserts over these.
insert into plant_genus (genus, common_name, growth_form, source) values
  ('Quercus', 'Oaks', 'tree', 'seed'),
  ('Prunus', 'Cherries & plums', 'tree', 'seed'),
  ('Salix', 'Willows', 'tree', 'seed'),
  ('Betula', 'Birches', 'tree', 'seed'),
  ('Populus', 'Cottonwoods & aspens', 'tree', 'seed'),
  ('Acer', 'Maples', 'tree', 'seed'),
  ('Vaccinium', 'Blueberries', 'shrub', 'seed'),
  ('Solidago', 'Goldenrods', 'perennial', 'seed'),
  ('Symphyotrichum', 'Asters', 'perennial', 'seed'),
  ('Helianthus', 'Sunflowers', 'perennial', 'seed'),
  ('Rudbeckia', 'Coneflowers', 'perennial', 'seed'),
  ('Eupatorium', 'Bonesets', 'perennial', 'seed'),
  ('Lupinus', 'Lupines', 'perennial', 'seed'),
  ('Ceanothus', 'Wild lilacs', 'shrub', 'seed'),
  ('Arctostaphylos', 'Manzanitas', 'shrub', 'seed'),
  ('Asclepias', 'Milkweeds', 'perennial', 'seed'),
  ('Echinacea', 'Purple coneflowers', 'perennial', 'seed'),
  ('Monarda', 'Bee balms', 'perennial', 'seed'),
  ('Liatris', 'Blazing stars', 'perennial', 'seed'),
  ('Schizachyrium', 'Little bluestem', 'grass', 'seed')
on conflict (genus) do nothing;

-- Storage: public-read bucket for post photos; users write only under their own
-- uid/ folder (publishPost uploads to `${user.id}/${uuid}.jpg`).
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;

-- If db push refuses these (newer projects reserve storage.objects for the
-- dashboard), add the same three policies under Storage → photos → Policies.
create policy "photos public read" on storage.objects
  for select using (bucket_id = 'photos');
create policy "photos own upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
