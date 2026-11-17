-- 0018 · Admin powers need two-step verification
--
-- From now on is_admin() is true only when the admin's session passed two-step verification
-- (Supabase "aal2"). A stolen admin password alone can no longer read or change admin-only data,
-- even by calling the database directly. An admin who hasn't passed two-step keeps only
-- teacher-level powers (is_staff() and my_role() are unchanged).
--
-- ⚠ ORDER: paste this only AFTER the new app version is live and every admin has set up two-step
--   (log in → /mfa). Otherwise admins see an empty Developer Console until they do.
-- Paste into the test project first, run npm run check:security, then the real project.

begin;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.my_role()) = 'admin', false)
     and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;

commit;
