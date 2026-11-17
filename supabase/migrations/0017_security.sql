-- 0017 · Security: log-in lockout, admin audit log, test-database marker
--
-- 1) login_events gets two columns for the lockout (src/app/login/actions.ts):
--    identifier = a scrambled key of what was typed (never the email or phone itself),
--    reason     = why a log-in failed ('wrong-password', 'wrong-tab', 'no-profile', 'locked',
--                 'mfa-wrong'); only wrong passwords and wrong two-step codes count towards a lockout.
-- 2) login_unlocks: an admin's "ปลดล็อก" (kept apart so it doesn't count as a log-in).
-- 3) audit_events: who did what in the Developer Console (no passwords, codes or full emails).
-- New tables have RLS on and no policies: only the app's server can read or write them.
-- Paste this into BOTH Supabase projects (the real one and the test one).
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

alter table public.login_events
  add column if not exists identifier text,
  add column if not exists reason text;
create index if not exists login_events_identifier_idx on public.login_events (identifier, created_at desc);

create table if not exists public.login_unlocks (
  id bigint generated always as identity primary key,
  identifier text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists login_unlocks_identifier_idx on public.login_unlocks (identifier, created_at desc);
alter table public.login_unlocks enable row level security;

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
alter table public.audit_events enable row level security;

commit;
