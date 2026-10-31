CREATE OR REPLACE FUNCTION private.guard_moderation_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') AND (
    (TG_OP = 'INSERT' AND NEW.moderation_hidden_at IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.moderation_hidden_at IS DISTINCT FROM OLD.moderation_hidden_at)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Moderation visibility is managed by authorized server actions';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_moderation_visibility() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_moderation_visibility() TO service_role;
