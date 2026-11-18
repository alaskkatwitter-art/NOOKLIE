-- Character wiki: reviewed public biographies and private pending contributions.
CREATE TABLE wiki_characters (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
 universe TEXT NOT NULL CHECK(length(universe) BETWEEN 2 AND 160), biography TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL DEFAULT '', approved_at TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE UNIQUE INDEX wiki_characters_name_universe_idx ON wiki_characters(lower(name),lower(universe));
CREATE TABLE wiki_character_favorites (
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 character_id TEXT NOT NULL REFERENCES wiki_characters(id) ON DELETE CASCADE,
 PRIMARY KEY(profile_id,character_id)
) STRICT;
CREATE INDEX wiki_character_favorites_character_idx ON wiki_character_favorites(character_id);
CREATE TABLE wiki_character_edits (
 id TEXT PRIMARY KEY NOT NULL, character_id TEXT NOT NULL REFERENCES wiki_characters(id) ON DELETE CASCADE,
 profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
 biography TEXT NOT NULL CHECK(length(biography) BETWEEN 20 AND 5000),
 source_url TEXT NOT NULL CHECK(length(source_url) BETWEEN 9 AND 1500),
 decision TEXT CHECK(decision IN('approved','rejected')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX wiki_character_edits_character_idx ON wiki_character_edits(character_id);
CREATE INDEX wiki_character_edits_pending_idx ON wiki_character_edits(created_at) WHERE decision IS NULL;
CREATE UNIQUE INDEX wiki_character_edits_one_pending_idx ON wiki_character_edits(character_id,profile_id) WHERE decision IS NULL;
CREATE VIEW d1_wiki_reviewers AS
 SELECT a.token_hash,a.user_id FROM d1_mod_actor a
 WHERE a.is_root=1 OR EXISTS(SELECT 1 FROM d1_mod_grants g JOIN departments d ON d.id=g.department_id
 WHERE g.token_hash=a.token_hash AND g.code='moderation.manage' AND d.slug='moderacao');
CREATE VIEW d1_wiki_commands AS
 SELECT CAST(NULL AS TEXT) AS token_hash, CAST(NULL AS TEXT) AS id, CAST(NULL AS TEXT) AS character_id,
 CAST(NULL AS TEXT) AS operation, CAST(NULL AS TEXT) AS name, CAST(NULL AS TEXT) AS universe,
 CAST(NULL AS TEXT) AS biography, CAST(NULL AS TEXT) AS source_url, CAST(NULL AS TEXT) AS decision WHERE 0;
CREATE TRIGGER d1_wiki_submit INSTEAD OF INSERT ON d1_wiki_commands WHEN NEW.operation='submit' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM d1_social_actors WHERE token_hash=NEW.token_hash) THEN RAISE(ABORT,'Active profile required') END;
 SELECT CASE WHEN NEW.character_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wiki_character_favorites f JOIN d1_social_actors a ON a.profile_id=f.profile_id WHERE a.token_hash=NEW.token_hash AND f.character_id=NEW.character_id) THEN RAISE(ABORT,'Favorite required') END;
 INSERT INTO wiki_characters(id,name,universe) SELECT NEW.id,NEW.name,NEW.universe WHERE NEW.character_id IS NULL;
 INSERT INTO wiki_character_favorites(profile_id,character_id) SELECT a.profile_id,NEW.id FROM d1_social_actors a WHERE a.token_hash=NEW.token_hash AND NEW.character_id IS NULL;
 INSERT INTO wiki_character_edits(id,character_id,profile_id,biography,source_url)
 SELECT NEW.id,coalesce(NEW.character_id,NEW.id),a.profile_id,NEW.biography,NEW.source_url FROM d1_social_actors a WHERE a.token_hash=NEW.token_hash
 ON CONFLICT(character_id,profile_id) WHERE decision IS NULL DO UPDATE SET biography=excluded.biography,source_url=excluded.source_url,created_at=excluded.created_at;
END;
CREATE TRIGGER d1_wiki_review INSTEAD OF INSERT ON d1_wiki_commands WHEN NEW.operation='review' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM d1_wiki_reviewers WHERE token_hash=NEW.token_hash) THEN RAISE(ABORT,'Wiki review forbidden') END;
 SELECT CASE WHEN coalesce(NEW.decision IN('approved','rejected'),0)=0 THEN RAISE(ABORT,'Invalid decision') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM wiki_character_edits WHERE id=NEW.character_id AND decision IS NULL) THEN RAISE(ABORT,'Contribution already reviewed or missing') END;
 INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details)
 SELECT NEW.id,a.user_id,'wiki.review','wiki_character_edit',NEW.character_id,json_object('decision',NEW.decision) FROM d1_wiki_reviewers a WHERE a.token_hash=NEW.token_hash;
 UPDATE wiki_characters SET biography=(SELECT biography FROM wiki_character_edits WHERE id=NEW.character_id),source_url=(SELECT source_url FROM wiki_character_edits WHERE id=NEW.character_id),approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=(SELECT character_id FROM wiki_character_edits WHERE id=NEW.character_id) AND NEW.decision='approved';
 UPDATE wiki_character_edits SET decision=NEW.decision WHERE id=NEW.character_id;
END;
