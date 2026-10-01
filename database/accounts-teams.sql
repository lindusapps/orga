-- SQL is the authority for staff roles, activation and team assignments.
create table public.staff_roles (
 code text primary key check(code in ('direction','employee','security_manager')),
 label text not null,
 description text not null
);
insert into public.staff_roles values
 ('direction','Direction','Gestion des comptes, équipes et de tous les modules'),
 ('employee','Employé','Planning personnel, disponibilités, tâches, débriefs et pointages'),
 ('security_manager','Responsable sécurité','Validation des services des agents Sécu uniquement');
create table public.staff_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 login text not null unique,
 role text not null references public.staff_roles(code),
 active boolean not null default true,
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.staff_accounts(user_id,name,login,role,active)
select id,coalesce(nullif(raw_app_meta_data->>'staff_name',''),'Équipier'),raw_app_meta_data->>'staff_login',raw_app_meta_data->>'staff_role',coalesce(raw_app_meta_data->>'staff_active','true')<>'false'
from auth.users where raw_app_meta_data->>'staff_role' in ('direction','employee','security_manager');
alter table public.staff_roles enable row level security;
alter table public.staff_accounts enable row level security;
revoke all on public.staff_roles,public.staff_accounts from public,anon,authenticated;
grant select,insert,update,delete on public.staff_roles,public.staff_accounts to service_role;
-- Prevent stale JWT role claims from granting direct table access after role changes.
revoke all on public.equipes,public.employes,public.employes_equipes,public.administrateurs from anon,authenticated;
grant select,insert,update,delete on public.equipes,public.employes,public.employes_equipes,public.administrateurs to service_role;
create function public.staff_account_save(p_actor_id uuid,p_user_id uuid,p_name text,p_role text,p_active boolean,p_team_ids uuid[],p_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_target public.staff_accounts; v_employee uuid; v_login text;
begin
 perform pg_advisory_xact_lock(17355001);
 if not exists(select 1 from public.staff_accounts where user_id=p_actor_id and role='direction' and active) then raise exception 'Réservé à la direction'; end if;
 select * into strict v_target from public.staff_accounts where user_id=p_user_id for update;
 if v_target.revision<>p_revision then raise exception 'Compte modifié. Actualise avant de réessayer.'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 80 or p_role is null or p_active is null or p_team_ids is null then raise exception 'Compte incomplet'; end if;
 if not exists(select 1 from public.staff_roles where code=p_role) then raise exception 'Fonction invalide'; end if;
 if p_user_id=p_actor_id and (p_role<>'direction' or not p_active) then raise exception 'Impossible de retirer ses propres droits Direction'; end if;
 if v_target.role='direction' and v_target.active and (p_role<>'direction' or not p_active) and (select count(*) from public.staff_accounts where role='direction' and active)<=1 then raise exception 'Conserver au moins une direction active'; end if;
 if cardinality(p_team_ids)>20 or exists(select 1 from unnest(p_team_ids) t where t is null or not exists(select 1 from public.equipes where id=t and actif)) then raise exception 'Équipe invalide ou inactive'; end if;
 if p_role<>'employee' and cardinality(p_team_ids)>0 then raise exception 'Les affectations concernent les employés'; end if;
 -- Hold membership/activation rows while synchronising the employee profile.
 perform id from public.equipes where id=any(p_team_ids) for share;
 update public.staff_accounts set name=btrim(p_name),role=p_role,active=p_active,revision=revision+1,updated_at=now() where user_id=p_user_id;
 insert into public.employes(auth_user_id,prenom,actif) values(p_user_id,btrim(p_name),p_active and p_role='employee')
 on conflict(auth_user_id) do update set prenom=excluded.prenom,actif=excluded.actif returning id into v_employee;
 delete from public.employes_equipes where employe_id=v_employee;
 insert into public.employes_equipes(employe_id,equipe_id) select v_employee,t from (select distinct unnest(p_team_ids) t) selected;
 if p_role='direction' then
  insert into public.administrateurs(auth_user_id,prenom,identifiant,statut) values(p_user_id,btrim(p_name),v_target.login,case when p_active then 'actif' else 'desactive' end)
  on conflict(auth_user_id) do update set prenom=excluded.prenom,statut=excluded.statut;
 else update public.administrateurs set statut='desactive' where auth_user_id=p_user_id;
 end if;
 return p_revision+1;
end $$;
create function public.staff_account_register(p_actor_id uuid,p_user_id uuid,p_name text,p_login text,p_role text,p_team_ids uuid[])
returns bigint language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(17355001);
 if not exists(select 1 from public.staff_accounts where user_id=p_actor_id and role='direction' and active) then raise exception 'Réservé à la direction'; end if;
 if exists(select 1 from public.employes where auth_user_id=p_user_id) or exists(select 1 from public.administrateurs where auth_user_id=p_user_id or identifiant=p_login) then raise exception 'Profil déjà existant'; end if;
 insert into public.staff_accounts(user_id,name,login,role) values(p_user_id,p_name,p_login,p_role);
 return public.staff_account_save(p_actor_id,p_user_id,p_name,p_role,true,p_team_ids,0);
end $$;
revoke all on function public.staff_account_save(uuid,uuid,text,text,boolean,uuid[],bigint),public.staff_account_register(uuid,uuid,text,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.staff_account_save(uuid,uuid,text,text,boolean,uuid[],bigint),public.staff_account_register(uuid,uuid,text,text,text,uuid[]) to service_role;
