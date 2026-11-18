-- News comments. Historical inserts must use suppress_notifications='1'.
CREATE TABLE news_comments (
 id TEXT PRIMARY KEY NOT NULL,
 article_slug TEXT NOT NULL CHECK(length(article_slug) BETWEEN 1 AND 100 AND article_slug NOT GLOB '*[^a-z0-9-]*'),
 author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 3000),
 parent_id TEXT, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 deleted_at TEXT, deleted_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
 UNIQUE(id,article_slug), FOREIGN KEY(parent_id,article_slug) REFERENCES news_comments(id,article_slug)
) STRICT;
CREATE INDEX news_comments_article_created_idx ON news_comments(article_slug,created_at DESC,id DESC);
CREATE INDEX news_comments_author_idx ON news_comments(author_id);
CREATE INDEX news_comments_parent_idx ON news_comments(parent_id,article_slug);
CREATE INDEX news_comments_deleted_by_idx ON news_comments(deleted_by);
-- SQLite cannot express PostgreSQL SET NULL(parent_id) on a composite FK.
CREATE TRIGGER d1_news_parent_delete BEFORE DELETE ON news_comments BEGIN
 UPDATE news_comments SET parent_id=NULL WHERE parent_id=OLD.id AND article_slug=OLD.article_slug;
END;
CREATE TRIGGER d1_news_reply_notice AFTER INSERT ON news_comments WHEN NEW.parent_id IS NOT NULL BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT author_id,NEW.author_id,'comment_reply','respondeu ao seu comentário no Jornal Nooklie.',
 '/noticias/'||NEW.article_slug||'#comentario-'||NEW.id,'news-reply:'||NEW.id
 FROM news_comments WHERE id=NEW.parent_id AND article_slug=NEW.article_slug AND deleted_at IS NULL;
END;
CREATE VIEW d1_news_moderators AS
 SELECT a.token_hash,a.user_id FROM d1_mod_actor a
 JOIN departments d ON d.slug='moderacao' AND d.status='active'
 WHERE a.is_root=1 OR EXISTS(SELECT 1 FROM d1_mod_grants g WHERE g.token_hash=a.token_hash AND g.department_id=d.id AND g.code='moderation.manage');
CREATE VIEW d1_news_audience AS
 SELECT a.token_hash,c.id AS comment_id FROM d1_social_actors a CROSS JOIN news_comments c
 JOIN profiles p ON p.id=c.author_id JOIN auth_accounts u ON u.id=p.user_id
 WHERE u.account_status='active' AND p.moderation_hidden_at IS NULL
 AND (p.is_private=0 OR p.id=a.profile_id OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=a.profile_id AND f.following_id=p.id))
 AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=p.id AND b.blocked_id=a.profile_id) OR (b.blocked_id=p.id AND b.blocker_id=a.profile_id));
CREATE VIEW d1_news_commands AS SELECT CAST(NULL AS TEXT) AS token_hash,CAST(NULL AS TEXT) AS id,
 CAST(NULL AS TEXT) AS article_slug,CAST(NULL AS TEXT) AS operation,CAST(NULL AS TEXT) AS body,
 CAST(NULL AS TEXT) AS parent_id,CAST(NULL AS TEXT) AS target_id WHERE 0;
CREATE TRIGGER d1_news_post INSTEAD OF INSERT ON d1_news_commands WHEN NEW.operation='post' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM d1_social_actors WHERE token_hash=NEW.token_hash) THEN RAISE(ABORT,'Active profile required') END;
 SELECT CASE WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM news_comments c JOIN d1_news_audience v ON v.comment_id=c.id WHERE v.token_hash=NEW.token_hash AND c.id=NEW.parent_id AND c.article_slug=NEW.article_slug AND c.deleted_at IS NULL) THEN RAISE(ABORT,'Reply target unavailable') END;
 SELECT CASE WHEN (SELECT count(*) FROM news_comments c JOIN d1_social_actors a ON a.profile_id=c.author_id WHERE a.token_hash=NEW.token_hash AND julianday(c.created_at)>julianday('now','-15 minutes'))>=20 THEN RAISE(ABORT,'News comment rate limit') END;
 INSERT INTO news_comments(id,article_slug,author_id,body,parent_id) SELECT NEW.id,NEW.article_slug,profile_id,NEW.body,NEW.parent_id FROM d1_social_actors WHERE token_hash=NEW.token_hash;
END;
CREATE TRIGGER d1_news_remove INSTEAD OF INSERT ON d1_news_commands WHEN NEW.operation='remove' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM news_comments c JOIN d1_social_actors a ON a.token_hash=NEW.token_hash WHERE c.id=NEW.target_id AND c.article_slug=NEW.article_slug AND c.deleted_at IS NULL AND (c.author_id=a.profile_id OR EXISTS(SELECT 1 FROM d1_news_moderators m WHERE m.token_hash=a.token_hash))) THEN RAISE(ABORT,'Comment removal forbidden or already deleted') END;
 INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details)
 SELECT NEW.id,a.user_id,'news.comment.remove','news_comment',NEW.target_id,json_object('article_slug',NEW.article_slug)
 FROM d1_social_actors a WHERE a.token_hash=NEW.token_hash;
 UPDATE news_comments SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),deleted_by=(SELECT profile_id FROM d1_social_actors WHERE token_hash=NEW.token_hash) WHERE id=NEW.target_id;
END;
