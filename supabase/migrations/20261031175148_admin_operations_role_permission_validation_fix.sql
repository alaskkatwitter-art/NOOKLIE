CREATE OR REPLACE FUNCTION public.admin_current_actor(p_session_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_assert_permission(
  p_actor uuid,
  p_permission_code text,
  p_department_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_create_department(
  p_session_token_hash text,
  p_name text,
  p_slug text,
  p_description text,
  p_sort_order integer
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
$$;

CREATE OR REPLACE FUNCTION public.admin_update_department(
  p_session_token_hash text,
  p_department_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_sort_order integer,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_create_team_role(
  p_session_token_hash text,
  p_department_id uuid,
  p_name text,
  p_description text,
  p_badge_title text,
  p_badge_description text,
  p_permission_codes text[]
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_update_team_role(
  p_session_token_hash text,
  p_role_id uuid,
  p_name text,
  p_description text,
  p_badge_title text,
  p_badge_description text,
  p_status text,
  p_permission_codes text[]
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_team_member(
  p_session_token_hash text,
  p_target_user_id uuid,
  p_role_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_team_member(
  p_session_token_hash text,
  p_membership_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.admin_current_actor(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_assert_permission(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_department(text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_department(text, uuid, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_team_role(text, uuid, text, text, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_team_role(text, uuid, text, text, text, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_assign_team_member(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_remove_team_member(text, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_current_actor(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_assert_permission(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_department(text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_department(text, uuid, text, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_team_role(text, uuid, text, text, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_team_role(text, uuid, text, text, text, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_assign_team_member(text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_team_member(text, uuid, text) TO service_role;