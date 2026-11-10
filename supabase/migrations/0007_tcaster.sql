-- PTN Connext — TCASter (Phase 2, release 1).
-- Program data from the official TCAS database, pulled by the admin into a staging
-- table and published with tcas_publish(). Students save up to 5 private targets.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0006). Safe to run again.

-- ─────────────────────────────────────────────────────────────
-- Live program data (written only by tcas_publish)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tcas_programs (
  program_id text primary key,
  university_id text not null,
  university_name text not null,
  campus text not null default '',
  faculty text not null default '',
  group_field text not null default '',
  field text not null default '',
  name_th text not null,
  name_en text not null default '',
  program_type text not null default '',
  cost text not null default '',
  round1_seats int,
  round3_seats int,
  tcas_year int not null,
  active boolean not null default true,
  fingerprint text,
  source_updated_at timestamptz,
  published_at timestamptz
);
create index if not exists tcas_programs_university_idx on public.tcas_programs (university_id, active);

create table if not exists public.tcas_round1_projects (
  id bigint generated always as identity primary key,
  program_id text not null references public.tcas_programs (program_id) on delete cascade,
  project_name text,
  seats int,
  portfolio text not null default '',
  criteria text not null default '',
  link text
);
create index if not exists tcas_round1_program_idx on public.tcas_round1_projects (program_id);

create table if not exists public.tcas_round3 (
  id bigint generated always as identity primary key,
  program_id text not null references public.tcas_programs (program_id) on delete cascade,
  position smallint not null default 0,
  project_name text,
  seats int,
  min_gpax numeric,
  min_total numeric,
  weights jsonb not null default '{}',
  conditions jsonb not null default '{}',
  link text,
  problem text
);
create index if not exists tcas_round3_program_idx on public.tcas_round3 (program_id);

-- What the admin pulled but hasn't published yet (service key only).
create table if not exists public.tcas_staging (
  university_id text not null,
  program_id text not null,
  payload jsonb not null,
  pulled_at timestamptz not null default now(),
  primary key (university_id, program_id)
);

create table if not exists public.tcas_publishes (
  id bigint generated always as identity primary key,
  university_id text not null,
  tcas_year int,
  added int not null default 0,
  changed int not null default 0,
  removed int not null default 0,
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now()
);

-- A student's saved target programs (private to them).
create table if not exists public.tcas_targets (
  student_id uuid not null references public.profiles (id) on delete cascade,
  program_id text not null references public.tcas_programs (program_id) on delete cascade,
  position smallint not null default 0,
  slider_scores jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, program_id)
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.tcas_programs enable row level security;
alter table public.tcas_round1_projects enable row level security;
alter table public.tcas_round3 enable row level security;
alter table public.tcas_staging enable row level security;   -- no policies: service key only
alter table public.tcas_publishes enable row level security;
alter table public.tcas_targets enable row level security;

drop policy if exists "tcas programs readable" on public.tcas_programs;
create policy "tcas programs readable" on public.tcas_programs
  for select to authenticated using (public.my_role() is not null);
drop policy if exists "tcas round1 readable" on public.tcas_round1_projects;
create policy "tcas round1 readable" on public.tcas_round1_projects
  for select to authenticated using (public.my_role() is not null);
drop policy if exists "tcas round3 readable" on public.tcas_round3;
create policy "tcas round3 readable" on public.tcas_round3
  for select to authenticated using (public.my_role() is not null);

drop policy if exists "admins read tcas publishes" on public.tcas_publishes;
create policy "admins read tcas publishes" on public.tcas_publishes
  for select to authenticated using (public.is_admin());

-- How many targets the current user already has (used by the insert rule).
create or replace function public.my_tcas_target_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.tcas_targets where student_id = auth.uid()
$$;

drop policy if exists "students read own targets" on public.tcas_targets;
create policy "students read own targets" on public.tcas_targets
  for select to authenticated using (student_id = auth.uid() and public.my_role() = 'student');
drop policy if exists "students add own targets" on public.tcas_targets;
create policy "students add own targets" on public.tcas_targets
  for insert to authenticated with check (
    student_id = auth.uid() and public.my_role() = 'student' and public.my_tcas_target_count() < 5
  );
drop policy if exists "students update own targets" on public.tcas_targets;
create policy "students update own targets" on public.tcas_targets
  for update to authenticated
  using (student_id = auth.uid() and public.my_role() = 'student')
  with check (student_id = auth.uid() and public.my_role() = 'student');
drop policy if exists "students delete own targets" on public.tcas_targets;
create policy "students delete own targets" on public.tcas_targets
  for delete to authenticated using (student_id = auth.uid() and public.my_role() = 'student');

