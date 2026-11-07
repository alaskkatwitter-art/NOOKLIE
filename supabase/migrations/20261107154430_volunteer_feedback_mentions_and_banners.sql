BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
WHERE id = 'chapter-media';

CREATE FUNCTION public.notify_feed_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE target uuid;
BEGIN
  IF new.body IS NULL OR strpos(new.body, '@') = 0 OR new.moderation_hidden_at IS NOT NULL THEN
    RETURN new;
  END IF;

  FOR target IN
    WITH mentions AS (
      SELECT lower(token[1]) AS username, min(position) AS first_position
      FROM regexp_matches(
        regexp_replace(new.body, 'https?://[^[:space:]<>]+', ' ', 'gi'),
        '(?<![[:alnum:]_@])@([a-zA-Z0-9_]{3,30})(?![[:alnum:]_@])', 'g'
      ) WITH ORDINALITY AS matches(token, position)
      GROUP BY lower(token[1])
      ORDER BY min(position)
      LIMIT 10
    )
    SELECT p.id FROM mentions m
    JOIN public.profiles p ON p.username = m.username
    JOIN public.auth_accounts a ON a.id = p.user_id
    WHERE p.id <> new.user_id AND p.moderation_hidden_at IS NULL AND a.account_status = 'active'
      AND public.profile_content_allowed(new.user_id, p.id)
  LOOP
    PERFORM public.social_notify(target, new.user_id, 'nook_mention', 'mencionou você em um post.',
      '/feed?post=' || new.id, 'nook-mention:' || new.id);
  END LOOP;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_feed_mentions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_feed_mentions() TO service_role;

CREATE TRIGGER notify_feed_mentions AFTER INSERT ON public.nook_posts
FOR EACH ROW EXECUTE FUNCTION public.notify_feed_mentions();

CREATE OR REPLACE FUNCTION public.notify_released_chapter(p_chapter uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE author uuid;
DECLARE title text;
DECLARE work uuid;
BEGIN
  SELECT s.author_id, s.title, s.id INTO author, title, work FROM public.released_stories s
  JOIN public.chapters c ON c.story_id = s.id WHERE c.id = p_chapter AND c.published;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.user_notifications(user_id,notification_type,title,body,href,source_key)
  SELECT p.user_id, 'chapter_release', 'Capítulo publicado', 'Seu capítulo de ' || title || ' está no ar.',
    '/capitulo-publicado/' || p_chapter, 'chapter-published:' || p_chapter
  FROM public.profiles p WHERE p.id = author
  ON CONFLICT(user_id,source_key) DO NOTHING;
  INSERT INTO public.user_notifications(user_id,notification_type,title,body,href,source_key)
  SELECT p.user_id, 'chapter_release', 'Novo capítulo disponível', 'Há um novo capítulo de ' || title || '.',
    '/historia/' || work, 'chapter-release:' || p_chapter
  FROM public.profiles p
  WHERE p.id <> author AND p.chapter_notifications AND public.profile_content_allowed(author,p.id)
    AND (EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id=p.id AND f.following_id=author)
      OR EXISTS (SELECT 1 FROM public.reading_lists l JOIN public.reading_list_items i ON i.list_id=l.id WHERE l.user_id=p.id AND i.story_id=(SELECT story_id FROM public.chapters WHERE id = p_chapter)))
  ON CONFLICT(user_id,source_key) DO NOTHING;
END $$;

UPDATE public.user_notifications n
SET href = '/historia/' || c.story_id
FROM public.chapters c
WHERE n.notification_type = 'chapter_release'
  AND n.source_key LIKE 'chapter-release:%'
  AND n.href = '/capitulo/' || c.id;

COMMIT;
