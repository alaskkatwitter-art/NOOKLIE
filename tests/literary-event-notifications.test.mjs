import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('publication and activation notify active accounts once and link to the published event', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table auth_accounts (id uuid primary key, account_status text);
      create table story_events (id uuid primary key, title text, active boolean, ends_at timestamptz);
      create table user_notifications (user_id uuid, notification_type text, title text, body text, href text,
        source_key text, unique(user_id, source_key));
      insert into auth_accounts values (gen_random_uuid(), 'active'), (gen_random_uuid(), 'suspended');
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261117121000_literary_event_notifications.sql', import.meta.url), 'utf8'));
    const event = '10000000-0000-4000-8000-000000000001';
    const draft = '10000000-0000-4000-8000-000000000002';
    await db.query(`insert into story_events values
      ($1,'Natal entre Histórias',true,now()+interval '1 month'),
      ($2,'Próximo evento',false,now()+interval '1 month')`, [event, draft]);
    await db.query('update story_events set title = $2 where id = $1', [event, 'Natal entre Histórias atualizado']);
    await db.query('update story_events set active = false where id = $1', [event]);
    await db.query('update story_events set active = true where id = $1', [event]);
    assert.deepEqual((await db.query('select title, href from user_notifications')).rows,
      [{ title: 'Natal entre Histórias', href: '/eventos?evento=' + event }]);
    await db.query('update story_events set active = true where id = $1', [draft]);
    const [result] = (await db.query('select notify_literary_event($1) as sent', [draft])).rows;
    assert.equal(result.sent, 0);
    assert.equal((await db.query('select * from user_notifications')).rows.length, 2);
  } finally {
    await db.close();
  }
});