-- ─────────────────────────────────────────────────────────────
-- Publish one university's staged programs (admin only, all-or-nothing)
-- The payload shape is NormalizedProgram in src/lib/tcasSource.ts.
-- ─────────────────────────────────────────────────────────────
create or replace function public.tcas_publish(p_university text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_added int := 0;
  v_changed int := 0;
  v_removed int := 0;
  v_year int;
  r record;
  p jsonb;
  v_old text;
  v_active boolean;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if not exists (select 1 from public.tcas_staging where university_id = p_university) then
    raise exception 'nothing staged for %', p_university;
  end if;

  for r in select program_id, payload from public.tcas_staging where university_id = p_university loop
    p := r.payload -> 'program';
    select fingerprint, active into v_old, v_active from public.tcas_programs where program_id = r.program_id;
    if not found then
      v_added := v_added + 1;
    elsif v_old is distinct from (r.payload ->> 'fingerprint') or not v_active then
      v_changed := v_changed + 1;
    end if;
    v_year := greatest(coalesce(v_year, 0), (p ->> 'tcas_year')::int);

    insert into public.tcas_programs as t (
      program_id, university_id, university_name, campus, faculty, group_field, field,
      name_th, name_en, program_type, cost, round1_seats, round3_seats, tcas_year,
      active, fingerprint, source_updated_at, published_at
    ) values (
      r.program_id, p ->> 'university_id', p ->> 'university_name', coalesce(p ->> 'campus', ''),
      coalesce(p ->> 'faculty', ''), coalesce(p ->> 'group_field', ''), coalesce(p ->> 'field', ''),
      p ->> 'name_th', coalesce(p ->> 'name_en', ''), coalesce(p ->> 'program_type', ''), coalesce(p ->> 'cost', ''),
      (p ->> 'round1_seats')::int, (p ->> 'round3_seats')::int, (p ->> 'tcas_year')::int,
      true, r.payload ->> 'fingerprint', nullif(p ->> 'source_updated_at', '')::timestamptz, now()
    )
    on conflict (program_id) do update set
      university_id = excluded.university_id, university_name = excluded.university_name,
      campus = excluded.campus, faculty = excluded.faculty, group_field = excluded.group_field,
      field = excluded.field, name_th = excluded.name_th, name_en = excluded.name_en,
      program_type = excluded.program_type, cost = excluded.cost,
      round1_seats = excluded.round1_seats, round3_seats = excluded.round3_seats,
      tcas_year = excluded.tcas_year, active = true, fingerprint = excluded.fingerprint,
      source_updated_at = excluded.source_updated_at, published_at = excluded.published_at;

    delete from public.tcas_round1_projects where program_id = r.program_id;
    insert into public.tcas_round1_projects (program_id, project_name, seats, portfolio, criteria, link)
    select r.program_id, x ->> 'project_name', (x ->> 'seats')::int,
           coalesce(x ->> 'portfolio', ''), coalesce(x ->> 'criteria', ''), x ->> 'link'
    from jsonb_array_elements(coalesce(r.payload -> 'round1', '[]'::jsonb)) as x;

    delete from public.tcas_round3 where program_id = r.program_id;
    insert into public.tcas_round3 (program_id, position, project_name, seats, min_gpax, min_total, weights, conditions, link, problem)
    select r.program_id, (x ->> 'position')::smallint, x ->> 'project_name', (x ->> 'seats')::int,
           (x ->> 'min_gpax')::numeric, (x ->> 'min_total')::numeric,
           coalesce(x -> 'weights', '{}'::jsonb), coalesce(x -> 'conditions', '{}'::jsonb),
           x ->> 'link', x ->> 'problem'
    from jsonb_array_elements(coalesce(r.payload -> 'round3', '[]'::jsonb)) as x;
  end loop;

  -- Programs TCAS no longer lists are hidden, not deleted (students' targets keep working).
  update public.tcas_programs set active = false
  where university_id = p_university and active
    and program_id not in (select program_id from public.tcas_staging where university_id = p_university);
  get diagnostics v_removed = row_count;

  insert into public.tcas_publishes (university_id, tcas_year, added, changed, removed, published_by)
  values (p_university, v_year, v_added, v_changed, v_removed, auth.uid());

  delete from public.tcas_staging where university_id = p_university;
  return json_build_object('added', v_added, 'changed', v_changed, 'removed', v_removed);
end
$$;

-- ─────────────────────────────────────────────────────────────
-- Anonymous totals for staff (groups of 3+ students only)
-- ─────────────────────────────────────────────────────────────
create or replace function public.tcas_target_totals()
returns table (group_field text, faculty text, university_name text, grade int, students int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  return query
    select p.group_field, p.faculty, p.university_name, c.grade::int, count(distinct t.student_id)::int
    from public.tcas_targets t
    join public.tcas_programs p on p.program_id = t.program_id and p.active
    join public.profiles pr on pr.id = t.student_id
    left join public.classrooms c on c.id = pr.classroom_id
    group by p.group_field, p.faculty, p.university_name, c.grade
    having count(distinct t.student_id) >= 3;
end
$$;

revoke execute on function public.tcas_publish(text), public.tcas_target_totals(), public.my_tcas_target_count() from public, anon;
grant execute on function public.tcas_publish(text), public.tcas_target_totals(), public.my_tcas_target_count() to authenticated, service_role;
