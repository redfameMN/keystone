-- 0003 let moderators change post.status at the trigger level but never granted
-- them row access under RLS, so Approve/Remove in the queue silently updated
-- zero rows. Give admins update access to any post.

create policy "admins update posts" on post
  for update using (is_admin(auth.uid()));
