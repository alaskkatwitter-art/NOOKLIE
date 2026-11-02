DO $$
DECLARE
  root_id uuid;
  target_id uuid;
  second_id uuid;
BEGIN
  SELECT account.id INTO root_id
  FROM public.platform_admins admin
  JOIN public.auth_accounts account ON account.id=admin.user_id
  WHERE account.username='astriddy';
  IF root_id IS NULL THEN RAISE EXCEPTION 'Primary admin fixture is unavailable'; END IF;

  SELECT account.id INTO target_id FROM public.auth_accounts account WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins admin WHERE admin.user_id=account.id) ORDER BY account.created_at LIMIT 1;
  SELECT account.id INTO second_id FROM public.auth_accounts account WHERE account.id NOT IN (root_id, target_id) AND NOT EXISTS (SELECT 1 FROM public.platform_admins admin WHERE admin.user_id=account.id) ORDER BY account.created_at LIMIT 1;
  IF target_id IS NULL OR second_id IS NULL THEN RAISE EXCEPTION 'Test accounts are unavailable'; END IF;

  BEGIN
    INSERT INTO public.auth_sessions (id,user_id,token_hash,expires_at)
    VALUES
      (gen_random_uuid(),root_id,repeat('j',64),now()+interval '5 minutes'),
      (gen_random_uuid(),target_id,repeat('k',64),now()+interval '5 minutes');

    PERFORM public.admin_set_account_status(repeat('j',64),target_id,'suspended','Test suspension');
    IF NOT EXISTS (SELECT 1 FROM public.auth_accounts account WHERE account.id=target_id AND account.account_status='suspended') THEN
      RAISE EXCEPTION 'Account was not suspended';
    END IF;
    IF EXISTS (SELECT 1 FROM public.auth_sessions session WHERE session.user_id=target_id) THEN
      RAISE EXCEPTION 'Suspension did not revoke existing sessions';
    END IF;

    PERFORM public.admin_set_account_status(repeat('j',64),target_id,'active','');
    IF NOT EXISTS (SELECT 1 FROM public.auth_accounts account WHERE account.id=target_id AND account.account_status='active') THEN
      RAISE EXCEPTION 'Account was not reactivated';
    END IF;

    BEGIN
      PERFORM public.admin_set_account_status(repeat('j',64),root_id,'suspended','');
      RAISE EXCEPTION 'Primary administrator account could be suspended';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    INSERT INTO public.auth_sessions (id,user_id,token_hash,expires_at)
    VALUES (gen_random_uuid(),target_id,repeat('k',64),now()+interval '5 minutes');
    BEGIN
      PERFORM public.admin_set_account_status(repeat('k',64),second_id,'suspended','');
      RAISE EXCEPTION 'Non-admin could manage accounts';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='rollback_user_status_test';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'rollback_user_status_test' THEN RAISE; END IF;
  END;
END $$;

DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins admin JOIN public.auth_accounts account ON account.id=admin.user_id WHERE account.username='astriddy' AND account.account_status='active') THEN
    RAISE EXCEPTION 'Primary administrator account did not remain active';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_sessions WHERE token_hash IN (repeat('j',64),repeat('k',64))) THEN
    RAISE EXCEPTION 'Account status test sessions were not rolled back';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admin_audit_log WHERE action IN ('user.suspended','user.reactivated') AND details->>'reason'='Test suspension') THEN
    RAISE EXCEPTION 'Account status test audit rows were not rolled back';
  END IF;
END;
$test$;