-- PTN Connext — speed-up for the database (no change to who can see what).
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0009). Safe to run again.
--
-- What this does, in plain language:
--
-- 1) Adds "indexes" (like the index at the back of a book) on columns the app looks
--    things up by, e.g. "all posts by this teacher" or "this user's feedback today".
--    Without them Postgres reads the whole table; that's fine with 10 rows, slow with 10,000.
--
-- 2) Rewrites the security rules (RLS policies) so that questions about the *current user*
--    — "who am I?" auth.uid(), "what's my role?" my_role(), is_admin(), is_staff(),
--    my_classroom() — are asked ONCE per request instead of once for every row checked.
--    Writing them as (select public.is_admin()) is Supabase's recommended trick for this.
--    Questions about a specific row (can_see_post(id), teaches_subject(subject_id), …)
--    must still be asked per row, so those stay as they were.
--    Every rule keeps exactly the same meaning; only the wording changes.
--
-- 3) Applies the same trick inside the helper functions.
--
-- Afterwards run `npm run check:security` — all checks must still pass.
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1) Indexes
--    Already covered, so not added again:
--      post_targets (classroom_id), post_targets (post_id)   — 0001
--      login_events (created_at desc)                         — 0001
--      tcas_targets (student_id) — the primary key (student_id, program_id) starts with it
-- ─────────────────────────────────────────────────────────────
create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists posts_subject_idx on public.posts (subject_id);
-- The primary key is (teacher_id, classroom_id, subject_id); teaches_subject() needs teacher + subject.
create index if not exists teaching_assignments_teacher_subject_idx
  on public.teaching_assignments (teacher_id, subject_id);
create index if not exists attachments_post_idx on public.attachments (post_id);
-- The feedback box counts "your messages in the last 24 hours".
create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at);
create index if not exists error_logs_created_idx on public.error_logs (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3) Helper functions (same names, arguments, results and permissions;
--    create or replace keeps the existing grants)
-- ─────────────────────────────────────────────────────────────
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.my_classroom() returns uuid
language sql stable security definer set search_path = public as $$
  select classroom_id from public.profiles where id = (select auth.uid())
$$;

create or replace function public.is_post_author(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts where id = p and author_id = (select auth.uid()))
$$;

create or replace function public.teaches_subject(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select s is not null and exists (
    select 1 from public.teaching_assignments
    where teacher_id = (select auth.uid()) and subject_id = s
  )
$$;

create or replace function public.can_manage_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select public.is_admin())
    or exists (
      select 1 from public.posts
      where id = p and (author_id = (select auth.uid()) or public.teaches_subject(subject_id))
    )
$$;

create or replace function public.can_see_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select public.is_admin())
    or exists (
      select 1 from public.posts
      where id = p and (author_id = (select auth.uid()) or public.teaches_subject(subject_id))
    )
    or exists (
      select 1 from public.post_targets t
      where t.post_id = p
        and (t.classroom_id is null or t.classroom_id = (select public.my_classroom()))
    )
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) Policies — every current policy, same logic, current-user calls wrapped
-- ─────────────────────────────────────────────────────────────

-- Reference data
drop policy if exists "classrooms readable" on public.classrooms;
create policy "classrooms readable" on public.classrooms
  for select to authenticated using ((select public.my_role()) is not null);

drop policy if exists "subjects readable" on public.subjects;
create policy "subjects readable" on public.subjects
  for select to authenticated using ((select public.my_role()) is not null);

-- Profiles
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

-- Teaching assignments
drop policy if exists "read own teaching" on public.teaching_assignments;
create policy "read own teaching" on public.teaching_assignments
  for select to authenticated using (teacher_id = (select auth.uid()) or (select public.is_admin()));

-- Posts
drop policy if exists "read visible posts" on public.posts;
create policy "read visible posts" on public.posts
  for select to authenticated
  using (author_id = (select auth.uid()) or public.teaches_subject(subject_id) or public.can_see_post(id));

drop policy if exists "staff create own posts" on public.posts;
create policy "staff create own posts" on public.posts
  for insert to authenticated
  with check ((select public.is_staff()) and author_id = (select auth.uid()));

