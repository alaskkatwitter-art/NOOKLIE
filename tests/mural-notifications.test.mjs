import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const migration = await readFile(new URL('20261111020000_mural_post_notifications_and_video_autoplay.sql', migrations), 'utf8');
const social = await readFile(new URL('20261103152626_nooklar_reading_and_scheduling.sql', migrations), 'utf8');
const mentions = await readFile(new URL('20261107154430_volunteer_feedback_mentions_and_banners.sql', migrations), 'utf8');
const notifyFunction = social.match(/create or replace function public\.social_notify\([\s\S]*?\$\$;/i)[0];
const mentionTrigger = mentions.slice(mentions.indexOf('CREATE FUNCTION public.notify_feed_mentions'), mentions.indexOf('CREATE OR REPLACE FUNCTION public.notify_released_chapter'));
const id = number => '00000000-0000-0000-0000-' + String(number).padStart(12, '0');

test('only mural posts notify eligible followers, including media-only posts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE auth_accounts(id uuid, account_status text);
      CREATE TABLE profiles(id uuid, user_id uuid, username text, display_name text, moderation_hidden_at timestamptz,
        social_notifications boolean DEFAULT true);
      CREATE TABLE nook_posts(id uuid DEFAULT gen_random_uuid(), user_id uuid, body text, story_id uuid, news_slug text,
        pinned boolean, moderation_hidden_at timestamptz);
      CREATE TABLE nook_post_media(post_id uuid, media_url text, media_type text, position integer, CHECK (media_type IN ('image', 'video')));
      CREATE TABLE user_notifications(user_id uuid, notification_type text, title text, body text, href text,
        source_key text, actor_id uuid, UNIQUE(user_id, source_key));
      CREATE TABLE follows(follower_id uuid, following_id uuid);
      CREATE TABLE chat_blocks(blocker_id uuid, blocked_id uuid);
      CREATE TABLE profile_mutes(user_id uuid, target_id uuid);
      CREATE FUNCTION public.profile_content_allowed(owner uuid, viewer uuid) RETURNS boolean
        LANGUAGE sql AS $$ SELECT NOT EXISTS (
          SELECT FROM public.chat_blocks WHERE blocker_id = viewer AND blocked_id = owner
        ) $$;
      INSERT INTO profiles(id,user_id,username) VALUES
        ('${id(1)}','${id(11)}','autora'), ('${id(2)}','${id(12)}','leitora'), ('${id(3)}','${id(13)}','silenciou'),
        ('${id(4)}','${id(14)}','bloqueou'), ('${id(5)}','${id(15)}','desativou'), ('${id(6)}','${id(16)}','visitante');
      INSERT INTO auth_accounts SELECT user_id, 'active' FROM profiles;
      INSERT INTO follows SELECT id, '${id(1)}' FROM profiles WHERE id IN ('${id(2)}','${id(3)}','${id(4)}','${id(5)}');
      INSERT INTO chat_blocks VALUES ('${id(4)}','${id(1)}');
      INSERT INTO profile_mutes VALUES ('${id(3)}','${id(1)}');
      UPDATE profiles SET social_notifications = false WHERE id = '${id(5)}';
      INSERT INTO nook_posts(id,user_id,body) VALUES ('${id(20)}','${id(1)}','Post antigo');
      CREATE FUNCTION public.create_feed_media_post(p_profile uuid,p_text text,p_story uuid,p_news text,p_media jsonb)
        RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    `);
    await db.exec(notifyFunction + mentionTrigger + migration);
    assert.deepEqual((await db.query('SELECT publication_origin FROM nook_posts')).rows, [{ publication_origin: 'feed' }]);
    assert.deepEqual((await db.query('SELECT DISTINCT video_autoplay FROM profiles')).rows, [{ video_autoplay: true }]);
    await db.query('INSERT INTO nook_posts(user_id,body) VALUES ($1,$2)', [id(1), 'Direto no feed']);
    const media = JSON.stringify([{ media_url: '/example', media_type: 'video' }]);
    await db.query('SELECT create_feed_media_post($1,$2,NULL,NULL,$3)', [id(1), '', media]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM user_notifications')).rows[0].count, 0);

    await db.query('INSERT INTO nook_posts(id,user_id,body,publication_origin) VALUES ($1,$2,$3,$4)',
      [id(21), id(1), 'Olá, @leitora e @visitante!', 'mural']);
    const uploaded = await db.query('SELECT create_feed_media_post($1,$2,NULL,NULL,$3,$4) AS id', [id(1), '', media, 'mural']);
    const uploadedId = uploaded.rows[0].id;
    assert.deepEqual((await db.query('SELECT user_id, notification_type, href FROM user_notifications ORDER BY user_id, href')).rows,
      [
        { user_id: id(12), notification_type: 'nook_mural_post', href: '/feed?post=' + id(21) },
        { user_id: id(12), notification_type: 'nook_mural_post', href: '/feed?post=' + uploadedId },
        { user_id: id(16), notification_type: 'nook_mention', href: '/feed?post=' + id(21) },
      ]);

    const invalid = JSON.stringify([{ media_url: '/example', media_type: 'unsupported' }]);
    await assert.rejects(db.query('SELECT create_feed_media_post($1,$2,NULL,NULL,$3,$4)', [id(1), '', invalid, 'mural']));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM user_notifications')).rows[0].count, 3);
  } finally {
    await db.close();
  }
});
