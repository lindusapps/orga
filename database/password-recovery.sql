-- Private recovery data. Only server functions can read or write these tables.
create table if not exists public.staff_recovery_contacts(
 user_id uuid primary key references public.staff_accounts(user_id) on delete cascade,
 email text not null check(length(email)<=254), verified_at timestamptz not null default now()
);
create table if not exists public.staff_recovery_tokens(
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references public.staff_accounts(user_id) on delete cascade,
 purpose text not null check(purpose in('verify_email','reset_password')),
 email text not null check(length(email)<=254), password_version bigint not null,
 expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists staff_recovery_tokens_user_idx on public.staff_recovery_tokens(user_id);
create index if not exists staff_recovery_tokens_expiry_idx on public.staff_recovery_tokens(expires_at);
create table if not exists public.staff_recovery_limits(
 bucket text primary key, attempts integer not null, expires_at timestamptz not null
);
alter table public.staff_recovery_contacts enable row level security;
alter table public.staff_recovery_tokens enable row level security;
alter table public.staff_recovery_limits enable row level security;
revoke all on public.staff_recovery_contacts,public.staff_recovery_tokens,public.staff_recovery_limits from public,anon,authenticated;
grant select,insert,update,delete on public.staff_recovery_contacts,public.staff_recovery_tokens,public.staff_recovery_limits to service_role;

create or replace function public.staff_recovery_throttle(p_bucket text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
 if p_limit<1 or p_seconds<1 or length(p_bucket)>150 then raise exception 'Invalid throttle';end if;
 insert into public.staff_recovery_limits(bucket,attempts,expires_at) values(p_bucket,1,now()+p_seconds*interval '1 second')
 on conflict(bucket) do update set attempts=case when staff_recovery_limits.expires_at<=now() then 1 else staff_recovery_limits.attempts+1 end,
 expires_at=case when staff_recovery_limits.expires_at<=now() then excluded.expires_at else staff_recovery_limits.expires_at end returning attempts into v_count;
 delete from public.staff_recovery_limits where expires_at<now()-interval '1 day';
 delete from public.staff_recovery_tokens where expires_at<now()-interval '1 day';
 return v_count<=p_limit;
end $$;

-- Single-use consumption is atomic. Reset links must still match the verified contact.
create or replace function public.staff_recovery_take(p_hash text,p_purpose text,p_version bigint)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.staff_recovery_tokens; v_user uuid;
begin
 if p_hash is null or p_purpose not in ('verify_email','reset_password') or p_purpose is null or p_version is null then raise exception 'Lien invalide ou expiré';end if;
 select user_id into v_user from public.staff_recovery_tokens where token_hash=p_hash;
 if v_user is null then raise exception 'Lien invalide ou expiré';end if;
 perform user_id from public.staff_accounts where user_id=v_user and active for update;
 if not found then raise exception 'Lien invalide ou expiré';end if;
 select * into t from public.staff_recovery_tokens where token_hash=p_hash for update;
 if not found then raise exception 'Lien invalide ou expiré';end if;
 if t.used_at is not null or t.expires_at<=now() or t.purpose<>p_purpose or t.password_version<>p_version then raise exception 'Lien invalide ou expiré';end if;
 if p_purpose='reset_password' and not exists(select 1 from public.staff_recovery_contacts where user_id=t.user_id and email=t.email) then raise exception 'Lien invalide ou expiré';end if;
 update public.staff_recovery_tokens set used_at=now() where user_id=t.user_id and used_at is null;
 if p_purpose='verify_email' then
  insert into public.staff_recovery_contacts(user_id,email,verified_at) values(t.user_id,t.email,now())
  on conflict(user_id) do update set email=excluded.email,verified_at=excluded.verified_at;
 end if;
 return t.user_id;
end $$;
revoke all on function public.staff_recovery_throttle(text,integer,integer),public.staff_recovery_take(text,text,bigint) from public,anon,authenticated;
grant execute on function public.staff_recovery_throttle(text,integer,integer),public.staff_recovery_take(text,text,bigint) to service_role;
