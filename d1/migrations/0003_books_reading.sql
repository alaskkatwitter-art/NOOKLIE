-- Phase 3: only apply before importing users. This guard prevents destructive
-- profile-table reconstruction if the isolated database has acquired real data.
CREATE TABLE d1_phase3_guard (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO d1_phase3_guard VALUES (CASE WHEN NOT EXISTS(SELECT 1 FROM profiles)
  AND NOT EXISTS(SELECT 1 FROM auth_accounts) THEN 1 ELSE 0 END);
DROP VIEW d1_social_actors;
DROP TABLE profiles;
CREATE TABLE "profiles" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "display_name" TEXT,
  "bio" TEXT,
  "avatar_url" TEXT,
  "cover_url" TEXT,
  "theme_color" TEXT DEFAULT '#ff78b9',
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "user_id" TEXT,
  "recovery_key_hash" TEXT,
  "verified" INTEGER NOT NULL DEFAULT 0 CHECK ("verified" IN (0,1)),
  "is_official" INTEGER NOT NULL DEFAULT 0 CHECK ("is_official" IN (0,1)),
  "moderation_hidden_at" TEXT,
  "is_private" INTEGER NOT NULL DEFAULT 0 CHECK ("is_private" IN (0,1)),
  "social_notifications" INTEGER NOT NULL DEFAULT 1 CHECK ("social_notifications" IN (0,1)),
  "chapter_notifications" INTEGER NOT NULL DEFAULT 1 CHECK ("chapter_notifications" IN (0,1)),
  "reposts_private" INTEGER NOT NULL DEFAULT 0 CHECK ("reposts_private" IN (0,1)),
  "pinned_story_id" TEXT,
  "header_layout" TEXT NOT NULL DEFAULT 'classic',
  "avatar_position" TEXT NOT NULL DEFAULT 'left',
  "video_autoplay" INTEGER NOT NULL DEFAULT 1 CHECK ("video_autoplay" IN (0,1)),
  "avatar_animation" TEXT,
  "cover_animation" TEXT,
  "spotify_link" TEXT,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_username_key" UNIQUE (username),
  CONSTRAINT "profiles_username_length" CHECK (((username IS NULL) OR ((length(username) >= 3) AND (length(username) <= 30)))),
  CONSTRAINT "profiles_avatar_animation_check" CHECK ((json_type(avatar_animation) = 'object')),
  CONSTRAINT "profiles_header_layout_check" CHECK ((header_layout IN ('classic', 'immersive'))),
  CONSTRAINT "profiles_avatar_position_check" CHECK ((avatar_position IN ('left', 'right'))),
  CONSTRAINT "profiles_cover_animation_check" CHECK ((json_type(cover_animation) = 'object')),
  FOREIGN KEY (user_id) REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (pinned_story_id) REFERENCES stories(id) ON DELETE SET NULL
) STRICT;
CREATE UNIQUE INDEX profiles_username_unique ON profiles(lower(username));
CREATE UNIQUE INDEX profiles_user_id_unique ON profiles(user_id);
CREATE UNIQUE INDEX profiles_recovery_key_hash_unique ON profiles(recovery_key_hash);
CREATE INDEX profiles_pinned_story_id_idx ON profiles(pinned_story_id);

CREATE TABLE "stories" (
  "id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "cover_url" TEXT,
  "status" TEXT DEFAULT 'ongoing',
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "rating" TEXT,
  "expires_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day')),
  "moderation_hidden_at" TEXT,
  "fandom" TEXT NOT NULL DEFAULT '',
  "work_has_ai" INTEGER NOT NULL DEFAULT 0 CHECK("work_has_ai" IN (0,1)),
  "cover_has_ai" INTEGER NOT NULL DEFAULT 0 CHECK("cover_has_ai" IN (0,1)),
  "has_content_warnings" INTEGER NOT NULL DEFAULT 0 CHECK("has_content_warnings" IN (0,1)),
  "content_warnings" TEXT NOT NULL DEFAULT '',
  "accepts_translation" INTEGER NOT NULL DEFAULT 0 CHECK("accepts_translation" IN (0,1)),
  "story_kind" TEXT NOT NULL DEFAULT '',
  "story_format" TEXT NOT NULL DEFAULT '',
  "series_name" TEXT NOT NULL DEFAULT '',
  "series_volume" INTEGER,
  "release_at" TEXT,
  "spotify_link" TEXT CHECK("spotify_link" IS NULL OR json_valid("spotify_link")),
  "allows_download" INTEGER NOT NULL DEFAULT 0 CHECK("allows_download" IN (0,1)),
  CONSTRAINT "stories_pkey" PRIMARY KEY (id),
  CONSTRAINT "stories_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "stories_fandom_check" CHECK ((length(fandom) <= 200)),
  CONSTRAINT "stories_content_warnings_check" CHECK ((length(content_warnings) <= 2000)),
  CONSTRAINT "stories_story_kind_check" CHECK ((story_kind IN ('', 'original', 'fanfic'))),
  CONSTRAINT "stories_story_format_check" CHECK ((story_format IN ('', 'romance', 'novela', 'conto', 'coletanea', 'poesia'))),
  CONSTRAINT "stories_series_name_check" CHECK ((length(series_name) <= 100)),
  CONSTRAINT "stories_series_volume_check" CHECK (((series_volume >= 1) AND (series_volume <= 999))),
  CONSTRAINT "story_series_requires_volume" CHECK ((((series_name = '') AND (series_volume IS NULL)) OR ((story_kind = 'original') AND (series_name <> '') AND (series_volume IS NOT NULL))))
) STRICT;

