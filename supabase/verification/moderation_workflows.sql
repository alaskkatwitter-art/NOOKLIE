DO $$
DECLARE
  root_id uuid := 'be272a49-1f7b-49ca-998f-d265029f4b34';
  target_profile_id uuid;
  own_profile_id uuid;
  v_target_user_id uuid;
  report_id uuid;
BEGIN
  SELECT profile.id, profile.user_id INTO target_profile_id, v_target_user_id
  FROM public.profiles profile
  WHERE profile.user_id <> root_id
  ORDER BY profile.created_at
  LIMIT 1;
  SELECT profile.id INTO own_profile_id FROM public.profiles profile WHERE profile.user_id = root_id;
  IF target_profile_id IS NULL OR own_profile_id IS NULL THEN RAISE EXCEPTION 'Required profile fixtures are missing'; END IF;

  BEGIN
    INSERT INTO public.auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (gen_random_uuid(), root_id, repeat('h',64), now()+interval '5 minutes');

    report_id := public.submit_moderation_report(repeat('h',64), 'profile', target_profile_id, 'other', 'Workflow test');
    IF NOT EXISTS (SELECT 1 FROM public.moderation_reports AS report WHERE report.id=report_id AND report.reporter_id=root_id AND report.target_user_id=v_target_user_id AND report.status='pending') THEN
      RAISE EXCEPTION 'Report submission did not persist expected private row';
    END IF;

    BEGIN
      PERFORM public.submit_moderation_report(repeat('h',64), 'profile', target_profile_id, 'other', 'Duplicate');
      RAISE EXCEPTION 'Duplicate open report was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
      PERFORM public.submit_moderation_report(repeat('h',64), 'profile', own_profile_id, 'other', '');
      RAISE EXCEPTION 'Self-report was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    PERFORM public.admin_review_moderation_report(repeat('h',64), report_id, 'in_review', 'Reviewed');
    PERFORM public.admin_review_moderation_report(repeat('h',64), report_id, 'resolved', 'Resolved');
    IF NOT EXISTS (SELECT 1 FROM public.moderation_reports AS report WHERE report.id=report_id AND report.status='resolved' AND report.internal_notes='Resolved') THEN
      RAISE EXCEPTION 'Report decision did not persist';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE subject_id=report_id AND action='moderation.report.resolved') THEN
      RAISE EXCEPTION 'Report decision was not audited';
    END IF;

    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='rollback_moderation_test';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'rollback_moderation_test' THEN RAISE; END IF;
  END;
END $$;

SELECT
  NOT EXISTS (SELECT 1 FROM public.moderation_reports WHERE details IN ('Workflow test', 'Duplicate')) AS test_reports_rolled_back,
  NOT EXISTS (SELECT 1 FROM public.auth_sessions WHERE token_hash=repeat('h',64)) AS test_session_rolled_back,
  NOT has_table_privilege('anon', 'public.moderation_reports', 'SELECT') AS anon_cannot_read,
  NOT has_table_privilege('authenticated', 'public.moderation_reports', 'SELECT') AS authenticated_cannot_read,
  has_table_privilege('service_role', 'public.moderation_reports', 'SELECT') AS service_role_can_read,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.moderation_reports'::regclass) AS rls_enabled;
