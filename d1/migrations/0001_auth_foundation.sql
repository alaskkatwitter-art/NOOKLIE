-- Phase 1 only: no user data and no production cutover.
CREATE TABLE auth_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','suspended'))
) STRICT;

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  expires_at TEXT NOT NULL CHECK (julianday(expires_at) IS NOT NULL),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE auth_rate_limits (
  key_hash TEXT PRIMARY KEY NOT NULL CHECK (length(key_hash) = 64 AND key_hash NOT GLOB '*[^0-9a-f]*'),
  window_started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    CHECK (julianday(window_started_at) IS NOT NULL),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
) STRICT;

-- Password/recovery rotation and session revocation are one atomic statement,
-- including when another request races with recovery.
CREATE TRIGGER auth_rotate_revoke_sessions
AFTER UPDATE OF password_hash, recovery_key_hash ON auth_accounts
WHEN NEW.password_hash IS NOT OLD.password_hash OR NEW.recovery_key_hash IS NOT OLD.recovery_key_hash
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
END;

CREATE TRIGGER auth_suspend_revoke_sessions
AFTER UPDATE OF account_status ON auth_accounts
WHEN NEW.account_status = 'suspended'
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
END;

CREATE TRIGGER auth_session_active_account_insert
BEFORE INSERT ON auth_sessions
WHEN NOT EXISTS (SELECT 1 FROM auth_accounts WHERE id = NEW.user_id AND account_status = 'active')
BEGIN
  SELECT RAISE(ABORT, 'Session requires an active account');
END;

CREATE TRIGGER auth_session_active_account_update
BEFORE UPDATE ON auth_sessions
WHEN NOT EXISTS (SELECT 1 FROM auth_accounts WHERE id = NEW.user_id AND account_status = 'active')
BEGIN
  SELECT RAISE(ABORT, 'Session requires an active account');
END;
