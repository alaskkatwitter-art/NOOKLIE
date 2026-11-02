CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  openings integer NOT NULL DEFAULT 1 CHECK (openings > 0),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  created_by uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

CREATE INDEX IF NOT EXISTS opportunities_public_listing_idx
  ON public.opportunities (status, opens_at, closes_at, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_department_status_idx
  ON public.opportunities (department_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.auth_accounts(id) ON DELETE RESTRICT,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected', 'cancelled')),
  internal_notes text NOT NULL DEFAULT '',
  reviewer_id uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, user_id)
);

CREATE INDEX IF NOT EXISTS applications_opportunity_status_idx
  ON public.applications (opportunity_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_user_created_idx
  ON public.applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_reviewer_idx
  ON public.applications (reviewer_id, reviewed_at DESC);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.opportunities, public.applications FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS deny_direct_client_access ON public.opportunities;
CREATE POLICY deny_direct_client_access ON public.opportunities
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS deny_direct_client_access ON public.applications;
CREATE POLICY deny_direct_client_access ON public.applications
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
GRANT ALL ON TABLE public.opportunities TO service_role;
GRANT ALL ON TABLE public.applications TO service_role;

CREATE OR REPLACE FUNCTION public.admin_validate_opportunity_questions(p_questions jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array'
     OR jsonb_array_length(p_questions) > 10 THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_questions) AS question(item)
    WHERE jsonb_typeof(question.item) <> 'object'
       OR coalesce(question.item->>'id', '') !~ '^[a-zA-Z0-9_-]{1,40}$'
       OR length(btrim(coalesce(question.item->>'prompt', ''))) NOT BETWEEN 1 AND 300
       OR (question.item ? 'required' AND jsonb_typeof(question.item->'required') <> 'boolean')
  ) THEN
    RETURN false;
  END IF;
  IF (
    SELECT count(DISTINCT question.item->>'id')
    FROM jsonb_array_elements(p_questions) AS question(item)
  ) <> jsonb_array_length(p_questions) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_opportunity(
  p_session_token_hash text,
  p_department_id uuid,
  p_title text,
  p_description text,
  p_requirements text,
  p_openings integer,
  p_questions jsonb,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_id uuid;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  PERFORM public.admin_assert_permission(v_actor, 'opportunities.manage', p_department_id);
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id=p_department_id AND status='active')
     OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 120
     OR length(coalesce(p_description,'')) > 12000
     OR length(coalesce(p_requirements,'')) > 8000
     OR p_openings NOT BETWEEN 1 AND 1000
     OR NOT public.admin_validate_opportunity_questions(p_questions)
     OR p_opens_at IS NULL OR p_closes_at IS NULL OR p_closes_at <= p_opens_at
     OR p_status NOT IN ('draft','open','closed','archived') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Opportunity fields are invalid';
  END IF;

  INSERT INTO public.opportunities (
    department_id,title,description,requirements,openings,questions,
    opens_at,closes_at,status,created_by,updated_by
  ) VALUES (
    p_department_id,btrim(p_title),coalesce(p_description,''),coalesce(p_requirements,''),
    p_openings,p_questions,p_opens_at,p_closes_at,p_status,v_actor,v_actor
  ) RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_log (actor_user_id,action,subject_type,subject_id,details)
  VALUES (v_actor,'opportunity.created','opportunity',v_id,
    jsonb_build_object('department_id',p_department_id,'title',btrim(p_title),'status',p_status));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_opportunity(
  p_session_token_hash text,
  p_opportunity_id uuid,
  p_department_id uuid,
  p_title text,
  p_description text,
  p_requirements text,
  p_openings integer,
  p_questions jsonb,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_old_department uuid;
  v_before jsonb;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  SELECT department_id,
    jsonb_build_object('department_id',department_id,'title',title,'status',status,
      'opens_at',opens_at,'closes_at',closes_at)
    INTO v_old_department,v_before
  FROM public.opportunities WHERE id=p_opportunity_id;
  IF v_old_department IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Opportunity not found';
  END IF;
  PERFORM public.admin_assert_permission(v_actor,'opportunities.manage',v_old_department);
  IF p_department_id IS DISTINCT FROM v_old_department THEN
    PERFORM public.admin_assert_permission(v_actor,'opportunities.manage',p_department_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id=p_department_id AND status='active')
     OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 120
     OR length(coalesce(p_description,'')) > 12000
     OR length(coalesce(p_requirements,'')) > 8000
     OR p_openings NOT BETWEEN 1 AND 1000
     OR NOT public.admin_validate_opportunity_questions(p_questions)
     OR p_opens_at IS NULL OR p_closes_at IS NULL OR p_closes_at <= p_opens_at
     OR p_status NOT IN ('draft','open','closed','archived') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Opportunity fields are invalid';
  END IF;

  UPDATE public.opportunities
  SET department_id=p_department_id,title=btrim(p_title),description=coalesce(p_description,''),
      requirements=coalesce(p_requirements,''),openings=p_openings,questions=p_questions,
      opens_at=p_opens_at,closes_at=p_closes_at,status=p_status,
      updated_by=v_actor,updated_at=now()
  WHERE id=p_opportunity_id;

  INSERT INTO public.admin_audit_log (actor_user_id,action,subject_type,subject_id,details)
  VALUES (v_actor,CASE WHEN p_status IN ('closed','archived') THEN 'opportunity.closed' ELSE 'opportunity.updated' END,
    'opportunity',p_opportunity_id,
    jsonb_build_object('before',v_before,'after',jsonb_build_object(
      'department_id',p_department_id,'title',btrim(p_title),'status',p_status,
      'opens_at',p_opens_at,'closes_at',p_closes_at)));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_opportunity_application(
  p_session_token_hash text,
  p_opportunity_id uuid,
  p_answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_questions jsonb;
  v_id uuid;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  SELECT questions INTO v_questions
  FROM public.opportunities
  WHERE id=p_opportunity_id
    AND status='open'
    AND opens_at <= now()
    AND closes_at > now();
  IF v_questions IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='This opportunity is not accepting applications';
  END IF;
  IF jsonb_typeof(p_answers) <> 'object' OR pg_column_size(p_answers) > 50000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Application answers are invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(p_answers) AS answer(key,value)
    WHERE length(answer.value) > 8000
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_questions) AS question(item)
         WHERE question.item->>'id'=answer.key
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Application answers do not match the application form';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_questions) AS question(item)
    WHERE coalesce((question.item->>'required')::boolean,false)
      AND nullif(btrim(coalesce(p_answers->>(question.item->>'id'),'')),'') IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Please answer all required questions';
  END IF;

  INSERT INTO public.applications (opportunity_id,user_id,answers)
  VALUES (p_opportunity_id,v_actor,p_answers)
  RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_log (actor_user_id,action,subject_type,subject_id,details)
  VALUES (v_actor,'application.submitted','application',v_id,
    jsonb_build_object('opportunity_id',p_opportunity_id));
  RETURN v_id;
END;
$$;

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
  WHERE application.id=p_application_id;
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

CREATE OR REPLACE FUNCTION public.cancel_own_application(
  p_session_token_hash text,
  p_application_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_status text;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  SELECT status INTO v_status FROM public.applications
  WHERE id=p_application_id AND user_id=v_actor FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Application not found';
  END IF;
  IF v_status NOT IN ('submitted','in_review') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This application can no longer be cancelled';
  END IF;
  UPDATE public.applications SET status='cancelled',updated_at=now()
  WHERE id=p_application_id;
  INSERT INTO public.admin_audit_log (actor_user_id,action,subject_type,subject_id,details)
  VALUES (v_actor,'application.cancelled','application',p_application_id,'{}'::jsonb);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_validate_opportunity_questions(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_opportunity(text, uuid, text, text, text, integer, jsonb, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_opportunity(text, uuid, uuid, text, text, text, integer, jsonb, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_opportunity_application(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_review_application(text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_own_application(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_opportunity(text, uuid, text, text, text, integer, jsonb, timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_opportunity(text, uuid, uuid, text, text, text, integer, jsonb, timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_opportunity_application(text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_application(text, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_own_application(text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_validate_opportunity_questions(jsonb) TO service_role;
