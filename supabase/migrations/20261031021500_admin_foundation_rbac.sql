-- Secure administrative identity and team/RBAC foundation.
-- Existing authentication remains in auth_accounts/auth_sessions.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES public.auth_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT 'department'
    CHECK (scope IN ('platform', 'department')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.team_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  badge_title text,
  badge_description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (department_id, name)
);

CREATE TABLE IF NOT EXISTS public.team_role_permissions (
  role_id uuid NOT NULL REFERENCES public.team_roles(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS public.team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth_accounts(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES public.team_roles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed')),
  assigned_by uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  removed_at timestamptz,
  removal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'active' AND removed_at IS NULL)
    OR (status = 'removed' AND removed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS team_memberships_one_active_role_idx
  ON public.team_memberships (user_id, role_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS team_memberships_user_status_idx
  ON public.team_memberships (user_id, status);

CREATE INDEX IF NOT EXISTS team_memberships_department_status_idx
  ON public.team_memberships (department_id, status);

CREATE INDEX IF NOT EXISTS team_roles_department_status_idx
  ON public.team_roles (department_id, status);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.auth_accounts(id) ON DELETE SET NULL,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_subject_idx
  ON public.admin_audit_log (subject_type, subject_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Administrative audit records are append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_admin_audit_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_audit_log_prevent_change ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_prevent_change
BEFORE UPDATE OR DELETE ON public.admin_audit_log
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_audit_mutation();

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth_accounts(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  href text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON public.user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

INSERT INTO public.permissions (code, name, description, scope)
VALUES
  ('admin.view', 'Acessar painel', 'Acessar a área administrativa e sua visão geral.', 'department'),
  ('users.view', 'Ver usuários', 'Consultar dados básicos de usuários para tarefas autorizadas.', 'platform'),
  ('users.manage', 'Gerenciar usuários', 'Aplicar ações administrativas de conta autorizadas.', 'platform'),
  ('departments.manage', 'Gerenciar departamentos', 'Criar, editar, arquivar e reativar departamentos.', 'platform'),
  ('roles.manage', 'Gerenciar cargos', 'Criar, editar e arquivar cargos da equipe.', 'platform'),
  ('permissions.manage', 'Gerenciar permissões', 'Associar permissões disponíveis a cargos.', 'platform'),
  ('members.view', 'Ver integrantes', 'Consultar integrantes e o histórico de equipe autorizado.', 'department'),
  ('members.manage', 'Gerenciar integrantes', 'Nomear e remover integrantes dentro do escopo permitido.', 'department'),
  ('opportunities.view', 'Ver oportunidades', 'Consultar processos seletivos e candidaturas autorizadas.', 'department'),
  ('opportunities.manage', 'Gerenciar oportunidades', 'Criar, publicar, encerrar e arquivar vagas.', 'department'),
  ('applications.view', 'Ver candidaturas', 'Consultar candidaturas dentro do escopo permitido.', 'department'),
  ('applications.review', 'Analisar candidaturas', 'Avaliar candidaturas e registrar decisões internas.', 'department'),
  ('moderation.view', 'Ver moderação', 'Consultar itens de moderação autorizados.', 'department'),
  ('moderation.manage', 'Gerenciar moderação', 'Tomar ações de moderação dentro do escopo permitido.', 'department'),
  ('badges.manage', 'Gerenciar selos', 'Gerenciar identificações oficiais vinculadas a cargos.', 'platform'),
  ('audit.view', 'Ver histórico administrativo', 'Consultar o histórico administrativo.', 'platform')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope;

INSERT INTO public.departments (name, slug, description, sort_order)
VALUES
  ('Moderação', 'moderacao', 'Segurança e cuidado com a comunidade.', 10),
  ('Jornal Nooklie', 'jornal-nooklie', 'Notícias e publicações do Nooklie.', 20),
  ('Equipe Editorial', 'equipe-editorial', 'Apoio e revisão editorial.', 30),
  ('Eventos', 'eventos', 'Eventos e atividades da comunidade.', 40),
  ('Design', 'design', 'Identidade visual e materiais da comunidade.', 50),
  ('Comunidade', 'comunidade', 'Acolhimento e participação da comunidade.', 60),
  ('Clube de Leitura', 'clube-de-leitura', 'Atividades do clube de leitura.', 70)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'platform_admins',
    'permissions',
    'departments',
    'team_roles',
    'team_role_permissions',
    'team_memberships',
    'admin_audit_log',
    'user_notifications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format(
      'CREATE POLICY deny_direct_client_access ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      table_name
    );
  END LOOP;
END;
$$;

-- Server routes use the secret key only after validating the user's cookie session and permissions.
GRANT SELECT ON TABLE public.platform_admins TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.permissions TO service_role;
GRANT ALL ON TABLE public.departments TO service_role;
GRANT ALL ON TABLE public.team_roles TO service_role;
GRANT ALL ON TABLE public.team_role_permissions TO service_role;
GRANT ALL ON TABLE public.team_memberships TO service_role;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role;
REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.admin_audit_log FROM service_role;
GRANT ALL ON TABLE public.user_notifications TO service_role;
