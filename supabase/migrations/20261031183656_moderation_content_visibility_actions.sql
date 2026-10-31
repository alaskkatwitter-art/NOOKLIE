ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS moderation_hidden_at timestamptz;
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS moderation_hidden_at timestamptz;
ALTER TABLE public.nook_posts
  ADD COLUMN IF NOT EXISTS moderation_hidden_at timestamptz;

CREATE INDEX IF NOT EXISTS stories_public_updated_idx
  ON public.stories (updated_at DESC)
  WHERE moderation_hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS nook_posts_public_created_idx
  ON public.nook_posts (created_at DESC)
  WHERE moderation_hidden_at IS NULL;

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
  WHERE s.moderation_hidden_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.chapters AS published_chapter
    WHERE published_chapter.story_id = s.id AND published_chapter.published = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS author_profile
    LEFT JOIN public.auth_accounts AS account ON account.id = author_profile.user_id
    WHERE author_profile.id = s.author_id
      AND (author_profile.moderation_hidden_at IS NOT NULL OR account.account_status = 'suspended')
  )
  AND (
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

DROP FUNCTION IF EXISTS public.admin_review_moderation_report(text, uuid, text, text);

CREATE FUNCTION public.admin_review_moderation_report(
  p_session_token_hash text,
  p_report_id uuid,
  p_status text,
  p_internal_notes text DEFAULT '',
  p_content_action text DEFAULT 'none'
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid;
  v_department uuid;
  v_reporter uuid;
  v_content_type text;
  v_content_id uuid;
  v_rows integer;
BEGIN
  v_actor := public.admin_current_actor(p_session_token_hash);
  IF p_status NOT IN ('in_review', 'resolved', 'dismissed')
     OR char_length(coalesce(p_internal_notes, '')) > 8000
     OR p_content_action NOT IN ('none', 'hide', 'restore')
     OR (p_status = 'in_review' AND p_content_action <> 'none') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Moderation decision is invalid';
  END IF;

  SELECT report.department_id, report.reporter_id, report.content_type, report.content_id
    INTO v_department, v_reporter, v_content_type, v_content_id
  FROM public.moderation_reports AS report
  WHERE report.id = p_report_id
    AND report.status IN ('pending', 'in_review')
  FOR UPDATE;
  IF v_department IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Open moderation report not found';
  END IF;

  PERFORM public.admin_assert_permission(v_actor, 'moderation.manage', v_department);

  IF p_content_action = 'hide' THEN
    IF v_content_type = 'profile' THEN
      UPDATE public.profiles SET moderation_hidden_at = coalesce(moderation_hidden_at, now()) WHERE id = v_content_id;
    ELSIF v_content_type = 'story' THEN
      UPDATE public.stories SET moderation_hidden_at = coalesce(moderation_hidden_at, now()) WHERE id = v_content_id;
    ELSIF v_content_type = 'post' THEN
      UPDATE public.nook_posts SET moderation_hidden_at = coalesce(moderation_hidden_at, now()) WHERE id = v_content_id;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Reported content not found'; END IF;
  ELSIF p_content_action = 'restore' THEN
    IF v_content_type = 'profile' THEN
      UPDATE public.profiles SET moderation_hidden_at = NULL WHERE id = v_content_id;
    ELSIF v_content_type = 'story' THEN
      UPDATE public.stories SET moderation_hidden_at = NULL WHERE id = v_content_id;
    ELSIF v_content_type = 'post' THEN
      UPDATE public.nook_posts SET moderation_hidden_at = NULL WHERE id = v_content_id;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Reported content not found'; END IF;
  END IF;

  UPDATE public.moderation_reports
  SET status = p_status,
      internal_notes = btrim(coalesce(p_internal_notes, '')),
      reviewer_id = v_actor,
      reviewed_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_report_id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  VALUES (
    v_actor,
    'moderation.report.' || p_status,
    'moderation_report',
    p_report_id,
    jsonb_build_object(
      'reporter_id', v_reporter,
      'department_id', v_department,
      'content_type', v_content_type,
      'content_id', v_content_id,
      'content_action', p_content_action
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_moderation_report(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_moderation_report(text, uuid, text, text, text) TO service_role;