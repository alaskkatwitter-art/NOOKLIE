ALTER TABLE public.auth_accounts
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.auth_accounts'::regclass
      AND conname = 'auth_accounts_account_status_check'
  ) THEN
    ALTER TABLE public.auth_accounts
      ADD CONSTRAINT auth_accounts_account_status_check
      CHECK (account_status IN ('active', 'suspended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS auth_accounts_account_status_idx
  ON public.auth_accounts (account_status);

CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_session_token_hash text,
  p_target_user_id uuid,
  p_status text,
  p_reason text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.admin_set_account_status(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(text, uuid, text, text) TO service_role;