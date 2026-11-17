-- PTN Connext — teachers' PDFs can be kept in the teacher's own Google Drive.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0018). Test project first, then the real one.
--
-- What this adds, in plain language:
-- 1) drive_connections: one row per teacher who pressed "เชื่อมต่อ Google Drive". It holds Google's
--    long-lived key for that teacher, encrypted by the app (GOOGLE_TOKEN_SECRET), and the id of the
--    "PTN Connext" folder in their Drive. Nobody can read it from the browser: only the app's server.
--    The teacher's Google email is NOT stored.
-- 2) attachments.drive_file_id / drive_owner_id: a PDF kept in Google Drive is saved as a link row plus the
--    Drive file's id and whose Drive it is in, so the daily clean-up can move it to that teacher's Drive
--    trash after 180 days.
-- 3) The database sets the 180-day expiry for Drive PDFs too, and always records the person who added the
--    row as the Drive owner, so nobody can point at someone else's Drive.
-- 4) A Drive PDF may be larger than 10 MB (it uses the teacher's own Google space, not ours).
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

-- ─── 1) Who connected Google Drive ───
create table if not exists public.drive_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  refresh_token_enc text not null,
  folder_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.drive_connections enable row level security;
-- No policies on purpose: only the server (service role) reads or writes this table.

-- ─── 2) Drive PDFs on attachments ───
alter table public.attachments
  add column if not exists drive_file_id text unique,
  add column if not exists drive_owner_id uuid references public.profiles (id) on delete set null;

-- ─── 3) The database sets the dates and the Drive owner ───
create or replace function public.attachments_set_expiry() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  new.expires_at := case when new.kind = 'file' or new.drive_file_id is not null then now() + interval '180 days' end;
  new.expired_at := null;
  if new.drive_file_id is not null then
    -- Rows added from the app (a signed-in teacher) always belong to that teacher's own Drive.
    new.drive_owner_id := coalesce(auth.uid(), new.drive_owner_id);
  else
    new.drive_owner_id := null;
  end if;
  return new;
end;
$$;

-- ─── 4) Drive PDFs may be bigger than 10 MB ───
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.attachments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%size_bytes%'
  loop
    execute format('alter table public.attachments drop constraint %I', c);
  end loop;
end $$;

alter table public.attachments
  add constraint attachments_size_limit check (
    size_bytes is null or size_bytes <= 10485760 or (drive_file_id is not null and size_bytes <= 52428800)
  );

-- ─── 5) Fast lookup for the daily clean-up ───
create index if not exists attachments_drive_expiring_idx
  on public.attachments (expires_at)
  where drive_file_id is not null and expired_at is null;

commit;
