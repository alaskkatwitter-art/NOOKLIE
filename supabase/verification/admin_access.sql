DO $$
DECLARE
  v_table text;
  v_routine text;
  v_tables text[] := ARRAY[
    'platform_admins','permissions','departments','team_roles',
    'team_role_permissions','team_memberships','admin_audit_log',
    'user_notifications','opportunities','applications'
  ];
  v_routines text[] := ARRAY[
    'admin_create_team_role','admin_update_team_role',
    'admin_assign_team_member','admin_remove_team_member',
    'admin_create_opportunity','admin_update_opportunity',
    'admin_validate_opportunity_questions','submit_opportunity_application',
    'admin_review_application','cancel_own_application'
  ];
  v_oid oid;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled for public.%', v_table;
    END IF;
    IF has_table_privilege('anon','public.'||v_table,'SELECT')
       OR has_table_privilege('anon','public.'||v_table,'INSERT')
       OR has_table_privilege('anon','public.'||v_table,'UPDATE')
       OR has_table_privilege('anon','public.'||v_table,'DELETE')
       OR has_table_privilege('authenticated','public.'||v_table,'SELECT')
       OR has_table_privilege('authenticated','public.'||v_table,'INSERT')
       OR has_table_privilege('authenticated','public.'||v_table,'UPDATE')
       OR has_table_privilege('authenticated','public.'||v_table,'DELETE') THEN
      RAISE EXCEPTION 'Direct client grants remain on public.%', v_table;
    END IF;
    IF NOT has_table_privilege('service_role','public.'||v_table,'SELECT') THEN
      RAISE EXCEPTION 'service_role cannot access public.%', v_table;
    END IF;
  END LOOP;

  FOREACH v_routine IN ARRAY v_routines LOOP
    SELECT p.oid INTO v_oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=v_routine
    LIMIT 1;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Missing administrative routine %', v_routine; END IF;
    IF has_function_privilege('anon',v_oid,'EXECUTE')
       OR has_function_privilege('authenticated',v_oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected execution grants on function %', v_routine;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='admin_audit_log'
      AND t.tgname='admin_audit_log_prevent_change' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'The append-only audit trigger is missing';
  END IF;

  IF (SELECT count(*) FROM public.platform_admins) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.platform_admins
       WHERE user_id='be272a49-1f7b-49ca-998f-d265029f4b34'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.platform_admins
       WHERE user_id='5685e19f-3d1e-4551-918d-036f7fa78aee'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.auth_accounts
       WHERE id='be272a49-1f7b-49ca-998f-d265029f4b34'
         AND username='astriddy'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.auth_accounts
       WHERE id='5685e19f-3d1e-4551-918d-036f7fa78aee'
         AND username='nooklie'
     ) THEN
    RAISE EXCEPTION 'Only the verified account IDs for astriddy and nooklie may be platform admins';
  END IF;
END;
$$;
