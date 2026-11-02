CREATE OR REPLACE FUNCTION public.admin_review_application(
  p_session_token_hash text,
  p_application_id uuid,
  p_status text,
  p_internal_notes text,
  p_role_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_user_id uuid;
  v_department_id uuid;
  v_opportunity_id uuid;
  v_title text;
  v_old_status text;
  v_old_notes text;
  v_role_department uuid;
  v_role_name text;
  v_membership_id uuid;
  v_badge_title text;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  SELECT application.user_id, opportunity.department_id, opportunity.id,
         opportunity.title, application.status, application.internal_notes
    INTO v_user_id,v_department_id,v_opportunity_id,v_title,v_old_status,v_old_notes
  FROM public.applications AS application
  JOIN public.opportunities AS opportunity ON opportunity.id=application.opportunity_id
  WHERE application.id=p_application_id
  FOR UPDATE OF application, opportunity;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Application not found';
  END IF;
  PERFORM public.admin_assert_permission(v_actor,'applications.review',v_department_id);
  IF v_old_status NOT IN ('submitted','in_review')
     OR p_status NOT IN ('in_review','approved','rejected')
     OR length(coalesce(p_internal_notes,'')) > 8000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Application decision is invalid';
  END IF;

  IF p_status='approved' THEN
    IF (
      SELECT count(*) FROM public.applications
      WHERE opportunity_id=v_opportunity_id AND status='approved'
    ) >= (
      SELECT openings FROM public.opportunities WHERE id=v_opportunity_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='All openings for this opportunity have been filled';
    END IF;
    IF v_actor = v_user_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='You cannot appoint yourself through an application';
    END IF;
    IF p_role_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose the team role for an approved application';
    END IF;
    PERFORM public.admin_assert_permission(v_actor,'members.manage',v_department_id);
    SELECT role.department_id,role.name,role.badge_title
      INTO v_role_department,v_role_name,v_badge_title
    FROM public.team_roles AS role
    WHERE role.id=p_role_id AND role.status='active';
    IF v_role_department IS DISTINCT FROM v_department_id THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='The chosen role must belong to the opportunity department';
    END IF;
  ELSIF p_role_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A role can only be selected when approving an application';
  END IF;

  UPDATE public.applications
  SET status=p_status,internal_notes=coalesce(p_internal_notes,''),reviewer_id=v_actor,
      reviewed_at=now(),updated_at=now()
  WHERE id=p_application_id;

  IF p_status='approved' THEN
    INSERT INTO public.team_memberships (user_id,department_id,role_id,assigned_by,status)
    VALUES (v_user_id,v_department_id,p_role_id,v_actor,'active')
    ON CONFLICT (user_id,role_id) WHERE status='active' DO NOTHING
    RETURNING id INTO v_membership_id;

    INSERT INTO public.user_notifications (user_id,notification_type,title,body,href)
    VALUES (v_user_id,'team_appointment','Você entrou para a equipe do Nooklie',
      format('Você foi aprovada para %s no departamento %s.',v_role_name,
        (SELECT name FROM public.departments WHERE id=v_department_id)),'/perfil');
  ELSIF p_status='rejected' THEN
    INSERT INTO public.user_notifications (user_id,notification_type,title,body,href)
    VALUES (v_user_id,'application_rejected','Atualização da sua candidatura',
      format('Sua candidatura para %s não foi aprovada desta vez.',v_title),'/oportunidades');
  END IF;

  INSERT INTO public.admin_audit_log (actor_user_id,action,subject_type,subject_id,details)
  VALUES (v_actor,CASE WHEN p_status='in_review' THEN 'application.review_started'
                       WHEN p_status='approved' THEN 'application.approved'
                       ELSE 'application.rejected' END,
      'application',p_application_id,
      jsonb_build_object('opportunity_id',v_opportunity_id,'user_id',v_user_id,
        'from_status',v_old_status,'to_status',p_status,'role_id',p_role_id,
        'membership_id',v_membership_id,'notes_changed',v_old_notes IS DISTINCT FROM coalesce(p_internal_notes,'')));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_application(text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_application(text, uuid, text, text, uuid) TO service_role;
