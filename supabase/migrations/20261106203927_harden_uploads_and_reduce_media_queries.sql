-- Uploads are performed by authenticated application routes with service_role.
-- A restrictive policy is an additional guard, never a grant of public access.
DROP POLICY IF EXISTS nooklie_private_content_server_only ON storage.objects;
CREATE POLICY nooklie_private_content_server_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Public avatars/covers/stickers keep their public read URLs. Social Stories
-- must go through the application, which checks followers and expiration.
UPDATE storage.buckets SET public = false WHERE id = 'social-stories';
UPDATE storage.buckets b SET file_size_limit = limits.max_bytes,
  allowed_mime_types = limits.mime_types
FROM (VALUES
  ('avatars', 5242880::bigint, ARRAY['image/jpeg','image/png','image/webp']),
  ('profile-covers', 8388608::bigint, ARRAY['image/jpeg','image/png','image/webp']),
  ('stickers', 10485760::bigint, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('social-stories', 5242880::bigint, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('story-covers', 10485760::bigint, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('nook-media', 10485760::bigint, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('stories', 10485760::bigint, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('chapter-media', 5242880::bigint, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('private-chat', 4194304::bigint, ARRAY['application/octet-stream'])
) AS limits(id, max_bytes, mime_types) WHERE b.id = limits.id;

CREATE INDEX IF NOT EXISTS profiles_pinned_story_id_idx ON public.profiles(pinned_story_id);
CREATE INDEX IF NOT EXISTS stories_cover_url_idx ON public.stories(cover_url) WHERE cover_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS chapter_media_url_idx ON public.chapter_media(media_url);
CREATE INDEX IF NOT EXISTS nook_post_media_url_idx ON public.nook_post_media(media_url);
CREATE INDEX IF NOT EXISTS nook_posts_image_url_idx ON public.nook_posts(image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_stories_media_url_idx ON public.social_stories(media_url);
CREATE INDEX IF NOT EXISTS chapters_banner_url_idx ON public.chapters(banner_url) WHERE banner_url IS NOT NULL;

-- Validate the session and media visibility inside ONE database request. This
-- replaces per-image HTTP round trips for session/account/profile/block checks.
-- No shared cache of private media or authorization decisions is introduced.
CREATE OR REPLACE FUNCTION public.content_media_allowed(p_session text, p_bucket text, p_urls text[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE viewer uuid;
BEGIN
  IF p_bucket NOT IN ('story-covers','stories','nook-media','chapter-media','social-stories')
     OR coalesce(cardinality(p_urls), 0) NOT BETWEEN 1 AND 2 THEN RETURN false; END IF;
  viewer := public.social_actor(p_session);
  IF p_bucket = 'social-stories' AND viewer IS NULL THEN RETURN false; END IF;

  IF p_bucket IN ('story-covers','stories') AND EXISTS (
    SELECT 1 FROM public.stories s WHERE s.cover_url = ANY(p_urls)
      AND (s.author_id = viewer OR (s.moderation_hidden_at IS NULL
        AND public.profile_content_allowed(s.author_id, viewer)))
  ) THEN RETURN true; END IF;

  IF p_bucket IN ('chapter-media','stories') AND EXISTS (
    SELECT 1 FROM public.chapter_media m JOIN public.chapters c ON c.id = m.chapter_id
      JOIN public.stories s ON s.id = c.story_id
    WHERE m.media_url = ANY(p_urls) AND (s.author_id = viewer OR
      (c.published AND s.moderation_hidden_at IS NULL AND public.profile_content_allowed(s.author_id, viewer)))
  ) THEN RETURN true; END IF;

  IF p_bucket = 'chapter-media' AND EXISTS (
    SELECT 1 FROM public.chapters c JOIN public.stories s ON s.id = c.story_id
    WHERE c.banner_url = ANY(p_urls) AND (s.author_id = viewer OR
      (c.published AND s.moderation_hidden_at IS NULL AND public.profile_content_allowed(s.author_id, viewer)))
  ) THEN RETURN true; END IF;

  IF p_bucket IN ('nook-media','stories') AND EXISTS (
    SELECT 1 FROM public.nook_posts p LEFT JOIN public.nook_post_media m ON m.post_id = p.id
    WHERE (p.image_url = ANY(p_urls) OR m.media_url = ANY(p_urls))
      AND p.moderation_hidden_at IS NULL AND public.profile_content_allowed(p.user_id, viewer)
  ) THEN RETURN true; END IF;

  IF p_bucket IN ('social-stories','stories') AND viewer IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.social_stories s WHERE s.media_url = ANY(p_urls) AND s.expires_at > now()
      AND (s.user_id = viewer OR EXISTS (SELECT 1 FROM public.follows f
        WHERE f.follower_id = viewer AND f.following_id = s.user_id))
      AND public.profile_content_allowed(s.user_id, viewer)
  ) THEN RETURN true; END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.content_media_allowed(text,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_media_allowed(text,text,text[]) TO service_role;
