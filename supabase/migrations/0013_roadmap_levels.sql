-- PTN Connext — Roadmap levels: stages, streaks, rewards, proof uploads, class comparison.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0012). Safe to run again.
-- Design: docs/specs/2026-11-13-roadmap-levels-design.md
--
-- What this adds, in plain language:
-- 1) On each roadmap: the stage (1–6), the highest stage ever reached, XP, the weekly streak and the
--    chosen card frame/theme. The app's server works these out and saves them; users can't write the
--    stage, XP or streak themselves (so the class comparison can't be faked).
-- 2) tcas_roadmap_proofs: evidence for gate steps (a file, a link or a number). Owner only.
-- 3) A private storage bucket "roadmap-proofs" for those photos/PDFs (5 MB, owner-only folders).
-- 4) roadmap_class_stats(): for a student, how many classmates have a roadmap, the room's average
--    stage, and how many are behind them. No names; nothing is shown under 3 students.
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

-- ─── 1) Stage, XP, streak, rewards on each roadmap ───
alter table public.tcas_roadmaps
  add column if not exists stage smallint not null default 1,
  add column if not exists max_stage smallint not null default 1,
  add column if not exists finished boolean not null default false,
  add column if not exists xp integer not null default 0,
  add column if not exists streak integer not null default 0,
  add column if not exists best_streak integer not null default 0,
  add column if not exists last_active_week date,
  add column if not exists frame text not null default 'glass',
  add column if not exists theme text not null default 'classic';

alter table public.tcas_roadmaps drop constraint if exists tcas_roadmaps_levels_check;
alter table public.tcas_roadmaps add constraint tcas_roadmaps_levels_check check (
  stage between 1 and 6 and max_stage between 1 and 6 and xp >= 0 and streak >= 0 and best_streak >= 0
  and char_length(frame) <= 20 and char_length(theme) <= 20
);

-- Users may only write the program, the option and their chosen frame/theme. Stage, XP and streak
-- are written by the server (service role) after it recomputes them from the boxes and proof.
revoke insert, update on public.tcas_roadmaps from authenticated;
grant insert (student_id, program_id, position) on public.tcas_roadmaps to authenticated;
grant update (program_id, position, updated_at, frame, theme) on public.tcas_roadmaps to authenticated;

-- ─── 2) Proof ───
create table if not exists public.tcas_roadmap_proofs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.tcas_roadmaps (student_id) on delete cascade,
  step text not null check (step ~ '^(gpax|portfolio-link|act:[a-z0-9]{1,16}|score:[a-z0-9_]{1,20})$'),
  kind text not null check (kind in ('file', 'link', 'number')),
  file_path text check (file_path is null or file_path like owner_id::text || '/%'),
  url text check (url is null or (url ~ '^https?://' and char_length(url) <= 500)),
  value numeric check (value is null or (value >= 0 and value <= 100)),
  created_at timestamptz not null default now(),
  unique (owner_id, step)
);
create index if not exists tcas_roadmap_proofs_owner_idx on public.tcas_roadmap_proofs (owner_id);
alter table public.tcas_roadmap_proofs enable row level security;

drop policy if exists "owners read own proofs" on public.tcas_roadmap_proofs;
create policy "owners read own proofs" on public.tcas_roadmap_proofs
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "owners add own proofs" on public.tcas_roadmap_proofs;
create policy "owners add own proofs" on public.tcas_roadmap_proofs
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "owners update own proofs" on public.tcas_roadmap_proofs;
create policy "owners update own proofs" on public.tcas_roadmap_proofs
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.my_role()) is not null)
  with check (owner_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "owners delete own proofs" on public.tcas_roadmap_proofs;
create policy "owners delete own proofs" on public.tcas_roadmap_proofs
  for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.my_role()) is not null);

-- ─── 3) Private storage for proof photos/PDFs ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roadmap-proofs', 'roadmap-proofs', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "proof owners upload" on storage.objects;
create policy "proof owners upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'roadmap-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "proof owners read" on storage.objects;
create policy "proof owners read" on storage.objects
  for select to authenticated using (
    bucket_id = 'roadmap-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "proof owners delete" on storage.objects;
create policy "proof owners delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'roadmap-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ─── 4) Anonymous class comparison (students only, 3+ classmates with a roadmap) ───
create or replace function public.roadmap_class_stats()
returns table (students int, avg_stage numeric, behind int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_class uuid;
  v_stage int;
begin
  select pr.classroom_id into v_class from public.profiles pr where pr.id = auth.uid() and pr.role = 'student';
  if v_class is null then
    return;
  end if;
  select r.stage into v_stage from public.tcas_roadmaps r where r.student_id = auth.uid();
  return query
    select count(*)::int,
           round(avg(r.stage)::numeric, 1),
           (count(*) filter (where r.stage < coalesce(v_stage, 0)))::int
    from public.tcas_roadmaps r
    join public.profiles p on p.id = r.student_id and p.role = 'student' and p.classroom_id = v_class
    having count(*) >= 3;
end
$$;
revoke execute on function public.roadmap_class_stats() from public, anon;
grant execute on function public.roadmap_class_stats() to authenticated, service_role;

commit;
