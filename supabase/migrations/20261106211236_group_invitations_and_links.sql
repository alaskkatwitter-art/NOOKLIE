CREATE TABLE public.chat_group_invite_links (
  thread_id uuid PRIMARY KEY REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.chat_group_invite_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_group_invite_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chat_group_invite_links TO service_role;

CREATE FUNCTION public.chat_group_invite_members(p_session text,p_thread uuid,p_members uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actor uuid := public.social_actor(p_session); target uuid; added uuid;
BEGIN
  PERFORM 1 FROM public.chat_threads WHERE id=p_thread AND kind='group' AND initiator_id=actor FOR UPDATE;
  IF NOT FOUND OR actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.chat_group_members WHERE thread_id=p_thread AND profile_id=actor AND status='accepted') THEN RETURN false; END IF;
  IF coalesce(cardinality(p_members),0) NOT BETWEEN 1 AND 14 OR array_position(p_members,null) IS NOT NULL THEN RETURN false; END IF;
  IF (SELECT count(DISTINCT member) FROM (SELECT profile_id AS member FROM public.chat_group_members WHERE thread_id=p_thread UNION SELECT unnest(p_members)) people)>15 THEN RETURN false; END IF;
  FOREACH target IN ARRAY p_members LOOP
    IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.auth_accounts a ON a.id=p.user_id WHERE p.id=target AND p.moderation_hidden_at IS NULL AND a.account_status='active') THEN RETURN false; END IF;
    IF EXISTS(SELECT 1 FROM public.chat_blocks b WHERE
      (b.blocker_id=target AND b.blocked_id IN (SELECT profile_id FROM public.chat_group_members WHERE thread_id=p_thread UNION SELECT unnest(p_members))) OR
      (b.blocked_id=target AND b.blocker_id IN (SELECT profile_id FROM public.chat_group_members WHERE thread_id=p_thread UNION SELECT unnest(p_members)))) THEN RETURN false; END IF;
  END LOOP;
  FOREACH target IN ARRAY p_members LOOP
    added := null;
    IF NOT EXISTS(SELECT 1 FROM public.chat_group_members WHERE thread_id=p_thread AND profile_id=target) THEN
      INSERT INTO public.chat_group_members(thread_id,profile_id,status) VALUES(p_thread,target,'pending') RETURNING profile_id INTO added;
    END IF;
    IF added IS NOT NULL THEN PERFORM public.social_notify(target,actor,'chat_request','convidou você para um grupo.','/chat?thread='||p_thread,'group-invite:'||p_thread); END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE FUNCTION public.chat_group_link_manage(p_session text,p_thread uuid,p_token_hash text DEFAULT null,p_revoke boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actor uuid := public.social_actor(p_session);
BEGIN
  PERFORM 1 FROM public.chat_threads WHERE id=p_thread AND kind='group' AND initiator_id=actor FOR UPDATE;
  IF NOT FOUND OR actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.chat_group_members WHERE thread_id=p_thread AND profile_id=actor AND status='accepted') THEN RETURN false; END IF;
  IF p_revoke THEN DELETE FROM public.chat_group_invite_links WHERE thread_id=p_thread; RETURN true; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  INSERT INTO public.chat_group_invite_links(thread_id,token_hash,created_by,expires_at)
  VALUES(p_thread,p_token_hash,actor,now()+interval '7 days') ON CONFLICT(thread_id) DO UPDATE
  SET token_hash=excluded.token_hash,created_by=excluded.created_by,expires_at=excluded.expires_at;
  RETURN true;
END $$;

CREATE FUNCTION public.chat_group_link_info(p_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('name',t.name,'expires_at',l.expires_at)
  FROM public.chat_group_invite_links l JOIN public.chat_threads t ON t.id=l.thread_id
  WHERE l.token_hash=p_token_hash AND l.expires_at>now() AND t.kind='group' AND t.initiator_id=l.created_by
  AND EXISTS(SELECT 1 FROM public.chat_group_members m WHERE m.thread_id=t.id AND m.profile_id=l.created_by AND m.status='accepted')
  AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.auth_accounts a ON a.id=p.user_id WHERE p.id=l.created_by AND p.moderation_hidden_at IS NULL AND a.account_status='active');
$$;

CREATE FUNCTION public.chat_group_link_join(p_session text,p_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actor uuid := public.social_actor(p_session); thread uuid;
BEGIN
  IF actor IS NULL THEN RETURN null; END IF;
  SELECT t.id INTO thread FROM public.chat_group_invite_links l JOIN public.chat_threads t ON t.id=l.thread_id WHERE l.token_hash=p_token_hash FOR UPDATE OF t;
  IF thread IS NULL OR public.chat_group_link_info(p_token_hash) IS NULL THEN RETURN null; END IF;
  IF EXISTS(SELECT 1 FROM public.chat_blocks b JOIN public.chat_group_members m ON m.thread_id=thread WHERE (b.blocker_id=actor AND b.blocked_id=m.profile_id) OR (b.blocked_id=actor AND b.blocker_id=m.profile_id)) THEN RETURN null; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.chat_group_members WHERE thread_id=thread AND profile_id=actor) AND (SELECT count(*) FROM public.chat_group_members WHERE thread_id=thread)>=15 THEN RETURN null; END IF;
  IF EXISTS(SELECT 1 FROM public.chat_group_members WHERE thread_id=thread AND profile_id=actor) THEN
    UPDATE public.chat_group_members SET status='accepted' WHERE thread_id=thread AND profile_id=actor;
  ELSE
    INSERT INTO public.chat_group_members(thread_id,profile_id,status) VALUES(thread,actor,'accepted');
  END IF;
  RETURN thread;
END $$;

REVOKE ALL ON FUNCTION public.chat_group_invite_members(text,uuid,uuid[]),public.chat_group_link_manage(text,uuid,text,boolean),public.chat_group_link_info(text),public.chat_group_link_join(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_group_invite_members(text,uuid,uuid[]),public.chat_group_link_manage(text,uuid,text,boolean),public.chat_group_link_info(text),public.chat_group_link_join(text,text) TO service_role;

-- Replies notify the original commenter as well as the existing chapter-author notification.
CREATE FUNCTION public.notify_chapter_comment_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE recipient uuid;
BEGIN
  IF new.parent_comment_id IS NOT NULL THEN
    SELECT user_id INTO recipient FROM public.comments WHERE id=new.parent_comment_id AND chapter_id=new.chapter_id;
    IF recipient IS NOT NULL THEN
      PERFORM public.social_notify(recipient,new.user_id,'comment_reply','respondeu ao seu comentário.','/capitulo/'||new.chapter_id,'chapter-reply:'||new.id);
    END IF;
  END IF;
  RETURN new;
END $$;
DO $$ BEGIN
  IF to_regclass('public.comments') IS NOT NULL THEN
    CREATE TRIGGER notify_chapter_comment_reply AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.notify_chapter_comment_reply();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.notify_chapter_comment_reply() FROM PUBLIC,anon,authenticated;
