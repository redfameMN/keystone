-- Places are many-to-many, not a tree: a park is in a city (political) AND a
-- watershed district (hydrological), and those boundaries don't align. A hub
-- lists its members and rolls up their posts (two levels, for hubs of hubs).
-- Replaces the single parent_id (left in place, no longer read). Service-role
-- writes only (seed scripts).
create table place_member (
  place_id  uuid references profile on delete cascade,   -- the hub (city, watershed, county…)
  member_id uuid references profile on delete cascade,   -- what it contains (park, or another hub)
  primary key (place_id, member_id)
);
create index place_member_member_idx on place_member (member_id);
alter table place_member enable row level security;
create policy "public read" on place_member for select using (true);
