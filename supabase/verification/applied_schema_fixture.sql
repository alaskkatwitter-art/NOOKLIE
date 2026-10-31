-- TEST ONLY: schema-only snapshot of the applied NOOKLIE public/private schema as observed on 2026-10-31.

-- Contains no production rows and is not a historical migration or a clean-install baseline.

-- Load only into a disposable local database to test migrations that follow this snapshot.

SET check_function_bodies = off;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE SCHEMA IF NOT EXISTS vault;

CREATE SCHEMA IF NOT EXISTS private;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE public.admin_audit_log (id uuid DEFAULT gen_random_uuid() NOT NULL, actor_user_id uuid, action text NOT NULL, subject_type text NOT NULL, subject_id uuid, details jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.applications (id uuid DEFAULT gen_random_uuid() NOT NULL, opportunity_id uuid NOT NULL, user_id uuid NOT NULL, answers jsonb DEFAULT '{}'::jsonb NOT NULL, status text DEFAULT 'submitted'::text NOT NULL, internal_notes text DEFAULT ''::text NOT NULL, reviewer_id uuid, reviewed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.auth_accounts (id uuid NOT NULL, username text NOT NULL, password_hash text NOT NULL, recovery_key_hash text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, account_status text DEFAULT 'active'::text NOT NULL);

CREATE TABLE public.auth_rate_limits (key_hash text NOT NULL, window_started_at timestamp with time zone DEFAULT now() NOT NULL, attempts integer DEFAULT 0 NOT NULL);

CREATE TABLE public.auth_sessions (id uuid NOT NULL, user_id uuid NOT NULL, token_hash text NOT NULL, expires_at timestamp with time zone NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.chapter_likes (chapter_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.chapter_media (id uuid DEFAULT gen_random_uuid() NOT NULL, chapter_id uuid NOT NULL, media_url text NOT NULL, media_type text NOT NULL, "position" integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.chapters (id uuid DEFAULT gen_random_uuid() NOT NULL, story_id uuid NOT NULL, chapter_number integer NOT NULL, title text NOT NULL, body text NOT NULL, published boolean DEFAULT true, created_at timestamp with time zone DEFAULT now(), author_notes text, original_published_at timestamp with time zone, republished_at timestamp with time zone, updated_at timestamp with time zone DEFAULT now() NOT NULL, publication_status text DEFAULT 'draft'::text NOT NULL);

CREATE TABLE public.comment_likes (comment_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.comments (id uuid DEFAULT gen_random_uuid() NOT NULL, chapter_id uuid NOT NULL, user_id uuid NOT NULL, body text NOT NULL, selected_text text, start_offset integer, end_offset integer, parent_comment_id uuid, created_at timestamp with time zone DEFAULT now(), sticker_id uuid);

CREATE TABLE public.departments (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, slug text NOT NULL, description text DEFAULT ''::text NOT NULL, sort_order integer DEFAULT 0 NOT NULL, status text DEFAULT 'active'::text NOT NULL, created_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, archived_at timestamp with time zone);

CREATE TABLE public.fic_club_members (id uuid DEFAULT gen_random_uuid() NOT NULL, club_id uuid NOT NULL, user_id uuid NOT NULL, joined_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.fic_clubs (id uuid DEFAULT gen_random_uuid() NOT NULL, story_id uuid NOT NULL, creator_id uuid NOT NULL, name text NOT NULL, description text, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.follows (follower_id uuid NOT NULL, following_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.moderation_reports (id uuid DEFAULT gen_random_uuid() NOT NULL, reporter_id uuid NOT NULL, target_user_id uuid NOT NULL, department_id uuid NOT NULL, content_type text NOT NULL, content_id uuid NOT NULL, reason text NOT NULL, details text DEFAULT ''::text NOT NULL, status text DEFAULT 'pending'::text NOT NULL, internal_notes text DEFAULT ''::text NOT NULL, reviewer_id uuid, reviewed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.nook_comment_reactions (id uuid DEFAULT gen_random_uuid() NOT NULL, comment_id uuid NOT NULL, user_id uuid NOT NULL, emoji text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.nook_comments (id uuid DEFAULT gen_random_uuid() NOT NULL, post_id uuid NOT NULL, author_id uuid NOT NULL, content text NOT NULL, parent_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.nook_post_media (id uuid DEFAULT gen_random_uuid() NOT NULL, post_id uuid NOT NULL, media_url text NOT NULL, media_type text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, "position" integer DEFAULT 0 NOT NULL);

CREATE TABLE public.nook_post_reactions (id uuid DEFAULT gen_random_uuid() NOT NULL, post_id uuid NOT NULL, user_id uuid NOT NULL, emoji text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.nook_posts (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, body text NOT NULL, image_url text, story_id uuid, pinned boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, moderation_hidden_at timestamp with time zone);

CREATE TABLE public.nook_saved_posts (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, post_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.official_signup_tokens (singleton boolean DEFAULT true NOT NULL, token_hash text NOT NULL, used_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.opportunities (id uuid DEFAULT gen_random_uuid() NOT NULL, department_id uuid NOT NULL, title text NOT NULL, description text DEFAULT ''::text NOT NULL, requirements text DEFAULT ''::text NOT NULL, openings integer DEFAULT 1 NOT NULL, questions jsonb DEFAULT '[]'::jsonb NOT NULL, opens_at timestamp with time zone NOT NULL, closes_at timestamp with time zone NOT NULL, status text DEFAULT 'draft'::text NOT NULL, created_by uuid, updated_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.permissions (code text NOT NULL, name text NOT NULL, description text DEFAULT ''::text NOT NULL, scope text DEFAULT 'department'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.platform_admins (user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.poll_options (id uuid DEFAULT gen_random_uuid() NOT NULL, poll_id uuid NOT NULL, option_text text NOT NULL);

CREATE TABLE public.poll_votes (poll_id uuid NOT NULL, option_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.polls (id uuid DEFAULT gen_random_uuid() NOT NULL, chapter_id uuid NOT NULL, question text NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.post_likes (post_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.posts (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, body text, quote_text text, chapter_id uuid, start_offset integer, end_offset integer, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.profiles (id uuid NOT NULL, username text NOT NULL, display_name text, bio text, avatar_url text, cover_url text, theme_color text DEFAULT '#ff78b9'::text, created_at timestamp with time zone DEFAULT now(), user_id uuid, recovery_key_hash text, verified boolean DEFAULT false NOT NULL, is_official boolean DEFAULT false NOT NULL, moderation_hidden_at timestamp with time zone);

CREATE TABLE public.reading_list_items (id uuid DEFAULT gen_random_uuid() NOT NULL, list_id uuid NOT NULL, story_id uuid NOT NULL, added_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.reading_lists (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, description text, is_public boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.reading_progress (user_id uuid NOT NULL, story_id uuid NOT NULL, chapter_id uuid NOT NULL, progress_percent numeric(5,2) DEFAULT 0, "position" integer DEFAULT 0, updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.scheduled_chapters (id uuid DEFAULT gen_random_uuid() NOT NULL, chapter_id uuid NOT NULL, scheduled_for timestamp with time zone NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.social_stories (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, media_url text NOT NULL, media_type text DEFAULT 'image'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL, thought text);

CREATE TABLE public.stories (id uuid DEFAULT gen_random_uuid() NOT NULL, author_id uuid NOT NULL, title text NOT NULL, description text, cover_url text, status text DEFAULT 'ongoing'::text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), rating text, expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL, moderation_hidden_at timestamp with time zone);

CREATE TABLE public.story_likes (story_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.story_tags (story_id uuid NOT NULL, tag_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.tag_categories (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, slug text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.tags (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, slug text NOT NULL, category_id uuid, created_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.team_memberships (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, department_id uuid NOT NULL, role_id uuid NOT NULL, status text DEFAULT 'active'::text NOT NULL, assigned_by uuid, assigned_at timestamp with time zone DEFAULT now() NOT NULL, removed_by uuid, removed_at timestamp with time zone, removal_reason text, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.team_role_permissions (role_id uuid NOT NULL, permission_code text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.team_roles (id uuid DEFAULT gen_random_uuid() NOT NULL, department_id uuid NOT NULL, name text NOT NULL, description text DEFAULT ''::text NOT NULL, badge_title text, badge_description text, status text DEFAULT 'active'::text NOT NULL, created_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, archived_at timestamp with time zone);

CREATE TABLE public.user_notifications (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, notification_type text NOT NULL, title text NOT NULL, body text DEFAULT ''::text NOT NULL, href text, created_at timestamp with time zone DEFAULT now() NOT NULL, read_at timestamp with time zone);

CREATE TABLE public.user_stickers (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, image_url text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, last_used_at timestamp with time zone);

CREATE OR REPLACE FUNCTION private.guard_moderation_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') AND (
    (TG_OP = 'INSERT' AND NEW.moderation_hidden_at IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.moderation_hidden_at IS DISTINCT FROM OLD.moderation_hidden_at)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Moderation visibility is managed by authorized server actions';
  END IF;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_assert_permission(p_actor uuid, p_permission_code text, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_scope text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_admins AS root_admin
    WHERE root_admin.user_id = p_actor
  ) THEN
    RETURN;
  END IF;

  SELECT permission.scope
    INTO v_scope
  FROM public.permissions AS permission
  WHERE permission.code = p_permission_code;

  IF v_scope IS DISTINCT FROM 'department' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permission is not available to team roles';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships AS membership
    JOIN public.team_roles AS active_role
      ON active_role.id = membership.role_id
      AND active_role.status = 'active'
    JOIN public.departments AS active_department
      ON active_department.id = membership.department_id
      AND active_department.status = 'active'
    JOIN public.team_role_permissions AS role_permission
      ON role_permission.role_id = membership.role_id
    WHERE membership.user_id = p_actor
      AND membership.status = 'active'
      AND membership.department_id = p_department_id
      AND role_permission.permission_code = p_permission_code
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The account lacks this department permission';
  END IF;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_assign_team_member(p_session_token_hash text, p_target_user_id uuid, p_role_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_department_id uuid;
  v_role_name text;
  v_department_name text;
  v_membership_id uuid;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);

  IF v_actor = p_target_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You cannot grant a team role to yourself';
  END IF;

  SELECT role.department_id, role.name, department.name
    INTO v_department_id, v_role_name, v_department_name
  FROM public.team_roles AS role
  JOIN public.departments AS department ON department.id = role.department_id
  WHERE role.id = p_role_id
    AND role.status = 'active'
    AND department.status = 'active';

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Active role not found';
  END IF;

  PERFORM public.admin_assert_permission(v_actor, 'members.manage', v_department_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.auth_accounts AS account
    JOIN public.profiles AS profile ON profile.user_id = account.id
    WHERE account.id = p_target_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Target account not found';
  END IF;

  INSERT INTO public.team_memberships (
    user_id, department_id, role_id, assigned_by, status
  )
  VALUES (
    p_target_user_id, v_department_id, p_role_id, v_actor, 'active'
  )
  RETURNING id INTO v_membership_id;

  INSERT INTO public.user_notifications (
    user_id, notification_type, title, body, href
  )
  VALUES (
    p_target_user_id,
    'team_appointment',
    'Você entrou para a equipe do Nooklie',
    format('Você foi nomeado para %s no departamento %s.', v_role_name, v_department_name),
    '/perfil'
  );

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    'team_member.appointed',
    'team_membership',
    v_membership_id,
    jsonb_build_object(
      'user_id', p_target_user_id,
      'department_id', v_department_id,
      'role_id', p_role_id,
      'role_name', v_role_name
    )
  );

  RETURN v_membership_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_create_department(p_session_token_hash text, p_name text, p_slug text, p_description text, p_sort_order integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_id uuid;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  PERFORM public.admin_assert_permission(v_actor, 'departments.manage');

  IF length(btrim(coalesce(p_name, ''))) = 0
     OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Department name or slug is invalid';
  END IF;

  INSERT INTO public.departments (name, slug, description, sort_order, created_by)
  VALUES (btrim(p_name), p_slug, coalesce(p_description, ''), coalesce(p_sort_order, 0), v_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    'department.created',
    'department',
    v_id,
    jsonb_build_object('name', btrim(p_name), 'slug', p_slug)
  );

  RETURN v_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_create_opportunity(p_session_token_hash text, p_department_id uuid, p_title text, p_description text, p_requirements text, p_openings integer, p_questions jsonb, p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.admin_create_team_role(p_session_token_hash text, p_department_id uuid, p_name text, p_description text, p_badge_title text, p_badge_description text, p_permission_codes text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_id uuid;
  v_permission_count integer;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  PERFORM public.admin_assert_permission(v_actor, 'roles.manage');

  IF length(btrim(coalesce(p_name, ''))) = 0
     OR NOT EXISTS (
       SELECT 1 FROM public.departments
       WHERE id = p_department_id AND status = 'active'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Department or role name is invalid';
  END IF;

  SELECT count(DISTINCT requested.code)
    INTO v_permission_count
  FROM unnest(coalesce(p_permission_codes, ARRAY[]::text[])) AS requested(code)
  JOIN public.permissions AS permission ON permission.code = requested.code
  WHERE permission.scope = 'department';

  IF v_permission_count <> cardinality(coalesce(p_permission_codes, ARRAY[]::text[])) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'One or more permissions are invalid for team roles';
  END IF;

  INSERT INTO public.team_roles (
    department_id, name, description, badge_title, badge_description, created_by
  )
  VALUES (
    p_department_id,
    btrim(p_name),
    coalesce(p_description, ''),
    nullif(btrim(coalesce(p_badge_title, '')), ''),
    nullif(btrim(coalesce(p_badge_description, '')), ''),
    v_actor
  )
  RETURNING id INTO v_id;

  INSERT INTO public.team_role_permissions (role_id, permission_code)
  SELECT v_id, permission_code
  FROM (
    SELECT DISTINCT unnest(coalesce(p_permission_codes, ARRAY[]::text[])) AS permission_code
  ) AS requested;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    'team_role.created',
    'team_role',
    v_id,
    jsonb_build_object(
      'department_id', p_department_id,
      'name', btrim(p_name),
      'permission_codes', coalesce(p_permission_codes, ARRAY[]::text[])
    )
  );

  RETURN v_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_current_actor(p_session_token_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
BEGIN
  SELECT session.user_id
    INTO v_actor
  FROM public.auth_sessions AS session
  WHERE session.token_hash = p_session_token_hash
    AND session.expires_at > now();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'A valid account session is required';
  END IF;

  RETURN v_actor;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_remove_team_member(p_session_token_hash text, p_membership_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_target_user_id uuid;
  v_department_id uuid;
  v_role_id uuid;
  v_role_name text;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);

  SELECT membership.user_id,
         membership.department_id,
         membership.role_id,
         role.name
    INTO v_target_user_id, v_department_id, v_role_id, v_role_name
  FROM public.team_memberships AS membership
  JOIN public.team_roles AS role ON role.id = membership.role_id
  WHERE membership.id = p_membership_id
    AND membership.status = 'active';

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Active team membership not found';
  END IF;

  IF v_actor = v_target_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.platform_admins
       WHERE user_id = v_actor
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You cannot change your own team permissions';
  END IF;

  PERFORM public.admin_assert_permission(v_actor, 'members.manage', v_department_id);

  UPDATE public.team_memberships
  SET status = 'removed',
      removed_by = v_actor,
      removed_at = now(),
      removal_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE id = p_membership_id;

  INSERT INTO public.user_notifications (
    user_id, notification_type, title, body, href
  )
  VALUES (
    v_target_user_id,
    'team_removal',
    'Atualização da sua equipe',
    format('Seu vínculo como %s foi encerrado.', v_role_name),
    '/perfil'
  );

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    'team_member.removed',
    'team_membership',
    p_membership_id,
    jsonb_build_object(
      'user_id', v_target_user_id,
      'department_id', v_department_id,
      'role_id', v_role_id,
      'role_name', v_role_name,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_review_application(p_session_token_hash text, p_application_id uuid, p_status text, p_internal_notes text, p_role_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.admin_review_moderation_report(p_session_token_hash text, p_report_id uuid, p_status text, p_internal_notes text DEFAULT ''::text, p_content_action text DEFAULT 'none'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.admin_set_account_status(p_session_token_hash text, p_target_user_id uuid, p_status text, p_reason text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_previous text;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  PERFORM public.admin_assert_permission(v_actor, 'users.manage');

  IF p_status NOT IN ('active', 'suspended')
     OR char_length(coalesce(p_reason, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Account status or reason is invalid';
  END IF;
  IF v_actor = p_target_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You cannot change your own account status';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_target_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Primary administrator accounts are protected';
  END IF;

  UPDATE public.auth_accounts
  SET account_status = p_status
  WHERE id = p_target_user_id
  RETURNING account_status INTO v_previous;
  IF v_previous IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Account not found';
  END IF;

  IF p_status = 'suspended' THEN
    DELETE FROM public.auth_sessions WHERE user_id = p_target_user_id;
  END IF;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    CASE WHEN p_status = 'suspended' THEN 'user.suspended' ELSE 'user.reactivated' END,
    'user',
    p_target_user_id,
    jsonb_build_object('status', p_status, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  INSERT INTO public.user_notifications (user_id, notification_type, title, body, href)
  VALUES (
    p_target_user_id,
    CASE WHEN p_status = 'suspended' THEN 'account_suspended' ELSE 'account_reactivated' END,
    CASE WHEN p_status = 'suspended' THEN 'Conta suspensa' ELSE 'Conta reativada' END,
    CASE WHEN p_status = 'suspended'
      THEN 'Sua conta foi suspensa. Entre em contato com o suporte do Nooklie.'
      ELSE 'Sua conta foi reativada. Você já pode entrar novamente.'
    END,
    '/'
  );

  RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_update_department(p_session_token_hash text, p_department_id uuid, p_name text, p_slug text, p_description text, p_sort_order integer, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_previous jsonb;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  PERFORM public.admin_assert_permission(v_actor, 'departments.manage');

  IF p_status NOT IN ('active', 'archived')
     OR length(btrim(coalesce(p_name, ''))) = 0
     OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Department fields are invalid';
  END IF;

  SELECT jsonb_build_object(
    'name', department.name,
    'slug', department.slug,
    'description', department.description,
    'sort_order', department.sort_order,
    'status', department.status
  )
  INTO v_previous
  FROM public.departments AS department
  WHERE department.id = p_department_id;

  IF v_previous IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Department not found';
  END IF;

  UPDATE public.departments
  SET name = btrim(p_name),
      slug = p_slug,
      description = coalesce(p_description, ''),
      sort_order = coalesce(p_sort_order, 0),
      status = p_status,
      archived_at = CASE
        WHEN p_status = 'archived' THEN coalesce(archived_at, now())
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_department_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    CASE WHEN p_status = 'archived' THEN 'department.archived' ELSE 'department.updated' END,
    'department',
    p_department_id,
    jsonb_build_object(
      'before', v_previous,
      'after', jsonb_build_object(
        'name', btrim(p_name),
        'slug', p_slug,
        'description', coalesce(p_description, ''),
        'sort_order', coalesce(p_sort_order, 0),
        'status', p_status
      )
    )
  );

  RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_update_opportunity(p_session_token_hash text, p_opportunity_id uuid, p_department_id uuid, p_title text, p_description text, p_requirements text, p_openings integer, p_questions jsonb, p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.admin_update_team_role(p_session_token_hash text, p_role_id uuid, p_name text, p_description text, p_badge_title text, p_badge_description text, p_status text, p_permission_codes text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_department_id uuid;
  v_previous jsonb;
  v_permission_count integer;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  PERFORM public.admin_assert_permission(v_actor, 'roles.manage');

  IF p_status NOT IN ('active', 'archived')
     OR length(btrim(coalesce(p_name, ''))) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Role fields are invalid';
  END IF;

  SELECT role.department_id,
         jsonb_build_object(
           'name', role.name,
           'description', role.description,
           'badge_title', role.badge_title,
           'badge_description', role.badge_description,
           'status', role.status
         )
    INTO v_department_id, v_previous
  FROM public.team_roles AS role
  WHERE role.id = p_role_id;

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Role not found';
  END IF;

  SELECT count(DISTINCT requested.code)
    INTO v_permission_count
  FROM unnest(coalesce(p_permission_codes, ARRAY[]::text[])) AS requested(code)
  JOIN public.permissions AS permission ON permission.code = requested.code
  WHERE permission.scope = 'department';

  IF v_permission_count <> cardinality(coalesce(p_permission_codes, ARRAY[]::text[])) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'One or more permissions are invalid for team roles';
  END IF;

  UPDATE public.team_roles
  SET name = btrim(p_name),
      description = coalesce(p_description, ''),
      badge_title = nullif(btrim(coalesce(p_badge_title, '')), ''),
      badge_description = nullif(btrim(coalesce(p_badge_description, '')), ''),
      status = p_status,
      archived_at = CASE
        WHEN p_status = 'archived' THEN coalesce(archived_at, now())
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_role_id;

  DELETE FROM public.team_role_permissions
  WHERE role_id = p_role_id;

  INSERT INTO public.team_role_permissions (role_id, permission_code)
  SELECT p_role_id, permission_code
  FROM (
    SELECT DISTINCT unnest(coalesce(p_permission_codes, ARRAY[]::text[])) AS permission_code
  ) AS requested;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    CASE WHEN p_status = 'archived' THEN 'team_role.archived' ELSE 'team_role.updated' END,
    'team_role',
    p_role_id,
    jsonb_build_object(
      'department_id', v_department_id,
      'before', v_previous,
      'after', jsonb_build_object(
        'name', btrim(p_name),
        'description', coalesce(p_description, ''),
        'badge_title', nullif(btrim(coalesce(p_badge_title, '')), ''),
        'badge_description', nullif(btrim(coalesce(p_badge_description, '')), ''),
        'status', p_status,
        'permission_codes', coalesce(p_permission_codes, ARRAY[]::text[])
      )
    )
  );

  RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_validate_opportunity_questions(p_questions jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.cancel_own_application(p_session_token_hash text, p_application_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.complete_auth_recovery(p_account_id uuid, p_expected_recovery_key_hash text, p_new_password_hash text, p_consumed_recovery_key_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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


CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(p_key_hash text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_attempts integer;
begin
  if p_key_hash is null or length(p_key_hash) <> 64
     or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.auth_rate_limits (key_hash, window_started_at, attempts)
  values (p_key_hash, now(), 1)
  on conflict (key_hash) do update
  set
    attempts = case
      when public.auth_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then 1
      else public.auth_rate_limits.attempts + 1
    end,
    window_started_at = case
      when public.auth_rate_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then now()
      else public.auth_rate_limits.window_started_at
    end
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$function$;


CREATE OR REPLACE FUNCTION public.generate_tag_slug(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
                                                                                                                                                                                                                  begin
                                                                                                                                                                                                                    return trim(
                                                                                                                                                                                                                        both '-'
                                                                                                                                                                                                                            from regexp_replace(
                                                                                                                                                                                                                                  lower(
                                                                                                                                                                                                                                          translate(
                                                                                                                                                                                                                                                    input,
                                                                                                                                                                                                                                                              'áàãâäéèêëíìîïóòõôöúùûüçñ',
                                                                                                                                                                                                                                                                        'aaaaaeeeeiiiiooooouuuucn'
                                                                                                                                                                                                                                                                                )
                                                                                                                                                                                                                                                                                      ),
                                                                                                                                                                                                                                                                                            '[^a-z0-9]+',
                                                                                                                                                                                                                                                                                                  '-',
                                                                                                                                                                                                                                                                                                        'g'
                                                                                                                                                                                                                                                                                                            )
                                                                                                                                                                                                                                                                                                              );
                                                                                                                                                                                                                                                                                                              end;
                                                                                                                                                                                                                                                                                                              $function$;


CREATE OR REPLACE FUNCTION public.get_story_tags(target_story_id uuid)
 RETURNS TABLE(id uuid, name text, slug text, category text, category_slug text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
                                                                                                                                                                                                                                                                                                                                                                                select
                                                                                                                                                                                                                                                                                                                                                                                    t.id,
                                                                                                                                                                                                                                                                                                                                                                                        t.name,
                                                                                                                                                                                                                                                                                                                                                                                            t.slug,
                                                                                                                                                                                                                                                                                                                                                                                                c.name as category,
                                                                                                                                                                                                                                                                                                                                                                                                    c.slug as category_slug
                                                                                                                                                                                                                                                                                                                                                                                                      from story_tags st
                                                                                                                                                                                                                                                                                                                                                                                                        join tags t
                                                                                                                                                                                                                                                                                                                                                                                                            on t.id = st.tag_id
                                                                                                                                                                                                                                                                                                                                                                                                              left join tag_categories c
                                                                                                                                                                                                                                                                                                                                                                                                                  on c.id = t.category_id
                                                                                                                                                                                                                                                                                                                                                                                                                    where st.story_id = target_story_id
                                                                                                                                                                                                                                                                                                                                                                                                                      order by
                                                                                                                                                                                                                                                                                                                                                                                                                          c.name,
                                                                                                                                                                                                                                                                                                                                                                                                                              t.name;
                                                                                                                                                                                                                                                                                                                                                                                                                              $function$;


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (
      id,
          username,
              display_name
                )
                  values (
                      new.id,
                          coalesce(
                                new.raw_user_meta_data ->> 'username',
                                      split_part(new.email, '@', 1)
                                          ),
                                              coalesce(
                                                    new.raw_user_meta_data ->> 'username',
                                                          split_part(new.email, '@', 1)
                                                              )
                                                                );

                                                                  return new;
                                                                  end;
                                                                  $function$;


CREATE OR REPLACE FUNCTION public.prevent_admin_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'Administrative audit records are append-only';
END;
$function$;


CREATE OR REPLACE FUNCTION public.search_public_stories(p_query text DEFAULT NULL::text, p_include_slugs text[] DEFAULT '{}'::text[], p_exclude_slugs text[] DEFAULT '{}'::text[], p_rating text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, author_id uuid, title text, description text, cover_url text, status text, rating text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT s.id, s.author_id, s.title, s.description, s.cover_url, s.status, s.rating, s.created_at, s.updated_at
  FROM public.stories AS s
  WHERE s.moderation_hidden_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.chapters AS published_chapter
    WHERE published_chapter.story_id = s.id AND published_chapter.published = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS author_profile
    LEFT JOIN public.auth_accounts AS account ON account.id = author_profile.user_id
    WHERE author_profile.id = s.author_id
      AND (author_profile.moderation_hidden_at IS NOT NULL OR account.account_status = 'suspended')
  )
  AND (
    p_query IS NULL OR btrim(p_query) = ''
    OR position(lower(btrim(p_query)) IN lower(coalesce(s.title, ''))) > 0
    OR position(lower(btrim(p_query)) IN lower(coalesce(s.description, ''))) > 0
  )
  AND (p_rating IS NULL OR s.rating = p_rating)
  AND (p_status IS NULL OR s.status = p_status)
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_include_slugs, '{}'::text[])) AS required(slug)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.story_tags AS st
      JOIN public.tags AS t ON t.id = st.tag_id
      WHERE st.story_id = s.id AND t.slug = required.slug
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_exclude_slugs, '{}'::text[])) AS excluded(slug)
    WHERE EXISTS (
      SELECT 1
      FROM public.story_tags AS st
      JOIN public.tags AS t ON t.id = st.tag_id
      WHERE st.story_id = s.id AND t.slug = excluded.slug
    )
  )
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN s.created_at END DESC,
    CASE WHEN p_sort = 'title_asc' THEN s.title END ASC,
    CASE WHEN p_sort = 'title_desc' THEN s.title END DESC,
    s.updated_at DESC,
    s.id
  LIMIT least(greatest(coalesce(p_limit, 24), 1), 48)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;


CREATE OR REPLACE FUNCTION public.search_tags(search_text text)
 RETURNS TABLE(id uuid, name text, slug text, category text, category_slug text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
                                                                                                                                                                                                                                                                                                                          select
                                                                                                                                                                                                                                                                                                                              t.id,
                                                                                                                                                                                                                                                                                                                                  t.name,
                                                                                                                                                                                                                                                                                                                                      t.slug,
                                                                                                                                                                                                                                                                                                                                          c.name as category,
                                                                                                                                                                                                                                                                                                                                              c.slug as category_slug
                                                                                                                                                                                                                                                                                                                                                from tags t
                                                                                                                                                                                                                                                                                                                                                  left join tag_categories c
                                                                                                                                                                                                                                                                                                                                                      on c.id = t.category_id
                                                                                                                                                                                                                                                                                                                                                        where
                                                                                                                                                                                                                                                                                                                                                            t.name ilike '%' || search_text || '%'
                                                                                                                                                                                                                                                                                                                                                              order by
                                                                                                                                                                                                                                                                                                                                                                  t.name asc
                                                                                                                                                                                                                                                                                                                                                                    limit 20;
                                                                                                                                                                                                                                                                                                                                                                    $function$;


CREATE OR REPLACE FUNCTION public.submit_moderation_report(p_session_token_hash text, p_content_type text, p_content_id uuid, p_reason text, p_details text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.submit_opportunity_application(p_session_token_hash text, p_opportunity_id uuid, p_answers jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;


CREATE OR REPLACE FUNCTION public.sync_official_account_follows()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_official IS NOT DISTINCT FROM NEW.is_official THEN
    RETURN NEW;
  END IF;

  IF NEW.is_official THEN
    INSERT INTO public.follows (follower_id, following_id)
    SELECT profile.id, NEW.id
    FROM public.profiles AS profile
    WHERE profile.id <> NEW.id
    ON CONFLICT (follower_id, following_id) DO NOTHING;
  ELSE
    INSERT INTO public.follows (follower_id, following_id)
    SELECT NEW.id, official.id
    FROM public.profiles AS official
    WHERE official.is_official = true
      AND official.id <> NEW.id
    ON CONFLICT (follower_id, following_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_nook_comment_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;


SET check_function_bodies = on;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE public.applications ADD CONSTRAINT applications_answers_check CHECK ((jsonb_typeof(answers) = 'object'::text));

ALTER TABLE public.applications ADD CONSTRAINT applications_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE RESTRICT;

ALTER TABLE public.applications ADD CONSTRAINT applications_opportunity_id_user_id_key UNIQUE (opportunity_id, user_id);

ALTER TABLE public.applications ADD CONSTRAINT applications_pkey PRIMARY KEY (id);

ALTER TABLE public.applications ADD CONSTRAINT applications_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.applications ADD CONSTRAINT applications_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));

ALTER TABLE public.applications ADD CONSTRAINT applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.auth_accounts ADD CONSTRAINT auth_accounts_account_status_check CHECK ((account_status = ANY (ARRAY['active'::text, 'suspended'::text])));

ALTER TABLE public.auth_accounts ADD CONSTRAINT auth_accounts_pkey PRIMARY KEY (id);

ALTER TABLE public.auth_accounts ADD CONSTRAINT auth_accounts_recovery_key_hash_key UNIQUE (recovery_key_hash);

ALTER TABLE public.auth_accounts ADD CONSTRAINT auth_accounts_username_key UNIQUE (username);

ALTER TABLE public.auth_rate_limits ADD CONSTRAINT auth_rate_limits_attempts_check CHECK ((attempts >= 0));

ALTER TABLE public.auth_rate_limits ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (key_hash);

ALTER TABLE public.auth_sessions ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.auth_sessions ADD CONSTRAINT auth_sessions_token_hash_key UNIQUE (token_hash);

ALTER TABLE public.chapter_likes ADD CONSTRAINT chapter_likes_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;

ALTER TABLE public.chapter_likes ADD CONSTRAINT chapter_likes_pkey PRIMARY KEY (chapter_id, user_id);

ALTER TABLE public.chapter_media ADD CONSTRAINT chapter_media_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;

ALTER TABLE public.chapter_media ADD CONSTRAINT chapter_media_pkey PRIMARY KEY (id);

ALTER TABLE public.chapter_media ADD CONSTRAINT chapter_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'gif'::text])));

ALTER TABLE public.chapters ADD CONSTRAINT chapters_pkey PRIMARY KEY (id);

ALTER TABLE public.chapters ADD CONSTRAINT chapters_publication_status_check CHECK ((publication_status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'unpublished'::text])));

ALTER TABLE public.chapters ADD CONSTRAINT chapters_story_id_chapter_number_key UNIQUE (story_id, chapter_number);

ALTER TABLE public.chapters ADD CONSTRAINT chapters_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE;

ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id);

ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.comments ADD CONSTRAINT comments_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;

ALTER TABLE public.comments ADD CONSTRAINT comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE;

ALTER TABLE public.comments ADD CONSTRAINT comments_pkey PRIMARY KEY (id);

ALTER TABLE public.comments ADD CONSTRAINT comments_sticker_id_fkey FOREIGN KEY (sticker_id) REFERENCES user_stickers(id) ON DELETE SET NULL;

ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.departments ADD CONSTRAINT departments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE public.departments ADD CONSTRAINT departments_slug_key UNIQUE (slug);

ALTER TABLE public.departments ADD CONSTRAINT departments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])));

ALTER TABLE public.fic_club_members ADD CONSTRAINT fic_club_members_club_id_fkey FOREIGN KEY (club_id) REFERENCES fic_clubs(id) ON DELETE CASCADE;

ALTER TABLE public.fic_club_members ADD CONSTRAINT fic_club_members_club_id_user_id_key UNIQUE (club_id, user_id);

ALTER TABLE public.fic_club_members ADD CONSTRAINT fic_club_members_pkey PRIMARY KEY (id);

ALTER TABLE public.fic_club_members ADD CONSTRAINT fic_club_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.fic_clubs ADD CONSTRAINT fic_clubs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.fic_clubs ADD CONSTRAINT fic_clubs_pkey PRIMARY KEY (id);

ALTER TABLE public.fic_clubs ADD CONSTRAINT fic_clubs_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

ALTER TABLE public.follows ADD CONSTRAINT follows_check CHECK ((follower_id <> following_id));

ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.follows ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.follows ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_content_type_check CHECK ((content_type = ANY (ARRAY['profile'::text, 'post'::text, 'story'::text])));

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_details_check CHECK ((char_length(details) <= 3000));

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_pkey PRIMARY KEY (id);

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_reason_check CHECK ((reason = ANY (ARRAY['harassment'::text, 'spam'::text, 'inappropriate'::text, 'copyright'::text, 'safety'::text, 'other'::text])));

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_review'::text, 'resolved'::text, 'dismissed'::text])));

ALTER TABLE public.moderation_reports ADD CONSTRAINT moderation_reports_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.nook_comment_reactions ADD CONSTRAINT nook_comment_reactions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES nook_comments(id) ON DELETE CASCADE;

ALTER TABLE public.nook_comment_reactions ADD CONSTRAINT nook_comment_reactions_comment_id_user_id_emoji_key UNIQUE (comment_id, user_id, emoji);

ALTER TABLE public.nook_comment_reactions ADD CONSTRAINT nook_comment_reactions_emoji_check CHECK ((emoji = ANY (ARRAY['❤️'::text, '😂'::text, '😭'::text, '😱'::text, '👀'::text, '🔥'::text])));

ALTER TABLE public.nook_comment_reactions ADD CONSTRAINT nook_comment_reactions_pkey PRIMARY KEY (id);

ALTER TABLE public.nook_comments ADD CONSTRAINT nook_comments_content_check CHECK ((char_length(TRIM(BOTH FROM content)) > 0));

ALTER TABLE public.nook_comments ADD CONSTRAINT nook_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES nook_comments(id) ON DELETE CASCADE;

ALTER TABLE public.nook_comments ADD CONSTRAINT nook_comments_pkey PRIMARY KEY (id);

ALTER TABLE public.nook_comments ADD CONSTRAINT nook_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE;

ALTER TABLE public.nook_post_media ADD CONSTRAINT nook_post_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'gif'::text])));

ALTER TABLE public.nook_post_media ADD CONSTRAINT nook_post_media_pkey PRIMARY KEY (id);

ALTER TABLE public.nook_post_media ADD CONSTRAINT nook_post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE;

ALTER TABLE public.nook_post_reactions ADD CONSTRAINT nook_post_reactions_emoji_check CHECK ((emoji = ANY (ARRAY['❤️'::text, '😂'::text, '😭'::text, '😱'::text, '👀'::text, '🔥'::text])));

ALTER TABLE public.nook_post_reactions ADD CONSTRAINT nook_post_reactions_pkey PRIMARY KEY (id);

ALTER TABLE public.nook_post_reactions ADD CONSTRAINT nook_post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE;

ALTER TABLE public.nook_post_reactions ADD CONSTRAINT nook_post_reactions_post_id_user_id_emoji_key UNIQUE (post_id, user_id, emoji);

ALTER TABLE public.nook_posts ADD CONSTRAINT nook_posts_pkey PRIMARY KEY (id);

ALTER TABLE public.nook_posts ADD CONSTRAINT nook_posts_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL;

ALTER TABLE public.nook_posts ADD CONSTRAINT nook_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.nook_saved_posts ADD CONSTRAINT nook_saved_posts_pkey PRIMARY KEY (id);

ALTER TABLE public.nook_saved_posts ADD CONSTRAINT nook_saved_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE;

ALTER TABLE public.nook_saved_posts ADD CONSTRAINT nook_saved_posts_user_id_post_id_key UNIQUE (user_id, post_id);

ALTER TABLE public.official_signup_tokens ADD CONSTRAINT official_signup_tokens_pkey PRIMARY KEY (singleton);

ALTER TABLE public.official_signup_tokens ADD CONSTRAINT official_signup_tokens_singleton_check CHECK ((singleton IS TRUE));

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_check CHECK ((closes_at > opens_at));

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_openings_check CHECK ((openings > 0));

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_questions_check CHECK ((jsonb_typeof(questions) = 'array'::text));

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text, 'archived'::text])));

ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (code);

ALTER TABLE public.permissions ADD CONSTRAINT permissions_scope_check CHECK ((scope = ANY (ARRAY['platform'::text, 'department'::text])));

ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);

ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.poll_options ADD CONSTRAINT poll_options_pkey PRIMARY KEY (id);

ALTER TABLE public.poll_options ADD CONSTRAINT poll_options_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (poll_id, user_id);

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.polls ADD CONSTRAINT polls_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;

ALTER TABLE public.polls ADD CONSTRAINT polls_pkey PRIMARY KEY (id);

ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.posts ADD CONSTRAINT posts_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL;

ALTER TABLE public.posts ADD CONSTRAINT posts_pkey PRIMARY KEY (id);

ALTER TABLE public.posts ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_length CHECK (((username IS NULL) OR ((char_length(username) >= 3) AND (char_length(username) <= 30))));

ALTER TABLE public.reading_list_items ADD CONSTRAINT reading_list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES reading_lists(id) ON DELETE CASCADE;

ALTER TABLE public.reading_list_items ADD CONSTRAINT reading_list_items_list_id_story_id_key UNIQUE (list_id, story_id);

ALTER TABLE public.reading_list_items ADD CONSTRAINT reading_list_items_pkey PRIMARY KEY (id);

ALTER TABLE public.reading_list_items ADD CONSTRAINT reading_list_items_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

ALTER TABLE public.reading_lists ADD CONSTRAINT reading_lists_pkey PRIMARY KEY (id);

ALTER TABLE public.reading_lists ADD CONSTRAINT reading_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_pkey PRIMARY KEY (user_id, story_id);

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

ALTER TABLE public.reading_progress ADD CONSTRAINT reading_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.scheduled_chapters ADD CONSTRAINT scheduled_chapters_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;

ALTER TABLE public.scheduled_chapters ADD CONSTRAINT scheduled_chapters_pkey PRIMARY KEY (id);

ALTER TABLE public.scheduled_chapters ADD CONSTRAINT scheduled_chapters_unique_chapter UNIQUE (chapter_id);

ALTER TABLE public.social_stories ADD CONSTRAINT social_stories_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'gif'::text, 'video'::text])));

ALTER TABLE public.social_stories ADD CONSTRAINT social_stories_pkey PRIMARY KEY (id);

ALTER TABLE public.social_stories ADD CONSTRAINT social_stories_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.stories ADD CONSTRAINT stories_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.stories ADD CONSTRAINT stories_pkey PRIMARY KEY (id);

ALTER TABLE public.story_likes ADD CONSTRAINT story_likes_pkey PRIMARY KEY (story_id, user_id);

ALTER TABLE public.story_likes ADD CONSTRAINT story_likes_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

ALTER TABLE public.story_likes ADD CONSTRAINT story_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.story_tags ADD CONSTRAINT story_tags_pkey PRIMARY KEY (story_id, tag_id);

ALTER TABLE public.story_tags ADD CONSTRAINT story_tags_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

ALTER TABLE public.story_tags ADD CONSTRAINT story_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE public.tag_categories ADD CONSTRAINT tag_categories_name_key UNIQUE (name);

ALTER TABLE public.tag_categories ADD CONSTRAINT tag_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.tag_categories ADD CONSTRAINT tag_categories_slug_key UNIQUE (slug);

ALTER TABLE public.tags ADD CONSTRAINT tags_category_id_fkey FOREIGN KEY (category_id) REFERENCES tag_categories(id) ON DELETE SET NULL;

ALTER TABLE public.tags ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE public.tags ADD CONSTRAINT tags_slug_key UNIQUE (slug);

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_check CHECK ((((status = 'active'::text) AND (removed_at IS NULL)) OR ((status = 'removed'::text) AND (removed_at IS NOT NULL))));

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_pkey PRIMARY KEY (id);

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_role_id_fkey FOREIGN KEY (role_id) REFERENCES team_roles(id) ON DELETE RESTRICT;

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'removed'::text])));

ALTER TABLE public.team_memberships ADD CONSTRAINT team_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.team_role_permissions ADD CONSTRAINT team_role_permissions_permission_code_fkey FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE RESTRICT;

ALTER TABLE public.team_role_permissions ADD CONSTRAINT team_role_permissions_pkey PRIMARY KEY (role_id, permission_code);

ALTER TABLE public.team_role_permissions ADD CONSTRAINT team_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES team_roles(id) ON DELETE CASCADE;

ALTER TABLE public.team_roles ADD CONSTRAINT team_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.team_roles ADD CONSTRAINT team_roles_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;

ALTER TABLE public.team_roles ADD CONSTRAINT team_roles_department_id_name_key UNIQUE (department_id, name);

ALTER TABLE public.team_roles ADD CONSTRAINT team_roles_pkey PRIMARY KEY (id);

ALTER TABLE public.team_roles ADD CONSTRAINT team_roles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])));

ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.user_stickers ADD CONSTRAINT user_stickers_pkey PRIMARY KEY (id);

ALTER TABLE public.user_stickers ADD CONSTRAINT user_stickers_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log USING btree (created_at DESC)

CREATE INDEX admin_audit_log_subject_idx ON public.admin_audit_log USING btree (subject_type, subject_id, created_at DESC)

CREATE INDEX admin_audit_log_actor_user_id_idx ON public.admin_audit_log USING btree (actor_user_id)

CREATE INDEX applications_opportunity_status_idx ON public.applications USING btree (opportunity_id, status, created_at DESC)

CREATE INDEX applications_user_created_idx ON public.applications USING btree (user_id, created_at DESC)

CREATE INDEX applications_reviewer_idx ON public.applications USING btree (reviewer_id, reviewed_at DESC)

CREATE INDEX auth_accounts_account_status_idx ON public.auth_accounts USING btree (account_status)

CREATE INDEX auth_sessions_user_id_idx ON public.auth_sessions USING btree (user_id)

CREATE INDEX auth_sessions_expires_at_idx ON public.auth_sessions USING btree (expires_at)

CREATE INDEX chapter_likes_chapter_id_idx ON public.chapter_likes USING btree (chapter_id)

CREATE INDEX chapter_likes_user_id_idx ON public.chapter_likes USING btree (user_id)

CREATE INDEX chapter_media_chapter_id_idx ON public.chapter_media USING btree (chapter_id)

CREATE INDEX chapter_media_position_idx ON public.chapter_media USING btree (chapter_id, "position")

CREATE INDEX chapters_story_id_idx ON public.chapters USING btree (story_id)

CREATE INDEX chapters_publication_status_idx ON public.chapters USING btree (publication_status)

CREATE INDEX comment_likes_user_id_idx ON public.comment_likes USING btree (user_id)

CREATE INDEX comments_chapter_id_idx ON public.comments USING btree (chapter_id)

CREATE INDEX comments_parent_id_idx ON public.comments USING btree (parent_comment_id)

CREATE INDEX comments_sticker_id_idx ON public.comments USING btree (sticker_id)

CREATE INDEX comments_user_id_idx ON public.comments USING btree (user_id)

CREATE INDEX departments_created_by_idx ON public.departments USING btree (created_by)

CREATE INDEX fic_club_members_club_id_idx ON public.fic_club_members USING btree (club_id)

CREATE INDEX fic_club_members_user_id_idx ON public.fic_club_members USING btree (user_id)

CREATE INDEX fic_clubs_story_id_idx ON public.fic_clubs USING btree (story_id)

CREATE INDEX fic_clubs_creator_id_idx ON public.fic_clubs USING btree (creator_id)

CREATE INDEX follows_following_id_idx ON public.follows USING btree (following_id)

CREATE INDEX moderation_reports_department_status_created_idx ON public.moderation_reports USING btree (department_id, status, created_at DESC)

CREATE INDEX moderation_reports_target_user_created_idx ON public.moderation_reports USING btree (target_user_id, created_at DESC)

CREATE UNIQUE INDEX moderation_reports_one_open_reporter_content_idx ON public.moderation_reports USING btree (reporter_id, content_type, content_id) WHERE (status = ANY (ARRAY['pending'::text, 'in_review'::text]))

CREATE INDEX moderation_reports_reviewer_id_idx ON public.moderation_reports USING btree (reviewer_id)

CREATE INDEX nook_comment_reactions_comment_id_idx ON public.nook_comment_reactions USING btree (comment_id)

CREATE INDEX nook_comment_reactions_user_id_idx ON public.nook_comment_reactions USING btree (user_id)

CREATE INDEX nook_comments_post_id_idx ON public.nook_comments USING btree (post_id)

CREATE INDEX nook_comments_parent_id_idx ON public.nook_comments USING btree (parent_id)

CREATE INDEX nook_comments_author_id_idx ON public.nook_comments USING btree (author_id)

CREATE INDEX nook_post_media_post_id_idx ON public.nook_post_media USING btree (post_id)

CREATE INDEX nook_post_media_post_position_idx ON public.nook_post_media USING btree (post_id, "position")

CREATE INDEX nook_post_reactions_post_id_idx ON public.nook_post_reactions USING btree (post_id)

CREATE INDEX nook_post_reactions_user_id_idx ON public.nook_post_reactions USING btree (user_id)

CREATE INDEX nook_posts_story_id_idx ON public.nook_posts USING btree (story_id)

CREATE INDEX nook_posts_user_id_idx ON public.nook_posts USING btree (user_id)

CREATE INDEX nook_posts_public_created_idx ON public.nook_posts USING btree (created_at DESC) WHERE (moderation_hidden_at IS NULL)

CREATE INDEX nook_saved_posts_user_id_idx ON public.nook_saved_posts USING btree (user_id)

CREATE INDEX nook_saved_posts_post_id_idx ON public.nook_saved_posts USING btree (post_id)

CREATE INDEX nook_saved_posts_created_at_idx ON public.nook_saved_posts USING btree (created_at DESC)

CREATE INDEX opportunities_public_listing_idx ON public.opportunities USING btree (status, opens_at, closes_at, created_at DESC)

CREATE INDEX opportunities_department_status_idx ON public.opportunities USING btree (department_id, status, created_at DESC)

CREATE INDEX opportunities_created_by_idx ON public.opportunities USING btree (created_by)

CREATE INDEX opportunities_updated_by_idx ON public.opportunities USING btree (updated_by)

CREATE INDEX poll_options_poll_id_idx ON public.poll_options USING btree (poll_id)

CREATE INDEX poll_votes_option_id_idx ON public.poll_votes USING btree (option_id)

CREATE INDEX poll_votes_user_id_idx ON public.poll_votes USING btree (user_id)

CREATE INDEX polls_chapter_id_idx ON public.polls USING btree (chapter_id)

CREATE INDEX post_likes_user_id_idx ON public.post_likes USING btree (user_id)

CREATE INDEX posts_user_id_idx ON public.posts USING btree (user_id)

CREATE INDEX posts_created_at_idx ON public.posts USING btree (created_at DESC)

CREATE INDEX posts_chapter_id_idx ON public.posts USING btree (chapter_id)

CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree (lower(username))

CREATE UNIQUE INDEX profiles_user_id_unique ON public.profiles USING btree (user_id)

CREATE UNIQUE INDEX profiles_recovery_key_hash_unique ON public.profiles USING btree (recovery_key_hash)

CREATE INDEX reading_list_items_list_id_idx ON public.reading_list_items USING btree (list_id)

CREATE INDEX reading_list_items_story_id_idx ON public.reading_list_items USING btree (story_id)

CREATE INDEX reading_lists_user_id_idx ON public.reading_lists USING btree (user_id)

CREATE INDEX reading_progress_story_id_idx ON public.reading_progress USING btree (story_id)

CREATE INDEX reading_progress_chapter_id_idx ON public.reading_progress USING btree (chapter_id)

CREATE INDEX social_stories_user_id_idx ON public.social_stories USING btree (user_id)

CREATE INDEX social_stories_expires_at_idx ON public.social_stories USING btree (expires_at)

CREATE INDEX social_stories_created_at_idx ON public.social_stories USING btree (created_at DESC)

CREATE INDEX stories_author_id_idx ON public.stories USING btree (author_id)

CREATE INDEX stories_rating_idx ON public.stories USING btree (rating)

CREATE INDEX stories_expires_at_idx ON public.stories USING btree (expires_at)

CREATE INDEX stories_public_updated_idx ON public.stories USING btree (updated_at DESC) WHERE (moderation_hidden_at IS NULL)

CREATE INDEX story_likes_user_id_idx ON public.story_likes USING btree (user_id)

CREATE INDEX story_tags_story_id_idx ON public.story_tags USING btree (story_id)

CREATE INDEX story_tags_tag_id_idx ON public.story_tags USING btree (tag_id)

CREATE UNIQUE INDEX tags_name_lower_idx ON public.tags USING btree (lower(name))

CREATE INDEX tags_category_id_idx ON public.tags USING btree (category_id)

CREATE INDEX tags_slug_idx ON public.tags USING btree (slug)

CREATE INDEX tags_created_by_idx ON public.tags USING btree (created_by)

CREATE UNIQUE INDEX team_memberships_one_active_role_idx ON public.team_memberships USING btree (user_id, role_id) WHERE (status = 'active'::text)

CREATE INDEX team_memberships_user_status_idx ON public.team_memberships USING btree (user_id, status)

CREATE INDEX team_memberships_department_status_idx ON public.team_memberships USING btree (department_id, status)

CREATE INDEX team_memberships_assigned_by_idx ON public.team_memberships USING btree (assigned_by)

CREATE INDEX team_memberships_removed_by_idx ON public.team_memberships USING btree (removed_by)

CREATE INDEX team_memberships_role_id_idx ON public.team_memberships USING btree (role_id)

CREATE INDEX team_role_permissions_permission_code_idx ON public.team_role_permissions USING btree (permission_code)

CREATE INDEX team_roles_department_status_idx ON public.team_roles USING btree (department_id, status)

CREATE INDEX team_roles_created_by_idx ON public.team_roles USING btree (created_by)

CREATE INDEX user_notifications_user_created_idx ON public.user_notifications USING btree (user_id, created_at DESC)

CREATE INDEX user_notifications_unread_idx ON public.user_notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL)

CREATE INDEX user_stickers_user_id_idx ON public.user_stickers USING btree (user_id)

CREATE INDEX user_stickers_last_used_at_idx ON public.user_stickers USING btree (last_used_at)

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chapter_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chapter_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fic_club_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fic_clubs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nook_comment_reactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nook_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nook_post_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nook_post_reactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nook_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nook_saved_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.official_signup_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_list_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_lists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scheduled_chapters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_stories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.story_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_direct_client_access ON public.admin_audit_log AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.applications AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.auth_accounts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.auth_rate_limits AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.auth_sessions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.chapter_likes AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.chapter_media AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Autor pode apagar capítulos" ON public.chapters AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM stories
  WHERE ((stories.id = chapters.story_id) AND (stories.author_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Autor pode criar capítulos" ON public.chapters AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM stories
  WHERE ((stories.id = chapters.story_id) AND (stories.author_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Autor pode editar capítulos" ON public.chapters AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM stories
  WHERE ((stories.id = chapters.story_id) AND (stories.author_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "Capítulos podem ser vistos" ON public.chapters AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Curtidas de comentários podem ser vistas" ON public.comment_likes AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode curtir comentário" ON public.comment_likes AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode remover curtida de comentário" ON public.comment_likes AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Comentários podem ser vistos" ON public.comments AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode apagar próprio comentário" ON public.comments AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode comentar" ON public.comments AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode editar próprio comentário" ON public.comments AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY deny_direct_client_access ON public.departments AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.fic_club_members AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.fic_clubs AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Seguidores podem ser vistos" ON public.follows AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode deixar de seguir" ON public.follows AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = follower_id));

CREATE POLICY "Usuário pode seguir" ON public.follows AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = follower_id));

CREATE POLICY moderation_reports_deny_client_access ON public.moderation_reports AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.nook_comment_reactions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.nook_comments AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.nook_post_media AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.nook_post_reactions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.nook_posts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.nook_saved_posts AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY official_signup_tokens_deny_client_access ON public.official_signup_tokens AS PERMISSIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.opportunities AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.permissions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.platform_admins AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Opções de enquete podem ser vistas" ON public.poll_options AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode remover próprio voto" ON public.poll_votes AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode votar" ON public.poll_votes AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Votos podem ser vistos" ON public.poll_votes AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Enquetes podem ser vistas" ON public.polls AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Curtidas de posts podem ser vistas" ON public.post_likes AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode curtir post" ON public.post_likes AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode remover curtida de post" ON public.post_likes AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Posts podem ser vistos" ON public.posts AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode apagar próprio post" ON public.posts AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode criar post" ON public.posts AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode editar próprio post" ON public.posts AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Perfis podem ser vistos" ON public.profiles AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode criar próprio perfil" ON public.profiles AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "Usuário pode editar próprio perfil" ON public.profiles AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY deny_direct_client_access ON public.reading_list_items AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.reading_lists AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Usuário atualiza próprio progresso" ON public.reading_progress AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário salva próprio progresso" ON public.reading_progress AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário vê próprio progresso" ON public.reading_progress AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY deny_direct_client_access ON public.scheduled_chapters AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.social_stories AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Autor pode apagar história" ON public.stories AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = author_id));

CREATE POLICY "Autor pode editar história" ON public.stories AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = author_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));

CREATE POLICY "Histórias publicadas podem ser vistas" ON public.stories AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode criar histórias" ON public.stories AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));

CREATE POLICY "Curtidas de histórias podem ser vistas" ON public.story_likes AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Usuário pode curtir história" ON public.story_likes AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Usuário pode remover própria curtida" ON public.story_likes AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY deny_direct_client_access ON public.story_tags AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.tag_categories AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.tags AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.team_memberships AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.team_role_permissions AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.team_roles AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.user_notifications AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY deny_direct_client_access ON public.user_stickers AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER admin_audit_log_prevent_change BEFORE DELETE OR UPDATE ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_mutation();

CREATE TRIGGER nook_comments_updated_at BEFORE UPDATE ON nook_comments FOR EACH ROW EXECUTE FUNCTION update_nook_comment_updated_at();

CREATE TRIGGER guard_moderation_visibility BEFORE INSERT OR UPDATE ON nook_posts FOR EACH ROW EXECUTE FUNCTION private.guard_moderation_visibility();

CREATE TRIGGER guard_moderation_visibility BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.guard_moderation_visibility();

CREATE TRIGGER profiles_sync_official_follows_insert AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION sync_official_account_follows();

CREATE TRIGGER profiles_sync_official_follows_update AFTER UPDATE OF is_official ON profiles FOR EACH ROW EXECUTE FUNCTION sync_official_account_follows();

CREATE TRIGGER guard_moderation_visibility BEFORE INSERT OR UPDATE ON stories FOR EACH ROW EXECUTE FUNCTION private.guard_moderation_visibility();

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.applications, public.auth_accounts, public.auth_rate_limits, public.auth_sessions, public.chapter_likes, public.chapter_media, public.chapters, public.comment_likes, public.comments, public.departments, public.fic_club_members, public.fic_clubs, public.follows, public.moderation_reports, public.nook_comment_reactions, public.nook_comments, public.nook_post_media, public.nook_post_reactions, public.nook_posts, public.nook_saved_posts, public.official_signup_tokens, public.opportunities, public.permissions, public.platform_admins, public.poll_options, public.poll_votes, public.polls, public.post_likes, public.posts, public.profiles, public.reading_list_items, public.reading_lists, public.reading_progress, public.scheduled_chapters, public.social_stories, public.stories, public.story_likes, public.story_tags, public.tag_categories, public.tags, public.team_memberships, public.team_role_permissions, public.team_roles, public.user_notifications, public.user_stickers TO service_role;

GRANT INSERT, REFERENCES, SELECT, TRIGGER ON TABLE public.admin_audit_log TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;

GRANT EXECUTE ON FUNCTION public.generate_tag_slug(text) TO PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_story_tags(uuid) TO PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.search_tags(text) TO PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_nook_comment_updated_at() TO PUBLIC, anon, authenticated;

