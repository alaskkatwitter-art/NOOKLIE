DO $$
DECLARE
  v_root uuid;
  v_target uuid;
  v_second_target uuid;
  v_second_application uuid;
  v_rejected_application uuid;
  v_department uuid;
  v_role uuid;
  v_opportunity uuid;
  v_application uuid;
  v_self_opportunity uuid;
  v_self_application uuid;
  v_membership uuid;
BEGIN
  SELECT account.id INTO v_root
  FROM public.platform_admins admin
  JOIN public.auth_accounts account ON account.id=admin.user_id
  WHERE account.username='astriddy';
  IF v_root IS NULL THEN RAISE EXCEPTION 'Primary admin fixture is unavailable'; END IF;

  SELECT account.id INTO v_target
  FROM public.auth_accounts account JOIN public.profiles profile ON profile.user_id=account.id
  WHERE account.id<>v_root
    AND NOT EXISTS (SELECT 1 FROM public.platform_admins admin WHERE admin.user_id=account.id)
  LIMIT 1;
  SELECT account.id INTO v_second_target
  FROM public.auth_accounts account JOIN public.profiles profile ON profile.user_id=account.id
  WHERE account.id NOT IN (v_root,v_target)
    AND NOT EXISTS (SELECT 1 FROM public.platform_admins admin WHERE admin.user_id=account.id)
  LIMIT 1;
  SELECT id INTO v_department FROM public.departments WHERE status='active' ORDER BY sort_order LIMIT 1;
  IF v_target IS NULL OR v_second_target IS NULL OR v_department IS NULL THEN RAISE EXCEPTION 'Required test fixtures are unavailable'; END IF;

  BEGIN
    INSERT INTO public.auth_sessions (id,user_id,token_hash,expires_at)
    VALUES
      (gen_random_uuid(),v_root,repeat('e',64),now()+interval '5 minutes'),
      (gen_random_uuid(),v_target,repeat('f',64),now()+interval '5 minutes'),
      (gen_random_uuid(),v_second_target,repeat('g',64),now()+interval '5 minutes');

    v_role := public.admin_create_team_role(
      repeat('e',64),v_department,'__admin_workflow_test_role','','Teste','',
      ARRAY['members.view','members.manage']::text[]
    );
    BEGIN
      PERFORM public.admin_create_team_role(
        repeat('e',64),v_department,'__admin_platform_permission_test','','','',
        ARRAY['users.manage']::text[]
      );
      RAISE EXCEPTION 'A team role accepted a platform-only permission';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    IF EXISTS (SELECT 1 FROM public.team_roles WHERE name='__admin_platform_permission_test') THEN
      RAISE EXCEPTION 'Platform-only permission test created a role';
    END IF;

    BEGIN
      PERFORM public.admin_create_team_role(
        repeat('f',64),v_department,'__admin_nonroot_role_test','','','',
        ARRAY['members.manage']::text[]
      );
      RAISE EXCEPTION 'A non-root account managed team roles';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
      PERFORM public.admin_assign_team_member(repeat('e',64),v_root,v_role);
      RAISE EXCEPTION 'A primary administrator granted a role to itself';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    IF EXISTS (
      SELECT 1 FROM public.team_memberships
      WHERE user_id=v_root AND role_id=v_role AND status='active'
    ) THEN
      RAISE EXCEPTION 'Self-assignment created an active membership';
    END IF;

    v_opportunity := public.admin_create_opportunity(
      repeat('e',64),v_department,'__admin_workflow_test_job','','',1,
      '[{"id":"why","prompt":"Por que?","required":true}]'::jsonb,
      now()-interval '1 minute',now()+interval '1 day','open'
    );
    BEGIN
      PERFORM public.submit_opportunity_application(repeat('f',64),v_opportunity,'{}'::jsonb);
      RAISE EXCEPTION 'Required answer was not enforced';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    v_application := public.submit_opportunity_application(
      repeat('f',64),v_opportunity,'{"why":"Resposta de teste"}'::jsonb
    );
    PERFORM public.admin_review_application(repeat('e',64),v_application,'approved','Nota privada de teste',v_role);
    SELECT id INTO v_membership FROM public.team_memberships
    WHERE user_id=v_target AND role_id=v_role AND status='active';
    IF v_membership IS NULL THEN RAISE EXCEPTION 'Approval did not appoint the applicant'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id=v_application AND status='approved') THEN RAISE EXCEPTION 'Approval did not update application status'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_notifications WHERE user_id=v_target AND notification_type='team_appointment') THEN RAISE EXCEPTION 'Approval did not notify the applicant'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE subject_id=v_application AND action='application.approved') THEN RAISE EXCEPTION 'Approval was not audited'; END IF;

    v_second_application := public.submit_opportunity_application(
      repeat('g',64),v_opportunity,'{"why":"Outra candidatura de teste"}'::jsonb
    );
    BEGIN
      PERFORM public.admin_review_application(repeat('e',64),v_second_application,'approved','',v_role);
      RAISE EXCEPTION 'Approved applications exceeded the number of openings';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.applications
      WHERE id=v_second_application AND status='submitted'
    ) OR EXISTS (
      SELECT 1 FROM public.team_memberships
      WHERE user_id=v_second_target AND role_id=v_role AND status='active'
    ) THEN
      RAISE EXCEPTION 'Capacity rejection changed the application or appointed the applicant';
    END IF;

    PERFORM public.admin_review_application(
      repeat('e',64),v_second_application,'in_review','Triagem de teste',NULL
    );
    IF NOT EXISTS (
      SELECT 1 FROM public.applications
      WHERE id=v_second_application AND status='in_review'
    ) THEN
      RAISE EXCEPTION 'Application could not enter in_review';
    END IF;
    PERFORM public.cancel_own_application(repeat('g',64),v_second_application);
    IF NOT EXISTS (
      SELECT 1 FROM public.applications
      WHERE id=v_second_application AND status='cancelled'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.admin_audit_log
      WHERE subject_id=v_second_application AND action='application.cancelled'
    ) THEN
      RAISE EXCEPTION 'Applicant cancellation was not recorded';
    END IF;

    v_self_opportunity := public.admin_create_opportunity(
      repeat('e',64),v_department,'__admin_workflow_self_test','','',1,'[]'::jsonb,
      now()-interval '1 minute',now()+interval '1 day','open'
    );
    v_self_application := public.submit_opportunity_application(repeat('e',64),v_self_opportunity,'{}'::jsonb);
    BEGIN
      PERFORM public.admin_review_application(repeat('e',64),v_self_application,'approved','',v_role);
      RAISE EXCEPTION 'Self-appointment through an application was not blocked';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id=v_self_application AND status='submitted') THEN
      RAISE EXCEPTION 'Rejected self-appointment changed the application';
    END IF;

    v_rejected_application := public.submit_opportunity_application(
      repeat('f',64),v_self_opportunity,'{}'::jsonb
    );
    PERFORM public.admin_review_application(
      repeat('e',64),v_rejected_application,'rejected','Revisão de teste',NULL
    );
    IF NOT EXISTS (
      SELECT 1 FROM public.applications
      WHERE id=v_rejected_application AND status='rejected'
    ) OR NOT EXISTS (
      SELECT 1 FROM public.user_notifications
      WHERE user_id=v_target AND notification_type='application_rejected'
    ) THEN
      RAISE EXCEPTION 'Rejection status or notification was not recorded';
    END IF;

    PERFORM public.admin_remove_team_member(repeat('e',64),v_membership,'rollback test');
    IF NOT EXISTS (SELECT 1 FROM public.team_memberships WHERE id=v_membership AND status='removed') THEN
      RAISE EXCEPTION 'Removal did not preserve team history';
    END IF;
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='rollback_admin_workflow_test';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'rollback_admin_workflow_test' THEN RAISE; END IF;
  END;
END;
$$;

SELECT
  NOT EXISTS (SELECT 1 FROM public.opportunities WHERE title IN ('__admin_workflow_test_job','__admin_workflow_self_test')) AS opportunities_rolled_back,
  NOT EXISTS (SELECT 1 FROM public.applications WHERE internal_notes='Nota privada de teste') AS applications_rolled_back,
  NOT EXISTS (SELECT 1 FROM public.auth_sessions WHERE token_hash IN (repeat('e',64),repeat('f',64),repeat('g',64))) AS test_sessions_rolled_back,
  NOT EXISTS (SELECT 1 FROM public.team_roles WHERE name='__admin_workflow_test_role') AS test_role_rolled_back,
  NOT EXISTS (SELECT 1 FROM public.user_notifications WHERE notification_type='team_appointment' AND body LIKE '%__admin_workflow_test%') AS test_notifications_rolled_back;