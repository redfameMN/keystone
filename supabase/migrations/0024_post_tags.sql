-- Place tags: a post can tag featured place accounts (parks etc. — username
-- pinnacle_%), so a place's profile gathers everyone's posts from there.
-- Only featured places are taggable (no tagging people → no tag-spam vector);
-- only the post's author tags/untags.
create table post_tag (
  post_id   uuid references post on delete cascade,
  tagged_id uuid references profile on delete cascade,
  primary key (post_id, tagged_id)
);
create index post_tag_tagged_idx on post_tag (tagged_id);
alter table post_tag enable row level security;
create policy "public read" on post_tag for select using (true);
create policy "author tags places" on post_tag for insert to authenticated with check (
  exists (select 1 from post p where p.id = post_id and p.author_id = auth.uid())
  and exists (select 1 from profile pr where pr.id = tagged_id and pr.username like 'pinnacle\_%')
);
create policy "author untags" on post_tag for delete to authenticated using (
  exists (select 1 from post p where p.id = post_id and p.author_id = auth.uid())
);

-- post_card: add `tagged` (usernames of tagged places).
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
