-- PTN Connext — TCASter: last year's Round 3 admitted scores (lowest / highest, seats, applicants).
-- Source: the official TCAS min/max sheet on mytcas.com/stat, read during the admin pull.
-- After running this, re-pull and re-publish all 5 universities in Developer Console → ข้อมูล TCAS.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0008). Safe to run again.

alter table public.tcas_round3
  add column if not exists last_min numeric,
  add column if not exists last_max numeric,
  add column if not exists last_seats int,
  add column if not exists last_applicants int;

alter table public.tcas_programs
  add column if not exists last_min numeric,
  add column if not exists last_max numeric,
  add column if not exists last_seats int,
  add column if not exists last_applicants int;

-- Same as 0007, plus the last-year columns.
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
      active, fingerprint, source_updated_at, published_at,
      last_min, last_max, last_seats, last_applicants
    ) values (
      r.program_id, p ->> 'university_id', p ->> 'university_name', coalesce(p ->> 'campus', ''),
      coalesce(p ->> 'faculty', ''), coalesce(p ->> 'group_field', ''), coalesce(p ->> 'field', ''),
      p ->> 'name_th', coalesce(p ->> 'name_en', ''), coalesce(p ->> 'program_type', ''), coalesce(p ->> 'cost', ''),
      (p ->> 'round1_seats')::int, (p ->> 'round3_seats')::int, (p ->> 'tcas_year')::int,
      true, r.payload ->> 'fingerprint', nullif(p ->> 'source_updated_at', '')::timestamptz, now(),
      (p ->> 'last_min')::numeric, (p ->> 'last_max')::numeric, (p ->> 'last_seats')::int, (p ->> 'last_applicants')::int
    )
    on conflict (program_id) do update set
      university_id = excluded.university_id, university_name = excluded.university_name,
      campus = excluded.campus, faculty = excluded.faculty, group_field = excluded.group_field,
      field = excluded.field, name_th = excluded.name_th, name_en = excluded.name_en,
      program_type = excluded.program_type, cost = excluded.cost,
      round1_seats = excluded.round1_seats, round3_seats = excluded.round3_seats,
      tcas_year = excluded.tcas_year, active = true, fingerprint = excluded.fingerprint,
      source_updated_at = excluded.source_updated_at, published_at = excluded.published_at,
      last_min = excluded.last_min, last_max = excluded.last_max,
      last_seats = excluded.last_seats, last_applicants = excluded.last_applicants;

    delete from public.tcas_round1_projects where program_id = r.program_id;
    insert into public.tcas_round1_projects (program_id, project_name, seats, portfolio, criteria, link)
    select r.program_id, x ->> 'project_name', (x ->> 'seats')::int,
           coalesce(x ->> 'portfolio', ''), coalesce(x ->> 'criteria', ''), x ->> 'link'
    from jsonb_array_elements(coalesce(r.payload -> 'round1', '[]'::jsonb)) as x;

    delete from public.tcas_round3 where program_id = r.program_id;
    insert into public.tcas_round3 (program_id, position, project_name, seats, min_gpax, min_total, weights, conditions, link, problem,
                                    last_min, last_max, last_seats, last_applicants)
    select r.program_id, (x ->> 'position')::smallint, x ->> 'project_name', (x ->> 'seats')::int,
           (x ->> 'min_gpax')::numeric, (x ->> 'min_total')::numeric,
           coalesce(x -> 'weights', '{}'::jsonb), coalesce(x -> 'conditions', '{}'::jsonb),
           x ->> 'link', x ->> 'problem',
           (x ->> 'last_min')::numeric, (x ->> 'last_max')::numeric, (x ->> 'last_seats')::int, (x ->> 'last_applicants')::int
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

revoke execute on function public.tcas_publish(text) from public, anon;
grant execute on function public.tcas_publish(text) to authenticated, service_role;
