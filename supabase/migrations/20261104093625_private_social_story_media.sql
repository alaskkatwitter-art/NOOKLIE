-- Story images are served through the application after visibility checks.
UPDATE storage.buckets
SET public = false
WHERE id = 'social-stories';

DROP POLICY IF EXISTS nooklie_private_content_server_only ON storage.objects;
CREATE POLICY nooklie_private_content_server_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id NOT IN ('story-covers', 'stories', 'nook-media', 'chapter-media', 'private-chat', 'social-stories'))
  WITH CHECK (bucket_id NOT IN ('story-covers', 'stories', 'nook-media', 'chapter-media', 'private-chat', 'social-stories'));

-- The application queries these tables through its server role.
DO $$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.generate_tag_slug(text)', 'public.get_story_tags(uuid)',
    'public.search_tags(text)', 'public.update_nook_comment_updated_at()'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
    END IF;
  END LOOP;
END $$;
