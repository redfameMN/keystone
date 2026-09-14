-- Child-safety handling. Suspected CSAM (a minor + sexual/nudity signal) must be
-- (a) removed from public reach immediately and (b) PRESERVED for a NCMEC report,
-- never deleted — deleting destroys evidence the operator is legally required to
-- report (18 U.S.C. 2258A). So such images are MOVED from the public "photos"
-- bucket to a private "quarantine" bucket and an incident is logged for the operator.
-- This is a classifier-based stopgap, not hash-matching; see docs/safety-csam.md.

-- New photo scan state: legal_hold = pulled from public, preserved, awaiting report.
alter table post_photo drop constraint if exists post_photo_scan_status_check;
alter table post_photo add constraint post_photo_scan_status_check
  check (scan_status in ('pending','approved','rejected','review','legal_hold'));

-- Private evidence bucket (NOT public). Service role only; no permissive policies,
-- so it is unreachable by any client — the Edge Function (service role) writes it.
insert into storage.buckets (id, name, public) values ('quarantine', 'quarantine', false)
on conflict (id) do nothing;

-- Operator alert queue. Holds METADATA only (never renders the image); the operator
-- files the NCMEC report and lets law enforcement retrieve the preserved file.
create table if not exists safety_incident (
  id            bigserial primary key,
  post_id       uuid,
  author_id     uuid,
  storage_path  text,        -- location in the private quarantine bucket
  labels        jsonb,
  reported      boolean not null default false,   -- operator marks true after NCMEC report
  created_at    timestamptz default now()
);
alter table safety_incident enable row level security;
create policy "admins read incidents"   on safety_incident for select using (is_admin(auth.uid()));
create policy "admins update incidents" on safety_incident for update using (is_admin(auth.uid()));
-- No insert policy: only the service role (scan function) writes incidents.

-- Keep suspected-CSAM posts OUT of the ordinary moderation queue so the image is
-- never casually viewed in the web UI. Rebuild the queue to exclude legal_hold.
create or replace view moderation_queue as
select p.id, p.author_id, pr.username, p.caption, p.status, p.created_at,
       (select jsonb_agg(jsonb_build_object('path', ph.storage_path, 'scan', ph.scan_status, 'labels', ph.scan_labels) order by ph.position)
          from post_photo ph where ph.post_id = p.id) as photos,
       (select jsonb_agg(jsonb_build_object('reason', r.reason, 'note', r.note) order by r.created_at)
          from report r where r.post_id = p.id and not r.resolved) as open_reports
from post p join profile pr on pr.id = p.author_id
where is_admin(auth.uid())
  and p.status <> 'removed'
  and not exists (select 1 from post_photo ph where ph.post_id = p.id and ph.scan_status = 'legal_hold')
  and (p.status = 'hidden'
       or exists (select 1 from report r where r.post_id = p.id and not r.resolved)
       or exists (select 1 from post_photo ph where ph.post_id = p.id and ph.scan_status in ('pending','review')));
