CREATE POLICY moderation_reports_deny_client_access
ON public.moderation_reports
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY official_signup_tokens_deny_client_access
ON public.official_signup_tokens
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_user_id_idx
  ON public.admin_audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS departments_created_by_idx
  ON public.departments (created_by);
CREATE INDEX IF NOT EXISTS moderation_reports_reviewer_id_idx
  ON public.moderation_reports (reviewer_id);
CREATE INDEX IF NOT EXISTS opportunities_created_by_idx
  ON public.opportunities (created_by);
CREATE INDEX IF NOT EXISTS opportunities_updated_by_idx
  ON public.opportunities (updated_by);
CREATE INDEX IF NOT EXISTS team_memberships_assigned_by_idx
  ON public.team_memberships (assigned_by);
CREATE INDEX IF NOT EXISTS team_memberships_removed_by_idx
  ON public.team_memberships (removed_by);
CREATE INDEX IF NOT EXISTS team_memberships_role_id_idx
  ON public.team_memberships (role_id);
CREATE INDEX IF NOT EXISTS team_role_permissions_permission_code_idx
  ON public.team_role_permissions (permission_code);
CREATE INDEX IF NOT EXISTS team_roles_created_by_idx
  ON public.team_roles (created_by);
