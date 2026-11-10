-- PTN Connext — teachers may post to any classroom (Phase 1: the 8 rooms are
-- chosen in the app), not only the rooms they teach. Whole-school posts
-- (classroom_id null) stay admin-only.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0004). Safe to run again.

drop policy if exists "author targets allowed classrooms" on public.post_targets;
create policy "author targets allowed classrooms" on public.post_targets
  for insert to authenticated with check (
    public.is_post_author(post_id)
    and (public.is_admin() or classroom_id is not null)
  );

drop policy if exists "author updates targets" on public.post_targets;
create policy "author updates targets" on public.post_targets
  for update to authenticated
  using (public.is_post_author(post_id) or public.is_admin())
  with check (
    (public.is_post_author(post_id) or public.is_admin())
    and (public.is_admin() or classroom_id is not null)
  );
