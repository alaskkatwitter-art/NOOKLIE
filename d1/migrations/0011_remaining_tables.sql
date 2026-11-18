-- Final nine source tables: schema parity only, no production route changes.
CREATE TABLE discovery_preferences (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
 favorite_fandoms TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(favorite_fandoms) AND json_type(favorite_fandoms)='array' AND json_array_length(favorite_fandoms)<=30),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
-- PostgreSQL text[] maps to a JSON array of text/null. array_to_string skips nulls.
CREATE TRIGGER d1_fandoms_insert BEFORE INSERT ON discovery_preferences BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.favorite_fandoms) WHERE type NOT IN('text','null'))
 OR (SELECT coalesce(sum(length(value)),0)+max(count(value)-1,0) FROM json_each(NEW.favorite_fandoms))>3000 THEN RAISE(ABORT,'Invalid favorite fandoms') END;
END;
CREATE TRIGGER d1_fandoms_update BEFORE UPDATE OF favorite_fandoms ON discovery_preferences BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.favorite_fandoms) WHERE type NOT IN('text','null'))
 OR (SELECT coalesce(sum(length(value)),0)+max(count(value)-1,0) FROM json_each(NEW.favorite_fandoms))>3000 THEN RAISE(ABORT,'Invalid favorite fandoms') END;
END;
CREATE TABLE story_daily_engagement (
 story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 reader_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 activity_day TEXT NOT NULL DEFAULT(date('now','-3 hours')) CHECK(length(activity_day)=10 AND date(activity_day,'+0 days') IS NOT NULL AND date(activity_day,'+0 days')=activity_day),
 viewed INTEGER NOT NULL DEFAULT 0 CHECK(viewed IN(0,1)),
 read INTEGER NOT NULL DEFAULT 0 CHECK(read IN(0,1)), PRIMARY KEY(story_id,reader_id,activity_day)
) STRICT;
CREATE INDEX story_daily_reader_idx ON story_daily_engagement(reader_id);
CREATE INDEX story_daily_day_idx ON story_daily_engagement(activity_day,story_id);
CREATE TABLE fic_clubs (
 id TEXT PRIMARY KEY NOT NULL, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 creator_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, name TEXT NOT NULL,
 description TEXT, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX fic_clubs_story_id_idx ON fic_clubs(story_id);
CREATE INDEX fic_clubs_creator_id_idx ON fic_clubs(creator_id);
CREATE TABLE fic_club_members (
 id TEXT PRIMARY KEY NOT NULL, club_id TEXT NOT NULL REFERENCES fic_clubs(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 joined_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(club_id,user_id)
) STRICT;
CREATE INDEX fic_club_members_club_id_idx ON fic_club_members(club_id);
CREATE INDEX fic_club_members_user_id_idx ON fic_club_members(user_id);
CREATE TABLE official_signup_tokens (
 singleton INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK(singleton=1), token_hash TEXT NOT NULL,
 used_at TEXT, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE posts (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 body TEXT, quote_text TEXT, chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
 start_offset INTEGER, end_offset INTEGER,
 created_at TEXT DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX posts_user_id_idx ON posts(user_id);
CREATE INDEX posts_created_at_idx ON posts(created_at DESC);
CREATE INDEX posts_chapter_id_idx ON posts(chapter_id);
CREATE TABLE post_likes (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 created_at TEXT DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY(post_id,user_id)
) STRICT;
CREATE INDEX post_likes_user_id_idx ON post_likes(user_id);
CREATE TABLE profile_themes (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
 drafts TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(drafts) AND json_type(drafts)='array' AND json_array_length(drafts)<=12),
 active TEXT CHECK(active IS NULL OR (json_valid(active) AND json_type(active)='object')),
 revision INTEGER NOT NULL CHECK(revision>0)
) STRICT;
CREATE TABLE social_stories (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 media_url TEXT NOT NULL, media_type TEXT NOT NULL DEFAULT 'image' CHECK(media_type IN('image','gif','video')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now','+24 hours')), thought TEXT
) STRICT;
CREATE INDEX social_stories_user_id_idx ON social_stories(user_id);
CREATE INDEX social_stories_expires_at_idx ON social_stories(expires_at);
CREATE INDEX social_stories_created_at_idx ON social_stories(created_at DESC);
CREATE INDEX social_stories_media_url_idx ON social_stories(media_url);
CREATE TRIGGER d1_legacy_quote_notice AFTER INSERT ON posts WHEN NEW.chapter_id IS NOT NULL BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT s.author_id,NEW.user_id,'posts','citou um trecho do seu capítulo no perfil.','/capitulo/'||NEW.chapter_id,
 'posts:'||NEW.id||':'||s.author_id FROM chapters c JOIN stories s ON s.id=c.story_id WHERE c.id=NEW.chapter_id;
END;
CREATE TRIGGER d1_legacy_post_like_notice AFTER INSERT ON post_likes BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT p.user_id,NEW.user_id,'post_likes','curtiu sua publicação.','/perfil/'||u.username,
 'post_likes:'||NEW.post_id||':'||NEW.user_id||':'||p.user_id FROM posts p JOIN profiles u ON u.id=p.user_id WHERE p.id=NEW.post_id;
END;
