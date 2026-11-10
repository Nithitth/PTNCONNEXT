-- PTN Connext — Phase 1: exactly 6 subjects (fixed colors) and 8 classrooms.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0001 and 0002).
-- Safe to run again if it stopped half-way. Keep in sync with src/lib/school.ts.

-- 1) The six subjects. `code` is the key the app uses; colors are the calendar dots.
insert into public.subjects (code, name_th, color) values
  ('math',    'คณิตศาสตร์',   '#EA7A1F'),  -- orange
  ('pat',     'PAT',          '#8A4FD8'),  -- purple
  ('social',  'สังคมศึกษา',   '#8B5A2B'),  -- brown
  ('science', 'วิทยาศาสตร์',  '#23995A'),  -- green
  ('thai',    'ภาษาไทย',      '#C99A06'),  -- gold
  ('english', 'ภาษาอังกฤษ',   '#2D7FD3')   -- blue
on conflict (code) do update set name_th = excluded.name_th, color = excluded.color;

-- 2) Which of the six an older subject (e.g. "ค32101 คณิตศาสตร์") belongs to.
create or replace function public.phase1_subject_code(old_code text, old_name text) returns text
language sql immutable as $$
  select case
    when old_code ilike 'pat%' or old_name ilike '%pat%' then 'pat'
    when old_code like 'ค%' or old_name like '%คณิต%' then 'math'
    when old_code like 'ว%' or old_name ~ '(วิทย|ฟิสิกส์|เคมี|ชีว)' then 'science'
    when old_code like 'ส%' or old_name like '%สังคม%' then 'social'
    when old_code like 'ท%' or old_name like '%ไทย%' then 'thai'
    when old_code like 'อ%' or old_name like '%อังกฤษ%' then 'english'
  end
$$;

-- Move posts and teaching rows from older subjects onto the matching new one.
update public.posts p
set subject_id = n.id
from public.subjects s
join public.subjects n on n.code = public.phase1_subject_code(s.code, s.name_th)
where p.subject_id = s.id
  and s.code not in ('math', 'pat', 'social', 'science', 'thai', 'english');

insert into public.teaching_assignments (teacher_id, classroom_id, subject_id)
select t.teacher_id, t.classroom_id, n.id
from public.teaching_assignments t
join public.subjects s on s.id = t.subject_id
join public.subjects n on n.code = public.phase1_subject_code(s.code, s.name_th)
where s.code not in ('math', 'pat', 'social', 'science', 'thai', 'english')
on conflict do nothing;

drop function public.phase1_subject_code(text, text);

-- Old subjects go (their teaching rows go with them; a post that matched nothing keeps no subject).
delete from public.subjects where code not in ('math', 'pat', 'social', 'science', 'thai', 'english');

-- From now on, only these six can exist.
alter table public.subjects drop constraint if exists subjects_only_six;
alter table public.subjects
  add constraint subjects_only_six check (code in ('math', 'pat', 'social', 'science', 'thai', 'english'));

-- 3) The eight classrooms for this school year (พ.ศ., starts in May): ม.4/1–4 and ม.5/1–4.
--    The roster import creates them in later years; the app only lists these eight.
insert into public.classrooms (grade, room, academic_year)
select g, r,
  extract(year from now() at time zone 'Asia/Bangkok')::int + 543
    - case when extract(month from now() at time zone 'Asia/Bangkok') < 5 then 1 else 0 end
from generate_series(4, 5) as g, generate_series(1, 4) as r
on conflict (grade, room, academic_year) do nothing;
