import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('only the sender can change a chat message within two hours and reports keep submitted evidence', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table chat_messages (
        id uuid primary key, thread_id uuid, sender_id uuid, body_cipher text not null,
        created_at timestamptz, media_path text, media_type text, is_sticker boolean, reply_to uuid, cipher_version integer
      );
      create table chat_reports (thread_id uuid, message_id uuid references chat_messages(id));
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261117120000_chat_message_changes.sql', import.meta.url), 'utf8'));
    const sender = '10000000-0000-4000-8000-000000000001';
    const stranger = '10000000-0000-4000-8000-000000000002';
    const thread = '20000000-0000-4000-8000-000000000001';
    const recent = '30000000-0000-4000-8000-000000000001';
    const expired = '30000000-0000-4000-8000-000000000002';
    await db.query(`
      insert into chat_messages values
        ($1,$3,$4,'sent',now()-interval '119 minutes','image.enc','image/jpeg',true,null,2),
        ($2,$3,$4,'expired',now()-interval '2 hours',null,null,false,null,2)
    `, [recent, expired, thread, sender]);
    await db.query('insert into chat_reports(thread_id,message_id) values ($1,$2)', [thread, recent]);
    async function change(actor, id, cipher, revoke) {
      return (await db.query('select * from change_own_chat_message($1,$2,$3,2,$4,$5)',
        [actor, thread, id, cipher, revoke])).rows;
    }
    assert.equal((await change(stranger, recent, 'foreign', false)).length, 0);
    assert.equal((await change(sender, expired, 'late', false)).length, 0);
    assert.equal((await change(sender, expired, 'late', true)).length, 0);
    assert.equal((await change(sender, recent, 'edited', false)).length, 1);
    const [revoked] = await change(sender, recent, 'empty', true);
    assert.equal(revoked.attachment_path, 'image.enc');
    assert.equal((await change(sender, recent, 'resent', false)).length, 0);
    const [message] = (await db.query('select * from chat_messages where id = $1', [recent])).rows;
    assert.equal(message.body_cipher, 'empty');
    assert.equal(message.media_path, null);
    assert.ok(message.revoked_at);
    const [report] = (await db.query('select message_snapshot from chat_reports')).rows;
    assert.equal(report.message_snapshot.body_cipher, 'sent');
    await assert.rejects(db.query('insert into chat_reports(thread_id,message_id) values ($1,$2)', [thread, recent]),
      /Message unavailable/);
  } finally {
    await db.close();
  }
});
