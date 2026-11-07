import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const migration = await readFile(new URL('20261107154430_volunteer_feedback_mentions_and_banners.sql', migrations), 'utf8');
const social = await readFile(new URL('20261103152626_nooklar_reading_and_scheduling.sql', migrations), 'utf8');
const notify = social.match(/create or replace function public\.social_notify\([\s\S]*?\$\$;/i)[0];
const id = number => '00000000-0000-0000-0000-' + String(number).padStart(12, '0');

test('feedback migration preserves private banners and sends eligible mentions and releases to the right routes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table storage.buckets(id text, public boolean, allowed_mime_types text[]);
      insert into storage.buckets values ('chapter-media', false, array['image/png']);
      create table auth_accounts(id uuid, account_status text);
      create table profiles(id uuid, user_id uuid, username text, display_name text, moderation_hidden_at timestamptz,
        social_notifications boolean default true, chapter_notifications boolean default true);
      create table nook_posts(id uuid, user_id uuid, body text, moderation_hidden_at timestamptz);
      create table user_notifications(user_id uuid, notification_type text, title text, body text, href text,
        source_key text, actor_id uuid, unique(user_id, source_key));
      create table chat_blocks(blocker_id uuid, blocked_id uuid);
      create table profile_mutes(user_id uuid, target_id uuid);
      create table follows(follower_id uuid, following_id uuid);
      create table reading_lists(id uuid, user_id uuid);
      create table reading_list_items(list_id uuid, story_id uuid);
      create table released_stories(id uuid, author_id uuid, title text);
      create table chapters(id uuid, story_id uuid, published boolean);
      create function public.profile_content_allowed(uuid,uuid) returns boolean
        language sql as $$ select $2 <> '${id(6)}'::uuid $$;
      insert into profiles(id,user_id,username) values
        ('${id(1)}','${id(11)}','autora'), ('${id(2)}','${id(12)}','leitora'),
        ('${id(3)}','${id(13)}','bloqueada'), ('${id(4)}','${id(14)}','ausente'),
        ('${id(5)}','${id(15)}','outra'), ('${id(6)}','${id(16)}','semacesso');
      insert into auth_accounts select user_id, case username when 'ausente' then 'suspended' else 'active' end from profiles;
      insert into chat_blocks values ('${id(3)}','${id(1)}');
      insert into follows values ('${id(2)}','${id(1)}');
      insert into released_stories values ('${id(20)}','${id(1)}','Minha obra');
      insert into chapters values ('${id(30)}','${id(20)}',true);
      insert into user_notifications(user_id,notification_type,href,source_key)
        values ('${id(14)}','chapter_release','/capitulo/${id(30)}','chapter-release:${id(30)}');
    `);
    await db.exec(notify + migration);
    await db.query('insert into nook_posts(id,user_id,body) values ($1,$2,$3)', [
      id(40), id(1),
      '@Leitora e @leitora, @autora @bloqueada @ausente @semacesso pessoa@outra.com https://site.test/@outra',
    ]);
    const mentions = await db.query("select user_id,href from user_notifications where notification_type='nook_mention'");
    assert.deepEqual(mentions.rows, [{ user_id: id(12), href: '/feed?post=' + id(40) }]);
    await db.query('select notify_released_chapter($1)', [id(30)]);
    const notices = await db.query("select href from user_notifications where notification_type='chapter_release' order by user_id");
    assert.deepEqual(notices.rows.map(row => row.href), ['/capitulo-publicado/' + id(30), '/historia/' + id(20), '/historia/' + id(20)]);
    const bucket = (await db.query('select public,allowed_mime_types from storage.buckets')).rows[0];
    assert.equal(bucket.public, false);
    assert.ok(bucket.allowed_mime_types.includes('video/mp4'));
  } finally {
    await db.close();
  }
});
