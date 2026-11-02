-- Efficient server-side discovery using all included tags and excluding any excluded tag.
CREATE OR REPLACE FUNCTION public.search_public_stories(
  p_query text DEFAULT NULL,
  p_include_slugs text[] DEFAULT '{}'::text[],
  p_exclude_slugs text[] DEFAULT '{}'::text[],
  p_rating text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_sort text DEFAULT 'updated',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  title text,
  description text,
  cover_url text,
  status text,
  rating text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT s.id, s.author_id, s.title, s.description, s.cover_url, s.status, s.rating, s.created_at, s.updated_at
  FROM public.stories AS s
  WHERE (
    p_query IS NULL OR btrim(p_query) = ''
    OR position(lower(btrim(p_query)) IN lower(coalesce(s.title, ''))) > 0
    OR position(lower(btrim(p_query)) IN lower(coalesce(s.description, ''))) > 0
  )
  AND (p_rating IS NULL OR s.rating = p_rating)
  AND (p_status IS NULL OR s.status = p_status)
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_include_slugs, '{}'::text[])) AS required(slug)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.story_tags AS st
      JOIN public.tags AS t ON t.id = st.tag_id
      WHERE st.story_id = s.id AND t.slug = required.slug
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_exclude_slugs, '{}'::text[])) AS excluded(slug)
    WHERE EXISTS (
      SELECT 1
      FROM public.story_tags AS st
      JOIN public.tags AS t ON t.id = st.tag_id
      WHERE st.story_id = s.id AND t.slug = excluded.slug
    )
  )
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN s.created_at END DESC,
    CASE WHEN p_sort = 'title_asc' THEN s.title END ASC,
    CASE WHEN p_sort = 'title_desc' THEN s.title END DESC,
    s.updated_at DESC,
    s.id
  LIMIT least(greatest(coalesce(p_limit, 24), 1), 48)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;

REVOKE ALL ON FUNCTION public.search_public_stories(text, text[], text[], text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_stories(text, text[], text[], text, text, text, integer, integer) TO service_role;
