-- Release state is separate from the author's editorial status (e.g. completed).
ALTER TABLE public.stories ADD COLUMN release_at timestamptz;
COMMENT ON COLUMN public.stories.release_at IS 'NULL releases with the first published chapter. Infinity explicitly takes the story offline. A finite value gates release until that instant.';

CREATE VIEW public.released_stories WITH (security_invoker = true) AS
SELECT s.* FROM public.stories s
WHERE s.moderation_hidden_at IS NULL
  AND (s.release_at IS NULL OR s.release_at <= now())
  AND EXISTS (SELECT 1 FROM public.chapters c WHERE c.story_id = s.id AND c.published);
REVOKE ALL ON public.released_stories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.released_stories TO service_role;

CREATE FUNCTION public.save_reading_list(p_owner uuid, p_list uuid, p_story uuid, p_name text, p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE list uuid;
BEGIN
  IF p_story IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.released_stories s WHERE s.id = p_story AND public.profile_content_allowed(s.author_id, p_owner)
  ) THEN RETURN NULL; END IF;
  IF p_list IS NULL THEN
    IF p_name = 'Biblioteca' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
      SELECT id INTO list FROM public.reading_lists
      WHERE user_id = p_owner AND name = 'Biblioteca' ORDER BY created_at, id LIMIT 1;
    END IF;
    IF list IS NULL THEN
      INSERT INTO public.reading_lists(user_id, name, description, is_public)
      VALUES (p_owner, p_name, p_description, false) RETURNING id INTO list;
    END IF;
  ELSE
    SELECT id INTO list FROM public.reading_lists WHERE id = p_list AND user_id = p_owner AND name <> 'Biblioteca' FOR UPDATE;
    IF list IS NULL THEN RETURN NULL; END IF;
  END IF;
  IF p_story IS NOT NULL THEN
    INSERT INTO public.reading_list_items(list_id, story_id) VALUES (list, p_story)
    ON CONFLICT (list_id, story_id) DO NOTHING;
  END IF;
  RETURN list;
END $$;
REVOKE ALL ON FUNCTION public.save_reading_list(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_reading_list(uuid, uuid, uuid, text, text) TO service_role;

CREATE FUNCTION public.save_story_details(p_story uuid, p_author uuid, p_changes jsonb, p_tags uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE existing public.stories;
DECLARE changes public.stories;
BEGIN
  SELECT * INTO existing FROM public.stories WHERE id = p_story AND author_id = p_author FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO changes FROM jsonb_populate_record(existing, p_changes);
  UPDATE public.stories SET
    title = changes.title,
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
    'description', changes.description, 'cover_url', changes.cover_url, 'status', changes.status,
    'rating', changes.rating, 'fandom', changes.fandom, 'story_kind', changes.story_kind,
    'story_format', changes.story_format, 'series_name', changes.series_name, 'series_volume', changes.series_volume,
    'work_has_ai', changes.work_has_ai, 'cover_has_ai', changes.cover_has_ai,
    'has_content_warnings', changes.has_content_warnings, 'content_warnings', changes.content_warnings,
    'accepts_translation', changes.accepts_translation, 'created_at', changes.created_at, 'updated_at', changes.updated_at,
    'tags', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug) ORDER BY t.name), '[]'::jsonb)
      FROM public.story_tags st JOIN public.tags t ON t.id = st.tag_id WHERE st.story_id = p_story));
