begin;
do $$ declare u uuid:=gen_random_uuid(); begin
 insert into auth.users(id) values(u);
 insert into public.staff_accounts(user_id,name,login,role,active) values(u,'Recovery test','test-'||u,'employee',true);
 perform set_config('test.recovery_user',u::text,true);
end $$;
set local role service_role;
do $$ declare u uuid:=current_setting('test.recovery_user')::uuid; blocked boolean; begin
 insert into public.staff_recovery_tokens(token_hash,user_id,purpose,email,password_version,expires_at) values(repeat('a',64),u,'verify_email','test@example.com',0,now()+interval '30 minutes');
 blocked:=false;begin perform public.staff_recovery_take(repeat('a',64),'reset_password',0);exception when others then blocked:=true;end;if not blocked then raise exception 'Wrong purpose accepted';end if;
 blocked:=false;begin perform public.staff_recovery_take(repeat('a',64),'verify_email',1);exception when others then blocked:=true;end;if not blocked then raise exception 'Old password version accepted';end if;
 if public.staff_recovery_take(repeat('a',64),'verify_email',0)<>u then raise exception 'Wrong user';end if;
 if not exists(select 1 from public.staff_recovery_contacts where user_id=u and email='test@example.com') then raise exception 'Contact not verified';end if;
 blocked:=false;begin perform public.staff_recovery_take(repeat('a',64),'verify_email',0);exception when others then blocked:=true;end;if not blocked then raise exception 'Replay accepted';end if;
 insert into public.staff_recovery_tokens(token_hash,user_id,purpose,email,password_version,expires_at) values(repeat('b',64),u,'reset_password','test@example.com',0,now()+interval '15 minutes'),(repeat('c',64),u,'reset_password','old@example.com',0,now()+interval '15 minutes'),(repeat('d',64),u,'reset_password','test@example.com',0,now()-interval '1 minute');
 blocked:=false;begin perform public.staff_recovery_take(repeat('c',64),'reset_password',0);exception when others then blocked:=true;end;if not blocked then raise exception 'Old contact accepted';end if;
 blocked:=false;begin perform public.staff_recovery_take(repeat('d',64),'reset_password',0);exception when others then blocked:=true;end;if not blocked then raise exception 'Expired link accepted';end if;
 update public.staff_accounts set active=false where user_id=u;
 blocked:=false;begin perform public.staff_recovery_take(repeat('b',64),'reset_password',0);exception when others then blocked:=true;end;if not blocked then raise exception 'Disabled user accepted';end if;
 update public.staff_accounts set active=true where user_id=u;
 perform public.staff_recovery_take(repeat('b',64),'reset_password',0);
 if exists(select 1 from public.staff_recovery_tokens where user_id=u and used_at is null) then raise exception 'Sibling links still usable';end if;
 if not public.staff_recovery_throttle('test:'||u,1,60) or public.staff_recovery_throttle('test:'||u,1,60) then raise exception 'Throttle failed';end if;
 if has_function_privilege('authenticated','public.staff_recovery_take(text,text,bigint)','execute') or has_function_privilege('anon','public.staff_recovery_throttle(text,integer,integer)','execute') or has_table_privilege('anon','public.staff_recovery_tokens','select') or has_table_privilege('authenticated','public.staff_recovery_contacts','update') then raise exception 'Recovery data exposed';end if;
end $$;
select 'PASS recovery SQL: single-use, purpose, password version, email ownership, expiry, disabled accounts, sibling invalidation, throttling and grants. Rolled back.' as result;
rollback;
