create table public.staff_planning (
 id boolean primary key default true check(id),
 data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.staff_planning(id) values(true);
create table public.staff_availability (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 slots jsonb not null default '[]'::jsonb check(jsonb_typeof(slots)='array'),
 updated_at timestamptz not null default now(),
 primary key(user_id,day)
);
create table public.staff_tasks (
 day date not null,
 task_id text not null,
 done boolean not null default false,
 actor_id uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(day,task_id)
);
create index staff_tasks_actor_idx on public.staff_tasks(actor_id);
create table public.staff_debriefs (
 user_id uuid not null references auth.users(id),
 day date not null,
 data jsonb not null check(jsonb_typeof(data)='object'),
 submitted_at timestamptz not null default now(),
 primary key(user_id,day)
);
create table public.staff_feedback (
 day date primary key,
 data jsonb not null check(jsonb_typeof(data)='object'),
 author_id uuid not null references auth.users(id),
 published_at timestamptz not null default now()
);
create index staff_feedback_author_idx on public.staff_feedback(author_id);
create table public.staff_clock (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 corrected_by uuid references auth.users(id),
 correction_reason text,
 check(ended_at is null or ended_at>started_at)
);
create index staff_clock_user_start_idx on public.staff_clock(user_id,started_at desc);
create index staff_clock_corrector_idx on public.staff_clock(corrected_by);
create unique index staff_clock_one_open_idx on public.staff_clock(user_id) where ended_at is null;
create table public.staff_incidents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 category text not null,
 description text not null check(length(description) between 1 and 5000),
 created_at timestamptz not null default now()
);
create index staff_incidents_user_idx on public.staff_incidents(user_id);
-- All access goes through staff-data, which validates the live Auth user and filters per role.
-- RLS plus revoked grants prevent bypass through direct REST requests.
do $$ declare t text; begin
 foreach t in array array['staff_planning','staff_availability','staff_tasks','staff_debriefs','staff_feedback','staff_clock','staff_incidents'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
create function public.staff_clock_action(p_user_id uuid,p_action text)
returns setof public.staff_clock language plpgsql security invoker set search_path='' as $$
begin
 if p_action='start' then
  insert into public.staff_clock(user_id) values(p_user_id)
    on conflict(user_id) where ended_at is null do nothing;
  return query select * from public.staff_clock where user_id=p_user_id and ended_at is null;
 elsif p_action='stop' then
  return query update public.staff_clock set ended_at=clock_timestamp()
    where user_id=p_user_id and ended_at is null returning *;
 else raise exception 'Action invalide'; end if;
end $$;
revoke all on function public.staff_clock_action(uuid,text) from public,anon,authenticated;
grant execute on function public.staff_clock_action(uuid,text) to service_role;
