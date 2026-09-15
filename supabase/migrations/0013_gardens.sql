-- Gardens now contain one or more projects.
--   garden          = a named place (+ USDA zone), owned by a user
--   garden_project  = a project within a garden (a project_type + optional label)
--   post            = still links to a project (garden_project) and carries a stage
-- Existing garden_project rows (which were "named gardens") are migrated: each
-- becomes a garden plus this one project linked to it. Nothing is lost.

create table garden (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profile on delete cascade,
  name       text not null,
  zone       text check (zone ~ '^([1-9]|1[0-3])[ab]$'),
  created_at timestamptz default now(),
  unique (owner_id, name)
);
alter table garden enable row level security;
create policy "public read" on garden for select using (true);
create policy "own garden"  on garden for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

alter table garden_project add column garden_id uuid references garden on delete cascade;

-- Migrate each existing project's implied garden into a real garden row.
do $$
declare gp record; gid uuid;
begin
  for gp in select * from garden_project where garden_id is null loop
    insert into garden (owner_id, name, zone)
      values (gp.owner_id, coalesce(nullif(gp.name, ''), 'My garden'), gp.zone)
      on conflict (owner_id, name) do update set zone = coalesce(garden.zone, excluded.zone)
      returning id into gid;
    update garden_project set garden_id = gid where id = gp.id;
  end loop;
end $$;

-- Rebuild post_card: garden name/zone now come from the garden; expose project_name.
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
       gd.name as garden_name, gd.zone, gp.name as project_name
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
