-- "Ask the gardener": a structured, flat Q&A. Askers pick from proposed prompts
-- (no free text from askers → nothing to screen, stays civil); only the post's
-- author answers, with a length cap. Answers show under the post, so the existing
-- post Report / moderation flow covers bad answers (no new moderation surface).

create table question_prompt (
  id   text primary key,
  text text not null,
  sort smallint
);
insert into question_prompt (id, text, sort) values
  ('how_long', 'How long did it take to look like this?', 1),
  ('prep',     'How did you prep the site?', 2),
  ('source',   'Where did you get the plants?', 3),
  ('upkeep',   'How much watering and upkeep does it need?', 4),
  ('wildlife', 'What wildlife has shown up?', 5),
  ('redo',     'What would you do differently?', 6);
alter table question_prompt enable row level security;
create policy "public read" on question_prompt for select using (true);

create table question (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references post on delete cascade,
  asker_id    uuid not null references profile on delete cascade,
  prompt_id   text not null references question_prompt,
  answer      text check (char_length(answer) <= 600),
  answered_at timestamptz,
  created_at  timestamptz default now(),
  unique (post_id, asker_id, prompt_id)          -- one ask per prompt per person per post
);
create index question_post_idx on question (post_id, created_at);
alter table question enable row level security;
create policy "public read" on question for select using (true);
-- Ask: as yourself, on someone else's live post.
create policy "ask" on question for insert to authenticated with check (
  asker_id = auth.uid()
  and exists (select 1 from post p where p.id = post_id and p.status = 'live' and p.author_id <> auth.uid())
);
-- Answer: only the post's author may update.
create policy "answer" on question for update to authenticated
  using (exists (select 1 from post p where p.id = question.post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from post p where p.id = question.post_id and p.author_id = auth.uid()));

-- Lock everything but the answer on update; stamp answered_at.
create or replace function question_answer_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
  new.post_id := old.post_id; new.asker_id := old.asker_id; new.prompt_id := old.prompt_id;
  new.created_at := old.created_at;
  new.answer := nullif(trim(new.answer), '');
  new.answered_at := case when new.answer is null then null else coalesce(old.answered_at, now()) end;
  return new;
end $$;
create trigger question_answer_guard before update on question
  for each row execute function question_answer_guard();

-- Anti-abuse: cap asks per account (same pattern as post_rate_limit).
create or replace function rate_limit_questions() returns trigger
language plpgsql security definer set search_path = public as $$
declare daily int;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or auth.uid() is null then return new; end if;
  select count(*) into daily from question
   where asker_id = new.asker_id and created_at > now() - interval '24 hours';
  if daily >= 20 then
    raise exception 'That is a lot of questions for one day (max 20). Come back tomorrow.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger question_rate_limit before insert on question
  for each row execute function rate_limit_questions();
