-- Keystone: public garden photo feed. Supabase (Postgres + auth + storage).
-- Anyone can read. Writes need auth.users. Run in the SQL editor in this order.

create extension if not exists postgis;

-- ---------- Plant vocabulary (ingested from online sources, not hand-edited) ----------

create table ecoregion (
  id            smallint primary key,            -- EPA Level I code (8 = Eastern Temperate Forests ...)
  name          text not null unique,
  geom          geometry(MultiPolygon, 4326)     -- from EPA shapefile; lets us derive region from a lat/lng
);

create table plant_genus (
  genus         text primary key,                -- "Quercus"
  family        text,
  common_name   text,
  growth_form   text check (growth_form in ('tree','shrub','perennial','grass','vine','annual')),
  source        text not null default 'inaturalist',
  updated_at    timestamptz default now()
);

-- Keystone status is per ecoregion (NWF keystone plant guides).
create table keystone_genus (
  genus         text references plant_genus on delete cascade,
  ecoregion_id  smallint references ecoregion,
  host_rank     smallint,                        -- position in NWF list, 1 = top host
  source_url    text,
  primary key (genus, ecoregion_id)
);

create table plant_species (
  id            bigint primary key,              -- iNaturalist taxon id
  genus         text references plant_genus,
  scientific    text not null unique,            -- "Solidago canadensis"
  common_name   text,
  updated_at    timestamptz default now()
);

-- Native range by state, from USDA PLANTS / BONAP. Used to flag "not native here".
create table species_native_state (
  species_id    bigint references plant_species on delete cascade,
  state         char(2),
  primary key (species_id, state)
);

-- ---------- Journey taxonomy (seeded; editable by admins, not clients) ----------

create table project_type (
  id     text primary key,   -- 'lawn', 'rain', 'boulevard' ...
  name   text not null,
  blurb  text,
  sort   smallint
);

create table stage (
  id     text primary key,   -- 'before','prep','planting','y1','y2','y3','established','visitor','winter','edit'
  name   text not null,
  blurb  text,
  sort   smallint            -- chronological order, so a project timeline can be sorted
);

insert into project_type values
  ('lawn','Lawn conversion','Turf out, natives in',1),
  ('rain','Rain garden','Downspout, berm, basin',2),
  ('boulevard','Boulevard / hellstrip','Between sidewalk and street',3),
  ('prairie','Prairie or meadow','Seeded, not planted',4),
  ('beelawn','Bee lawn','Low natives seeded into turf',5),
  ('shade','Shade / woodland','Under the trees',6),
  ('pocket','Pocket & containers','Balcony, patio, one bed',7),
  ('slope','Slope or shoreline','Erosion and buffers',8),
  ('foundation','Foundation bed redo','Replacing the yews',9),
  ('hoa','Front yard (HOA)','Keeping it tidy enough',10);

insert into stage values
  ('before','Before','The lawn as it was',1),
  ('prep','Site prep','Tarping, sheet mulch, sod cut',2),
  ('planting','Planting day','Plugs, seed, winter sowing',3),
  ('y1','Year 1 · sleep','Roots, not much to see',4),
  ('y2','Year 2 · creep','Filling in',5),
  ('y3','Year 3 · leap','It finally looks like something',6),
  ('established','Established','4+ years, self-sowing',7),
  ('visitor','First visitor','First monarch cat, first bird nest',8),
  ('winter','Winter interest','Seedheads and stems left up',9),
  ('edit','Rework','Editing what got too enthusiastic',10);

-- ---------- People ----------

create table profile (
  id            uuid primary key references auth.users on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name  text,
  ecoregion_id  smallint references ecoregion,
  state         char(2),
  created_at    timestamptz default now()
);

