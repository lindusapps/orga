-- Called only by the authenticated staff-data service after live Auth role checks.
-- A single transaction checks current membership/availability and updates one agent.
create or replace function public.staff_security_validate(p_actor_id uuid,p_user_id uuid,p_day date,p_slot text,p_end text,p_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_data jsonb; v_revision bigint; v_slots jsonb; v_date text:=p_day::text; v_person text:=p_user_id::text; v_start text; v_snapshot jsonb;
begin
 if p_actor_id is null or p_user_id is null or p_day is null or p_slot is null or p_end is null or p_revision is null then raise exception 'Validation incomplète'; end if;
 perform user_id from public.staff_accounts where user_id in (p_actor_id,p_user_id) order by user_id for share;
 if not exists(select 1 from public.staff_accounts where user_id=p_actor_id and role='security_manager' and active) then raise exception 'Réservé au responsable sécurité'; end if;
 if not exists(select 1 from public.staff_accounts where user_id=p_user_id and role='employee' and active) then raise exception 'Agent inactif ou fonction invalide'; end if;
 select data,revision into strict v_data,v_revision from public.staff_planning where id=true for update;
 if v_revision<>p_revision then raise exception 'Planning modifié. Actualise avant de valider.'; end if;
 perform ee.employe_id from public.employes_equipes ee
 join public.employes e on e.id=ee.employe_id
 join public.equipes t on t.id=ee.equipe_id
 where e.auth_user_id=p_user_id and e.actif and t.code='secu' and t.actif
 for share of ee,e,t;
 if not found then raise exception 'Cet agent ne fait pas partie de l’équipe Sécu.'; end if;
 if p_slot<>'22' then raise exception 'Les agents Sécu commencent uniquement à 22 h.'; end if;
 select slots into v_slots from public.staff_availability where user_id=p_user_id and day=p_day for share;
 if v_slots is null or not (v_slots ? p_slot) then raise exception 'Ce créneau ne fait pas partie des disponibilités de cet agent.'; end if;
 if not (coalesce(v_data->'exceptionalDays','{}'::jsonb) ? v_date)
 and extract(isodow from p_day) not in (5,6)
 and not (extract(isodow from p_day)=4 and coalesce(v_data#>array['thursdayUnlocked',v_date],'[]'::jsonb) ? p_slot)
 then raise exception 'Ce créneau est fermé.'; end if;
 v_start:=case p_slot when '17' then '17:00' when '20' then '20:00' when '22' then '22:00' else null end;
 if v_start is null then select s->>'time' into v_start from jsonb_array_elements(coalesce(v_data->'customSlots','[]'::jsonb)) s where s->>'id'=p_slot; end if;
 if v_start is null or p_end!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_end=v_start then raise exception 'Horaires invalides.'; end if;
 v_data:=jsonb_set(v_data,'{validated}',coalesce(v_data->'validated','{}'::jsonb)||jsonb_build_object(v_date,coalesce(v_data#>array['validated',v_date],'{}'::jsonb)||jsonb_build_object(v_person,p_slot)));
 v_data:=jsonb_set(v_data,'{shiftEnds}',coalesce(v_data->'shiftEnds','{}'::jsonb)||jsonb_build_object(v_date,coalesce(v_data#>array['shiftEnds',v_date],'{}'::jsonb)||jsonb_build_object(v_person,p_end)));
 v_data:=jsonb_set(v_data,'{planStatus}',coalesce(v_data->'planStatus','{}'::jsonb)||jsonb_build_object(v_date,coalesce(v_data#>array['planStatus',v_date],'{}'::jsonb)||jsonb_build_object(v_person,'present')));
 v_snapshot:=coalesce(v_data#>array['publishedPlans',v_date],'{}'::jsonb);
 v_snapshot:=v_snapshot||jsonb_build_object('publishedAt',now(),'people',coalesce(v_snapshot->'people','{}'::jsonb)||jsonb_build_object(v_person,jsonb_build_object('status','present','slot',p_slot,'end',p_end,'validatedBy',p_actor_id,'validatedAt',now())));
 v_data:=jsonb_set(v_data,'{publishedPlans}',coalesce(v_data->'publishedPlans','{}'::jsonb)||jsonb_build_object(v_date,v_snapshot));
 update public.staff_planning set data=v_data,revision=v_revision+1,updated_at=now() where id=true;
 return v_revision+1;
end $$;
revoke all on function public.staff_security_validate(uuid,uuid,date,text,text,bigint) from public,anon,authenticated;
grant execute on function public.staff_security_validate(uuid,uuid,date,text,text,bigint) to service_role;