CREATE TABLE "chapters" (
  "id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "chapter_number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "published" INTEGER DEFAULT 1 CHECK("published" IN (0,1)),
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "author_notes" TEXT,
  "original_published_at" TEXT,
  "republished_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "publication_status" TEXT NOT NULL DEFAULT 'draft',
  "banner_url" TEXT,
  "entry_kind" TEXT NOT NULL DEFAULT 'chapter',
  "spotify_link" TEXT CHECK("spotify_link" IS NULL OR json_valid("spotify_link")),
  CONSTRAINT "chapters_story_id_fkey" FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT "chapters_pkey" PRIMARY KEY (id),
  CONSTRAINT "chapters_story_id_chapter_number_key" UNIQUE (story_id, chapter_number),
  CONSTRAINT "chapters_publication_status_check" CHECK ((publication_status IN ('draft', 'scheduled', 'published', 'unpublished'))),
  CONSTRAINT "chapters_entry_kind_check" CHECK ((entry_kind IN ('chapter', 'prologue', 'epilogue', 'extra')))
) STRICT;

CREATE TABLE "reading_lists" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_public" INTEGER NOT NULL DEFAULT 0 CHECK("is_public" IN (0,1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "image_path" TEXT,
  CONSTRAINT "reading_lists_pkey" PRIMARY KEY (id),
  CONSTRAINT "reading_lists_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "reading_list_items" (
  "id" TEXT NOT NULL,
  "list_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "added_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "reading_status" TEXT,
  "position" INTEGER NOT NULL,
  CONSTRAINT "reading_list_items_story_id_fkey" FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT "reading_list_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "reading_list_items_list_id_story_id_key" UNIQUE (list_id, story_id),
  CONSTRAINT "reading_list_items_list_id_fkey" FOREIGN KEY (list_id) REFERENCES reading_lists(id) ON DELETE CASCADE,
  CONSTRAINT "reading_list_items_reading_status_check" CHECK ((reading_status IN ('unread', 'reading', 'completed'))),
  CONSTRAINT "reading_list_position_nonnegative" CHECK (("position" >= 0))
) STRICT;

CREATE TABLE "reading_progress" (
  "user_id" TEXT NOT NULL,
  "story_id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "progress_percent" REAL DEFAULT 0,
  "position" INTEGER DEFAULT 0,
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "reading_progress_pkey" PRIMARY KEY (user_id, story_id),
  CONSTRAINT "reading_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "reading_progress_story_id_fkey" FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT "reading_progress_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id,story_id) REFERENCES chapters(id,story_id) ON DELETE CASCADE,
  CHECK (progress_percent BETWEEN 0 AND 100), CHECK(position>=0)
) STRICT;