drop policy if exists "managers update posts" on public.posts;
create policy "managers update posts" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()) or public.teaches_subject(subject_id))
  with check (author_id = (select auth.uid()) or (select public.is_admin()) or public.teaches_subject(subject_id));

drop policy if exists "managers delete posts" on public.posts;
create policy "managers delete posts" on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()) or public.teaches_subject(subject_id));

-- Post targets
drop policy if exists "read targets of visible posts" on public.post_targets;
create policy "read targets of visible posts" on public.post_targets
  for select to authenticated using (public.can_see_post(post_id));

drop policy if exists "managers add targets" on public.post_targets;
create policy "managers add targets" on public.post_targets
  for insert to authenticated with check (
    public.can_manage_post(post_id) and ((select public.is_admin()) or classroom_id is not null)
  );

drop policy if exists "managers update targets" on public.post_targets;
create policy "managers update targets" on public.post_targets
  for update to authenticated
  using (public.can_manage_post(post_id))
  with check (public.can_manage_post(post_id) and ((select public.is_admin()) or classroom_id is not null));

drop policy if exists "managers delete targets" on public.post_targets;
create policy "managers delete targets" on public.post_targets
  for delete to authenticated using (public.can_manage_post(post_id));

-- Attachments
drop policy if exists "read attachments of visible posts" on public.attachments;
create policy "read attachments of visible posts" on public.attachments
  for select to authenticated using (public.can_see_post(post_id));

drop policy if exists "managers add attachments" on public.attachments;
create policy "managers add attachments" on public.attachments
  for insert to authenticated with check (public.can_manage_post(post_id));

drop policy if exists "managers remove attachments" on public.attachments;
create policy "managers remove attachments" on public.attachments
  for delete to authenticated using (public.can_manage_post(post_id));

-- Feedback
drop policy if exists "send own feedback" on public.feedback;
create policy "send own feedback" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.my_role()) is not null);

drop policy if exists "admins read feedback" on public.feedback;
create policy "admins read feedback" on public.feedback
  for select to authenticated using ((select public.is_admin()));

-- Logs
drop policy if exists "admins read logins" on public.login_events;
create policy "admins read logins" on public.login_events
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "admins read errors" on public.error_logs;
create policy "admins read errors" on public.error_logs
  for select to authenticated using ((select public.is_admin()));

-- TCAS program data
drop policy if exists "tcas programs readable" on public.tcas_programs;
create policy "tcas programs readable" on public.tcas_programs
  for select to authenticated using ((select public.my_role()) is not null);

drop policy if exists "tcas round1 readable" on public.tcas_round1_projects;
create policy "tcas round1 readable" on public.tcas_round1_projects
  for select to authenticated using ((select public.my_role()) is not null);

drop policy if exists "tcas round3 readable" on public.tcas_round3;
create policy "tcas round3 readable" on public.tcas_round3
  for select to authenticated using ((select public.my_role()) is not null);

drop policy if exists "admins read tcas publishes" on public.tcas_publishes;
create policy "admins read tcas publishes" on public.tcas_publishes
  for select to authenticated using ((select public.is_admin()));

-- TCAS targets (private to the student; the 5-target limit is the 0008 trigger)
drop policy if exists "students read own targets" on public.tcas_targets;
create policy "students read own targets" on public.tcas_targets
  for select to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student');

drop policy if exists "students add own targets" on public.tcas_targets;
create policy "students add own targets" on public.tcas_targets
  for insert to authenticated
  with check (student_id = (select auth.uid()) and (select public.my_role()) = 'student');

drop policy if exists "students update own targets" on public.tcas_targets;
create policy "students update own targets" on public.tcas_targets
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student')
  with check (student_id = (select auth.uid()) and (select public.my_role()) = 'student');

drop policy if exists "students delete own targets" on public.tcas_targets;
create policy "students delete own targets" on public.tcas_targets
  for delete to authenticated
  using (student_id = (select auth.uid()) and (select public.my_role()) = 'student');

-- File storage (materials bucket)
drop policy if exists "staff upload own folder" on storage.objects;
create policy "staff upload own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'materials'
    and (select public.is_staff())
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "staff delete own files" on storage.objects;
create policy "staff delete own files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

commit;
