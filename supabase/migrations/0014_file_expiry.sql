-- PTN Connext — teachers' PDFs expire 180 days after upload.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0013). Safe to run again.
--
-- What this adds, in plain language:
-- 1) Each attachment remembers when it was added (created_at), when its PDF stops being downloadable
--    (expires_at = 180 days later; links never expire) and when the daily clean-up deleted the file
--    (expired_at).
-- 2) The database always sets expires_at itself when a file is added, so nobody can choose a later date.
--    (Users can't update attachments at all; only the server's admin key can, for the clean-up.)
-- 3) A deleted file keeps its row, so the post can still say "ไฟล์หมดอายุแล้ว".
-- 4) Files uploaded before this migration count their 180 days from their post's creation date.
-- Everything is in one transaction: if any step fails, nothing changes.

begin;

-- ─── 1) New columns ───
alter table public.attachments
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz;

-- ─── 2) Existing files: 180 days from when their post was created ───
update public.attachments a
set created_at = p.created_at,
    expires_at = case when a.kind = 'file' then p.created_at + interval '180 days' end
from public.posts p
where p.id = a.post_id
  and a.expires_at is null
  and a.expired_at is null;

-- ─── 3) New files: the database sets the dates ───
create or replace function public.attachments_set_expiry() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  new.expires_at := case when new.kind = 'file' then now() + interval '180 days' end;
  new.expired_at := null;
  return new;
end;
$$;

drop trigger if exists attachments_set_expiry on public.attachments;
create trigger attachments_set_expiry
  before insert on public.attachments
  for each row execute function public.attachments_set_expiry();

-- ─── 4) A deleted (expired) file may have no storage path any more ───
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.attachments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%storage_path is not null%'
  loop
    execute format('alter table public.attachments drop constraint %I', c);
  end loop;
end $$;

alter table public.attachments
  add constraint attachments_kind_fields check (
    (kind = 'file' and (storage_path is not null or expired_at is not null))
    or (kind = 'link' and url is not null)
  );

-- ─── 5) Fast lookups for the clean-up and the "expiring soon" window ───
create index if not exists attachments_expiring_idx
  on public.attachments (expires_at)
  where expired_at is null;

commit;
