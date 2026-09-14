-- SECURITY FIX: enforce_post_status (0003) computed `privileged` with an OR
-- chain whose last term, `current_setting('keystone.system', true) = 'on'`,
-- is NULL whenever the setting is unset (i.e. all normal traffic). `false OR
-- false OR NULL` is NULL, and `IF NOT NULL` is not-true, so the guard SILENTLY
-- FAILED OPEN: a client that explicitly sent status='live' skipped quarantine
-- and the photo scanner. (Normal publishing was saved only by the column's
-- `default 'hidden'`.) Rewrite so every term is strictly boolean, and force
-- hidden unless the caller is definitely privileged.

create or replace function enforce_post_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare privileged boolean;
begin
  privileged := coalesce(auth.jwt() ->> 'role', '') = 'service_role'
                or coalesce(is_admin(auth.uid()), false)
                or coalesce(current_setting('keystone.system', true), '') = 'on';
  if tg_op = 'INSERT' then
    if privileged is not true then new.status := 'hidden'; end if;
  elsif new.status is distinct from old.status and privileged is not true then
    raise exception 'only moderators can change post status';
  end if;
  return new;
end $$;
