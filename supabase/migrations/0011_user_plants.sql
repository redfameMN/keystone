-- Let signed-in users add a plant genus to the shared vocabulary when they tag a
-- plant that isn't in the seed list (via the composer's plant search). Reads stay
-- public; the ingest job still owns bulk/authoritative updates. source='user'
-- marks these so they can be reconciled later. Low blast radius: user-added
-- genera only satisfy post_plant's FK and show as tags on that user's own post —
-- the quick-pick chips are a fixed client-side list, not this table.
create policy "authenticated add genus" on plant_genus
  for insert to authenticated with check (true);
