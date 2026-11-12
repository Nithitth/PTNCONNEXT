-- PTN Connext — TCAS Roadmap (Phase 2, release 2).
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0010). Safe to run again.
--
-- What this adds, in plain language:
--
-- 1) tcas_roadmaps: each student's ONE roadmap (the primary key is the student, so a second
--    one is impossible). It points at one TCAS program.
-- 2) tcas_roadmap_boxes: the "boxes" the student builds the roadmap from (GPA, quests, goals…),
--    at most 10 per student. Each box keeps its own data as JSON; the app checks it before saving.
-- 3) tcas_roadmap_templates: suggested quests our team writes per field group and term.
--    Students only see the ones marked as checked by the guidance teacher (approved).
-- 4) tcas_key_dates: TCAS dates (exams, applications) the admin keeps, for countdown boxes.
-- 5) Two staff-only totals functions (no names, groups under 3 students hidden).
--
-- Privacy: a roadmap and its boxes can be read and changed only by the student who owns them.
-- Teachers and admins can't read them (same rule as TCAS targets).
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

create table if not exists public.tcas_roadmaps (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  program_id text not null references public.tcas_programs (program_id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tcas_roadmap_boxes (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.tcas_roadmaps (student_id) on delete cascade,
  kind text not null check (kind in (
    'gpa', 'scores', 'quests', 'portfolio', 'goal', 'countdown', 'activities',
    'notes', 'motto', 'study', 'skills', 'backup', 'links'
  )),
  title text not null check (char_length(title) between 1 and 60),
  sort int not null default 0,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tcas_roadmap_boxes_student_idx on public.tcas_roadmap_boxes (student_id, sort);

create table if not exists public.tcas_roadmap_templates (
  id bigint generated always as identity primary key,
  group_field text not null check (char_length(group_field) between 1 and 200),
  term text not null check (term in ('m4t1', 'm4t2', 'm5t1', 'm5t2', 'm6t1', 'm6t2')),
  title text not null check (char_length(title) between 1 and 100),
  detail text not null default '' check (char_length(detail) <= 500),
  xp smallint not null default 10 check (xp in (10, 20, 30)),
  approved boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.tcas_key_dates (
  id bigint generated always as identity primary key,
  label text not null check (char_length(label) between 1 and 60),
  date date not null,
  tcas_year int not null
);

-- ─── At most 10 boxes per student (checked row by row, like the 5-target limit in 0008) ───
create or replace function public.tcas_roadmap_boxes_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.tcas_roadmap_boxes where student_id = new.student_id) >= 10 then
    raise exception 'at most 10 roadmap boxes per student' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.tcas_roadmap_boxes_limit() from public, anon;

drop trigger if exists tcas_roadmap_boxes_limit on public.tcas_roadmap_boxes;
create trigger tcas_roadmap_boxes_limit
  before insert on public.tcas_roadmap_boxes
  for each row execute function public.tcas_roadmap_boxes_limit();

-- ─── Row Level Security ───
alter table public.tcas_roadmaps enable row level security;
alter table public.tcas_roadmap_boxes enable row level security;
alter table public.tcas_roadmap_templates enable row level security;
alter table public.tcas_key_dates enable row level security;

-- Roadmaps: the owning student only (no one else, admins included).
drop policy if exists "students read own roadmap" on public.tcas_roadmaps;
create policy "students read own roadmap" on public.tcas_roadmaps
  for select to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student');
drop policy if exists "students add own roadmap" on public.tcas_roadmaps;
create policy "students add own roadmap" on public.tcas_roadmaps
  for insert to authenticated
  with check (student_id = (select auth.uid()) and (select public.my_role()) = 'student');
drop policy if exists "students update own roadmap" on public.tcas_roadmaps;
create policy "students update own roadmap" on public.tcas_roadmaps
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student')
  with check (student_id = (select auth.uid()) and (select public.my_role()) = 'student');
drop policy if exists "students delete own roadmap" on public.tcas_roadmaps;
create policy "students delete own roadmap" on public.tcas_roadmaps
  for delete to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student');

-- Boxes: same rule. A box can only hang off the student's own roadmap (foreign key + this check).
drop policy if exists "students read own boxes" on public.tcas_roadmap_boxes;
create policy "students read own boxes" on public.tcas_roadmap_boxes
  for select to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student');
drop policy if exists "students add own boxes" on public.tcas_roadmap_boxes;
create policy "students add own boxes" on public.tcas_roadmap_boxes
  for insert to authenticated
  with check (student_id = (select auth.uid()) and (select public.my_role()) = 'student');
drop policy if exists "students update own boxes" on public.tcas_roadmap_boxes;
create policy "students update own boxes" on public.tcas_roadmap_boxes
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student')
  with check (student_id = (select auth.uid()) and (select public.my_role()) = 'student');
drop policy if exists "students delete own boxes" on public.tcas_roadmap_boxes;
create policy "students delete own boxes" on public.tcas_roadmap_boxes
  for delete to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student');

-- Templates: everyone signed in reads approved ones; admins read and write all.
drop policy if exists "read approved roadmap templates" on public.tcas_roadmap_templates;
create policy "read approved roadmap templates" on public.tcas_roadmap_templates
  for select to authenticated
  using (approved or (select public.is_admin()));
drop policy if exists "admins write roadmap templates" on public.tcas_roadmap_templates;
create policy "admins write roadmap templates" on public.tcas_roadmap_templates
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Key dates: everyone signed in reads; admins write.
drop policy if exists "read tcas key dates" on public.tcas_key_dates;
create policy "read tcas key dates" on public.tcas_key_dates
  for select to authenticated
  using ((select public.my_role()) is not null);
drop policy if exists "admins write tcas key dates" on public.tcas_key_dates;
create policy "admins write tcas key dates" on public.tcas_key_dates
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ─── Staff totals (anonymous; groups under 3 students hidden) ───
create or replace function public.tcas_roadmap_totals()
returns table (group_field text, grade int, students int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  return query
    select p.group_field, c.grade::int, count(*)::int
    from public.tcas_roadmaps r
    join public.tcas_programs p on p.program_id = r.program_id
    join public.profiles pr on pr.id = r.student_id
    left join public.classrooms c on c.id = pr.classroom_id
    group by p.group_field, c.grade
    having count(*) >= 3;
end
$$;

create or replace function public.tcas_roadmap_box_totals()
returns table (kind text, students int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  return query
    select b.kind, count(distinct b.student_id)::int
    from public.tcas_roadmap_boxes b
    group by b.kind
    having count(distinct b.student_id) >= 3;
end
$$;

revoke execute on function public.tcas_roadmap_totals(), public.tcas_roadmap_box_totals() from public, anon;
grant execute on function public.tcas_roadmap_totals(), public.tcas_roadmap_box_totals() to authenticated, service_role;

commit;
