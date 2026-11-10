-- PTN Connext — two kinds of exam.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0003). Safe to run again.
--   quiz  = สอบเก็บคะแนน / สอบย่อย      (calendar: light / dark amber)
--   major = สอบกลางภาค / ปลายภาค          (calendar: light / dark red)
-- Existing exams become "quiz". Non-exam posts just keep the default.
alter table public.posts
  add column if not exists exam_kind text not null default 'quiz'
  check (exam_kind in ('quiz', 'major'));
