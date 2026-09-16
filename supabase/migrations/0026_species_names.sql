-- Common names at species level, so tags can favor "Swamp milkweed" over
-- "Asclepias incarnata". Filled at tag time from iNaturalist (members may add;
-- first write wins) and seeded for species we've already posted. post_card's
-- plant `common` now prefers the species name, falling back to the genus name.
create table species_name (
  species text primary key,   -- binomial, matches post_plant.species
  common  text not null
);
alter table species_name enable row level security;
create policy "public read" on species_name for select using (true);
create policy "members add" on species_name for insert to authenticated with check (char_length(common) between 2 and 80);

insert into species_name (species, common) values
  ('Quercus robur', 'English oak'), ('Hedera helix', 'English ivy'), ('Acer palmatum', 'Japanese maple'),
  ('Betula pendula', 'Silver birch'), ('Fagus sylvatica', 'European beech'), ('Eucalyptus marginata', 'Jarrah'),
  ('Quercus macrocarpa', 'Bur oak'), ('Andropogon gerardii', 'Big bluestem'), ('Solidago rigida', 'Stiff goldenrod'),
  ('Asclepias incarnata', 'Swamp milkweed'), ('Salix nigra', 'Black willow'), ('Schizachyrium scoparium', 'Little bluestem'),
  ('Larix laricina', 'Tamarack'), ('Betula papyrifera', 'Paper birch'), ('Vaccinium angustifolium', 'Lowbush blueberry'),
  ('Monarda fistulosa', 'Wild bergamot'), ('Liatris pycnostachya', 'Prairie blazing star'), ('Rudbeckia hirta', 'Black-eyed Susan')
on conflict (species) do nothing;

drop view project_timeline;
drop view post_card;
create view post_card as
select p.id, p.author_id, pr.username, p.caption, p.ecoregion_id, e.name as ecoregion,
       p.project_id, p.project_type_id, pt.name as project_type, p.stage_id, st.name as stage, st.sort as stage_sort,
       p.like_count, p.created_at, p.pinned,
       (select jsonb_agg(jsonb_build_object('genus', pp.genus, 'species', nullif(pp.species, ''),
               'common', coalesce(sn.common, g.common_name),
               'keystone', exists (select 1 from keystone_genus k where k.genus = pp.genus and k.ecoregion_id = p.ecoregion_id)))
          from post_plant pp join plant_genus g using (genus)
          left join species_name sn on sn.species = pp.species
          where pp.post_id = p.id) as plants,
       (select jsonb_agg(storage_path order by position) from post_photo where post_id = p.id) as photos,
       (select jsonb_agg(jsonb_build_object('credit', credit, 'license', license, 'url', source_url) order by position)
          from post_photo where post_id = p.id) as credits,
       (select jsonb_agg(pr2.username) from post_tag t join profile pr2 on pr2.id = t.tagged_id where t.post_id = p.id) as tagged,
       gd.name as garden_name, gd.zone, gd.country, gd.state, gp.name as project_name
from post p
join profile pr on pr.id = p.author_id
left join ecoregion e on e.id = p.ecoregion_id
left join project_type pt on pt.id = p.project_type_id
left join stage st on st.id = p.stage_id
left join garden_project gp on gp.id = p.project_id
left join garden gd on gd.id = gp.garden_id
where p.status = 'live';

create view project_timeline as
select gp.name, gp.owner_id, pc.*
from garden_project gp join post_card pc on pc.project_id = gp.id
order by pc.stage_sort, pc.created_at;
