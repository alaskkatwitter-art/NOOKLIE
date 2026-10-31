ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.official_signup_tokens (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton IS TRUE),
  token_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.official_signup_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.official_signup_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.official_signup_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.sync_official_account_follows()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.sync_official_account_follows() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_official_follows_insert ON public.profiles;
CREATE TRIGGER profiles_sync_official_follows_insert
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_official_account_follows();

DROP TRIGGER IF EXISTS profiles_sync_official_follows_update ON public.profiles;
CREATE TRIGGER profiles_sync_official_follows_update
AFTER UPDATE OF is_official ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_official_account_follows();