CREATE TABLE "chapter_likes" (
  "chapter_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "chapter_likes_pkey" PRIMARY KEY (chapter_id, user_id),
  CONSTRAINT "chapter_likes_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "chapter_favorites" (
  "chapter_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "chapter_favorites_pkey" PRIMARY KEY (chapter_id, user_id),
  CONSTRAINT "chapter_favorites_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  CONSTRAINT "chapter_favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "story_likes" (
  "story_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "story_likes_pkey" PRIMARY KEY (story_id, user_id),
  CONSTRAINT "story_likes_story_id_fkey" FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT "story_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "chapter_media" (
  "id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "media_url" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "chapter_media_type_check" CHECK ((media_type IN ('image', 'gif'))),
  CONSTRAINT "chapter_media_pkey" PRIMARY KEY (id),
  CONSTRAINT "chapter_media_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "scheduled_chapters" (
  "id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "scheduled_for" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "scheduled_chapters_pkey" PRIMARY KEY (id),
  CONSTRAINT "scheduled_chapters_unique_chapter" UNIQUE (chapter_id),
  CONSTRAINT "scheduled_chapters_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category_id" TEXT,
  "created_by" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "tags_pkey" PRIMARY KEY (id),
  CONSTRAINT "tags_slug_key" UNIQUE (slug),
  CONSTRAINT "tags_category_id_fkey" FOREIGN KEY (category_id) REFERENCES tag_categories(id) ON DELETE SET NULL,
  CONSTRAINT "tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE "tag_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "tag_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "tag_categories_name_key" UNIQUE (name),
  CONSTRAINT "tag_categories_slug_key" UNIQUE (slug)
) STRICT;

CREATE TABLE "story_tags" (
  "story_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "story_tags_pkey" PRIMARY KEY (story_id, tag_id),
  CONSTRAINT "story_tags_story_id_fkey" FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  CONSTRAINT "story_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX chapter_favorites_user_idx ON chapter_favorites (user_id);
CREATE INDEX chapter_likes_chapter_id_idx ON chapter_likes (chapter_id);
CREATE INDEX chapter_likes_user_id_idx ON chapter_likes (user_id);
CREATE INDEX chapter_media_chapter_id_idx ON chapter_media (chapter_id);
CREATE INDEX chapter_media_position_idx ON chapter_media (chapter_id, "position");
CREATE INDEX chapter_media_url_idx ON chapter_media (media_url);
CREATE INDEX chapters_story_id_idx ON chapters (story_id);
CREATE INDEX chapters_publication_status_idx ON chapters (publication_status);
CREATE INDEX chapters_banner_url_idx ON chapters (banner_url) WHERE (banner_url IS NOT NULL);
CREATE INDEX reading_list_items_list_id_idx ON reading_list_items (list_id);
CREATE INDEX reading_list_items_story_id_idx ON reading_list_items (story_id);
CREATE INDEX reading_list_item_order_idx ON reading_list_items (list_id, "position", added_at DESC, id);
CREATE INDEX reading_lists_user_id_idx ON reading_lists (user_id);
CREATE INDEX reading_progress_story_id_idx ON reading_progress (story_id);
CREATE INDEX reading_progress_chapter_id_idx ON reading_progress (chapter_id);
CREATE INDEX reading_progress_recent_idx ON reading_progress (user_id, updated_at DESC);
CREATE INDEX stories_author_id_idx ON stories (author_id);
CREATE INDEX stories_rating_idx ON stories (rating);
CREATE INDEX stories_expires_at_idx ON stories (expires_at);
CREATE INDEX stories_public_updated_idx ON stories (updated_at DESC) WHERE (moderation_hidden_at IS NULL);
CREATE UNIQUE INDEX stories_series_volume_key ON stories (author_id, lower(series_name), series_volume) WHERE (series_volume IS NOT NULL);
CREATE INDEX stories_cover_url_idx ON stories (cover_url) WHERE (cover_url IS NOT NULL);
CREATE INDEX story_likes_user_id_idx ON story_likes (user_id);
CREATE INDEX story_tags_story_id_idx ON story_tags (story_id);
CREATE INDEX story_tags_tag_id_idx ON story_tags (tag_id);
CREATE UNIQUE INDEX tags_name_lower_idx ON tags (lower(name));
CREATE INDEX tags_category_id_idx ON tags (category_id);
CREATE INDEX tags_slug_idx ON tags (slug);
CREATE INDEX tags_created_by_idx ON tags (created_by);
CREATE UNIQUE INDEX chapters_id_story_idx ON chapters(id,story_id);
CREATE UNIQUE INDEX reading_lists_single_library_idx ON reading_lists(user_id) WHERE name='Biblioteca';
CREATE VIEW d1_social_actors AS
SELECT s.token_hash,a.id AS user_id,p.id AS profile_id
FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id JOIN profiles p ON p.user_id=a.id
WHERE a.account_status='active' AND p.moderation_hidden_at IS NULL
  AND julianday(s.expires_at)>julianday('now');
DROP TABLE d1_phase3_guard;

CREATE VIEW released_stories AS
SELECT s.* FROM stories s WHERE s.moderation_hidden_at IS NULL
  AND (s.release_at IS NULL OR julianday(s.release_at)<=julianday('now'))
  AND EXISTS(SELECT 1 FROM chapters c WHERE c.story_id=s.id AND c.published=1);

-- Internal command rows exist only during the inserting transaction. They let
-- SQLite validate complete orders and perform two-phase unique-number updates
-- atomically; there is no browser-accessible SQL/command endpoint.
CREATE TABLE d1_book_commands (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('reorder_chapters','delete_chapter','reorder_list')),
  target_id TEXT NOT NULL,
  chapter_id TEXT,
  ids TEXT NOT NULL CHECK(json_valid(ids) AND json_type(ids)='array')
) STRICT;

CREATE TRIGGER d1_run_book_command AFTER INSERT ON d1_book_commands
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM d1_social_actors WHERE token_hash=NEW.token_hash)
    THEN RAISE(ABORT,'Invalid session') END;
  SELECT CASE WHEN NEW.operation IN ('reorder_chapters','delete_chapter') AND NOT EXISTS(
    SELECT 1 FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id
    WHERE s.id=NEW.target_id AND a.token_hash=NEW.token_hash AND s.moderation_hidden_at IS NULL)
    THEN RAISE(ABORT,'Story ownership required') END;
  SELECT CASE WHEN NEW.operation='reorder_list' AND NOT EXISTS(
    SELECT 1 FROM reading_lists l JOIN d1_social_actors a ON a.profile_id=l.user_id
    WHERE l.id=NEW.target_id AND a.token_hash=NEW.token_hash AND l.name<>'Biblioteca')
    THEN RAISE(ABORT,'List ownership required') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.ids) WHERE type<>'text')
    OR (SELECT count(*) FROM json_each(NEW.ids))<>(SELECT count(DISTINCT value) FROM json_each(NEW.ids))
    THEN RAISE(ABORT,'Invalid order') END;
  SELECT CASE WHEN NEW.operation='reorder_chapters' AND (
    json_array_length(NEW.ids)<>(SELECT count(*) FROM chapters WHERE story_id=NEW.target_id)
    OR EXISTS(SELECT 1 FROM json_each(NEW.ids) j WHERE NOT EXISTS(
      SELECT 1 FROM chapters c WHERE c.id=j.value AND c.story_id=NEW.target_id)))
    THEN RAISE(ABORT,'Chapters changed; reload before sorting') END;
  SELECT CASE WHEN NEW.operation='reorder_list' AND (
    json_array_length(NEW.ids)<>(SELECT count(*) FROM reading_list_items WHERE list_id=NEW.target_id)
    OR EXISTS(SELECT 1 FROM json_each(NEW.ids) j WHERE NOT EXISTS(
      SELECT 1 FROM reading_list_items i WHERE i.story_id=j.value AND i.list_id=NEW.target_id)))
    THEN RAISE(ABORT,'List changed; reload before sorting') END;
  SELECT CASE WHEN NEW.operation='delete_chapter' AND NOT EXISTS(
    SELECT 1 FROM chapters WHERE id=NEW.chapter_id AND story_id=NEW.target_id)
    THEN RAISE(ABORT,'Chapter not found') END;
  SELECT CASE WHEN NEW.operation IN ('reorder_chapters','delete_chapter') AND EXISTS(
    SELECT 1 FROM chapters WHERE story_id=NEW.target_id AND chapter_number<=0)
    THEN RAISE(ABORT,'Invalid chapter numbering') END;

  DELETE FROM chapters WHERE NEW.operation='delete_chapter' AND story_id=NEW.target_id AND id=NEW.chapter_id;
  UPDATE d1_book_commands SET ids=(SELECT json_group_array(id) FROM (
    SELECT id FROM chapters WHERE story_id=NEW.target_id ORDER BY chapter_number,id))
    WHERE id=NEW.id AND NEW.operation='delete_chapter';
  UPDATE chapters SET chapter_number=-chapter_number
    WHERE story_id=NEW.target_id AND NEW.operation IN ('reorder_chapters','delete_chapter');
  UPDATE chapters SET chapter_number=(SELECT CAST(j.key AS INTEGER)+1 FROM
    json_each((SELECT ids FROM d1_book_commands WHERE id=NEW.id)) j WHERE j.value=chapters.id)
    WHERE story_id=NEW.target_id AND NEW.operation IN ('reorder_chapters','delete_chapter');
  UPDATE reading_list_items SET position=(SELECT CAST(j.key AS INTEGER) FROM json_each(NEW.ids) j
    WHERE j.value=reading_list_items.story_id)
    WHERE list_id=NEW.target_id AND NEW.operation='reorder_list';
  DELETE FROM d1_book_commands WHERE id=NEW.id;
END;

CREATE TRIGGER chapter_cancel_old_schedule AFTER UPDATE OF publication_status ON chapters
WHEN NEW.publication_status<>'scheduled'
BEGIN DELETE FROM scheduled_chapters WHERE chapter_id=NEW.id; END;
