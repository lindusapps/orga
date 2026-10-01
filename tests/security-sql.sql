-- Integration test, rolled back in full. Creates no lasting accounts or shifts.
begin;
do $$ declare manager uuid:=gen_random_uuid(); guard uuid:=gen_random_uuid(); bar uuid:=gen_random_uuid(); director uuid; secu_team uuid; bar_team uuid;
begin
 select user_id into strict director from public.staff_accounts where role='direction' and active order by user_id limit 1;
 select id into strict secu_team from public.equipes where code='secu' and actif;
 select id into strict bar_team from public.equipes where code='bar' and actif;
 insert into auth.users(id) values(manager),(guard),(bar);
 perform set_config('test.manager',manager::text,true);perform set_config('test.guard',guard::text,true);perform set_config('test.bar',bar::text,true);perform set_config('test.director',director::text,true);perform set_config('test.secu_team',secu_team::text,true);perform set_config('test.bar_team',bar_team::text,true);
end $$;
set local role service_role;
do $$ declare manager uuid:=current_setting('test.manager')::uuid; guard uuid:=current_setting('test.guard')::uuid; bar uuid:=current_setting('test.bar')::uuid; director uuid:=current_setting('test.director')::uuid; blocked boolean; before_bar jsonb; after_bar jsonb; r bigint;
begin
 perform public.staff_account_register(director,manager,'Test responsable','test-'||manager,'security_manager','{}');
 perform public.staff_account_register(director,guard,'Test Sécu','test-'||guard,'employee',array[current_setting('test.secu_team')::uuid]);
 perform public.staff_account_register(director,bar,'Test Bar','test-'||bar,'employee',array[current_setting('test.bar_team')::uuid]);
 update public.staff_planning set data=jsonb_build_object('publishedPlans',jsonb_build_object('2026-10-02',jsonb_build_object('people',jsonb_build_object(bar::text,jsonb_build_object('status','present','slot','17','end','23:00'))))),revision=0 where id=true;
 select data#>array['publishedPlans','2026-10-02','people',bar::text] into before_bar from public.staff_planning where id=true;
 insert into public.staff_availability(user_id,day,slots) values(guard,'2026-10-02','["20","22"]'),(bar,'2026-10-02','["22"]');
 r:=public.staff_security_validate(manager,guard,'2026-10-02','22','04:00',0);
 if r<>1 then raise exception 'Revision not incremented'; end if;
 select data#>array['publishedPlans','2026-10-02','people',bar::text] into after_bar from public.staff_planning where id=true;
 if before_bar is distinct from after_bar then raise exception 'Other team publication changed'; end if;
 blocked:=false;begin perform public.staff_security_validate(manager,bar,'2026-10-02','22','04:00',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Cross-team validation accepted';end if;
 blocked:=false;begin perform public.staff_security_validate(manager,guard,'2026-10-02','20','04:00',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Non-22 security slot accepted';end if;
 blocked:=false;begin perform public.staff_security_validate(manager,guard,'2026-10-02','22','04:00',0);exception when others then blocked:=true;end;if not blocked then raise exception 'Stale revision accepted';end if;
 blocked:=false;begin perform public.staff_security_validate(bar,guard,'2026-10-02','22','04:00',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Employee validation accepted';end if;
 blocked:=false;begin perform public.staff_account_save(manager,bar,'Elevation','direction',true,'{}',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Manager privilege elevation accepted';end if;
 blocked:=false;begin perform public.staff_account_save(director,director,'Self','employee',false,'{}',(select revision from public.staff_accounts where user_id=director));exception when others then blocked:=true;end;if not blocked then raise exception 'Self lockout accepted';end if;
 blocked:=false;begin perform public.staff_shift_delete(manager,bar,'2026-10-02',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Cross-team shift deletion accepted';end if;
 blocked:=false;begin perform public.staff_shift_delete(guard,guard,'2026-10-02',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Employee shift deletion accepted';end if;
 blocked:=false;begin perform public.staff_shift_delete(manager,guard,'2026-10-02',0);exception when others then blocked:=true;end;if not blocked then raise exception 'Stale shift deletion accepted';end if;
 r:=public.staff_shift_delete(manager,guard,'2026-10-02',1);
 if r<>2 or exists(select 1 from public.staff_planning where data#>array['publishedPlans','2026-10-02','people',guard::text] is not null or data#>array['validated','2026-10-02',guard::text] is not null) then raise exception 'Shift not removed';end if;
 if not exists(select 1 from public.staff_availability where user_id=guard and slots ? '22') then raise exception 'Availability removed';end if;
 select data#>array['publishedPlans','2026-10-02','people',bar::text] into after_bar from public.staff_planning where id=true;
 if before_bar is distinct from after_bar then raise exception 'Deletion changed other employee';end if;
 r:=public.staff_shift_delete(director,bar,'2026-10-02',2);if r<>3 then raise exception 'Director deletion failed';end if;
 if has_function_privilege('authenticated','public.staff_shift_delete(uuid,uuid,date,bigint)','EXECUTE') then raise exception 'Deletion RPC exposed';end if;
 perform public.staff_account_save(director,guard,'Test Sécu','employee',true,array[current_setting('test.bar_team')::uuid],1);
 blocked:=false;begin perform public.staff_security_validate(manager,guard,'2026-10-02','22','04:00',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Removed membership ignored';end if;
 perform public.staff_account_save(director,manager,'Test responsable','security_manager',false,'{}',1);
 blocked:=false;begin perform public.staff_security_validate(manager,bar,'2026-10-02','22','04:00',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Disabled manager accepted';end if;
 if has_function_privilege('authenticated','public.staff_security_validate(uuid,uuid,date,text,text,bigint)','EXECUTE') or has_function_privilege('authenticated','public.staff_account_save(uuid,uuid,text,text,boolean,uuid[],bigint)','EXECUTE') then raise exception 'Privileged RPC exposed';end if;
 if has_table_privilege('authenticated','public.staff_accounts','SELECT') or has_table_privilege('authenticated','public.employes_equipes','UPDATE') then raise exception 'Direct data access exposed';end if;

end $$;
select 'PASS: SQL permissions, account creation, team moves, scoped validation, non-security publication preservation, stale revision, unavailable slot and deactivation; all rolled back' as result;
rollback;
