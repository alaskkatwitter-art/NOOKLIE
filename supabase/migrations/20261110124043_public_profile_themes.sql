CREATE TABLE public.profile_themes (
  user_id uuid PRIMARY KEY REFERENCES public.auth_accounts(id) ON DELETE CASCADE,
  drafts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    CASE WHEN jsonb_typeof(drafts) = 'array' THEN jsonb_array_length(drafts) <= 12 ELSE false END
  ),
  active jsonb CHECK (active IS NULL OR jsonb_typeof(active) = 'object'),
  revision integer NOT NULL CHECK (revision > 0)
);

ALTER TABLE public.profile_themes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_themes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.profile_themes TO service_role;
