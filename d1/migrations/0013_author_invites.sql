-- Invitations record completed new registrations, never visits or logins.
CREATE TABLE author_invite_participants (
  author_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE author_invite_registrations (
  reader_user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX author_invite_registrations_author_idx ON author_invite_registrations(author_id, created_at DESC);
CREATE TRIGGER author_invite_registration_notification AFTER INSERT ON author_invite_registrations
BEGIN
  INSERT INTO d1_notification_events(target_id,actor_id,kind,phrase,href,source_key)
  SELECT NEW.author_id,p.id,'author_invite_signup','chegou ao Nooklie pelo seu convite!',
    '/convites','author-invite:'||NEW.reader_user_id
  FROM profiles p WHERE p.user_id=NEW.reader_user_id;
END;
