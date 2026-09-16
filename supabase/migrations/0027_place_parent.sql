-- Places can nest: a park belongs to a city, like a project belongs to a garden.
-- A city's profile lists its parks and rolls up their posts. Only featured
-- (pinnacle_) accounts use this; set by seed scripts, never by clients.
alter table profile add column parent_id uuid references profile on delete set null;
create index profile_parent_idx on profile (parent_id);
