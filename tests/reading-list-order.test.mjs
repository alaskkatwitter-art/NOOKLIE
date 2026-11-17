import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('lists preserve legacy order and serialize additions, owner sorting and removal', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table reading_lists (id uuid primary key, user_id uuid, name text);
      create table reading_list_items (
        id uuid primary key default gen_random_uuid(),
        list_id uuid references reading_lists(id),
        story_id uuid,
        added_at timestamptz default now(),
        unique(list_id, story_id)
      );
    `);
    const owner = '10000000-0000-4000-8000-000000000001';
    const stranger = '10000000-0000-4000-8000-000000000002';
    const list = '20000000-0000-4000-8000-000000000001';
    const library = '20000000-0000-4000-8000-000000000002';
    const stories = ['30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003'];
    await db.query('insert into reading_lists values ($1,$3,\'Favoritas\'),($2,$3,\'Biblioteca\')', [list, library, owner]);
    await db.query(`insert into reading_list_items (list_id,story_id,added_at)
      values ($1,$2,now()-interval '1 day'),($1,$3,now())`, [list, stories[0], stories[1]]);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261117160000_reading_list_images_and_order.sql', import.meta.url), 'utf8'));
    async function order() {
      return (await db.query('select story_id from reading_list_items where list_id=$1 order by position', [list])).rows.map(row => row.story_id);
    }
    async function reorder(actor, ids, listId = list) {
      return (await db.query('select reorder_reading_list($1,$2,$3::uuid[]) as saved', [actor, listId, ids])).rows[0].saved;
    }
    assert.deepEqual(await order(), [stories[1], stories[0]]);
    await db.query('insert into reading_list_items (list_id,story_id) values ($1,$2)', [list, stories[2]]);
    assert.deepEqual(await order(), [stories[1], stories[0], stories[2]]);
    assert.equal(await reorder(stranger, stories), false);
    await assert.rejects(reorder(owner, [stories[0], stories[0], stories[2]]), /List changed/);
    await assert.rejects(reorder(owner, stories.slice(0, 2)), /List changed/);
    assert.equal(await reorder(owner, stories), true);
    assert.deepEqual(await order(), stories);
    await db.query('insert into reading_list_items(list_id,story_id) values ($1,$2) on conflict do nothing', [list, stories[0]]);
    assert.deepEqual(await order(), stories);
    assert.equal(await reorder(owner, [], library), false);
    assert.equal((await db.query('select remove_reading_list_item($1,$2,$3) as removed', [stranger, list, stories[1]])).rows[0].removed, false);
    await db.query('select remove_reading_list_item($1,$2,$3)', [owner, list, stories[1]]);
    assert.deepEqual(await order(), [stories[0], stories[2]]);
    assert.equal(await reorder(owner, [stories[2], stories[0]]), true);
    await db.query('insert into reading_list_items (list_id,story_id) values ($1,$2)', [list, stories[1]]);
    assert.deepEqual(await order(), [stories[2], stories[0], stories[1]]);
  } finally {
    await db.close();
  }
});
