DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_accounts
    WHERE id = 'be272a49-1f7b-49ca-998f-d265029f4b34'
      AND username = 'astriddy'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.auth_accounts
    WHERE id = '5685e19f-3d1e-4551-918d-036f7fa78aee'
      AND username = 'nooklie'
  ) THEN
    RAISE EXCEPTION 'Verified Nooklie principal account identities are unavailable';
  END IF;
END;
$$;

INSERT INTO public.platform_admins (user_id)
VALUES
  ('be272a49-1f7b-49ca-998f-d265029f4b34'),
  ('5685e19f-3d1e-4551-918d-036f7fa78aee')
ON CONFLICT (user_id) DO NOTHING;
