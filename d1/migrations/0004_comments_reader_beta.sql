-- Phase 4: comments, reader preferences, beta reading and notification storage.

CREATE TABLE "beta_reading_invites" (
  "id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "reader_id" TEXT NOT NULL,
  "accepted_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "beta_reading_invites_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  CONSTRAINT "beta_reading_invites_reader_id_fkey" FOREIGN KEY (reader_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "beta_reading_invites_pkey" PRIMARY KEY (id),
  CONSTRAINT "beta_reading_invites_chapter_id_reader_id_key" UNIQUE (chapter_id, reader_id)
) STRICT;

CREATE TABLE "beta_reading_notes" (
  "id" TEXT NOT NULL,
  "invite_id" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "beta_reading_notes_excerpt_check" CHECK ((length(excerpt) <= 400)),
  CONSTRAINT "beta_reading_notes_body_check" CHECK (((length(body) >= 1) AND (length(body) <= 2000))),
  CONSTRAINT "beta_reading_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "beta_reading_notes_invite_id_fkey" FOREIGN KEY (invite_id) REFERENCES beta_reading_invites(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "comment_likes" (
  "comment_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "comment_likes_pkey" PRIMARY KEY (comment_id, user_id),
  CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "comments" (
  "id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "selected_text" TEXT,
  "start_offset" INTEGER,
  "end_offset" INTEGER,
  "parent_comment_id" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "sticker_id" TEXT,
  CONSTRAINT "comments_pkey" PRIMARY KEY (id),
  CONSTRAINT "comments_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  CONSTRAINT "comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT "comments_sticker_id_fkey" FOREIGN KEY (sticker_id) REFERENCES user_stickers(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_comment_id,chapter_id) REFERENCES comments(id,chapter_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "reader_preferences" (
  "user_id" TEXT NOT NULL,
  "preferences" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "reader_preferences_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "reader_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE CASCADE,
  CHECK(coalesce(json_valid(preferences) AND json_type(preferences)='object'
    AND json_type(preferences,'$.fontId')='text' AND json_extract(preferences,'$.fontId') IN (
      'browser-serif','lora','merriweather','literata','newsreader','eb-garamond','source-serif-4',
      'libre-baskerville','nunito','dm-sans','lexend','atkinson-hyperlegible','open-sans')
    AND json_type(preferences,'$.fontSize') IN ('integer','real') AND json_extract(preferences,'$.fontSize') BETWEEN 14 AND 40
    AND json_type(preferences,'$.lineHeight') IN ('integer','real') AND json_extract(preferences,'$.lineHeight') BETWEEN 1.2 AND 2.5
    AND json_type(preferences,'$.margin') IN ('integer','real') AND json_extract(preferences,'$.margin') BETWEEN 0 AND 64
    AND json_type(preferences,'$.theme')='text' AND json_extract(preferences,'$.theme') IN ('dark','light','sepia','system'),0))
) STRICT;

CREATE TABLE "user_notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "notification_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "href" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "read_at" TEXT,
  "source_key" TEXT,
  "actor_id" TEXT,
  CONSTRAINT "user_notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE CASCADE,
  CONSTRAINT "user_notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE "user_stickers" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "image_url" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "last_used_at" TEXT,
  CONSTRAINT "user_stickers_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_stickers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX beta_reading_reader_idx ON beta_reading_invites (reader_id, created_at DESC);
CREATE INDEX beta_reading_notes_invite_idx ON beta_reading_notes (invite_id, created_at DESC);
CREATE INDEX comment_likes_user_id_idx ON comment_likes (user_id);
CREATE INDEX comments_chapter_id_idx ON comments (chapter_id);
CREATE INDEX comments_parent_id_idx ON comments (parent_comment_id);
CREATE INDEX comments_sticker_id_idx ON comments (sticker_id);
CREATE INDEX comments_user_id_idx ON comments (user_id);
CREATE INDEX user_notifications_user_created_idx ON user_notifications (user_id, created_at DESC);
CREATE INDEX user_notifications_unread_idx ON user_notifications (user_id, created_at DESC) WHERE (read_at IS NULL);
CREATE UNIQUE INDEX notifications_source_key_idx ON user_notifications (user_id, source_key);
CREATE INDEX user_notifications_actor_idx ON user_notifications (actor_id);
CREATE INDEX user_stickers_user_id_idx ON user_stickers (user_id);
CREATE INDEX user_stickers_last_used_at_idx ON user_stickers (last_used_at);
CREATE UNIQUE INDEX comments_id_chapter_idx ON comments(id,chapter_id);

-- Internal notification entry point, available only to server-side SQL/triggers.
CREATE VIEW d1_notification_events AS SELECT
  CAST(NULL AS TEXT) AS target_id,CAST(NULL AS TEXT) AS actor_id,
  CAST(NULL AS TEXT) AS kind,CAST(NULL AS TEXT) AS phrase,
  CAST(NULL AS TEXT) AS href,CAST(NULL AS TEXT) AS source_key WHERE 0;
CREATE TRIGGER d1_deliver_notification INSTEAD OF INSERT ON d1_notification_events
BEGIN
  INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key,actor_id)
  SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
    target.user_id,NEW.kind,coalesce(actor.display_name,actor.username)||' '||NEW.phrase,'',NEW.href,NEW.source_key,NEW.actor_id
  FROM profiles target JOIN auth_accounts ta ON ta.id=target.user_id
  JOIN profiles actor ON actor.id=NEW.actor_id JOIN auth_accounts aa ON aa.id=actor.user_id
  WHERE target.id=NEW.target_id AND target.id<>actor.id AND target.social_notifications=1
    AND ta.account_status='active' AND aa.account_status='active'
    AND target.moderation_hidden_at IS NULL AND actor.moderation_hidden_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM profile_mutes m WHERE m.user_id=target.id AND m.target_id=actor.id)
    AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
      (b.blocker_id=target.id AND b.blocked_id=actor.id) OR (b.blocked_id=target.id AND b.blocker_id=actor.id))
  ON CONFLICT(user_id,source_key) DO NOTHING;
END;

CREATE TRIGGER d1_comment_notifications AFTER INSERT ON comments
BEGIN
  INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
  SELECT s.author_id,NEW.user_id,'comments','comentou em um capítulo seu.','/capitulo/'||NEW.chapter_id,'comments:'||NEW.id||':'||s.author_id
  FROM chapters c JOIN stories s ON s.id=c.story_id WHERE c.id=NEW.chapter_id;
  INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
  SELECT parent.user_id,NEW.user_id,'comment_reply','respondeu ao seu comentário.','/capitulo/'||NEW.chapter_id,'chapter-reply:'||NEW.id
  FROM comments parent JOIN chapters c ON c.id=NEW.chapter_id JOIN stories s ON s.id=c.story_id
  WHERE parent.id=NEW.parent_comment_id AND parent.chapter_id=NEW.chapter_id AND parent.user_id<>s.author_id;
  UPDATE user_stickers SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=NEW.sticker_id AND user_id=NEW.user_id;
END;

CREATE TRIGGER d1_comment_like_notification AFTER INSERT ON comment_likes
BEGIN
  INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
  SELECT c.user_id,NEW.user_id,'comment_likes','curtiu seu comentário.','/capitulo/'||c.chapter_id,
    'comment-like:'||NEW.comment_id||':'||NEW.user_id FROM comments c WHERE c.id=NEW.comment_id;
END;

CREATE TRIGGER d1_beta_invite_notification AFTER INSERT ON beta_reading_invites
BEGIN
  INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
  SELECT NEW.reader_id,s.author_id,'beta_reading_invite','convidou você para uma leitura beta.','/leitura-beta','beta-invite:'||NEW.id
  FROM chapters c JOIN stories s ON s.id=c.story_id WHERE c.id=NEW.chapter_id;
END;

CREATE TRIGGER reader_preferences_keys_insert
BEFORE INSERT ON reader_preferences
WHEN (SELECT count(*) FROM json_each(NEW.preferences))<>5 OR EXISTS(
 SELECT 1 FROM json_each(NEW.preferences) WHERE key NOT IN ('fontId','fontSize','lineHeight','margin','theme'))
BEGIN SELECT RAISE(ABORT,'Invalid reader preference keys'); END;

CREATE TRIGGER reader_preferences_keys_update
BEFORE UPDATE OF preferences ON reader_preferences
WHEN (SELECT count(*) FROM json_each(NEW.preferences))<>5 OR EXISTS(
 SELECT 1 FROM json_each(NEW.preferences) WHERE key NOT IN ('fontId','fontSize','lineHeight','margin','theme'))
BEGIN SELECT RAISE(ABORT,'Invalid reader preference keys'); END;