create table follow (
  follower_id   uuid references profile on delete cascade,
  followed_id   uuid references profile on delete cascade,
  created_at    timestamptz default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

-- ---------- Posts ----------

-- A garden project groups posts over time, so "lawn conversion, year 1 → year 3"
-- reads as one story on the author's profile.
create table garden_project (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references profile on delete cascade,
  project_type_id text references project_type,
  name            text,                          -- "Front yard", "North side rain garden"
  started_on      date,
  created_at      timestamptz default now()
);

create table post (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references profile on delete cascade,
  project_id    uuid references garden_project on delete set null,
  project_type_id text references project_type,   -- denormalized for filtering
  stage_id      text references stage,
  caption       text check (char_length(caption) <= 500),
  ecoregion_id  smallint references ecoregion,
  state         char(2),                         -- coarse location only; never store the photo's GPS
  status        text not null default 'live' check (status in ('live','hidden','removed')),
  like_count    int not null default 0,
  created_at    timestamptz default now()
);

create table post_photo (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid references post on delete cascade,
  storage_path  text not null,                   -- Supabase Storage bucket "photos"
  width         int, height int,
  position      smallint not null default 0
);

-- Every post has ≥1 plant tag; enforced in the API layer and by the trigger below.
create table post_plant (
  post_id       uuid references post on delete cascade,
  genus         text not null references plant_genus,
  species_id    bigint references plant_species,        -- optional finer ID
  id_source     text not null default 'manual' check (id_source in ('manual','plant_id','inaturalist')),
  id_confidence real,                                   -- from the identifier, if any
  confirmed_by_author boolean not null default true,    -- suggestion accepted with a tap
  primary key (post_id, genus)
);

create table post_like (
  post_id       uuid references post on delete cascade,
  user_id       uuid references profile on delete cascade,
  created_at    timestamptz default now(),
  primary key (post_id, user_id)
);

-- Community ID confirmations ("yes, that's a bur oak") — the trust layer.
create table plant_confirm (
  post_id       uuid, genus text, user_id uuid references profile on delete cascade,
  primary key (post_id, genus, user_id),
  foreign key (post_id, genus) references post_plant on delete cascade
);

-- ---------- Safety ----------

create table report (
  id            bigserial primary key,
  post_id       uuid references post on delete cascade,
  reporter_id   uuid references profile on delete set null,
  reason        text not null check (reason in ('not_a_garden','spam','harassment','other')),
  note          text,
  resolved      boolean not null default false,
  created_at    timestamptz default now()
);

create table block (
  blocker_id    uuid references profile on delete cascade,
  blocked_id    uuid references profile on delete cascade,
  primary key (blocker_id, blocked_id)
);

-- ---------- Views used by the feed ----------

create view post_card as
select p.id, p.author_id, pr.username, p.caption, p.ecoregion_id, e.name as ecoregion,
       p.project_id, p.project_type_id, pt.name as project_type, p.stage_id, st.name as stage, st.sort as stage_sort,
       p.like_count, p.created_at,
       (select jsonb_agg(jsonb_build_object('genus', pp.genus, 'common', g.common_name,
               'keystone', exists (select 1 from keystone_genus k where k.genus = pp.genus and k.ecoregion_id = p.ecoregion_id)))
          from post_plant pp join plant_genus g using (genus) where pp.post_id = p.id) as plants,
       (select jsonb_agg(storage_path order by position) from post_photo where post_id = p.id) as photos
from post p
join profile pr on pr.id = p.author_id
left join ecoregion e on e.id = p.ecoregion_id
left join project_type pt on pt.id = p.project_type_id
left join stage st on st.id = p.stage_id
where p.status = 'live';

-- A project's timeline: its posts in stage order, then date.
create view project_timeline as
select gp.name, gp.owner_id, pc.*   -- pc.* already includes project_id
from garden_project gp join post_card pc on pc.project_id = gp.id
order by pc.stage_sort, pc.created_at;

create index post_created_idx on post (created_at desc) where status = 'live';
create index post_plant_genus_idx on post_plant (genus);
create index post_journey_idx on post (project_type_id, stage_id, created_at desc) where status = 'live';

-- ---------- Triggers ----------

create or replace function bump_like_count() returns trigger language plpgsql as $$
begin
  update post set like_count = like_count + (case when tg_op = 'INSERT' then 1 else -1 end)
   where id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
create trigger post_like_count after insert or delete on post_like for each row execute function bump_like_count();

-- ---------- Row-level security: read everything, write your own ----------

alter table profile     enable row level security;
alter table post        enable row level security;
alter table garden_project enable row level security;
alter table project_type enable row level security;
alter table stage       enable row level security;
create policy "public read"  on garden_project for select using (true);
create policy "own projects" on garden_project for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "public read"  on project_type for select using (true);
create policy "public read"  on stage        for select using (true);
alter table post_photo  enable row level security;
alter table post_plant  enable row level security;
alter table post_like   enable row level security;
alter table follow      enable row level security;
alter table plant_confirm enable row level security;
alter table report      enable row level security;
alter table block       enable row level security;

create policy "public read"  on profile    for select using (true);
create policy "public read"  on post       for select using (status = 'live');
create policy "public read"  on post_photo for select using (true);
create policy "public read"  on post_plant for select using (true);
create policy "public read"  on post_like  for select using (true);
create policy "public read"  on follow     for select using (true);
create policy "public read"  on plant_confirm for select using (true);

create policy "own profile"  on profile for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own posts"    on post    for all using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy "own photos"   on post_photo for all using (exists (select 1 from post where id = post_id and author_id = auth.uid()));
create policy "own tags"     on post_plant for all using (exists (select 1 from post where id = post_id and author_id = auth.uid()));
create policy "own likes"    on post_like for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own follows"  on follow   for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
create policy "own confirms" on plant_confirm for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "file reports" on report   for insert with check (auth.uid() = reporter_id);
create policy "own blocks"   on block    for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- Plant tables are read-only for clients; the ingestion job writes with the service role.
alter table plant_genus enable row level security;
alter table plant_species enable row level security;
alter table keystone_genus enable row level security;
alter table ecoregion enable row level security;
create policy "public read" on plant_genus    for select using (true);
create policy "public read" on plant_species  for select using (true);
create policy "public read" on keystone_genus for select using (true);
create policy "public read" on ecoregion      for select using (true);

-- Storage: create bucket "photos" (public read). Uploads go through an Edge Function
-- that strips EXIF, resizes, and calls Plant.id server-side so the key never reaches clients.
