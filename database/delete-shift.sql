-- Remove one agent's draft and publication while preserving availability and other agents.
create or replace function public.staff_shift_delete(p_actor_id uuid,p_user_id uuid,p_day date,p_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_role text; v_data jsonb; v_revision bigint; v_date text:=p_day::text; v_person text:=p_user_id::text;
begin
 if p_actor_id is null or p_user_id is null or p_day is null or p_revision is null then raise exception 'Suppression incomplète'; end if;
 perform user_id from public.staff_accounts where user_id in(p_actor_id,p_user_id) order by user_id for share;
 select role into v_role from public.staff_accounts where user_id=p_actor_id and active;
 if v_role is null or v_role not in('direction','security_manager') then raise exception 'Accès refusé'; end if;
 if v_role='security_manager' then
  perform ee.employe_id from public.employes_equipes ee join public.employes e on e.id=ee.employe_id join public.equipes t on t.id=ee.equipe_id join public.staff_accounts a on a.user_id=e.auth_user_id
  where e.auth_user_id=p_user_id and e.actif and t.code='secu' and t.actif and a.active and a.role='employee' for share of ee,e,t;
  if not found then raise exception 'Réservé aux agents Sécu actifs'; end if;
 end if;
 select data,revision into strict v_data,v_revision from public.staff_planning where id=true for update;
 if v_revision<>p_revision then raise exception 'Planning modifié. Actualise avant de supprimer.'; end if;
 v_data:=v_data #- array['manualAssignments',v_date,v_person] #- array['validated',v_date,v_person] #- array['shiftEnds',v_date,v_person] #- array['planStatus',v_date,v_person] #- array['publishedPlans',v_date,'people',v_person];
 update public.staff_planning set data=v_data,revision=v_revision+1,updated_at=now() where id=true;
 return v_revision+1;
end $$;
revoke all on function public.staff_shift_delete(uuid,uuid,date,bigint) from public,anon,authenticated;
grant execute on function public.staff_shift_delete(uuid,uuid,date,bigint) to service_role;
