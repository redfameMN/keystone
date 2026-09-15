-- Seed keystone_genus from the National Wildlife Federation "Keystone Plants by
-- Ecoregion" guides (Tallamy Lepidoptera-host + Fowler specialist-bee research).
-- Until now this table was empty, so the app's "★ keystone" flag and the
-- composer's keystone hints never lit up for anything. host_rank is the genus's
-- position within its ecoregion, ordered by caterpillar-species host count (1 =
-- top host). Only genera already in our plant_genus vocabulary are included.
-- Source: https://www.nwf.org/Native-Plant-Habitats/Plant-Native/Why-Native/Keystone-Plants-by-Ecoregion
--
-- Note: Asclepias (milkweed) is intentionally NOT flagged keystone here. NWF's
-- keystone lists rank broad Lepidoptera/bee hosts; milkweed is a monarch
-- specialist host, ecologically vital but not an NWF keystone genus. We keep the
-- badge meaning "NWF keystone" precise.

insert into keystone_genus (genus, ecoregion_id, host_rank, source_url) values
  -- Ecoregion 6 · Northwestern Forested Mountains
  ('Salix',6,1,null),('Prunus',6,2,null),('Populus',6,3,null),('Betula',6,4,null),
  ('Quercus',6,5,null),('Vaccinium',6,6,null),('Acer',6,7,null),('Solidago',6,8,null),
  ('Helianthus',6,9,null),('Symphyotrichum',6,10,null),
  -- Ecoregion 7 · Marine West Coast Forest
  ('Quercus',7,1,null),('Prunus',7,2,null),('Salix',7,3,null),('Betula',7,4,null),
  ('Populus',7,5,null),('Acer',7,6,null),('Vaccinium',7,7,null),('Helianthus',7,8,null),
  ('Solidago',7,9,null),('Rudbeckia',7,10,null),('Symphyotrichum',7,11,null),
  -- Ecoregion 8 · Eastern Temperate Forests
  ('Quercus',8,1,null),('Prunus',8,2,null),('Salix',8,3,null),('Betula',8,4,null),
  ('Populus',8,5,null),('Acer',8,6,null),('Vaccinium',8,7,null),('Solidago',8,8,null),
  ('Symphyotrichum',8,9,null),('Helianthus',8,10,null),('Rudbeckia',8,11,null),
  -- Ecoregion 9 · Great Plains
  ('Quercus',9,1,null),('Prunus',9,2,null),('Salix',9,3,null),('Betula',9,4,null),
  ('Populus',9,5,null),('Vaccinium',9,6,null),('Acer',9,7,null),('Solidago',9,8,null),
  ('Helianthus',9,9,null),('Rudbeckia',9,10,null),('Symphyotrichum',9,11,null),
  -- Ecoregion 10 · North American Deserts
  ('Salix',10,1,null),('Quercus',10,2,null),('Prunus',10,3,null),('Populus',10,4,null),
  ('Betula',10,5,null),('Vaccinium',10,6,null),('Acer',10,7,null),('Ceanothus',10,8,null),
  ('Helianthus',10,9,null),('Solidago',10,10,null),
  -- Ecoregion 11 · Mediterranean California
  ('Salix',11,1,null),('Quercus',11,2,null),('Prunus',11,3,null),('Betula',11,4,null),
  ('Ceanothus',11,5,null),('Acer',11,6,null),('Helianthus',11,7,null),('Solidago',11,8,null)
on conflict (genus, ecoregion_id) do nothing;

update keystone_genus set source_url =
  'https://www.nwf.org/Native-Plant-Habitats/Plant-Native/Why-Native/Keystone-Plants-by-Ecoregion'
where source_url is null;
