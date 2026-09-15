-- Expose the garden's country (and state) on post_card so non-US gardens show
-- their place on the feed (ecoregion is US-only and null elsewhere).
drop view project_timeline;
drop view post_card;
create view post_card as
select p.id, p.author_id, pr.username, p.caption, p.ecoregion_id, e.name as ecoregion,
       p.project_id, p.project_type_id, pt.name as project_type, p.stage_id, st.name as stage, st.sort as stage_sort,
       p.like_count, p.created_at, p.pinned,
       (select jsonb_agg(jsonb_build_object('genus', pp.genus, 'species', nullif(pp.species, ''), 'common', g.common_name,
               'keystone', exists (select 1 from keystone_genus k where k.genus = pp.genus and k.ecoregion_id = p.ecoregion_id)))
          from post_plant pp join plant_genus g using (genus) where pp.post_id = p.id) as plants,
       (select jsonb_agg(storage_path order by position) from post_photo where post_id = p.id) as photos,
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