END $$;
REVOKE ALL ON FUNCTION public.save_story_details(uuid, uuid, jsonb, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_story_details(uuid, uuid, jsonb, uuid[]) TO service_role;

-- Use the same release gate in discovery, activity tracking and private media.
CREATE OR REPLACE FUNCTION public.discovery_home(p_account uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
with favorites as (
 select coalesce((select favorite_fandoms from public.discovery_preferences where user_id=p_account),'{}'::text[]) names
), reader as (select id from public.profiles where user_id=p_account),
metrics as (
 select story_id, count(*) filter(where viewed) views, count(*) filter(where read) reads,
 count(*) filter(where activity_day>=(now() at time zone 'America/Sao_Paulo')::date-6 and viewed) week_views,
 count(*) filter(where activity_day>=(now() at time zone 'America/Sao_Paulo')::date-6 and read) week_reads
 from public.story_daily_engagement group by story_id
), eligible as materialized (
 select s.id,s.author_id,s.title,left(s.description,240) description,s.cover_url,s.fandom,s.rating,s.work_has_ai,s.cover_has_ai,s.has_content_warnings,s.content_warnings,
 s.created_at,s.updated_at,p.username,p.display_name,pc.first_published_at,
 public.discovery_story_fandoms(s.id,s.fandom) fandom_keys,
 coalesce((select array_agg(t.slug) from public.story_tags st join public.tags t on t.id=st.tag_id join public.tag_categories tc on tc.id=t.category_id where st.story_id=s.id and tc.slug='genre'),'{}'::text[]) genres,
 coalesce(m.views,0) views,coalesce(m.reads,0) reads,coalesce(m.week_views,0) week_views,coalesce(m.week_reads,0) week_reads
 from public.released_stories s join public.profiles p on p.id=s.author_id
 left join public.auth_accounts a on a.id=p.user_id
 join lateral(select min(coalesce(c.original_published_at,c.created_at)) first_published_at from public.chapters c where c.story_id=s.id and c.published=true) pc on pc.first_published_at is not null
 left join metrics m on m.story_id=s.id
 where public.profile_content_allowed(s.author_id,(select id from reader limit 1)) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
), candidates as materialized (
 select e.*,to_jsonb(e)-'genres'-'fandom_keys' card from eligible e cross join favorites f
 where cardinality(f.names)=0 or e.fandom_keys && array(select public.discovery_key(n) from unnest(f.names) n)
), genre_affinity as (
 select t.slug,count(*) weight from public.reading_progress rp join reader r on r.id=rp.user_id
 join public.story_tags st on st.story_id=rp.story_id join public.tags t on t.id=st.tag_id
 join public.tag_categories tc on tc.id=t.category_id where tc.slug='genre' group by t.slug order by weight desc,t.slug limit 5
), continue_reading as (
 select e.id,e.title,e.cover_url,c.id chapter_id,c.title chapter_title,c.chapter_number,rp.progress_percent,rp.position,rp.updated_at
 from public.reading_progress rp join reader r on r.id=rp.user_id join eligible e on e.id=rp.story_id
 join public.chapters c on c.id=rp.chapter_id and c.story_id=rp.story_id and c.published=true
 order by rp.updated_at desc limit 6
), event_rows as (
 select ev.id,ev.title,ev.description,ev.ends_at,
 coalesce((select jsonb_agg(x.card) from (select c.card from candidates c join public.story_event_entries en on en.story_id=c.id where en.event_id=ev.id order by en.created_at desc,c.id limit 8)x),'[]'::jsonb) stories
 from public.story_events ev where ev.active and ev.starts_at<=now() and ev.ends_at>now() order by ev.ends_at limit 4
)
select jsonb_build_object(
 'favorite_fandoms',(select to_jsonb(names) from favorites),
 'continue_reading',coalesce((select jsonb_agg(to_jsonb(x)) from continue_reading x),'[]'::jsonb),
 'genres',coalesce((select jsonb_agg(slug order by weight desc,slug) from genre_affinity),'[]'::jsonb),
 'for_you',coalesce((select jsonb_agg(x.card) from (select c.card from candidates c where c.genres && array(select slug from genre_affinity) order by c.week_reads desc,c.first_published_at desc,c.id limit 8)x),'[]'::jsonb),
 'weekly',coalesce((select jsonb_agg(x.card) from (select card from candidates where week_views+week_reads>0 order by (week_views+week_reads*3) desc,first_published_at desc,id limit 8)x),'[]'::jsonb),
 'most_viewed',coalesce((select jsonb_agg(x.card) from (select card from candidates where views>0 order by views desc,reads desc,id limit 8)x),'[]'::jsonb),
 'most_read',coalesce((select jsonb_agg(x.card) from (select card from candidates where reads>0 order by reads desc,views desc,id limit 8)x),'[]'::jsonb),
 'new_fandom',coalesce((select jsonb_agg(x.card) from (select c.card from candidates c order by c.first_published_at desc,c.id limit 8)x),'[]'::jsonb),
 'new_voices',coalesce((select jsonb_agg(x.card) from (select card from (select c.*,row_number() over(partition by author_id order by first_published_at desc,id) author_slot from candidates c where reads<10) diverse where author_slot<=2 order by first_published_at desc,id limit 8)x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from event_rows x),'[]'::jsonb)
);
$function$;

CREATE OR REPLACE FUNCTION public.record_discovery_activity(p_account uuid, p_story uuid, p_chapter uuid DEFAULT NULL::uuid, p_percent numeric DEFAULT 0, p_position integer DEFAULT 0, p_read boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare reader uuid; author uuid;
begin
 select p.id into reader from public.profiles p join public.auth_accounts a on a.id=p.user_id
 where p.user_id=p_account and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended';
 select s.author_id into author from public.released_stories s join public.profiles p on p.id=s.author_id
 left join public.auth_accounts a on a.id=p.user_id
 where public.profile_content_allowed(s.author_id,reader) and s.id=p_story and s.moderation_hidden_at is null and p.moderation_hidden_at is null
 and a.account_status is distinct from 'suspended';
 if reader is null or author is null then return false; end if;
 if p_percent is null or p_percent<0 or p_percent>100 or p_position is null or p_position<0 or p_position>10000 then return false; end if;
 if p_chapter is not null then
   if not exists(select 1 from public.chapters c where c.id=p_chapter and c.story_id=p_story and c.published=true) then return false; end if;
   insert into public.reading_progress(user_id,story_id,chapter_id,progress_percent,position,updated_at)
   values(reader,p_story,p_chapter,p_percent,p_position,now())
   on conflict(user_id,story_id) do update set chapter_id=excluded.chapter_id,progress_percent=excluded.progress_percent,position=excluded.position,updated_at=excluded.updated_at;
 end if;
 if reader<>author then
   insert into public.story_daily_engagement(story_id,reader_id,viewed,read)
   values(p_story,reader,true,p_read and p_chapter is not null)
   on conflict(story_id,reader_id,activity_day) do update set viewed=true,read=public.story_daily_engagement.read or excluded.read;
 end if;
 return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_catalog_stories(p_viewer uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_include_slugs text[] DEFAULT '{}'::text[], p_exclude_slugs text[] DEFAULT '{}'::text[], p_rating text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_kind text DEFAULT NULL::text, p_format text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, author_id uuid, title text, description text, cover_url text, status text, rating text, created_at timestamp with time zone, updated_at timestamp with time zone, story_kind text, story_format text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
with searchable as (
 select s.*, debut.first_published_at,public.discovery_key(s.title) title_key,
 public.discovery_key(concat_ws(' ',s.title,s.description,s.fandom,p.username,p.display_name,
 (select string_agg(t.name,' ') from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id))) document_key,
 public.discovery_story_fandoms(s.id,s.fandom) fandom_keys
 from public.released_stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
 join lateral (select min(coalesce(c.original_published_at,c.created_at)) first_published_at from public.chapters c where c.story_id=s.id and c.published=true) debut on debut.first_published_at is not null
 where public.profile_content_allowed(s.author_id,p_viewer) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
 and (p_kind is null or s.story_kind=p_kind) and (p_format is null or s.story_format=p_format)
)
select s.id,s.author_id,s.title,s.description,s.cover_url,s.status,s.rating,s.created_at,s.updated_at,s.story_kind,s.story_format from searchable s
where (public.discovery_key(p_query)='' or not exists(select 1 from unnest(string_to_array(public.discovery_key(p_query),'-')) word where position(word in s.document_key)=0))
and (p_rating is null or s.rating=p_rating) and (p_status is null or s.status=p_status)
and not exists(select 1 from unnest(coalesce(p_include_slugs,'{}'::text[])) required where not (required=any(s.fandom_keys)) and not exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=required))
and not exists(select 1 from unnest(coalesce(p_exclude_slugs,'{}'::text[])) excluded where excluded=any(s.fandom_keys) or exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=excluded))
order by case when public.discovery_key(p_query)<>'' then case when s.title_key=public.discovery_key(p_query) then 0 when s.title_key like public.discovery_key(p_query)||'%' then 1 when position(public.discovery_key(p_query) in s.title_key)>0 then 2 else 3 end end,
case when p_sort='debut' then s.first_published_at end desc,
case when p_sort='newest' then s.created_at end desc,
case when p_sort='title_asc' then s.title end asc,case when p_sort='title_desc' then s.title end desc,s.updated_at desc,s.id
limit least(greatest(coalesce(p_limit,24),1),48) offset greatest(coalesce(p_offset,0),0);
$function$;

CREATE OR REPLACE FUNCTION public.search_visible_stories(p_viewer uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_include_slugs text[] DEFAULT '{}'::text[], p_exclude_slugs text[] DEFAULT '{}'::text[], p_rating text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, author_id uuid, title text, description text, cover_url text, status text, rating text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
with searchable as (
 select s.*,public.discovery_key(s.title) title_key,
 public.discovery_key(concat_ws(' ',s.title,s.description,s.fandom,p.username,p.display_name,
 (select string_agg(t.name,' ') from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id))) document_key,
 public.discovery_story_fandoms(s.id,s.fandom) fandom_keys
 from public.released_stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
 where public.profile_content_allowed(s.author_id,p_viewer) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'

)
select s.id,s.author_id,s.title,s.description,s.cover_url,s.status,s.rating,s.created_at,s.updated_at from searchable s
where (public.discovery_key(p_query)='' or not exists(select 1 from unnest(string_to_array(public.discovery_key(p_query),'-')) word where position(word in s.document_key)=0))
and (p_rating is null or s.rating=p_rating) and (p_status is null or s.status=p_status)
and not exists(select 1 from unnest(coalesce(p_include_slugs,'{}'::text[])) required where not (required=any(s.fandom_keys)) and not exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=required))
and not exists(select 1 from unnest(coalesce(p_exclude_slugs,'{}'::text[])) excluded where excluded=any(s.fandom_keys) or exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=excluded))
order by case when public.discovery_key(p_query)<>'' then case when s.title_key=public.discovery_key(p_query) then 0 when s.title_key like public.discovery_key(p_query)||'%' then 1 when position(public.discovery_key(p_query) in s.title_key)>0 then 2 else 3 end end,
case when p_sort='newest' then s.created_at end desc,
case when p_sort='title_asc' then s.title end asc,case when p_sort='title_desc' then s.title end desc,s.updated_at desc,s.id
limit least(greatest(coalesce(p_limit,24),1),48) offset greatest(coalesce(p_offset,0),0);
$function$;

CREATE FUNCTION public.notify_released_chapter(p_chapter uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE author uuid;
DECLARE title text;
BEGIN
  SELECT s.author_id, s.title INTO author, title FROM public.released_stories s
  JOIN public.chapters c ON c.story_id = s.id WHERE c.id = p_chapter AND c.published;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.user_notifications(user_id,notification_type,title,body,href,source_key)
  SELECT p.user_id, 'chapter_release', 'Capítulo publicado', 'Seu capítulo de ' || title || ' está no ar.',
    '/capitulo-publicado/' || p_chapter, 'chapter-published:' || p_chapter
  FROM public.profiles p WHERE p.id = author
  ON CONFLICT(user_id,source_key) DO NOTHING;
  INSERT INTO public.user_notifications(user_id,notification_type,title,body,href,source_key)
  SELECT p.user_id, 'chapter_release', 'Novo capítulo disponível', 'Há um novo capítulo de ' || title || '.',
    '/capitulo/' || p_chapter, 'chapter-release:' || p_chapter
  FROM public.profiles p
  WHERE p.id <> author AND p.chapter_notifications AND public.profile_content_allowed(author,p.id)
    AND (EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id=p.id AND f.following_id=author)
      OR EXISTS (SELECT 1 FROM public.reading_lists l JOIN public.reading_list_items i ON i.list_id=l.id WHERE l.user_id=p.id AND i.story_id=(SELECT story_id FROM public.chapters WHERE id = p_chapter)))
  ON CONFLICT(user_id,source_key) DO NOTHING;
END $$;


REVOKE ALL ON FUNCTION public.notify_released_chapter(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_released_chapter(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.social_chapter_release()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.published AND (TG_OP = 'INSERT' OR NOT OLD.published) THEN
    PERFORM public.notify_released_chapter(NEW.id);
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.set_story_release(p_story uuid, p_author uuid, p_action text, p_schedule timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM public.stories WHERE id = p_story AND author_id = p_author AND moderation_hidden_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_action = 'unpublish' THEN
    UPDATE public.stories SET release_at = 'infinity' WHERE id = p_story;
    RETURN 'unpublished';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chapters WHERE story_id = p_story AND published)
    AND NOT (p_action = 'schedule' AND EXISTS (
      SELECT 1 FROM public.scheduled_chapters sc JOIN public.chapters c ON c.id = sc.chapter_id
      WHERE c.story_id = p_story AND c.publication_status = 'scheduled' AND sc.scheduled_for <= p_schedule
    )) THEN RETURN 'no_chapter'; END IF;
  IF p_action = 'publish' THEN
    UPDATE public.stories SET release_at = NULL WHERE id = p_story;
    PERFORM public.notify_released_chapter(c.id) FROM public.chapters c WHERE c.story_id = p_story AND c.published;
    RETURN 'published';
  END IF;
  IF p_action = 'schedule' AND p_schedule > now() AND isfinite(p_schedule) THEN
    UPDATE public.stories SET release_at = p_schedule WHERE id = p_story;
    RETURN 'scheduled';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.set_story_release(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_story_release(uuid, uuid, text, timestamptz) TO service_role;

create or replace function public.list_story_series(p_story uuid, p_viewer uuid)
returns table(id uuid, title text, series_volume integer)
language sql stable security invoker set search_path = pg_catalog as $$
  select sibling.id, sibling.title, sibling.series_volume
  from public.released_stories source
  join public.released_stories sibling on sibling.author_id = source.author_id
    and lower(sibling.series_name) = lower(source.series_name)
    and sibling.series_volume is not null
  join public.profiles author on author.id = source.author_id
  left join public.auth_accounts account on account.id = author.user_id
  where source.id = p_story and source.series_volume is not null
    and source.moderation_hidden_at is null and sibling.moderation_hidden_at is null
    and author.moderation_hidden_at is null and account.account_status is distinct from 'suspended'
    and public.profile_content_allowed(author.id, p_viewer)
  order by sibling.series_volume;
$$;

-- The existing every-minute chapter job also sends release notices for scheduled works.
CREATE OR REPLACE FUNCTION public.publish_scheduled_chapters()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE item record;
DECLARE released integer := 0;
BEGIN
  FOR item IN SELECT sc.id, sc.chapter_id, sc.scheduled_for FROM public.scheduled_chapters sc
    JOIN public.chapters c ON c.id = sc.chapter_id
    WHERE sc.scheduled_for <= now() AND c.publication_status = 'scheduled'
    ORDER BY sc.scheduled_for FOR UPDATE OF sc,c SKIP LOCKED
  LOOP
    UPDATE public.chapters SET published = true, publication_status = 'published',
      original_published_at = coalesce(original_published_at, item.scheduled_for), updated_at = now()
    WHERE id = item.chapter_id AND publication_status = 'scheduled';
    IF FOUND THEN released := released + 1; END IF;
    DELETE FROM public.scheduled_chapters WHERE id = item.id;
  END LOOP;
  FOR item IN SELECT s.id FROM public.stories s
    WHERE isfinite(s.release_at) AND s.release_at <= now() AND s.moderation_hidden_at IS NULL
      AND EXISTS (SELECT 1 FROM public.chapters c WHERE c.story_id = s.id AND c.published)
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    UPDATE public.stories SET release_at = NULL WHERE id = item.id;
    PERFORM public.notify_released_chapter(c.id) FROM public.chapters c WHERE c.story_id = item.id AND c.published;
  END LOOP;
  RETURN released;
END $$;

create or replace function public.discovery_sitemap() returns table(id uuid,updated_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
select s.id,s.updated_at from public.released_stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
where public.profile_content_allowed(s.author_id,null) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'

order by s.id limit 50000;
$$;
create or replace function public.discovery_fandom_catalog() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
with names as (
 select 'Universo original' name
 union all select btrim(part) from public.released_stories s cross join lateral regexp_split_to_table(s.fandom, ',') part
 where public.profile_content_allowed(s.author_id,null) and s.moderation_hidden_at is null and btrim(part)<>''
 union all select t.name from public.tags t join public.tag_categories tc on tc.id=t.category_id where tc.slug='fandom'
), unique_names as(select min(name) name from names where char_length(name)<=100 group by public.discovery_key(name))
select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from (select name from unique_names order by name limit 300) n;
$$;

-- Favorite characters and moderated wiki contributions.
CREATE TABLE public.wiki_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  universe text NOT NULL CHECK (length(universe) BETWEEN 2 AND 160),
  biography text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX wiki_characters_name_universe_idx ON public.wiki_characters (lower(name), lower(universe));

CREATE TABLE public.wiki_character_favorites (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.wiki_characters(id) ON DELETE CASCADE,
  PRIMARY KEY(profile_id, character_id)
);
CREATE INDEX wiki_character_favorites_character_idx ON public.wiki_character_favorites(character_id);

CREATE TABLE public.wiki_character_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.wiki_characters(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  biography text NOT NULL CHECK (length(biography) BETWEEN 20 AND 5000),
  source_url text NOT NULL CHECK (length(source_url) BETWEEN 9 AND 1500),
  decision text CHECK (decision IN ('approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wiki_character_edits_character_idx ON public.wiki_character_edits(character_id);
CREATE INDEX wiki_character_edits_pending_idx ON public.wiki_character_edits(created_at) WHERE decision IS NULL;
CREATE UNIQUE INDEX wiki_character_edits_one_pending_idx ON public.wiki_character_edits(character_id, profile_id) WHERE decision IS NULL;
ALTER TABLE public.wiki_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_character_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiki_character_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wiki_characters, public.wiki_character_favorites, public.wiki_character_edits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wiki_characters, public.wiki_character_favorites, public.wiki_character_edits TO service_role;

CREATE FUNCTION public.submit_character_edit(p_profile uuid, p_character uuid, p_name text, p_universe text, p_bio text, p_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE target_character uuid;
BEGIN
  IF p_character IS NULL THEN
    INSERT INTO public.wiki_characters(name, universe) VALUES (p_name, p_universe)
    ON CONFLICT (lower(name), lower(universe)) DO NOTHING RETURNING id INTO target_character;
    IF target_character IS NULL THEN RETURN NULL; END IF;
    INSERT INTO public.wiki_character_favorites(profile_id,character_id) VALUES (p_profile,target_character);
  ELSE
    SELECT f.character_id INTO target_character FROM public.wiki_character_favorites f
    WHERE f.character_id = p_character AND f.profile_id = p_profile;
    IF target_character IS NULL THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.wiki_character_edits(character_id,profile_id,biography,source_url)
  VALUES(target_character,p_profile,p_bio,p_source)
  ON CONFLICT (character_id,profile_id) WHERE decision IS NULL
  DO UPDATE SET biography = excluded.biography, source_url = excluded.source_url, created_at = now();
  RETURN target_character;
END $$;

CREATE FUNCTION public.review_character_edit(p_edit uuid, p_decision text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE edit public.wiki_character_edits;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN RETURN false; END IF;
  UPDATE public.wiki_character_edits SET decision = p_decision
  WHERE id = p_edit AND decision IS NULL RETURNING * INTO edit;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_decision = 'approved' THEN
    UPDATE public.wiki_characters SET biography = edit.biography, source_url = edit.source_url, approved_at = now()
    WHERE id = edit.character_id;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.submit_character_edit(uuid, uuid, text, text, text, text), public.review_character_edit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_character_edit(uuid, uuid, text, text, text, text), public.review_character_edit(uuid, text) TO service_role;

-- Feed media, replies and hashtags.
ALTER TABLE public.nook_post_media DROP CONSTRAINT nook_post_media_media_type_check;
ALTER TABLE public.nook_post_media ADD CONSTRAINT nook_post_media_media_type_check CHECK (media_type IN ('image','gif','video'));
UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
WHERE id = 'nook-media';

CREATE FUNCTION public.create_feed_media_post(p_profile uuid,p_text text,p_story uuid,p_news text,p_media jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE post uuid;
BEGIN
  IF jsonb_array_length(p_media) NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'invalid media count'; END IF;
  INSERT INTO public.nook_posts(user_id,body,story_id,news_slug,pinned)
  VALUES (p_profile,p_text,p_story,p_news,false) RETURNING id INTO post;
  INSERT INTO public.nook_post_media(post_id,media_url,media_type,position)
  SELECT post, item->>'media_url', item->>'media_type', position::integer
  FROM jsonb_array_elements(p_media) WITH ORDINALITY AS files(item,position);
  RETURN post;
END $$;
REVOKE ALL ON FUNCTION public.create_feed_media_post(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_feed_media_post(uuid,text,uuid,text,jsonb) TO service_role;

CREATE FUNCTION public.feed_hashtags(body text)
RETURNS text[] LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(DISTINCT lower(matches[1])), '{}'::text[])
  FROM regexp_matches(body, '(?<![[:alnum:]_])#([[:alnum:]_]{1,64})(?![[:alnum:]_])', 'g') AS matches
$$;
ALTER TABLE public.nook_posts ADD COLUMN hashtags text[] GENERATED ALWAYS AS (public.feed_hashtags(body)) STORED;
CREATE INDEX nook_posts_hashtags_idx ON public.nook_posts USING gin(hashtags) WHERE moderation_hidden_at IS NULL;
REVOKE ALL ON FUNCTION public.feed_hashtags(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.feed_hashtags(text) TO service_role;

ALTER TABLE public.nook_comments ADD COLUMN image_url text;
ALTER TABLE public.nook_comments DROP CONSTRAINT nook_comments_content_check;
ALTER TABLE public.nook_comments ADD CONSTRAINT nook_comments_content_check
  CHECK (char_length(trim(content)) > 0 OR image_url IS NOT NULL);
CREATE INDEX nook_comments_image_idx ON public.nook_comments(image_url) WHERE image_url IS NOT NULL;
CREATE TABLE public.nook_saved_replies (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.nook_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,comment_id)
);
CREATE INDEX nook_saved_replies_comment_idx ON public.nook_saved_replies(comment_id);
ALTER TABLE public.nook_saved_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nook_saved_replies FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.nook_saved_replies TO service_role;

CREATE OR REPLACE FUNCTION public.content_media_allowed(p_session text, p_bucket text, p_urls text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE viewer uuid;
BEGIN
  IF p_bucket NOT IN ('story-covers','stories','nook-media','chapter-media','social-stories')
     OR coalesce(cardinality(p_urls), 0) NOT BETWEEN 1 AND 2 THEN RETURN false; END IF;
  viewer := public.social_actor(p_session);
  IF p_bucket = 'social-stories' AND viewer IS NULL THEN RETURN false; END IF;

  IF p_bucket IN ('story-covers','stories') AND EXISTS (
    SELECT 1 FROM public.stories s WHERE s.cover_url = ANY(p_urls)
      AND (s.author_id = viewer OR (EXISTS (SELECT 1 FROM public.released_stories r WHERE r.id = s.id)
        AND public.profile_content_allowed(s.author_id, viewer)))
  ) THEN RETURN true; END IF;

  IF p_bucket IN ('chapter-media','stories') AND EXISTS (
    SELECT 1 FROM public.chapter_media m JOIN public.chapters c ON c.id = m.chapter_id
      JOIN public.stories s ON s.id = c.story_id
    WHERE m.media_url = ANY(p_urls) AND (s.author_id = viewer OR
      (c.published AND EXISTS (SELECT 1 FROM public.released_stories r WHERE r.id = s.id) AND public.profile_content_allowed(s.author_id, viewer)))
  ) THEN RETURN true; END IF;

  IF p_bucket = 'chapter-media' AND EXISTS (
    SELECT 1 FROM public.chapters c JOIN public.stories s ON s.id = c.story_id
    WHERE c.banner_url = ANY(p_urls) AND (s.author_id = viewer OR
      (c.published AND EXISTS (SELECT 1 FROM public.released_stories r WHERE r.id = s.id) AND public.profile_content_allowed(s.author_id, viewer)))
  ) THEN RETURN true; END IF;

  IF p_bucket IN ('nook-media','stories') AND EXISTS (
    SELECT 1 FROM public.nook_posts p LEFT JOIN public.nook_post_media m ON m.post_id = p.id
    WHERE (p.image_url = ANY(p_urls) OR m.media_url = ANY(p_urls))
      AND p.moderation_hidden_at IS NULL AND public.profile_content_allowed(p.user_id, viewer)
  ) THEN RETURN true; END IF;

  IF p_bucket = 'nook-media' AND EXISTS (
    SELECT 1 FROM public.nook_comments c JOIN public.nook_posts p ON p.id = c.post_id
    WHERE c.image_url = ANY(p_urls) AND p.moderation_hidden_at IS NULL
      AND public.profile_content_allowed(p.user_id, viewer) AND public.profile_content_allowed(c.author_id, viewer)
  ) THEN RETURN true; END IF;

  IF p_bucket IN ('social-stories','stories') AND viewer IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.social_stories s WHERE s.media_url = ANY(p_urls) AND s.expires_at > now()
      AND (s.user_id = viewer OR EXISTS (SELECT 1 FROM public.follows f
        WHERE f.follower_id = viewer AND f.following_id = s.user_id))
      AND public.profile_content_allowed(s.user_id, viewer)
  ) THEN RETURN true; END IF;
  RETURN false;
END $function$;
