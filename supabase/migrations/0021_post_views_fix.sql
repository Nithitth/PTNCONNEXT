-- PTN Connext — fix for 0020: post_views.user_id now points at auth.users instead of public.profiles.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0020). Safe to run again.
--
-- Why, in plain language: post_views linked posts to profiles (post_id → posts, user_id → profiles, both in its
-- primary key). The database API then saw two ways from a post to a person (its author, and who viewed it) and
-- refused "posts with their author" (error PGRST201), which broke the Teacher's Console list and the edit page.
-- Pointing user_id at the login account (auth.users, which the API doesn't show) leaves only the author link.
-- Deleting an account still deletes its rows (profiles are deleted together with auth.users).

begin;

alter table public.post_views drop constraint if exists post_views_user_id_fkey;
alter table public.post_views
  add constraint post_views_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

-- Make the API reload its picture of the tables now.
notify pgrst, 'reload schema';

commit;
