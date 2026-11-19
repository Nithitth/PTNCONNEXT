-- PTN Connext — activity logs: feature visits, who opened which post or file, and post history.
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run (after 0019). Safe to run again.
-- Paste into the TEST project first, then the real one.
--
-- What this adds, in plain language:
-- usage_daily   one row per person, feature (page) and Thai day, with how many visits. Daily rows, not one per
--               visit, so a year stays small on the free database.
-- post_views    one row per student and post: when they first and last opened it, and when they opened its file.
--               Teachers of the subject see who opened their posts (names); admins use it for disputes.
-- post_history  every create / edit / delete of a post: who, when and what changed (kept after the post is deleted).
-- All three are server-only (RLS on, no policies) and the daily cron deletes rows older than 365 days.
-- The functions below are for the server (service role) only: track_usage, mark_seen, and the report summaries
-- usage_summary, usage_people, post_view_summary, post_seen_counts and report_live (counts only, never names).

begin;

create table if not exists public.usage_daily (
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null check (feature ~ '^[a-z_]{2,40}$'),
  day date not null,
  role public.user_role not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  visits integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, feature, day)
);
create index if not exists usage_daily_day_idx on public.usage_daily (day, feature);
create index if not exists usage_daily_last_idx on public.usage_daily (last_at desc);
alter table public.usage_daily enable row level security;

