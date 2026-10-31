-- Synthetic CI accounts only. Password values are intentionally unusable and no production rows are copied.
BEGIN;

INSERT INTO public.auth_accounts (id, username, password_hash, recovery_key_hash)
VALUES
  ('90000000-0000-4000-8000-000000000001', 'astriddy', 'ci-invalid-password-hash', 'ci-recovery-astriddy'),
  ('90000000-0000-4000-8000-000000000002', 'nooklie', 'ci-invalid-password-hash', 'ci-recovery-nooklie'),
  ('90000000-0000-4000-8000-000000000003', 'ci_target', 'ci-invalid-password-hash', 'ci-recovery-target'),
  ('90000000-0000-4000-8000-000000000004', 'ci_coauthor', 'ci-invalid-password-hash', 'ci-recovery-coauthor');

-- Add the official profile first so the auto-follow trigger has a target.
INSERT INTO public.profiles (id, username, display_name, user_id, verified, is_official)
VALUES ('90000000-0000-4000-8000-000000000002', 'nooklie', 'Nooklie', '90000000-0000-4000-8000-000000000002', true, true);

INSERT INTO public.profiles (id, username, display_name, user_id)
VALUES
  ('90000000-0000-4000-8000-000000000001', 'astriddy', 'Astriddy', '90000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000003', 'ci_target', 'CI Target', '90000000-0000-4000-8000-000000000003'),
  ('90000000-0000-4000-8000-000000000004', 'ci_coauthor', 'CI Coauthor', '90000000-0000-4000-8000-000000000004');

INSERT INTO public.platform_admins (user_id)
VALUES
  ('90000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002');

INSERT INTO public.permissions (code, name, description, scope)
VALUES
  ('admin.view', 'Admin view', '', 'department'),
  ('applications.review', 'Review applications', '', 'department'),
  ('applications.view', 'View applications', '', 'department'),
  ('audit.view', 'View audit history', '', 'platform'),
  ('badges.manage', 'Manage badges', '', 'platform'),
  ('departments.manage', 'Manage departments', '', 'platform'),
  ('members.manage', 'Manage members', '', 'department'),
  ('members.view', 'View members', '', 'department'),
  ('moderation.manage', 'Manage moderation', '', 'department'),
  ('moderation.view', 'View moderation', '', 'department'),
  ('opportunities.manage', 'Manage opportunities', '', 'department'),
  ('opportunities.view', 'View opportunities', '', 'department'),
  ('permissions.manage', 'Manage permissions', '', 'platform'),
  ('roles.manage', 'Manage roles', '', 'platform'),
  ('users.manage', 'Manage users', '', 'platform'),
  ('users.view', 'View users', '', 'platform');

INSERT INTO public.departments (id, name, slug, description, sort_order, status, created_by)
VALUES ('90000000-0000-4000-8000-000000000010', 'Departamento de teste', 'ci-department', 'Fixture de CI sem dados reais', 0, 'active', '90000000-0000-4000-8000-000000000001');

COMMIT;
