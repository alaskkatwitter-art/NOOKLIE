CREATE OR REPLACE FUNCTION public.admin_review_moderation_report(
  p_session_token_hash text,
  p_report_id uuid,
  p_status text,
  p_internal_notes text DEFAULT '',
  p_content_action text DEFAULT 'none'
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_department uuid;
  v_reporter uuid;
  v_content_type text;
  v_content_id uuid;
  v_rows integer;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  IF p_status NOT IN ('in_review', 'resolved', 'dismissed')
     OR char_length(coalesce(p_internal_notes, '')) > 8000
     OR p_content_action NOT IN ('none', 'hide', 'restore')
     OR (p_status = 'in_review' AND p_content_action <> 'none') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Moderation decision is invalid';
  END IF;

  SELECT report.department_id, report.reporter_id, report.content_type, report.content_id
    INTO v_department, v_reporter, v_content_type, v_content_id
  FROM public.moderation_reports AS report
  WHERE report.id = p_report_id
    AND (report.status IN ('pending', 'in_review') OR (p_content_action = 'restore' AND report.status = 'resolved'))
  FOR UPDATE;
  IF v_department IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Open moderation report not found';
  END IF;

  PERFORM public.admin_assert_permission(v_actor, 'moderation.manage', v_department);

  IF p_content_action = 'hide' THEN
    IF v_content_type = 'profile' THEN
      UPDATE public.profiles SET moderation_hidden_at = coalesce(moderation_hidden_at, now()) WHERE id = v_content_id;
    ELSIF v_content_type = 'story' THEN
      UPDATE public.stories SET moderation_hidden_at = coalesce(moderation_hidden_at, now()) WHERE id = v_content_id;
    ELSIF v_content_type = 'post' THEN
      UPDATE public.nook_posts SET moderation_hidden_at = coalesce(moderation_hidden_at, now()) WHERE id = v_content_id;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Reported content not found'; END IF;
  ELSIF p_content_action = 'restore' THEN
    IF v_content_type = 'profile' THEN
      UPDATE public.profiles SET moderation_hidden_at = NULL WHERE id = v_content_id;
    ELSIF v_content_type = 'story' THEN
      UPDATE public.stories SET moderation_hidden_at = NULL WHERE id = v_content_id;
    ELSIF v_content_type = 'post' THEN
      UPDATE public.nook_posts SET moderation_hidden_at = NULL WHERE id = v_content_id;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Reported content not found'; END IF;
  END IF;

  UPDATE public.moderation_reports
  SET status = p_status,
      internal_notes = btrim(coalesce(p_internal_notes, '')),
      reviewer_id = v_actor,
      reviewed_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_report_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    'moderation.report.' || p_status,
    'moderation_report',
    p_report_id,
    jsonb_build_object(
      'reporter_id', v_reporter,
      'department_id', v_department,
      'content_type', v_content_type,
      'content_id', v_content_id,
      'content_action', p_content_action
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_moderation_report(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_moderation_report(text, uuid, text, text, text) TO service_role;
