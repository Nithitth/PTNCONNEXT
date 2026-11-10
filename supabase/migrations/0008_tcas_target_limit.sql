-- PTN Connext — enforce "at most 5 TCASter targets per student" row by row.
-- The 0007 insert rule counted targets once per request, so saving several targets in
-- one request could go past 5. A trigger sees the rows inserted earlier in the same request.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0007). Safe to run again.

create or replace function public.tcas_targets_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.tcas_targets where student_id = new.student_id) >= 5 then
    raise exception 'at most 5 TCASter targets per student' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke execute on function public.tcas_targets_limit() from public, anon;

drop trigger if exists tcas_targets_limit on public.tcas_targets;
create trigger tcas_targets_limit
  before insert on public.tcas_targets
  for each row execute function public.tcas_targets_limit();

-- The count now lives in the trigger; the insert rule only checks ownership.
drop policy if exists "students add own targets" on public.tcas_targets;
create policy "students add own targets" on public.tcas_targets
  for insert to authenticated with check (student_id = auth.uid() and public.my_role() = 'student');
