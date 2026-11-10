-- Fix: teachers couldn't create posts.
-- When a row is inserted, Postgres also checks the SELECT rule on the new row.
-- The old rule only used can_see_post(), which can't see a row inserted in the
-- same statement, so every new post was rejected. Authors now match directly.

drop policy "read visible posts" on public.posts;
create policy "read visible posts" on public.posts
  for select to authenticated using (author_id = auth.uid() or public.can_see_post(id));
