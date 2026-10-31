
create or replace function public.complete_auth_recovery(
  p_account_id uuid,
  p_expected_recovery_key_hash text,
  p_new_password_hash text,
  p_consumed_recovery_key_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = 'pg_catalog'
as $function$
declare
  v_updated_id uuid;
begin
  if p_account_id is null
     or p_expected_recovery_key_hash is null
     or p_new_password_hash is null
     or p_consumed_recovery_key_hash is null then
    raise exception 'Invalid recovery parameters';
  end if;

  update public.auth_accounts
  set
    password_hash = p_new_password_hash,
    recovery_key_hash = p_consumed_recovery_key_hash
  where id = p_account_id
    and recovery_key_hash = p_expected_recovery_key_hash
  returning id into v_updated_id;

  if v_updated_id is null then
    return false;
  end if;

  delete from public.auth_sessions
  where user_id = p_account_id;

  return true;
end;
$function$;

revoke all on function public.complete_auth_recovery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_auth_recovery(uuid, text, text, text)
  to service_role;
