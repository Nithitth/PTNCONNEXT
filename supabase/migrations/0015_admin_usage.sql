-- PTN Connext — usage numbers for the Developer Console's "ขีดจำกัดระบบ" tab.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0014). Safe to run again.
--
-- What this adds, in plain language:
-- admin_usage(): for admins only, measures what the app can see from inside the database:
--   the database size, the files in each storage bucket (count and total size), the number of
--   accounts, the busiest 5 minutes of sign-ins in the last 7 days, and the last sign-in time.
-- Monthly downloads (egress) and Vercel function runs can't be read from here; the page links to
-- the Supabase and Vercel usage pages for those.

create or replace function public.admin_usage()
returns jsonb
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not coalesce((select public.is_admin()), false) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'files', b.files, 'bytes', b.bytes) order by b.bucket_id)
      from (
        select o.bucket_id, count(*) as files, coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
        from storage.objects o
        group by o.bucket_id
      ) b
    ), '[]'::jsonb),
    'accounts', (select count(*) from public.profiles),
    'peak_logins_5min', coalesce((
      select max(n) from (
        select count(*) as n
        from public.login_events
        where created_at > now() - interval '7 days'
        group by date_bin('5 minutes', created_at, timestamptz '2000-01-01')
      ) w
    ), 0),
    'logins_30d', (select count(*) from public.login_events where created_at > now() - interval '30 days'),
    'last_login', (select max(created_at) from public.login_events),
    'idle_days', (select floor(extract(epoch from now() - max(created_at)) / 86400)::int from public.login_events)
  );
end
$$;

revoke execute on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated, service_role;
