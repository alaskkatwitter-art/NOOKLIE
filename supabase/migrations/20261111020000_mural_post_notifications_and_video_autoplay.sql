BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN video_autoplay boolean NOT NULL DEFAULT true;

ALTER TABLE public.nook_posts
  ADD COLUMN publication_origin text NOT NULL DEFAULT 'feed'
  CHECK (publication_origin IN ('feed', 'mural'));

CREATE FUNCTION public.create_feed_media_post(
  p_profile uuid, p_text text, p_story uuid, p_news text, p_media jsonb, p_origin text
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE post uuid;
BEGIN
  IF jsonb_array_length(p_media) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid media count';
  END IF;
  INSERT INTO public.nook_posts(user_id, body, story_id, news_slug, pinned, publication_origin)
  VALUES (p_profile, p_text, p_story, p_news, false, p_origin) RETURNING id INTO post;
  INSERT INTO public.nook_post_media(post_id, media_url, media_type, position)
  SELECT post, item->>'media_url', item->>'media_type', position::integer
  FROM jsonb_array_elements(p_media) WITH ORDINALITY AS files(item, position);
  RETURN post;
END;
$$;

REVOKE ALL ON FUNCTION public.create_feed_media_post(uuid, text, uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_feed_media_post(uuid, text, uuid, text, jsonb, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_feed_media_post(
  p_profile uuid, p_text text, p_story uuid, p_news text, p_media jsonb
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT public.create_feed_media_post(p_profile, p_text, p_story, p_news, p_media, 'feed');
$$;

CREATE FUNCTION public.notify_mural_followers()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO public.user_notifications(user_id, notification_type, title, body, href, source_key, actor_id)
  SELECT recipient.user_id, 'nook_mural_post',
    coalesce(author.display_name, author.username) || ' publicou no mural.',
    '', '/feed?post=' || new.id, 'nook-mention:' || new.id, new.user_id
  FROM public.follows AS follow
  JOIN public.profiles AS recipient ON recipient.id = follow.follower_id
  JOIN public.auth_accounts AS account ON account.id = recipient.user_id
  JOIN public.profiles AS author ON author.id = follow.following_id
  WHERE follow.following_id = new.user_id
    AND recipient.id <> new.user_id
    AND recipient.social_notifications
    AND recipient.moderation_hidden_at IS NULL
    AND account.account_status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_mutes AS mute
      WHERE mute.user_id = recipient.id AND mute.target_id = new.user_id
    )
    AND public.profile_content_allowed(new.user_id, recipient.id)
  ON CONFLICT (user_id, source_key) DO NOTHING;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_mural_followers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_mural_followers() TO service_role;

-- Run before notify_feed_mentions; a mentioned follower gets just one notification.
CREATE TRIGGER notify_author_mural_post
AFTER INSERT ON public.nook_posts
FOR EACH ROW WHEN (NEW.publication_origin = 'mural' AND NEW.moderation_hidden_at IS NULL)
EXECUTE FUNCTION public.notify_mural_followers();

COMMIT;
