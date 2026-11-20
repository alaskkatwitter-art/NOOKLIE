-- Additive community features. Existing stories, lists and private beta drafts are preserved.
CREATE TABLE nookview_entries (
 id TEXT PRIMARY KEY NOT NULL,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 body TEXT NOT NULL DEFAULT '' CHECK(length(body)<=8000),
 stars REAL CHECK(stars BETWEEN 0.5 AND 5 AND stars*2=CAST(stars*2 AS INTEGER)),
 reading_status TEXT NOT NULL CHECK(reading_status IN('want','reading','read','paused','dropped')),
 favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN(0,1)),
 spoiler INTEGER NOT NULL DEFAULT 0 CHECK(spoiler IN(0,1)),
 read_on TEXT CHECK(read_on IS NULL OR (date(read_on)=read_on AND length(read_on)=10)),
 is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN(0,1)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(profile_id,story_id)
) STRICT;
CREATE INDEX nookview_recent ON nookview_entries(updated_at DESC,id);
CREATE TABLE nookview_likes (
 entry_id TEXT NOT NULL REFERENCES nookview_entries(id) ON DELETE CASCADE,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 PRIMARY KEY(entry_id,profile_id)
) STRICT;
CREATE TABLE service_profiles (
 profile_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 headline TEXT NOT NULL CHECK(length(headline) BETWEEN 3 AND 100),
 bio TEXT NOT NULL DEFAULT '' CHECK(length(bio)<=3000),
 categories TEXT NOT NULL CHECK(json_valid(categories) AND json_type(categories)='array'),
 availability TEXT NOT NULL CHECK(availability IN('free','closed','external')),
 contact_url TEXT NOT NULL DEFAULT '' CHECK(length(contact_url)<=1000),
 portfolio TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(portfolio) AND json_type(portfolio)='array'),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE service_requests (
 id TEXT PRIMARY KEY NOT NULL,
 provider_id TEXT NOT NULL REFERENCES service_profiles(profile_id) ON DELETE CASCADE,
 requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 category TEXT NOT NULL CHECK(category IN('beta','cover','aesthetic','proofreading','illustration','translation','other')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
 brief TEXT NOT NULL CHECK(length(brief) BETWEEN 10 AND 3000),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(provider_id<>requester_id)
) STRICT;
CREATE UNIQUE INDEX service_request_pending ON service_requests(provider_id,requester_id) WHERE status IN('pending','accepted');
CREATE INDEX service_request_inbox ON service_requests(provider_id,status,created_at DESC);
CREATE TRIGGER service_request_created AFTER INSERT ON service_requests BEGIN
 INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key,actor_id)
 SELECT 'service:'||NEW.id,p.user_id,'service_request','Novo pedido de serviço',NEW.title,
 '/designers-e-servicos?tab=requests','service:'||NEW.id,NEW.requester_id FROM profiles p WHERE p.id=NEW.provider_id;
END;
CREATE TRIGGER service_request_changed AFTER UPDATE OF status ON service_requests WHEN OLD.status<>NEW.status BEGIN
 INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key,actor_id)
 SELECT 'service:'||NEW.id||':'||NEW.status,p.user_id,'service_request','Pedido de serviço atualizado',NEW.title,
 '/designers-e-servicos?tab=requests','service:'||NEW.id||':'||NEW.status,
 CASE WHEN NEW.status='cancelled' THEN NEW.requester_id ELSE NEW.provider_id END
 FROM profiles p WHERE p.id=CASE WHEN NEW.status='cancelled' THEN NEW.provider_id ELSE NEW.requester_id END;
END;
