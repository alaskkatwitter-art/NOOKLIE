-- Phase 7: preserve ciphertext and existing key versions. No keys or plaintext here.

CREATE TABLE "chat_audit_access" (
  "id" TEXT NOT NULL,
  "admin_user_id" TEXT NOT NULL,
  "report_ids" TEXT NOT NULL CHECK("report_ids" IS NULL OR json_valid("report_ids")) CHECK(json_type("report_ids")='array'),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "chat_audit_access_pkey" PRIMARY KEY (id),
  CONSTRAINT "chat_audit_access_admin_user_id_fkey" FOREIGN KEY (admin_user_id) REFERENCES auth_accounts(id)
) STRICT;

CREATE TABLE "chat_group_invite_links" (
  "thread_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  CONSTRAINT "chat_group_invite_links_token_hash_check" CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "chat_group_invite_links_pkey" PRIMARY KEY (thread_id),
  CONSTRAINT "chat_group_invite_links_token_hash_key" UNIQUE (token_hash),
  CONSTRAINT "chat_group_invite_links_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT "chat_group_invite_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "chat_group_members" (
  "thread_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "joined_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "chat_group_members_status_check" CHECK ((status IN ('pending', 'accepted'))),
  CONSTRAINT "chat_group_members_pkey" PRIMARY KEY (thread_id, profile_id),
  CONSTRAINT "chat_group_members_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT "chat_group_members_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "body_cipher" TEXT NOT NULL,
  "media_path" TEXT,
  "media_type" TEXT,
  "reply_to" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "read_at" TEXT,
  "is_sticker" INTEGER NOT NULL DEFAULT 0 CHECK("is_sticker" IN (0,1)),
  "cipher_version" INTEGER,
  "edited_at" TEXT,
  "revoked_at" TEXT,
  CONSTRAINT "chat_messages_body_cipher_check" CHECK ((length(body_cipher) <= 16000)),
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "chat_messages_reply_to_fkey" FOREIGN KEY (reply_to) REFERENCES chat_messages(id) ON DELETE SET NULL,
  CONSTRAINT "chat_messages_media_type_check" CHECK ((media_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/mp4'))),
  CONSTRAINT "chat_sticker_is_image" CHECK(is_sticker=0 OR coalesce(media_type LIKE 'image/%',0)),
  CONSTRAINT "chat_v2_media_path" CHECK(cipher_version=1 OR media_path IS NULL OR media_path='v2/'||thread_id||'/'||id||'.enc'),
  CHECK(cipher_version IS NULL OR cipher_version IN (1,2))
) STRICT;

CREATE TABLE "chat_reports" (
  "id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "message_id" TEXT,
  "reason" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "message_snapshot" TEXT CHECK("message_snapshot" IS NULL OR json_valid("message_snapshot")),
  CONSTRAINT "chat_reports_reason_check" CHECK (((length(reason) >= 3) AND (length(reason) <= 2000))),
  CONSTRAINT "chat_reports_status_check" CHECK ((status IN ('pending', 'reviewed'))),
  CONSTRAINT "chat_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "chat_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES profiles(id),
  CONSTRAINT "chat_reports_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES chat_threads(id),
  CONSTRAINT "chat_reports_message_id_fkey" FOREIGN KEY (message_id) REFERENCES chat_messages(id)
) STRICT;

CREATE TABLE "chat_threads" (
  "id" TEXT NOT NULL,
  "initiator_id" TEXT NOT NULL,
  "recipient_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "kind" TEXT NOT NULL DEFAULT 'direct',
  "name" TEXT,
  "avatar_path" TEXT,
  CONSTRAINT "chat_threads_status_check" CHECK ((status IN ('pending', 'accepted', 'spam'))),
  CONSTRAINT "chat_threads_check" CHECK ((initiator_id <> recipient_id)),
  CONSTRAINT "chat_threads_pkey" PRIMARY KEY (id),
  CONSTRAINT "chat_threads_initiator_id_fkey" FOREIGN KEY (initiator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "chat_threads_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "chat_threads_kind_check" CHECK ((kind IN ('direct', 'group'))),
  CONSTRAINT "chat_threads_name_check" CHECK (((length(name) >= 1) AND (length(name) <= 60))),
  CONSTRAINT "chat_thread_shape" CHECK ((((kind = 'direct') AND (recipient_id IS NOT NULL) AND (name IS NULL)) OR ((kind = 'group') AND (recipient_id IS NULL) AND (name IS NOT NULL)))),
  CONSTRAINT "chat_group_avatar_path_check" CHECK(avatar_path IS NULL OR(kind='group' AND substr(avatar_path,1,length(id)+1)=id||'/' AND
    ((substr(avatar_path,-5)='.webp' AND length(avatar_path)>length(id)+6 AND substr(avatar_path,length(id)+2,length(avatar_path)-length(id)-6) NOT GLOB '*[^a-f0-9-]*') OR
     (substr(avatar_path,-4) IN ('.jpg','.png') AND length(avatar_path)>length(id)+5 AND substr(avatar_path,length(id)+2,length(avatar_path)-length(id)-5) NOT GLOB '*[^a-f0-9-]*'))))
) STRICT;

CREATE INDEX chat_audit_admin_idx ON chat_audit_access (admin_user_id);
CREATE INDEX chat_group_members_profile_idx ON chat_group_members (profile_id, thread_id);
CREATE INDEX chat_messages_thread_idx ON chat_messages (thread_id, created_at DESC, id);
CREATE INDEX chat_messages_sender_idx ON chat_messages (sender_id, created_at DESC);
CREATE INDEX chat_messages_reply_idx ON chat_messages (reply_to);
CREATE INDEX chat_messages_thread_version_idx ON chat_messages (thread_id, cipher_version, created_at DESC, id DESC);
CREATE INDEX chat_reports_reporter_idx ON chat_reports (reporter_id);
CREATE INDEX chat_reports_thread_idx ON chat_reports (thread_id);
CREATE INDEX chat_reports_message_idx ON chat_reports (message_id);
CREATE INDEX chat_initiator_idx ON chat_threads (initiator_id, updated_at DESC);
CREATE INDEX chat_recipient_idx ON chat_threads (recipient_id, updated_at DESC);
CREATE UNIQUE INDEX chat_pair_idx ON chat_threads (min(initiator_id, recipient_id), max(initiator_id, recipient_id)) WHERE (kind = 'direct');

CREATE TRIGGER d1_group_capacity BEFORE INSERT ON chat_group_members
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM chat_threads WHERE id=NEW.thread_id AND kind='group') THEN RAISE(ABORT,'Not a group') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM chat_group_members WHERE thread_id=NEW.thread_id AND profile_id=NEW.profile_id)
  AND(SELECT count(*) FROM chat_group_members WHERE thread_id=NEW.thread_id)>=15 THEN RAISE(ABORT,'Group limit is 15') END;
END;
CREATE TRIGGER d1_group_membership_identity BEFORE UPDATE OF thread_id,profile_id ON chat_group_members
WHEN NEW.thread_id<>OLD.thread_id OR NEW.profile_id<>OLD.profile_id
BEGIN SELECT RAISE(ABORT,'Membership identity is immutable'); END;
CREATE TRIGGER d1_group_leave AFTER DELETE ON chat_group_members
BEGIN
 DELETE FROM chat_group_invite_links WHERE thread_id=OLD.thread_id AND created_by=OLD.profile_id;
 UPDATE chat_threads SET initiator_id=(SELECT profile_id FROM chat_group_members WHERE thread_id=OLD.thread_id
  ORDER BY (status='accepted') DESC,joined_at,profile_id LIMIT 1)
 WHERE id=OLD.thread_id AND kind='group' AND initiator_id=OLD.profile_id AND EXISTS(SELECT 1 FROM chat_group_members WHERE thread_id=OLD.thread_id);
END;
CREATE TRIGGER d1_report_evidence_immutable BEFORE UPDATE OF message_snapshot ON chat_reports
WHEN OLD.message_snapshot IS NOT NULL AND NEW.message_snapshot IS NOT OLD.message_snapshot
BEGIN SELECT RAISE(ABORT,'Reported evidence is immutable'); END;
CREATE TRIGGER d1_chat_reply_thread BEFORE INSERT ON chat_messages
WHEN NEW.reply_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM chat_messages p WHERE p.id=NEW.reply_to AND p.thread_id=NEW.thread_id)
BEGIN SELECT RAISE(ABORT,'Reply belongs to another conversation'); END;

CREATE VIEW d1_chat_access AS
SELECT a.token_hash,a.profile_id AS actor_id,t.*,CASE WHEN t.kind='group' THEN mine.status ELSE t.status END AS member_status,
 CASE WHEN t.kind='direct' THEN EXISTS(SELECT 1 FROM chat_blocks b WHERE
  (b.blocker_id=t.initiator_id AND b.blocked_id=t.recipient_id) OR (b.blocked_id=t.initiator_id AND b.blocker_id=t.recipient_id))
 ELSE EXISTS(SELECT 1 FROM chat_blocks b JOIN chat_group_members peer ON peer.thread_id=t.id AND peer.status='accepted'
  WHERE(b.blocker_id=a.profile_id AND b.blocked_id=peer.profile_id)OR(b.blocked_id=a.profile_id AND b.blocker_id=peer.profile_id)) END AS blocked
FROM d1_social_actors a JOIN chat_threads t ON
 (t.kind='direct' AND a.profile_id IN(t.initiator_id,t.recipient_id)) OR
 (t.kind='group' AND EXISTS(SELECT 1 FROM chat_group_members m WHERE m.thread_id=t.id AND m.profile_id=a.profile_id))
LEFT JOIN chat_group_members mine ON mine.thread_id=t.id AND mine.profile_id=a.profile_id;

CREATE VIEW d1_chat_group_commands AS SELECT CAST(NULL AS TEXT) AS id,CAST(NULL AS TEXT) AS token_hash,
 CAST(NULL AS TEXT) AS name,CAST(NULL AS TEXT) AS members WHERE 0;
CREATE TRIGGER d1_create_chat_group INSTEAD OF INSERT ON d1_chat_group_commands
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM d1_social_actors WHERE token_hash=NEW.token_hash)
  OR length(trim(NEW.name)) NOT BETWEEN 1 AND 60 THEN RAISE(ABORT,'Invalid group') END;
 SELECT CASE WHEN NOT json_valid(NEW.members) OR json_type(NEW.members)<>'array' OR json_array_length(NEW.members) NOT BETWEEN 1 AND 14
  OR EXISTS(SELECT 1 FROM json_each(NEW.members) WHERE type<>'text')
  OR (SELECT count(*) FROM json_each(NEW.members))<>(SELECT count(DISTINCT value) FROM json_each(NEW.members))
  OR EXISTS(SELECT 1 FROM json_each(NEW.members) WHERE value=(SELECT profile_id FROM d1_social_actors WHERE token_hash=NEW.token_hash))
  THEN RAISE(ABORT,'Choose 2 to 15 distinct people including yourself') END;
 SELECT CASE WHEN(SELECT count(*) FROM chat_threads WHERE initiator_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=NEW.token_hash)
  AND julianday(created_at)>julianday('now','-1 hour'))>=10 THEN RAISE(ABORT,'Too many requests') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.members) j WHERE NOT EXISTS(SELECT 1 FROM profiles p JOIN auth_accounts a ON a.id=p.user_id
  WHERE p.id=j.value AND p.moderation_hidden_at IS NULL AND a.account_status='active')) THEN RAISE(ABORT,'Profile unavailable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM chat_blocks b WHERE b.blocker_id IN(
  SELECT value FROM json_each(NEW.members) UNION SELECT profile_id FROM d1_social_actors WHERE token_hash=NEW.token_hash)
  AND b.blocked_id IN(SELECT value FROM json_each(NEW.members) UNION SELECT profile_id FROM d1_social_actors WHERE token_hash=NEW.token_hash))
  THEN RAISE(ABORT,'Group unavailable') END;
 INSERT INTO chat_threads(id,initiator_id,kind,name,status)
  SELECT NEW.id,profile_id,'group',trim(NEW.name),'accepted' FROM d1_social_actors WHERE token_hash=NEW.token_hash;
 INSERT INTO chat_group_members(thread_id,profile_id,status)
  SELECT NEW.id,profile_id,'accepted' FROM d1_social_actors WHERE token_hash=NEW.token_hash;
 INSERT INTO chat_group_members(thread_id,profile_id,status) SELECT NEW.id,value,'pending' FROM json_each(NEW.members);