create table if not exists public.post_views (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  classroom_id uuid references public.classrooms (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  views integer not null default 1,
  file_first_at timestamptz,
  file_last_at timestamptz,
  file_opens integer not null default 0,
  primary key (post_id, user_id)
);
create index if not exists post_views_user_idx on public.post_views (user_id, last_seen_at desc);
create index if not exists post_views_last_idx on public.post_views (last_seen_at);
alter table public.post_views enable row level security;

create table if not exists public.post_history (
  id bigint generated always as identity primary key,
  post_id uuid not null,                                   -- no foreign key: the history outlives the post
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('create', 'edit', 'delete')),
  title text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists post_history_post_idx on public.post_history (post_id, created_at desc);
create index if not exists post_history_actor_idx on public.post_history (actor_id, created_at desc);
create index if not exists post_history_created_idx on public.post_history (created_at);
alter table public.post_history enable row level security;

-- One more visit to a feature, today (Thai time).
create or replace function public.track_usage(p_user uuid, p_feature text)
returns void
language sql volatile security definer set search_path = public as $$
  insert into public.usage_daily (user_id, feature, day, role, classroom_id)
  select p.id, p_feature, (now() at time zone 'Asia/Bangkok')::date, p.role, p.classroom_id
  from public.profiles p
  where p.id = p_user and p_feature ~ '^[a-z_]{2,40}$'
  on conflict (user_id, feature, day) do update
    set visits = public.usage_daily.visits + 1, last_at = now(), classroom_id = excluded.classroom_id;
$$;

-- A student saw these posts (day drawer), or opened a post's file (p_file). Other roles are ignored.
create or replace function public.mark_seen(p_user uuid, p_posts uuid[], p_file boolean default false)
returns void
language sql volatile security definer set search_path = public as $$
  insert into public.post_views (post_id, user_id, classroom_id, file_first_at, file_last_at, file_opens)
  select x.id, p.id, p.classroom_id,
         case when p_file then now() end, case when p_file then now() end, case when p_file then 1 else 0 end
  from public.profiles p
  cross join lateral (select distinct unnest(p_posts[1:50]) as id) x
  where p.id = p_user and p.role = 'student' and exists (select 1 from public.posts po where po.id = x.id)
  on conflict (post_id, user_id) do update
    set last_seen_at = now(),
        views = public.post_views.views + 1,
        file_first_at = coalesce(public.post_views.file_first_at, excluded.file_first_at),
        file_last_at = coalesce(excluded.file_last_at, public.post_views.file_last_at),
        file_opens = public.post_views.file_opens + excluded.file_opens;
$$;

-- Feature use per week (Monday start), role and room: distinct people and visits. feature is null on the
-- "any feature" rows (grouping sets), so weekly active people can be counted without downloading rows.
create or replace function public.usage_summary(p_from date, p_to date)
returns table (feature text, week date, role public.user_role, classroom_id uuid, users integer, visits integer)
language sql stable security definer set search_path = public as $$
  select u.feature, date_trunc('week', u.day)::date as week, u.role, u.classroom_id,
         count(distinct u.user_id)::int, sum(u.visits)::int
  from public.usage_daily u
  where u.day between p_from and p_to
  group by grouping sets ((u.feature, date_trunc('week', u.day), u.role, u.classroom_id), (date_trunc('week', u.day), u.role, u.classroom_id));
$$;

-- One row per person who used Connext in the period (no ids): how many features, weeks and visits.
create or replace function public.usage_people(p_from date, p_to date)
returns table (role public.user_role, classroom_id uuid, features integer, weeks integer, visits integer)
language sql stable security definer set search_path = public as $$
  select min(u.role::text)::public.user_role, (array_agg(u.classroom_id order by u.day desc))[1],
         count(distinct u.feature)::int, count(distinct date_trunc('week', u.day))::int, sum(u.visits)::int
  from public.usage_daily u
  where u.day between p_from and p_to
  group by u.user_id;
$$;

-- Per post created in the period and per targeted room: students targeted, seen, seen within 24 h, opened the file.
-- A whole-school post (classroom null) counts every student.
create or replace function public.post_view_summary(p_from timestamptz, p_to timestamptz)
returns table (post_id uuid, classroom_id uuid, type public.post_type, subject text, created_at timestamptz,
               targeted integer, seen integer, seen_24h integer, file_openers integer)
language sql stable security definer set search_path = public as $$
  select t.post_id, t.classroom_id, po.type, s.code, po.created_at,
    (select count(*) from public.profiles p where p.role = 'student' and (t.classroom_id is null or p.classroom_id = t.classroom_id))::int,
    count(v.user_id)::int,
    count(v.user_id) filter (where v.first_seen_at <= po.created_at + interval '24 hours')::int,
    count(v.user_id) filter (where v.file_opens > 0)::int
  from public.post_targets t
  join public.posts po on po.id = t.post_id
  left join public.subjects s on s.id = po.subject_id
  left join public.post_views v on v.post_id = t.post_id and (t.classroom_id is null or v.classroom_id = t.classroom_id)
  where po.created_at >= p_from and po.created_at < p_to
  group by t.post_id, t.classroom_id, po.type, s.code, po.created_at;
$$;

-- "เปิดดูแล้ว 28/40" for a list of posts: students targeted and students who opened each post.
create or replace function public.post_seen_counts(p_posts uuid[])
returns table (post_id uuid, targeted integer, seen integer)
language sql stable security definer set search_path = public as $$
  select po.id,
    (select count(*) from public.profiles p where p.role = 'student'
       and (exists (select 1 from public.post_targets t where t.post_id = po.id and t.classroom_id is null)
            or p.classroom_id in (select t.classroom_id from public.post_targets t where t.post_id = po.id)))::int,
    (select count(*) from public.post_views v where v.post_id = po.id)::int
  from public.posts po
  where po.id = any (p_posts[1:300]);
$$;

-- Today's live numbers for the war room (Thai day), plus the latest anonymous events.
create or replace function public.report_live()
returns jsonb
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Asia/Bangkok')::date as d,
                        ((now() at time zone 'Asia/Bangkok')::date::timestamp at time zone 'Asia/Bangkok') as start)
  select jsonb_build_object(
    'online_now', (select count(distinct user_id) from public.usage_daily where last_at > now() - interval '15 minutes'),
    'users_today', (select count(distinct user_id) from public.usage_daily, today where day = today.d),
    'visits_today', (select coalesce(sum(visits), 0) from public.usage_daily, today where day = today.d),
    'logins_today', (select count(*) from public.login_events, today where success and created_at >= today.start),
    'posts_today', (select count(*) from public.posts, today where created_at >= today.start),
    'file_opens_today', (select count(*) from public.post_views, today where file_last_at >= today.start),
    'seen_today', (select count(*) from public.post_views, today where last_seen_at >= today.start),
    'signups_today', (select count(*) from public.registrations, today where claimed_at >= today.start),
    'errors_today', (select count(*) from public.error_logs, today where created_at >= today.start),
    'feed', coalesce((
      select jsonb_agg(e order by e->>'at' desc) from (
        (select jsonb_build_object('kind', 'post', 'at', po.created_at, 'type', po.type, 'subject', s.code,
                  'grade', c.grade, 'room', c.room) as e
         from public.posts po
         left join public.subjects s on s.id = po.subject_id
         left join lateral (select classroom_id from public.post_targets where post_id = po.id order by classroom_id limit 1) t on true
         left join public.classrooms c on c.id = t.classroom_id
         order by po.created_at desc limit 6)
        union all
        (select jsonb_build_object('kind', 'signup', 'at', r.claimed_at, 'role', r.kind, 'grade', c.grade, 'room', c.room)
         from public.registrations r left join public.classrooms c on c.id = r.classroom_id
         where r.claimed_at is not null order by r.claimed_at desc limit 4)
        union all
        (select jsonb_build_object('kind', 'visit', 'at', u.last_at, 'feature', u.feature, 'role', u.role, 'grade', c.grade, 'room', c.room)
         from public.usage_daily u left join public.classrooms c on c.id = u.classroom_id
         order by u.last_at desc limit 8)
      ) f
    ), '[]'::jsonb)
  );
$$;

-- Server only: nobody signed in (or not) may call these directly.
revoke all on function public.track_usage(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_seen(uuid, uuid[], boolean) from public, anon, authenticated;
revoke all on function public.usage_summary(date, date) from public, anon, authenticated;
revoke all on function public.usage_people(date, date) from public, anon, authenticated;
revoke all on function public.post_view_summary(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.report_live() from public, anon, authenticated;
revoke all on function public.post_seen_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.track_usage(uuid, text) to service_role;
grant execute on function public.mark_seen(uuid, uuid[], boolean) to service_role;
grant execute on function public.usage_summary(date, date) to service_role;
grant execute on function public.usage_people(date, date) to service_role;
grant execute on function public.post_view_summary(timestamptz, timestamptz) to service_role;
grant execute on function public.report_live() to service_role;
grant execute on function public.post_seen_counts(uuid[]) to service_role;

commit;
