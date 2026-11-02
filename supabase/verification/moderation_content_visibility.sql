DO $$
DECLARE
  root_id uuid;
  target_profile uuid;
  target_user uuid;
  report_id uuid;
BEGIN
  SELECT account.id INTO root_id
  FROM public.platform_admins admin
  JOIN public.auth_accounts account ON account.id=admin.user_id
  WHERE account.username='astriddy';
  IF root_id IS NULL THEN RAISE EXCEPTION 'Primary admin fixture is unavailable'; END IF;

  SELECT profile.id, profile.user_id INTO target_profile, target_user
  FROM public.profiles AS profile
  WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins AS root WHERE root.user_id=profile.user_id)
  ORDER BY profile.created_at LIMIT 1;
  IF target_profile IS NULL THEN RAISE EXCEPTION 'A non-admin profile fixture is unavailable'; END IF;

  BEGIN
    INSERT INTO public.auth_sessions (id,user_id,token_hash,expires_at)
    VALUES (gen_random_uuid(),root_id,repeat('m',64),now()+interval '5 minutes');

    report_id := public.submit_moderation_report(repeat('m',64),'profile',target_profile,'other','Visibility test');
    PERFORM public.admin_review_moderation_report(repeat('m',64),report_id,'resolved','Hide test','hide');
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target_profile AND moderation_hidden_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Moderation action did not hide the profile';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.admin_audit_log WHERE subject_id=report_id AND details->>'content_action'='hide') THEN
      RAISE EXCEPTION 'Hide action was not audited';
    END IF;

    PERFORM public.admin_review_moderation_report(repeat('m',64),report_id,'resolved','Restore test','restore');
    IF EXISTS(SELECT 1 FROM public.profiles WHERE id=target_profile AND moderation_hidden_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Moderation action did not restore the profile';
    END IF;

    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='rollback_moderation_visibility_test';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'rollback_moderation_visibility_test' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=target_profile AND moderation_hidden_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Visibility test did not restore the target profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_sessions WHERE token_hash=repeat('m',64)) THEN
    RAISE EXCEPTION 'Visibility test session was not rolled back';
  END IF;
  IF EXISTS (SELECT 1 FROM public.moderation_reports WHERE id=report_id) THEN
    RAISE EXCEPTION 'Visibility test report was not rolled back';
  END IF;
END $$;
