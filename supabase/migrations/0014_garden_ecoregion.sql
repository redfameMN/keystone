-- Ecoregion is a property of the place, like zone — so it lives on the garden and
-- posts inherit it, instead of being picked on every post. Backfill existing
-- gardens from the most common ecoregion among their posts.
alter table garden add column ecoregion_id smallint references ecoregion;

update garden g set ecoregion_id = sub.eco
from (
  select gp.garden_id, mode() within group (order by p.ecoregion_id) as eco
  from garden_project gp join post p on p.project_id = gp.id
  where p.ecoregion_id is not null
  group by gp.garden_id
) sub
where g.id = sub.garden_id and g.ecoregion_id is null;
