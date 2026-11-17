-- Phase 5: feed, mural, events and chapter poll data. No production cutover.

CREATE TABLE "nook_comment_reactions" (
  "id" TEXT NOT NULL,
  "comment_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "nook_comment_reactions_emoji_check" CHECK ((emoji IN ('❤️', '😂', '😭', '😱', '👀', '🔥'))),
  CONSTRAINT "nook_comment_reactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "nook_comment_reactions_comment_id_user_id_emoji_key" UNIQUE (comment_id, user_id, emoji),
  CONSTRAINT "nook_comment_reactions_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES nook_comments(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "nook_comments" (
  "id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "parent_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "image_url" TEXT,
  CONSTRAINT "nook_comments_pkey" PRIMARY KEY (id),
  CONSTRAINT "nook_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE,
  CONSTRAINT "nook_comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES nook_comments(id) ON DELETE CASCADE,
  CONSTRAINT "nook_comments_content_check" CHECK (((length(trim(content)) > 0) OR (image_url IS NOT NULL))),
  FOREIGN KEY(parent_id,post_id) REFERENCES nook_comments(id,post_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "nook_post_media" (
  "id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "media_url" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "nook_post_media_pkey" PRIMARY KEY (id),
  CONSTRAINT "nook_post_media_post_id_fkey" FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE,
  CONSTRAINT "nook_post_media_media_type_check" CHECK ((media_type IN ('image', 'gif', 'video')))
) STRICT;

CREATE TABLE "nook_post_reactions" (
  "id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "nook_post_reactions_emoji_check" CHECK ((emoji IN ('❤️', '😂', '😭', '😱', '👀', '🔥'))),
  CONSTRAINT "nook_post_reactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "nook_post_reactions_post_id_user_id_emoji_key" UNIQUE (post_id, user_id, emoji),
  CONSTRAINT "nook_post_reactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "nook_posts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "image_url" TEXT,
  "story_id" TEXT,
  "pinned" INTEGER NOT NULL DEFAULT 0 CHECK("pinned" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "moderation_hidden_at" TEXT,
  "news_slug" TEXT,
  "hashtags" TEXT CHECK("hashtags" IS NULL OR json_valid("hashtags")) CHECK("hashtags" IS NULL OR json_type("hashtags")='array'),
  "publication_origin" TEXT NOT NULL DEFAULT 'feed',
  CONSTRAINT "nook_posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "nook_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "nook_posts_story_id_fkey" FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL,
  CONSTRAINT "nook_posts_one_link_check" CHECK (((news_slug IS NULL) OR (story_id IS NULL))),
  CONSTRAINT "nook_posts_publication_origin_check" CHECK ((publication_origin IN ('feed', 'mural'))),
  CONSTRAINT "nook_posts_news_slug_check" CHECK (((news_slug IS NULL) OR (news_slug IN ('boas-vindas', 'originais', 'atualizacao-6-novembro-2026', 'doacoes-e-novidades', 'nooklie-de-volta'))))
) STRICT;

CREATE TABLE "nook_reposts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "comment" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "nook_reposts_comment_check" CHECK (((comment IS NULL) OR ((length(trim(comment)) >= 1) AND (length(trim(comment)) <= 5000)))),
  CONSTRAINT "nook_reposts_pkey" PRIMARY KEY (id),
  CONSTRAINT "nook_reposts_user_id_post_id_key" UNIQUE (user_id, post_id),
  CONSTRAINT "nook_reposts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "nook_reposts_post_id_fkey" FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "nook_saved_posts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "nook_saved_posts_pkey" PRIMARY KEY (id),
  CONSTRAINT "nook_saved_posts_user_id_post_id_key" UNIQUE (user_id, post_id),
  CONSTRAINT "nook_saved_posts_post_id_fkey" FOREIGN KEY (post_id) REFERENCES nook_posts(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "nook_saved_replies" (
  "user_id" TEXT NOT NULL,
  "comment_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "nook_saved_replies_pkey" PRIMARY KEY (user_id, comment_id),
  CONSTRAINT "nook_saved_replies_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "nook_saved_replies_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES nook_comments(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "poll_options" (
  "id" TEXT NOT NULL,
  "poll_id" TEXT NOT NULL,
  "option_text" TEXT NOT NULL,
  CONSTRAINT "poll_options_pkey" PRIMARY KEY (id),
  CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "poll_votes" (
  "poll_id" TEXT NOT NULL,
  "option_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "poll_votes_pkey" PRIMARY KEY (poll_id, user_id),
  CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
  CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY(option_id,poll_id) REFERENCES poll_options(id,poll_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "polls" (
  "id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "polls_pkey" PRIMARY KEY (id),
  CONSTRAINT "polls_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "story_event_entries" (
  "event_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "story_event_entries_pkey" PRIMARY KEY (event_id, story_id),
  CONSTRAINT "story_event_entries_event_id_fkey" FOREIGN KEY (event_id) REFERENCES story_events(id) ON DELETE CASCADE,
  CONSTRAINT "story_event_entries_story_id_fkey" FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "story_events" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "starts_at" TEXT NOT NULL,
  "ends_at" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1 CHECK("active" IN (0,1)),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "details" TEXT CHECK("details" IS NULL OR json_valid("details")),
  "revision" TEXT NOT NULL,
  CONSTRAINT "story_events_check" CHECK(julianday(ends_at)>julianday(starts_at) AND julianday(ends_at) IS NOT NULL AND julianday(starts_at) IS NOT NULL),
  CONSTRAINT "story_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "story_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth_accounts(id),
  CONSTRAINT "story_events_title_check" CHECK (((length(title) >= 1) AND (length(title) <= 120))),
  CONSTRAINT "story_events_description_check" CHECK ((length(description) <= 12000)),
  CONSTRAINT "story_events_details_check" CHECK (((details IS NULL) OR (json_type(details) = 'object')))
) STRICT;

CREATE INDEX nook_comment_reactions_comment_id_idx ON nook_comment_reactions (comment_id);
CREATE INDEX nook_comment_reactions_user_id_idx ON nook_comment_reactions (user_id);
CREATE INDEX nook_comments_post_id_idx ON nook_comments (post_id);
CREATE INDEX nook_comments_parent_id_idx ON nook_comments (parent_id);
CREATE INDEX nook_comments_author_id_idx ON nook_comments (author_id);
CREATE INDEX nook_comments_image_idx ON nook_comments (image_url) WHERE (image_url IS NOT NULL);
CREATE INDEX nook_post_media_post_id_idx ON nook_post_media (post_id);
CREATE INDEX nook_post_media_post_position_idx ON nook_post_media (post_id, "position");
CREATE INDEX nook_post_media_url_idx ON nook_post_media (media_url);
CREATE INDEX nook_post_reactions_post_id_idx ON nook_post_reactions (post_id);
CREATE INDEX nook_post_reactions_user_id_idx ON nook_post_reactions (user_id);
CREATE INDEX nook_posts_story_id_idx ON nook_posts (story_id);
CREATE INDEX nook_posts_user_id_idx ON nook_posts (user_id);
CREATE INDEX nook_posts_public_created_idx ON nook_posts (created_at DESC) WHERE (moderation_hidden_at IS NULL);
CREATE INDEX nook_posts_image_url_idx ON nook_posts (image_url) WHERE (image_url IS NOT NULL);
CREATE INDEX nook_reposts_post_idx ON nook_reposts (post_id, created_at DESC);
CREATE INDEX nook_reposts_timeline_idx ON nook_reposts (created_at DESC);
CREATE INDEX nook_saved_posts_user_id_idx ON nook_saved_posts (user_id);
CREATE INDEX nook_saved_posts_post_id_idx ON nook_saved_posts (post_id);
CREATE INDEX nook_saved_posts_created_at_idx ON nook_saved_posts (created_at DESC);
CREATE INDEX nook_saved_replies_comment_idx ON nook_saved_replies (comment_id);
CREATE INDEX poll_options_poll_id_idx ON poll_options (poll_id);
CREATE INDEX poll_votes_option_id_idx ON poll_votes (option_id);
CREATE INDEX poll_votes_user_id_idx ON poll_votes (user_id);
CREATE INDEX polls_chapter_id_idx ON polls (chapter_id);
CREATE INDEX story_event_story_idx ON story_event_entries (story_id);
CREATE INDEX story_events_creator_idx ON story_events (created_by);
CREATE UNIQUE INDEX nook_comments_id_post_idx ON nook_comments(id,post_id);
CREATE UNIQUE INDEX poll_options_id_poll_idx ON poll_options(id,poll_id);

CREATE TRIGGER d1_mural_notification AFTER INSERT ON nook_posts
WHEN NEW.publication_origin='mural' AND NEW.moderation_hidden_at IS NULL
BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT f.follower_id,NEW.user_id,'nook_mural_post','publicou no mural.','/feed?post='||NEW.id,'nook-mural:'||NEW.id
 FROM follows f WHERE f.following_id=NEW.user_id;
END;
CREATE TRIGGER d1_post_reaction_notification AFTER INSERT ON nook_post_reactions
BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT p.user_id,NEW.user_id,'nook_post_reactions','curtiu sua publicação.','/feed?post='||p.id,'post-reaction:'||NEW.post_id||':'||NEW.user_id||':'||NEW.emoji
 FROM nook_posts p WHERE p.id=NEW.post_id;
END;
CREATE TRIGGER d1_post_comment_notification AFTER INSERT ON nook_comments
BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT p.user_id,NEW.author_id,'nook_comments','comentou em sua publicação.','/feed?post='||p.id,'post-comment:'||NEW.id||':'||p.user_id
 FROM nook_posts p WHERE p.id=NEW.post_id;
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT c.author_id,NEW.author_id,'reply','respondeu ao seu comentário.','/feed?post='||NEW.post_id,'post-reply:'||NEW.id
 FROM nook_comments c JOIN nook_posts p ON p.id=c.post_id WHERE c.id=NEW.parent_id AND c.post_id=NEW.post_id AND c.author_id<>p.user_id;
END;
CREATE TRIGGER d1_comment_reaction_notification AFTER INSERT ON nook_comment_reactions
BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT c.author_id,NEW.user_id,'nook_comment_reactions','reagiu ao seu comentário no mural.','/feed?post='||c.post_id,
 'reply-reaction:'||NEW.comment_id||':'||NEW.user_id||':'||NEW.emoji FROM nook_comments c WHERE c.id=NEW.comment_id;
END;
CREATE TRIGGER d1_repost_notification AFTER INSERT ON nook_reposts
BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT p.user_id,NEW.user_id,'nook_repost','nooklou seu post.','/feed?post='||p.id,'nook-repost:'||NEW.id FROM nook_posts p WHERE p.id=NEW.post_id;
END;

-- Official literary event notices follow the existing all-active-accounts rule.
CREATE TRIGGER d1_announce_event AFTER INSERT ON story_events
WHEN NEW.active=1 AND julianday(NEW.ends_at)>julianday('now')
BEGIN
 INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
 SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
 a.id,'literary_event',NEW.title,'Novo evento literário no Nooklie. Veja os detalhes e saiba como participar.',
 '/eventos?evento='||NEW.id,'literary-event:'||NEW.id FROM auth_accounts a WHERE a.account_status='active'
 ON CONFLICT(user_id,source_key) DO NOTHING;
END;
CREATE TRIGGER d1_activate_event AFTER UPDATE OF active ON story_events
WHEN NEW.active=1 AND OLD.active=0 AND julianday(NEW.ends_at)>julianday('now')
BEGIN
 INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
 SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
 a.id,'literary_event',NEW.title,'Novo evento literário no Nooklie. Veja os detalhes e saiba como participar.',
 '/eventos?evento='||NEW.id,'literary-event:'||NEW.id FROM auth_accounts a WHERE a.account_status='active'
 ON CONFLICT(user_id,source_key) DO NOTHING;
END;
