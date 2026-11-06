CREATE TABLE public.news_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_slug text NOT NULL CHECK (article_slug ~ '^[a-z0-9-]{1,100}$'),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
  parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (id,article_slug),
  FOREIGN KEY (parent_id,article_slug) REFERENCES public.news_comments(id,article_slug) ON DELETE SET NULL (parent_id)
);
CREATE INDEX news_comments_article_created_idx ON public.news_comments(article_slug,created_at DESC,id DESC);
CREATE INDEX news_comments_author_idx ON public.news_comments(author_id);
CREATE INDEX news_comments_parent_idx ON public.news_comments(parent_id,article_slug);
CREATE INDEX news_comments_deleted_by_idx ON public.news_comments(deleted_by);
ALTER TABLE public.news_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_comments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.news_comments TO service_role;

CREATE FUNCTION public.notify_news_comment_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE recipient uuid;
BEGIN
  IF new.parent_id IS NOT NULL THEN
    SELECT author_id INTO recipient FROM public.news_comments
      WHERE id=new.parent_id AND article_slug=new.article_slug AND deleted_at IS NULL;
    IF recipient IS NOT NULL THEN
      PERFORM public.social_notify(recipient,new.author_id,'comment_reply','respondeu ao seu comentário no Jornal Nooklie.',
        '/noticias/'||new.article_slug||'#comentario-'||new.id,'news-reply:'||new.id);
    END IF;
  END IF;
  RETURN new;
END $$;
CREATE TRIGGER notify_news_comment_reply AFTER INSERT ON public.news_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_news_comment_reply();
REVOKE ALL ON FUNCTION public.notify_news_comment_reply() FROM PUBLIC,anon,authenticated;
