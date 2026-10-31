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
$$;
REVOKE ALL ON FUNCTION public.admin_assert_permission(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assert_permission(uuid, text, uuid) TO service_role;
