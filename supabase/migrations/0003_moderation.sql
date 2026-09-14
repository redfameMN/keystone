-- Safety: quarantine-until-scanned publishing, report teeth, moderator tooling.
--
-- Flow: every new post is forced to status 'hidden'. The scan-post Edge Function
-- (service role) screens each photo and is the only path to 'live' besides a
-- moderator. Reports auto-hide a live post at 3 distinct reporters.

-- ---------- Photo scan state ----------

alter table post alter column status set default 'hidden';

alter table post_photo
  add column scan_status text not null default 'pending'
    check (scan_status in ('pending','approved','rejected','review')),
  add column scan_labels jsonb,
  add column scanned_at  timestamptz;

-- ---------- Moderators ----------

alter table profile add column is_admin boolean not null default false;

create or replace function is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profile where id = uid), false)
$$;

-- Only the service role (scan function), a moderator, or the auto-hide trigger
-- may set post.status; authors always insert as 'hidden' no matter what they send.
create or replace function enforce_post_status() returns trigger
language plpgsql as $$
declare privileged boolean;
begin
  privileged := coalesce(auth.jwt() ->> 'role', '') = 'service_role'
                or is_admin(auth.uid())
                or current_setting('keystone.system', true) = 'on';
  if tg_op = 'INSERT' then
    if not privileged then new.status := 'hidden'; end if;
  elsif new.status is distinct from old.status and not privileged then
    raise exception 'only moderators can change post status';
  end if;
  return new;
end $$;

create trigger post_status_guard before insert or update on post
  for each row execute function enforce_post_status();

-- ---------- Reports: auto-hide + moderator access ----------

-- 3 distinct unresolved reporters pull a live post from the feed until review.
create or replace function auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct reporter_id) from report
       where post_id = new.post_id and not resolved) >= 3 then
    perform set_config('keystone.system', 'on', true);
    update post set status = 'hidden' where id = new.post_id and status = 'live';
    perform set_config('keystone.system', 'off', true);
  end if;
  return null;
end $$;

create trigger report_auto_hide after insert on report
  for each row execute function auto_hide_reported();

create policy "admins read reports"   on report for select using (is_admin(auth.uid()));
create policy "admins update reports" on report for update using (is_admin(auth.uid()));

-- ---------- Moderation queue (rows only exist for admins) ----------

create view moderation_queue as
select p.id, p.author_id, pr.username, p.caption, p.status, p.created_at,
       (select jsonb_agg(jsonb_build_object('path', ph.storage_path, 'scan', ph.scan_status, 'labels', ph.scan_labels) order by ph.position)
          from post_photo ph where ph.post_id = p.id) as photos,
       (select jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note) order by r.created_at)
          from report r where r.post_id = p.id and not r.resolved) as open_reports
from post p join profile pr on pr.id = p.author_id
where is_admin(auth.uid())
  and p.status <> 'removed'
  and (p.status = 'hidden'
       or exists (select 1 from report r where r.post_id = p.id and not r.resolved)
       or exists (select 1 from post_photo ph where ph.post_id = p.id and ph.scan_status in ('pending','review')));

-- ---------- Storage hardening ----------

update storage.buckets
   set file_size_limit = 10485760,           -- 10MB; client resizes to ≤2000px JPEG anyway
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where id = 'photos';
