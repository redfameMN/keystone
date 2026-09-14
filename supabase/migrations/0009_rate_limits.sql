-- Anti-abuse: cap how fast one account can post (each post triggers an expensive
-- image scan), and stop one account from filing many reports on the same post.
-- Enforced in the database so the client can't bypass it. The service role
-- (seed/ingest jobs) is exempt.

create or replace function rate_limit_posts() returns trigger
language plpgsql security definer set search_path = public as $$
declare hourly int; daily int;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or auth.uid() is null then
    return new;  -- service role / direct DB
  end if;
  select count(*) into hourly from post
   where author_id = new.author_id and created_at > now() - interval '1 hour';
  if hourly >= 6 then
    raise exception 'You are posting too fast — up to 6 gardens an hour. Try again shortly.'
      using errcode = 'check_violation';
  end if;
  select count(*) into daily from post
   where author_id = new.author_id and created_at > now() - interval '24 hours';
  if daily >= 20 then
    raise exception 'That is a lot of gardens for one day (max 20). Come back tomorrow.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger post_rate_limit before insert on post
  for each row execute function rate_limit_posts();

-- One report per user per post (the 3-reporter auto-hide already counts distinct
-- reporters, so this just stops a single account spamming the report table).
create unique index if not exists report_one_per_user
  on report (post_id, reporter_id) where reporter_id is not null;
