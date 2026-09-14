-- SECURITY FIX: the "own profile" RLS policy (0001) lets a user update any
-- column on their own row — including is_admin, added in 0003 — so any signed-in
-- user could self-promote to moderator. RLS can't restrict columns, so guard it
-- with a trigger: only the service role or a direct DB connection (no end-user
-- JWT, e.g. the dashboard / admin-granting script) may change is_admin. An
-- authenticated end user's attempt is silently reset, so normal profile edits
-- (username, display_name) still work.

create or replace function guard_is_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from coalesce(old.is_admin, false) then
    if auth.uid() is not null and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
      new.is_admin := coalesce(old.is_admin, false);
    end if;
  end if;
  return new;
end $$;

create trigger profile_is_admin_guard before insert or update on profile
  for each row execute function guard_is_admin();
