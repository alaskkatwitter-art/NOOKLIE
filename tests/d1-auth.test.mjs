import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Auth } from '../lib/database/d1-auth.ts';

const migration = readFileSync(new URL('../d1/migrations/0001_auth_foundation.sql', import.meta.url), 'utf8');
const hash = 'a'.repeat(64);

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(migration);
  sqlite.prepare(`INSERT INTO auth_accounts (id, username, password_hash, recovery_key_hash)
    VALUES ('alice', 'alice', 'old-password', 'old-recovery'), ('bob', 'bob', 'bob-password', 'bob-recovery')`).run();
  const adapter = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        async run() {
          const result = sqlite.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  return { sqlite, auth: d1Auth(adapter) };
}

test('D1 sessions reject expired, unknown, suspended accounts and SQL injection', async () => {
  const { sqlite, auth } = fixture();
  try {
    await auth.createSession('s1', 'alice', hash, new Date(Date.now() + 86400000).toISOString());
    assert.equal((await auth.session(hash)).user_id, 'alice');
    assert.equal(await auth.session('b'.repeat(64)), null);
    assert.equal(await auth.accountForLogin("alice' OR 1=1 --"), null);
    sqlite.prepare("UPDATE auth_sessions SET expires_at = '2000-01-01T00:00:00Z' WHERE id = 's1'").run();
    assert.equal(await auth.session(hash), null);
    sqlite.prepare("UPDATE auth_accounts SET account_status = 'suspended' WHERE id = 'alice'").run();
    assert.equal(sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n, 0);
    await assert.rejects(auth.createSession('s2', 'alice', hash, new Date(Date.now() + 86400000).toISOString()), /active account/);
    await assert.rejects(auth.createSession('s3', 'missing', hash, new Date(Date.now() + 86400000).toISOString()), /active account/);
    await assert.rejects(auth.session('raw-token'), /Invalid token hash/);
  } finally { sqlite.close(); }
});

test('D1 recovery consumes the key once and atomically revokes only the recovered account sessions', async () => {
  const { sqlite, auth } = fixture();
  try {
    const expiry = new Date(Date.now() + 86400000).toISOString();
    await auth.createSession('a1', 'alice', hash, expiry);
    await auth.createSession('b1', 'bob', 'b'.repeat(64), expiry);
    assert.equal(await auth.completeRecovery('alice', 'wrong', 'new-password', 'new-recovery'), false);
    assert.ok(await auth.session(hash));
    assert.equal(await auth.completeRecovery('alice', 'old-recovery', 'new-password', 'new-recovery'), true);
    assert.equal(await auth.completeRecovery('alice', 'old-recovery', 'raced-password', 'raced-recovery'), false);
    assert.equal(await auth.session(hash), null);
    assert.ok(await auth.session('b'.repeat(64)));
    assert.equal((await auth.accountForLogin('alice')).password_hash, 'new-password');
    await assert.rejects(auth.completeRecovery('alice', 'new-recovery', 'invalid', 'bob-recovery'), /UNIQUE/);
    assert.equal((await auth.accountForLogin('alice')).password_hash, 'new-password');
  } finally { sqlite.close(); }
});

test('D1 rate limit denies excess attempts, resets expired windows, and validates parameters', async () => {
  const { sqlite, auth } = fixture();
  try {
    assert.equal(await auth.consumeRateLimit(hash, 2, 900), true);
    assert.equal(await auth.consumeRateLimit(hash, 2, 900), true);
    assert.equal(await auth.consumeRateLimit(hash, 2, 900), false);
    sqlite.prepare("UPDATE auth_rate_limits SET window_started_at = '2000-01-01 00:00:00+00:00'").run();
    assert.equal(await auth.consumeRateLimit(hash, 2, 900), true);
    assert.equal(sqlite.prepare('SELECT attempts FROM auth_rate_limits').get().attempts, 1);
    await assert.rejects(auth.consumeRateLimit('unhashed', 2, 900), /Invalid token hash/);
    await assert.rejects(auth.consumeRateLimit(hash, 0, 900), /Invalid rate limit/);
    await auth.consumeRateLimit(hash, 2, 900);
    const results = await Promise.all(Array.from({ length: 10 }, () => auth.consumeRateLimit(hash, 2, 900)));
    assert.equal(results.filter(Boolean).length, 0);
  } finally { sqlite.close(); }
});

test('D1 schema rejects invalid states and revocation fails atomically on trigger failure', async () => {
  const { sqlite, auth } = fixture();
  try {
    await auth.createSession('s1', 'alice', hash, new Date(Date.now() + 86400000).toISOString());
    assert.throws(() => sqlite.prepare("UPDATE auth_accounts SET account_status = 'admin' WHERE id = 'alice'").run(), /CHECK/);
    sqlite.exec(`CREATE TRIGGER test_fail_revoke BEFORE DELETE ON auth_sessions
      BEGIN SELECT RAISE(ABORT, 'simulated revoke failure'); END;`);
    await assert.rejects(auth.completeRecovery('alice', 'old-recovery', 'new-password', 'new-recovery'), /simulated revoke failure/);
    assert.equal((await auth.accountForLogin('alice')).password_hash, 'old-password');
    assert.ok(await auth.session(hash));
  } finally { sqlite.close(); }
});
