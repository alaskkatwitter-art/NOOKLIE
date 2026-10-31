
BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.generate_tag_slug(text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.search_tags(text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_story_tags(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_nook_comment_updated_at()
  SET search_path = public, pg_temp;

COMMIT;
