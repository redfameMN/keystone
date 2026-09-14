-- Pinned posts: authors flag their best posts to lead their profile grid.
-- RLS already lets authors update their own rows; the status guard trigger
-- only fires on status changes, so pinning needs no new policy.

alter table post add column pinned boolean not null default false;

-- Rebuild post_card with the flag (project_timeline reads post_card).
drop view project_timeline;
drop view post_card;

create view post_card as
select p.id, p.author_id, pr.username, p.caption, p.ecoregion_id, e.name as ecoregion,
       p.project_id, p.project_type_id, pt.name as project_type, p.stage_id, st.name as stage, st.sort as stage_sort,
       p.like_count, p.created_at, p.pinned,
       (select jsonb_agg(jsonb_build_object('genus', pp.genus, 'common', g.common_name,
               'keystone', exists (select 1 from keystone_genus k where k.genus = pp.genus and k.ecoregion_id = p.ecoregion_id)))
          from post_plant pp join plant_genus g using (genus) where pp.post_id = p.id) as plants,
       (select jsonb_agg(storage_path order by position) from post_photo where post_id = p.id) as photos,
       gp.name as garden_name, gp.zone
from post p
join profile pr on pr.id = p.author_id
left join ecoregion e on e.id = p.ecoregion_id
left join project_type pt on pt.id = p.project_type_id
left join stage st on st.id = p.stage_id
left join garden_project gp on gp.id = p.project_id
where p.status = 'live';

create view project_timeline as
select gp.name, gp.owner_id, pc.*
from garden_project gp join post_card pc on pc.project_id = gp.id
order by pc.stage_sort, pc.created_at;
