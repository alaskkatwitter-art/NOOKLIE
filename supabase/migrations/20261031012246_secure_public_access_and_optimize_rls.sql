-- Public tables in this app are server-only. The Supabase service key stays in server routes.
-- Restrictive false policies preserve a deny-by-default boundary if client grants are added later.

REVOKE ALL ON TABLE public."auth_accounts" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."auth_accounts" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."auth_rate_limits" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."auth_rate_limits" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."auth_sessions" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."auth_sessions" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."chapter_likes" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."chapter_likes" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."chapter_media" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."chapter_media" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."fic_club_members" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."fic_club_members" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."fic_clubs" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."fic_clubs" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nook_comment_reactions" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."nook_comment_reactions" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nook_comments" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."nook_comments" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nook_post_media" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."nook_post_media" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nook_post_reactions" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."nook_post_reactions" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nook_posts" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."nook_posts" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nook_saved_posts" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."nook_saved_posts" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."reading_list_items" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."reading_list_items" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."reading_lists" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."reading_lists" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."scheduled_chapters" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."scheduled_chapters" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."social_stories" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."social_stories" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."story_tags" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."story_tags" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."tag_categories" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."tag_categories" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."tags" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."tags" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."user_stickers" FROM anon, authenticated;
CREATE POLICY "deny_direct_client_access" ON public."user_stickers" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Evaluate auth.uid() once per statement in existing policies.
DROP POLICY "Autor pode apagar capítulos" ON public."chapters";
CREATE POLICY "Autor pode apagar capítulos" ON public."chapters" AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS ( SELECT 1
   FROM stories
  WHERE ((stories.id = chapters.story_id) AND (stories.author_id = (select auth.uid())))));

DROP POLICY "Autor pode criar capítulos" ON public."chapters";
CREATE POLICY "Autor pode criar capítulos" ON public."chapters" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
   FROM stories
  WHERE ((stories.id = chapters.story_id) AND (stories.author_id = (select auth.uid())))));

DROP POLICY "Autor pode editar capítulos" ON public."chapters";
CREATE POLICY "Autor pode editar capítulos" ON public."chapters" AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
   FROM stories
  WHERE ((stories.id = chapters.story_id) AND (stories.author_id = (select auth.uid())))));

DROP POLICY "Usuário pode curtir comentário" ON public."comment_likes";
CREATE POLICY "Usuário pode curtir comentário" ON public."comment_likes" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode remover curtida de comentário" ON public."comment_likes";
CREATE POLICY "Usuário pode remover curtida de comentário" ON public."comment_likes" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode apagar próprio comentário" ON public."comments";
CREATE POLICY "Usuário pode apagar próprio comentário" ON public."comments" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode comentar" ON public."comments";
CREATE POLICY "Usuário pode comentar" ON public."comments" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode editar próprio comentário" ON public."comments";
CREATE POLICY "Usuário pode editar próprio comentário" ON public."comments" AS PERMISSIVE FOR UPDATE TO public
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode deixar de seguir" ON public."follows";
CREATE POLICY "Usuário pode deixar de seguir" ON public."follows" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = follower_id);

DROP POLICY "Usuário pode seguir" ON public."follows";
CREATE POLICY "Usuário pode seguir" ON public."follows" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = follower_id);

DROP POLICY "Usuário pode remover próprio voto" ON public."poll_votes";
CREATE POLICY "Usuário pode remover próprio voto" ON public."poll_votes" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode votar" ON public."poll_votes";
CREATE POLICY "Usuário pode votar" ON public."poll_votes" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode curtir post" ON public."post_likes";
CREATE POLICY "Usuário pode curtir post" ON public."post_likes" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode remover curtida de post" ON public."post_likes";
CREATE POLICY "Usuário pode remover curtida de post" ON public."post_likes" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode apagar próprio post" ON public."posts";
CREATE POLICY "Usuário pode apagar próprio post" ON public."posts" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode criar post" ON public."posts";
CREATE POLICY "Usuário pode criar post" ON public."posts" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode editar próprio post" ON public."posts";
CREATE POLICY "Usuário pode editar próprio post" ON public."posts" AS PERMISSIVE FOR UPDATE TO public
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode criar próprio perfil" ON public."profiles";
CREATE POLICY "Usuário pode criar próprio perfil" ON public."profiles" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY "Usuário pode editar próprio perfil" ON public."profiles";
CREATE POLICY "Usuário pode editar próprio perfil" ON public."profiles" AS PERMISSIVE FOR UPDATE TO public
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY "Usuário atualiza próprio progresso" ON public."reading_progress";
CREATE POLICY "Usuário atualiza próprio progresso" ON public."reading_progress" AS PERMISSIVE FOR UPDATE TO public
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário salva próprio progresso" ON public."reading_progress";
CREATE POLICY "Usuário salva próprio progresso" ON public."reading_progress" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário vê próprio progresso" ON public."reading_progress";
CREATE POLICY "Usuário vê próprio progresso" ON public."reading_progress" AS PERMISSIVE FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY "Autor pode apagar história" ON public."stories";
CREATE POLICY "Autor pode apagar história" ON public."stories" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = author_id);

DROP POLICY "Autor pode editar história" ON public."stories";
CREATE POLICY "Autor pode editar história" ON public."stories" AS PERMISSIVE FOR UPDATE TO public
  USING ((select auth.uid()) = author_id)
  WITH CHECK ((select auth.uid()) = author_id);

DROP POLICY "Usuário pode criar histórias" ON public."stories";
CREATE POLICY "Usuário pode criar histórias" ON public."stories" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = author_id);

DROP POLICY "Usuário pode curtir história" ON public."story_likes";
CREATE POLICY "Usuário pode curtir história" ON public."story_likes" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Usuário pode remover própria curtida" ON public."story_likes";
CREATE POLICY "Usuário pode remover própria curtida" ON public."story_likes" AS PERMISSIVE FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

-- Index foreign-key columns lacking a leading-column index.
CREATE INDEX IF NOT EXISTS "comment_likes_user_id_idx" ON public."comment_likes" ("user_id");
CREATE INDEX IF NOT EXISTS "comments_user_id_idx" ON public."comments" ("user_id");
CREATE INDEX IF NOT EXISTS "nook_posts_story_id_idx" ON public."nook_posts" ("story_id");
CREATE INDEX IF NOT EXISTS "nook_posts_user_id_idx" ON public."nook_posts" ("user_id");
CREATE INDEX IF NOT EXISTS "poll_options_poll_id_idx" ON public."poll_options" ("poll_id");
CREATE INDEX IF NOT EXISTS "poll_votes_option_id_idx" ON public."poll_votes" ("option_id");
CREATE INDEX IF NOT EXISTS "poll_votes_user_id_idx" ON public."poll_votes" ("user_id");
CREATE INDEX IF NOT EXISTS "polls_chapter_id_idx" ON public."polls" ("chapter_id");
CREATE INDEX IF NOT EXISTS "post_likes_user_id_idx" ON public."post_likes" ("user_id");
CREATE INDEX IF NOT EXISTS "posts_chapter_id_idx" ON public."posts" ("chapter_id");
CREATE INDEX IF NOT EXISTS "reading_progress_chapter_id_idx" ON public."reading_progress" ("chapter_id");
CREATE INDEX IF NOT EXISTS "story_likes_user_id_idx" ON public."story_likes" ("user_id");
CREATE INDEX IF NOT EXISTS "tags_created_by_idx" ON public."tags" ("created_by");
