ALTER TABLE public.nook_posts
  DROP CONSTRAINT nook_posts_news_slug_check,
  ADD CONSTRAINT nook_posts_news_slug_check CHECK (
    news_slug IS NULL OR news_slug IN (
      'boas-vindas',
      'originais',
      'atualizacao-6-novembro-2026',
      'doacoes-e-novidades',
      'nooklie-de-volta'
    )
  );
