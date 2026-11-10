-- PTN Connext — who may edit and delete posts.
--   * Admins: every post.
--   * Teachers: their own posts, plus any post in a subject they teach
--     (so co-teachers of one subject can manage each other's work).
--     School events have no subject, so only their author or an admin manages them.
-- Nobody can change who wrote a post, or its kind, after it's created.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0005). Safe to run again.

-- Does the current user teach this subject (in any classroom)?
create or replace function public.teaches_subject(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select s is not null and exists (
    select 1 from public.teaching_assignments
    where teacher_id = auth.uid() and subject_id = s
  )
$$;

-- May the current user edit / delete this (already saved) post?
create or replace function public.can_manage_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from public.posts
      where id = p and (author_id = auth.uid() or public.teaches_subject(subject_id))
    )
$$;

-- Teachers also see every post in the subjects they teach.
create or replace function public.can_see_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from public.posts
      where id = p and (author_id = auth.uid() or public.teaches_subject(subject_id))
    )
    or exists (
      select 1 from public.post_targets t
      where t.post_id = p
        and (t.classroom_id is null or t.classroom_id = public.my_classroom())
    )
$$;

revoke execute on function public.teaches_subject(uuid), public.can_manage_post(uuid) from public, anon;
grant execute on function public.teaches_subject(uuid), public.can_manage_post(uuid) to authenticated, service_role;

-- Posts (direct column checks, so they also work on a row being written)
drop policy if exists "read visible posts" on public.posts;
create policy "read visible posts" on public.posts
  for select to authenticated
  using (author_id = auth.uid() or public.teaches_subject(subject_id) or public.can_see_post(id));

drop policy if exists "author or admin updates" on public.posts;
drop policy if exists "managers update posts" on public.posts;
create policy "managers update posts" on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.teaches_subject(subject_id))
  with check (author_id = auth.uid() or public.is_admin() or public.teaches_subject(subject_id));

drop policy if exists "author or admin deletes" on public.posts;
drop policy if exists "managers delete posts" on public.posts;
create policy "managers delete posts" on public.posts
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin() or public.teaches_subject(subject_id));

-- Only these columns can be changed after a post is created (not author_id or type).
revoke update on public.posts from authenticated, anon;
grant update (subject_id, title, description, content_order, exam_kind, updated_at) on public.posts to authenticated;

-- Classroom targets (whole school stays admin-only)
drop policy if exists "author targets allowed classrooms" on public.post_targets;
drop policy if exists "managers add targets" on public.post_targets;
create policy "managers add targets" on public.post_targets
  for insert to authenticated with check (
    public.can_manage_post(post_id) and (public.is_admin() or classroom_id is not null)
  );

drop policy if exists "author updates targets" on public.post_targets;
drop policy if exists "managers update targets" on public.post_targets;
create policy "managers update targets" on public.post_targets
  for update to authenticated
  using (public.can_manage_post(post_id))
  with check (public.can_manage_post(post_id) and (public.is_admin() or classroom_id is not null));

drop policy if exists "author deletes targets" on public.post_targets;
drop policy if exists "managers delete targets" on public.post_targets;
create policy "managers delete targets" on public.post_targets
  for delete to authenticated using (public.can_manage_post(post_id));

-- Attachments follow their post
drop policy if exists "author adds attachments" on public.attachments;
drop policy if exists "managers add attachments" on public.attachments;
create policy "managers add attachments" on public.attachments
  for insert to authenticated with check (public.can_manage_post(post_id));

drop policy if exists "author removes attachments" on public.attachments;
drop policy if exists "managers remove attachments" on public.attachments;
create policy "managers remove attachments" on public.attachments
  for delete to authenticated using (public.can_manage_post(post_id));
