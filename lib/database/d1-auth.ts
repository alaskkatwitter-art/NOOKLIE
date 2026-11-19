import type { NooklieD1 } from './d1';

export interface D1Account {
  id: string;
  username: string;
  password_hash: string;
  recovery_key_hash: string;
  account_status: 'active' | 'suspended';
}

function requireHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid token hash');
}

// Server-side repository. It accepts hashed session tokens, never a user ID
// from the browser as proof of identity. Password verification remains bcrypt.
export function d1Auth(db: NooklieD1) {
  return {
    async accountForLogin(username: string) {
      return db.prepare(`SELECT id, username, password_hash, recovery_key_hash, account_status
        FROM auth_accounts WHERE username = ?`).bind(username).first<D1Account>();
    },
    async register(id: string, username: string, passwordHash: string, recoveryHash: string, officialHash: string | null) {
      if (officialHash !== null) requireHash(officialHash);
      const account = db.prepare(`INSERT INTO auth_accounts (id, username, password_hash, recovery_key_hash)
        SELECT ?1, ?2, ?3, ?4
        WHERE (?2 <> 'nooklie' AND ?5 IS NULL) OR (?2 = 'nooklie' AND EXISTS (
          SELECT 1 FROM official_signup_tokens WHERE singleton = 1 AND used_at IS NULL AND token_hash = ?5
        ))
        ON CONFLICT(username) DO NOTHING`).bind(id, username, passwordHash, recoveryHash, officialHash);
      const profile = db.prepare(`INSERT INTO profiles (id, user_id, username, is_official)
        SELECT id, id, username, username = 'nooklie' FROM auth_accounts WHERE id = ?`).bind(id);
      const claim = db.prepare(`UPDATE official_signup_tokens
        SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE singleton = 1 AND used_at IS NULL AND token_hash = ?1
          AND EXISTS (SELECT 1 FROM auth_accounts WHERE id = ?2 AND username = 'nooklie')`)
        .bind(officialHash, id);
      const results = await db.batch([account, profile, claim]);
      if (results.some(result => !result.success)) throw Error('Unable to register account');
      return results[0].meta.changes === 1;
    },
    async session(tokenHash: string) {
      requireHash(tokenHash);
      return db.prepare(`SELECT s.user_id, s.expires_at FROM auth_sessions s
        JOIN auth_accounts a ON a.id = s.user_id
        WHERE s.token_hash = ? AND a.account_status = 'active'
          AND julianday(s.expires_at) > julianday('now')`)
        .bind(tokenHash).first<{ user_id: string; expires_at: string }>();
    },
    async createSession(id: string, userId: string, tokenHash: string, expiresAt: string) {
      requireHash(tokenHash);
      if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
        throw new Error('Invalid session expiry');
      }
      const result = await db.prepare(`INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)`).bind(id, userId, tokenHash, expiresAt).run();
      if (!result.success) throw new Error('Unable to create session');
    },
    async revokeSession(tokenHash: string) {
      requireHash(tokenHash);
      const result = await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
      if (!result.success) throw new Error('Unable to revoke session');
    },
    async consumeRateLimit(keyHash: string, limit: number, windowSeconds: number) {
      requireHash(keyHash);
      if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
        throw new Error('Invalid rate limit parameters');
      }
      // One UPSERT avoids read/modify/write races between Workers.
      const result = await db.prepare(`INSERT INTO auth_rate_limits (key_hash, window_started_at, attempts)
        VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)
        ON CONFLICT(key_hash) DO UPDATE SET
          attempts = CASE WHEN julianday(window_started_at) <= julianday('now') - ?2 / 86400.0
            THEN 1 ELSE min(attempts + 1, 2147483647) END,
          window_started_at = CASE WHEN julianday(window_started_at) <= julianday('now') - ?2 / 86400.0
            THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE window_started_at END
        RETURNING attempts`).bind(keyHash, windowSeconds).first<{ attempts: number }>();
      if (!result) throw new Error('Rate limit unavailable');
      return result.attempts <= limit;
    },
    async completeRecovery(accountId: string, expectedRecoveryHash: string, newPasswordHash: string, newRecoveryHash: string) {
      if (![accountId, expectedRecoveryHash, newPasswordHash, newRecoveryHash].every(value => typeof value === 'string' && value.length > 0)) {
        throw new Error('Invalid recovery parameters');
      }
      if (expectedRecoveryHash === newRecoveryHash) throw new Error('Recovery key must rotate');
      // Compare-and-swap consumes the old recovery key once. The SQL trigger
      // revokes every old session in this same transaction, without a second query.
      const result = await db.prepare(`UPDATE auth_accounts SET password_hash = ?, recovery_key_hash = ?
        WHERE id = ? AND recovery_key_hash = ? RETURNING id`)
        .bind(newPasswordHash, newRecoveryHash, accountId, expectedRecoveryHash).first<{ id: string }>();
      // D1 meta.changes may include trigger side effects; RETURNING identifies
      // the matched account independently of how many sessions were revoked.
      return result?.id === accountId;
    },
  };
}
