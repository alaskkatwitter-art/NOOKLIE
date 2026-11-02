CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.auth_accounts(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES public.auth_accounts(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  content_type text NOT NULL CHECK (content_type IN ('profile', 'post', 'story')),
  content_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('harassment', 'spam', 'inappropriate', 'copyright', 'safety', 'other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 3000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
  internal_notes text NOT NULL DEFAULT '',
  reviewer_id uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_reports_department_status_created_idx
  ON public.moderation_reports (department_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_reports_target_user_created_idx
  ON public.moderation_reports (target_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_one_open_reporter_content_idx
  ON public.moderation_reports (reporter_id, content_type, content_id)
  WHERE status IN ('pending', 'in_review');

ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.moderation_reports TO service_role;

CREATE OR REPLACE FUNCTION public.submit_moderation_report(
  p_session_token_hash text,
  p_content_type text,
  p_content_id uuid,
  p_reason text,
  p_details text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_target uuid;
  v_department uuid;
  v_report_id uuid;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);

  IF p_content_type = 'profile' THEN
    SELECT profile.user_id INTO v_target FROM public.profiles AS profile WHERE profile.id = p_content_id;
  ELSIF p_content_type = 'post' THEN
    SELECT post.user_id INTO v_target FROM public.nook_posts AS post WHERE post.id = p_content_id;
  ELSIF p_content_type = 'story' THEN
    SELECT story.author_id INTO v_target FROM public.stories AS story WHERE story.id = p_content_id;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported moderation target';
  END IF;

  IF v_target IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Reported content not found';
  END IF;
  IF v_target = v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'You cannot report your own content';
  END IF;
  IF p_reason NOT IN ('harassment', 'spam', 'inappropriate', 'copyright', 'safety', 'other')
     OR char_length(btrim(coalesce(p_details, ''))) > 3000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Report details are invalid';
  END IF;
  IF (SELECT count(*) FROM public.moderation_reports
      WHERE reporter_id = v_actor AND status IN ('pending', 'in_review')) >= 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Too many open reports';
  END IF;

  SELECT department.id INTO v_department
  FROM public.departments AS department
  WHERE department.slug = 'moderacao' AND department.status = 'active';
  IF v_department IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Moderation department is unavailable';
  END IF;

  INSERT INTO public.moderation_reports (
    reporter_id, target_user_id, department_id, content_type, content_id, reason, details
  ) VALUES (
    v_actor, v_target, v_department, p_content_type, p_content_id, p_reason, btrim(coalesce(p_details, ''))
  ) RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_moderation_report(
  p_session_token_hash text,
  p_report_id uuid,
  p_status text,
  p_internal_notes text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_department uuid;
  v_reporter uuid;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  IF p_status NOT IN ('in_review', 'resolved', 'dismissed')
     OR char_length(coalesce(p_internal_notes, '')) > 8000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Moderation decision is invalid';
  END IF;

  SELECT report.department_id, report.reporter_id
    INTO v_department, v_reporter
  FROM public.moderation_reports AS report
  WHERE report.id = p_report_id
    AND report.status IN ('pending', 'in_review');
  IF v_department IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Open moderation report not found';
  END IF;

  PERFORM public.admin_assert_permission(v_actor, 'moderation.manage', v_department);

  UPDATE public.moderation_reports
  SET status = p_status,
      internal_notes = btrim(coalesce(p_internal_notes, '')),
      reviewer_id = v_actor,
      reviewed_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_report_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (v_actor, 'moderation.report.' || p_status, 'moderation_report', p_report_id,
    jsonb_build_object('reporter_id', v_reporter, 'department_id', v_department));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_moderation_report(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_moderation_report(text, text, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_review_moderation_report(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_moderation_report(text, uuid, text, text) TO service_role;