END;

CREATE TRIGGER d1_chat_request_notice AFTER INSERT ON chat_threads WHEN NEW.kind='direct'
BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 VALUES(NEW.recipient_id,NEW.initiator_id,'chat_request','enviou uma solicitação de conversa.','/chat?thread='||NEW.id,'chat-request:'||NEW.id);
END;
CREATE TRIGGER d1_group_invite_notice AFTER INSERT ON chat_group_members WHEN NEW.status='pending'
BEGIN
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT NEW.profile_id,t.initiator_id,'chat_request','convidou você para um grupo.','/chat?thread='||t.id,'group-invite:'||t.id
 FROM chat_threads t WHERE t.id=NEW.thread_id;
END;
CREATE TRIGGER d1_chat_message_notice AFTER INSERT ON chat_messages
BEGIN
 UPDATE chat_threads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.thread_id;
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT CASE WHEN t.initiator_id=NEW.sender_id THEN t.recipient_id ELSE t.initiator_id END,
 NEW.sender_id,'chat_message','enviou uma mensagem privada.','/chat?thread='||t.id,'chat-message:'||NEW.id
 FROM chat_threads t WHERE t.id=NEW.thread_id AND t.kind='direct';
 INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
 SELECT m.profile_id,NEW.sender_id,'chat_message','enviou uma mensagem no grupo.','/chat?thread='||NEW.thread_id,'chat-message:'||NEW.id
 FROM chat_group_members m WHERE m.thread_id=NEW.thread_id AND m.status='accepted' AND m.profile_id<>NEW.sender_id;
END;
