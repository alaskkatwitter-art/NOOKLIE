-- A published opportunity is announced once, including scheduled openings.
CREATE TABLE opportunity_announcements (
  opportunity_id TEXT PRIMARY KEY NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  announced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TRIGGER d1_deliver_opportunity_announcement AFTER INSERT ON opportunity_announcements
WHEN coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
BEGIN
  INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
  SELECT lower(hex(randomblob(16))),a.id,'opportunity_open',
    'Inscrições abertas: '||o.title,
    'Há '||o.openings||' vaga(s) nesta seleção. Confira os requisitos e o prazo para se candidatar.',
    '/oportunidades','opportunity-open:'||o.id
  FROM opportunities o CROSS JOIN auth_accounts a
  WHERE o.id=NEW.opportunity_id AND o.status='open'
    AND julianday(o.opens_at)<=julianday(NEW.announced_at) AND julianday(o.closes_at)>julianday(NEW.announced_at)
    AND a.account_status='active'
  ON CONFLICT(user_id,source_key) DO NOTHING;
END;
CREATE TRIGGER d1_announce_opportunity AFTER INSERT ON opportunities
WHEN NEW.status='open' AND julianday(NEW.opens_at)<=julianday('now') AND julianday(NEW.closes_at)>julianday('now')
AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
BEGIN
  INSERT INTO opportunity_announcements(opportunity_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
END;
CREATE TRIGGER d1_open_opportunity AFTER UPDATE OF status,opens_at,closes_at ON opportunities
WHEN NEW.status='open' AND julianday(NEW.opens_at)<=julianday('now') AND julianday(NEW.closes_at)>julianday('now')
AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
BEGIN
  INSERT INTO opportunity_announcements(opportunity_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
END;
-- Announce a newly published event, or an expired event made available again.
-- Keep the original source key so edits and republication never duplicate notices.
DROP TRIGGER d1_activate_event;
CREATE TRIGGER d1_activate_event AFTER UPDATE OF active,ends_at ON story_events
WHEN NEW.active=1 AND (OLD.active=0 OR julianday(OLD.ends_at)<=julianday('now'))
AND julianday(NEW.ends_at)>julianday('now')
AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
BEGIN
 INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
 SELECT lower(hex(randomblob(16))),a.id,'literary_event',NEW.title,
 'Novo evento literário no Nooklie. Veja os detalhes e saiba como participar.',
 '/eventos?evento='||NEW.id,'literary-event:'||NEW.id
 FROM auth_accounts a WHERE a.account_status='active'
 ON CONFLICT(user_id,source_key) DO NOTHING;
END;
