-- Retire the fixed list of article slugs without rebuilding the live posts table
-- (a rebuild could cascade into comments, reactions, reposts and attachments).
-- The retired column stays NULL; HTTP routes validate against the news catalog.
ALTER TABLE nook_posts RENAME COLUMN news_slug TO legacy_news_slug;
ALTER TABLE nook_posts ADD COLUMN news_slug TEXT
  CHECK(news_slug IS NULL OR (length(news_slug) BETWEEN 1 AND 100 AND news_slug NOT GLOB '*[^a-z0-9-]*'));
UPDATE nook_posts SET news_slug=legacy_news_slug,legacy_news_slug=NULL WHERE legacy_news_slug IS NOT NULL;
CREATE TRIGGER d1_post_news_link_insert BEFORE INSERT ON nook_posts
WHEN NEW.legacy_news_slug IS NOT NULL OR (NEW.news_slug IS NOT NULL AND NEW.story_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Select one publication link'); END;
CREATE TRIGGER d1_post_news_link_update BEFORE UPDATE OF news_slug,story_id,legacy_news_slug ON nook_posts
WHEN NEW.legacy_news_slug IS NOT NULL OR (NEW.news_slug IS NOT NULL AND NEW.story_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Select one publication link'); END;
