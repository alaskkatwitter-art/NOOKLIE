ALTER TABLE public.profiles ADD COLUMN spotify_link jsonb;
ALTER TABLE public.stories ADD COLUMN spotify_link jsonb;
ALTER TABLE public.chapters ADD COLUMN spotify_link jsonb;

CREATE OR REPLACE FUNCTION public.save_story_details(p_story uuid, p_author uuid, p_changes jsonb, p_tags uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE existing public.stories;
DECLARE changes public.stories;
BEGIN
  SELECT * INTO existing FROM public.stories WHERE id = p_story AND author_id = p_author FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO changes FROM jsonb_populate_record(existing, p_changes);
  UPDATE public.stories SET
    title = changes.title,
    spotify_link = changes.spotify_link,
    description = changes.description,
    cover_url = changes.cover_url,
    status = changes.status,
    rating = changes.rating,
    fandom = changes.fandom,
    story_kind = changes.story_kind,
    story_format = changes.story_format,
    series_name = changes.series_name,
    series_volume = changes.series_volume,
    work_has_ai = changes.work_has_ai,
    cover_has_ai = changes.cover_has_ai,
    has_content_warnings = changes.has_content_warnings,
    content_warnings = changes.content_warnings,
    accepts_translation = changes.accepts_translation,
    updated_at = now()
  WHERE id = p_story RETURNING * INTO changes;
  IF p_tags IS NOT NULL THEN
    DELETE FROM public.story_tags WHERE story_id = p_story AND NOT (tag_id = ANY(p_tags));
    INSERT INTO public.story_tags(story_id, tag_id)
    SELECT p_story, tag FROM unnest(p_tags) AS tag ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('id', changes.id, 'author_id', changes.author_id, 'title', changes.title,
    'description', changes.description, 'spotify_link', changes.spotify_link, 'cover_url', changes.cover_url, 'status', changes.status,
    'rating', changes.rating, 'fandom', changes.fandom, 'story_kind', changes.story_kind,
    'story_format', changes.story_format, 'series_name', changes.series_name, 'series_volume', changes.series_volume,
    'work_has_ai', changes.work_has_ai, 'cover_has_ai', changes.cover_has_ai,
    'has_content_warnings', changes.has_content_warnings, 'content_warnings', changes.content_warnings,
    'accepts_translation', changes.accepts_translation, 'created_at', changes.created_at, 'updated_at', changes.updated_at,
    'tags', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug) ORDER BY t.name), '[]'::jsonb)
      FROM public.story_tags st JOIN public.tags t ON t.id = st.tag_id WHERE st.story_id = p_story));
END $$;
