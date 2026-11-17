-- Set suppress_notifications='1' before importing historical data. Restore to
-- '0' only after original notification records and source keys are imported.
CREATE TABLE d1_runtime_flags(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(value IN ('0','1'))) STRICT;
INSERT INTO d1_runtime_flags VALUES('suppress_notifications','0');
DROP TRIGGER d1_deliver_notification;
CREATE TRIGGER d1_deliver_notification INSTEAD OF INSERT ON d1_notification_events
WHEN coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
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

DROP TRIGGER d1_announce_event;
CREATE TRIGGER d1_announce_event AFTER INSERT ON story_events
WHEN NEW.active=1 AND julianday(NEW.ends_at)>julianday('now')
AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
BEGIN
 INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
 SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
 a.id,'literary_event',NEW.title,'Novo evento literário no Nooklie. Veja os detalhes e saiba como participar.',
 '/eventos?evento='||NEW.id,'literary-event:'||NEW.id FROM auth_accounts a WHERE a.account_status='active'
 ON CONFLICT(user_id,source_key) DO NOTHING;
END;

DROP TRIGGER d1_activate_event;
CREATE TRIGGER d1_activate_event AFTER UPDATE OF active ON story_events
WHEN NEW.active=1 AND OLD.active=0 AND julianday(NEW.ends_at)>julianday('now')
AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
BEGIN
 INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
 SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
 a.id,'literary_event',NEW.title,'Novo evento literário no Nooklie. Veja os detalhes e saiba como participar.',
 '/eventos?evento='||NEW.id,'literary-event:'||NEW.id FROM auth_accounts a WHERE a.account_status='active'
 ON CONFLICT(user_id,source_key) DO NOTHING;
END;
