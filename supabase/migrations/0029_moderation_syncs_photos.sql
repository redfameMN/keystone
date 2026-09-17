-- Bug: the moderation queue lists a post while any photo is scan_status pending/
-- review, but approving/removing only changed post.status — so Approve appeared to
-- do nothing (post went live, photo stayed 'review', post stayed in the queue).
-- Sync the photos when a moderator decides.
create or replace function sync_photo_scan_on_moderation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    update post_photo set scan_status = 'approved' where post_id = new.id and scan_status in ('pending', 'review');
  elsif new.status = 'removed' and old.status is distinct from 'removed' then
    update post_photo set scan_status = 'rejected' where post_id = new.id and scan_status in ('pending', 'review');
  end if;
  return new;
end $$;
create trigger post_moderation_syncs_photos after update of status on post
  for each row execute function sync_photo_scan_on_moderation();
