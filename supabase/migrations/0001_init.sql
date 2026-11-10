-- PTN Connext — initial schema (Phase 1: Smart Calendar)
-- Run this once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Every table has Row Level Security (RLS) turned on. RLS is what stops a
-- student from reading another classroom's work, even if a page has a bug.

-- ─────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────
create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.post_type as enum ('assignment', 'material', 'exam', 'announcement', 'event');
create type public.attachment_kind as enum ('file', 'link');

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────
create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  grade smallint not null check (grade between 1 and 6),        -- ม.1–ม.6
  room smallint not null check (room between 1 and 99),
  academic_year smallint not null,                                -- พ.ศ., e.g. 2569
  unique (grade, room, academic_year)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  login_id text not null unique,                                  -- student ID or teacher username (lowercase)
  display_name text not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  must_change_password boolean not null default true,
  pdpa_version smallint,
  pdpa_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_has_classroom check (role <> 'student' or classroom_id is not null)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                                      -- e.g. ค32101
  name_th text not null,
  color text not null default '#378ADD'
);

create table public.teaching_assignments (
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  primary key (teacher_id, classroom_id, subject_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  type public.post_type not null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  subject_id uuid references public.subjects (id) on delete set null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per classroom a post goes to. classroom_id null = whole school.
create table public.post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  classroom_id uuid references public.classrooms (id) on delete cascade,
  due_at timestamptz,                                             -- assignments: deadline; exams/events: start
  ends_at timestamptz,                                            -- events spanning several days
  lead_days smallint not null default 0 check (lead_days between 0 and 30)
);
create index post_targets_classroom_idx on public.post_targets (classroom_id);
create index post_targets_post_idx on public.post_targets (post_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  kind public.attachment_kind not null,
  storage_path text,
  url text,
  file_name text not null,
  size_bytes integer check (size_bytes is null or size_bytes <= 10485760),
  check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null))
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  login_id text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_events_created_idx on public.login_events (created_at desc);

create table public.error_logs (
  id bigint generated always as identity primary key,
  route text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Helper functions (used inside RLS policies)
-- security definer = they can read profiles without tripping RLS recursion
-- ─────────────────────────────────────────────────────────────
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_classroom() returns uuid
language sql stable security definer set search_path = public as $$
  select classroom_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('teacher', 'admin'), false)
$$;

create or replace function public.teaches_classroom(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teaching_assignments
    where teacher_id = auth.uid() and classroom_id = c
  )
$$;

-- Can the current user see this post? (author, admin, or it targets their classroom / whole school)
create or replace function public.can_see_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.posts where id = p and author_id = auth.uid())
    or exists (
      select 1 from public.post_targets t
      where t.post_id = p
        and (t.classroom_id is null or t.classroom_id = public.my_classroom())
    )
$$;

create or replace function public.is_post_author(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts where id = p and author_id = auth.uid())
$$;

-- Users record their own PDPA consent through this function only
-- (they cannot edit any other column of their profile).
create or replace function public.accept_pdpa(p_version smallint) returns void
language sql security definer set search_path = public as $$
  update public.profiles
     set pdpa_version = p_version, pdpa_accepted_at = now()
   where id = auth.uid()
$$;

-- Lock down: only signed-in users may call these.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.classrooms enable row level security;
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.teaching_assignments enable row level security;
alter table public.posts enable row level security;
alter table public.post_targets enable row level security;
alter table public.attachments enable row level security;
alter table public.feedback enable row level security;
alter table public.login_events enable row level security;
alter table public.error_logs enable row level security;

-- Reference data: any signed-in user with a profile can read.
create policy "classrooms readable" on public.classrooms
  for select to authenticated using (public.my_role() is not null);
create policy "subjects readable" on public.subjects
  for select to authenticated using (public.my_role() is not null);

-- Profiles: you see yourself; admins see everyone. No direct writes
-- (accounts are created/changed only by the server with the service key).
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- Teaching assignments: a teacher sees their own; admins see all.
create policy "read own teaching" on public.teaching_assignments
  for select to authenticated using (teacher_id = auth.uid() or public.is_admin());

-- Posts
create policy "read visible posts" on public.posts
  for select to authenticated using (public.can_see_post(id));
create policy "staff create own posts" on public.posts
  for insert to authenticated with check (public.is_staff() and author_id = auth.uid());
create policy "author or admin updates" on public.posts
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());
create policy "author or admin deletes" on public.posts
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- Post targets: teachers may only target classrooms they teach.
-- Whole-school targets (classroom_id null) are admin-only.
create policy "read targets of visible posts" on public.post_targets
  for select to authenticated using (public.can_see_post(post_id));
create policy "author targets allowed classrooms" on public.post_targets
  for insert to authenticated with check (
    public.is_post_author(post_id)
    and (public.is_admin() or (classroom_id is not null and public.teaches_classroom(classroom_id)))
  );
create policy "author updates targets" on public.post_targets
  for update to authenticated
  using (public.is_post_author(post_id) or public.is_admin())
  with check (
    (public.is_post_author(post_id) or public.is_admin())
    and (public.is_admin() or (classroom_id is not null and public.teaches_classroom(classroom_id)))
  );
create policy "author deletes targets" on public.post_targets
  for delete to authenticated using (public.is_post_author(post_id) or public.is_admin());

-- Attachments follow their post.
create policy "read attachments of visible posts" on public.attachments
  for select to authenticated using (public.can_see_post(post_id));
create policy "author adds attachments" on public.attachments
  for insert to authenticated with check (public.is_post_author(post_id));
create policy "author removes attachments" on public.attachments
  for delete to authenticated using (public.is_post_author(post_id) or public.is_admin());

-- Feedback: anyone signed in can send their own; only admins read.
create policy "send own feedback" on public.feedback
  for insert to authenticated with check (user_id = auth.uid() and public.my_role() is not null);
create policy "admins read feedback" on public.feedback
  for select to authenticated using (public.is_admin());

-- Logs: written only by the server (service key); only admins read.
create policy "admins read logins" on public.login_events
  for select to authenticated using (public.is_admin());
create policy "admins read errors" on public.error_logs
  for select to authenticated using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- File storage: private bucket for teacher PDFs (≤ 10 MB)
-- Files are downloaded through short-lived signed links made by the server
-- after it checks the student is allowed to see the post.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materials', 'materials', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Staff upload only into a folder named after their own user id.
create policy "staff upload own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'materials'
    and public.is_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "staff delete own files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
