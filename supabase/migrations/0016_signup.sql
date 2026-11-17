-- PTN Connext — sign-up for students and teachers (separate from log-in).
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0015). Safe to run again.
--
-- What this adds, in plain language:
-- 1) profiles: real first/last name, a verified email and a phone number (each email/phone on one account only).
-- 2) registrations: people the admin pre-registers from the roster (no login yet). Signing up "claims" a row,
--    once only. Teachers also carry their subjects/rooms and a personal sign-up code (stored scrambled).
-- 3) signup_rooms: the admin's schedule. One time slot + random code per classroom, shown as a QR by a
--    student volunteer. The code works only inside that slot and only for names in that room.
-- 4) signup_email_codes: 6-digit email check codes (scrambled, 10 minutes, 5 tries).
-- 5) signup_events: what happened, for the Developer Console dashboard (no passwords, codes or full emails).
-- 6) app_settings: the master "accepting sign-ups" switch.
-- 7) claim_registration(): turns a pre-registration into a profile in one locked step, so two people can
--    never claim the same person.
-- None of the new tables can be read or written from the browser: only the app's server (service role).
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

-- ─── 1) Profiles ───
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_contact_check;
alter table public.profiles add constraint profiles_contact_check check (
  (email is null or (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
  and (phone is null or phone ~ '^0[0-9]{9}$')
  and (first_name is null or char_length(first_name) <= 80)
  and (last_name is null or char_length(last_name) <= 80)
);
create unique index if not exists profiles_email_key on public.profiles (email) where email is not null;
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;

-- ─── 2) Pre-registrations ───
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  kind public.user_role not null check (kind in ('student', 'teacher')),
  login_id text unique,                       -- students: their student ID
  prefix text not null default '',
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) <= 80),
  name_key text not null,                     -- the name as the app matches it (normalised by src/lib/signup.ts)
  classroom_id uuid references public.classrooms (id) on delete set null,
  assignments jsonb not null default '[]',    -- teachers: [{ "subject_code": "math", "classroom_id": "…" }, …]
  code_hash text,                             -- personal sign-up code (teachers, or an absent student), scrambled
  code_expires_at timestamptz,
  code_attempts smallint not null default 0,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_student_check check (kind <> 'student' or (login_id is not null and classroom_id is not null))
);
create unique index if not exists registrations_teacher_name_key on public.registrations (name_key) where kind = 'teacher';
create index if not exists registrations_classroom_idx on public.registrations (classroom_id) where kind = 'student';
create unique index if not exists registrations_code_key on public.registrations (code_hash) where code_hash is not null;
alter table public.registrations enable row level security;

-- ─── 3) Room sign-up slots ───
create table if not exists public.signup_rooms (
  classroom_id uuid primary key references public.classrooms (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.signup_rooms enable row level security;

-- ─── 4) Email check codes ───
create table if not exists public.signup_email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  last_sent_at timestamptz not null default now()
);
alter table public.signup_email_codes enable row level security;

-- ─── 5) Events for the dashboard ───
create table if not exists public.signup_events (
  id bigint generated always as identity primary key,
  kind text not null check (char_length(kind) <= 40),
  outcome text not null check (outcome in ('ok', 'fail', 'info')),
  classroom_id uuid references public.classrooms (id) on delete set null,
  registration_id uuid references public.registrations (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists signup_events_created_idx on public.signup_events (created_at desc);
alter table public.signup_events enable row level security;

-- ─── 6) Settings ───
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('signup_open', 'true') on conflict (key) do nothing;

-- ─── 7) Claiming a pre-registration ───
create or replace function public.claim_registration(
  p_registration uuid,
  p_user uuid,
  p_login_id text,
  p_display_name text,
  p_email text,
  p_phone text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.registrations;
begin
  select * into r from public.registrations where id = p_registration for update;
  if not found then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;
  if r.claimed_by is not null then
    raise exception 'already claimed' using errcode = '23505';
  end if;

  insert into public.profiles (id, role, login_id, display_name, classroom_id, must_change_password,
                               first_name, last_name, email, email_verified_at, phone)
  values (p_user, r.kind, p_login_id, p_display_name, r.classroom_id, false,
          r.first_name, r.last_name, p_email, case when p_email is not null then now() end, p_phone);

  if r.kind = 'teacher' then
    insert into public.teaching_assignments (teacher_id, classroom_id, subject_id)
    select p_user, (a ->> 'classroom_id')::uuid, s.id
    from jsonb_array_elements(r.assignments) a
    join public.subjects s on s.code = a ->> 'subject_code'
    where (a ->> 'classroom_id') is not null
    on conflict do nothing;
  end if;

  update public.registrations
  set claimed_by = p_user, claimed_at = now(), code_hash = null, code_expires_at = null, code_attempts = 0, updated_at = now()
  where id = p_registration;
end
$$;
revoke execute on function public.claim_registration(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_registration(uuid, uuid, text, text, text, text) to service_role;

commit;
