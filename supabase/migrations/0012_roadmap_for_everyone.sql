-- PTN Connext — let everyone (students, teachers, admins) make their own Roadmap.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0011). Safe to run again.
--
-- What changes, in plain language:
-- 1) The Roadmap rules no longer require the "student" role. Anyone signed in can create,
--    read, change and delete THEIR OWN roadmap and boxes. Nobody can see anyone else's
--    (admins included) — that part is unchanged.
-- 2) The staff totals keep counting students only, so teachers trying the feature don't
--    show up in "นักเรียนที่มี Roadmap".
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

-- ─── Roadmaps: owner only, any role ───
drop policy if exists "students read own roadmap" on public.tcas_roadmaps;
drop policy if exists "students add own roadmap" on public.tcas_roadmaps;
drop policy if exists "students update own roadmap" on public.tcas_roadmaps;
drop policy if exists "students delete own roadmap" on public.tcas_roadmaps;

drop policy if exists "users read own roadmap" on public.tcas_roadmaps;
create policy "users read own roadmap" on public.tcas_roadmaps
  for select to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "users add own roadmap" on public.tcas_roadmaps;
create policy "users add own roadmap" on public.tcas_roadmaps
  for insert to authenticated
  with check (student_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "users update own roadmap" on public.tcas_roadmaps;
create policy "users update own roadmap" on public.tcas_roadmaps
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) is not null)
  with check (student_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "users delete own roadmap" on public.tcas_roadmaps;
create policy "users delete own roadmap" on public.tcas_roadmaps
  for delete to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) is not null);

-- ─── Boxes: owner only, any role ───
drop policy if exists "students read own boxes" on public.tcas_roadmap_boxes;
drop policy if exists "students add own boxes" on public.tcas_roadmap_boxes;
drop policy if exists "students update own boxes" on public.tcas_roadmap_boxes;
drop policy if exists "students delete own boxes" on public.tcas_roadmap_boxes;

drop policy if exists "users read own boxes" on public.tcas_roadmap_boxes;
create policy "users read own boxes" on public.tcas_roadmap_boxes
  for select to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "users add own boxes" on public.tcas_roadmap_boxes;
create policy "users add own boxes" on public.tcas_roadmap_boxes
  for insert to authenticated
  with check (student_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "users update own boxes" on public.tcas_roadmap_boxes;
create policy "users update own boxes" on public.tcas_roadmap_boxes
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) is not null)
  with check (student_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists "users delete own boxes" on public.tcas_roadmap_boxes;
create policy "users delete own boxes" on public.tcas_roadmap_boxes
  for delete to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) is not null);

-- ─── Staff totals: students only ───
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
    join public.profiles pr on pr.id = r.student_id and pr.role = 'student'
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
    join public.profiles pr on pr.id = b.student_id and pr.role = 'student'
    group by b.kind
    having count(distinct b.student_id) >= 3;
end
$$;

revoke execute on function public.tcas_roadmap_totals(), public.tcas_roadmap_box_totals() from public, anon;
grant execute on function public.tcas_roadmap_totals(), public.tcas_roadmap_box_totals() to authenticated, service_role;

commit;
