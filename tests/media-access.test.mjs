import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20261106203927_harden_uploads_and_reduce_media_queries.sql', import.meta.url), 'utf8');
const dir = new URL('../supabase/migrations/', import.meta.url);
let actorFunction, profileFunction;
for (const name of (await readdir(dir)).sort()) {
  const source = await readFile(new URL(name, dir), 'utf8');
  actorFunction = source.match(/create or replace function public\.social_actor\([\s\S]*?\$\$;/i)?.[0] || actorFunction;
  profileFunction = source.match(/create or replace function public\.profile_content_allowed\([\s\S]*?\$\$;/i)?.[0] || profileFunction;
}
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('single media authorization preserves private profiles, blocks, drafts, moderation, sessions and Story expiration', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      insert into storage.buckets(id,public) values('avatars',true),('social-stories',true),('private-chat',false);
      create table storage.objects(id int,bucket_id text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated;
      grant all on storage.objects to anon,authenticated;
      create policy accidental_grant on storage.objects for all to anon,authenticated using(true) with check(true);
      insert into storage.objects values(1,'avatars');
      create table auth_accounts(id uuid,account_status text);
      create table profiles(id uuid,user_id uuid,is_private boolean default false,moderation_hidden_at timestamptz,pinned_story_id uuid);
      create table auth_sessions(user_id uuid,token_hash text,expires_at timestamptz);
      create table follows(follower_id uuid,following_id uuid);
      create table chat_blocks(blocker_id uuid,blocked_id uuid);
      create table stories(id uuid,author_id uuid,cover_url text,moderation_hidden_at timestamptz);
      create table chapters(id uuid,story_id uuid,published boolean,banner_url text);
      create table chapter_media(chapter_id uuid,media_url text);
      create table nook_posts(id uuid,user_id uuid,image_url text,moderation_hidden_at timestamptz);
      create table nook_post_media(post_id uuid,media_url text);
      create table social_stories(user_id uuid,media_url text,expires_at timestamptz);
      insert into auth_accounts values('${id(1)}','active'),('${id(2)}','active');
      insert into profiles(id,user_id) values('${id(101)}','${id(1)}'),('${id(102)}','${id(2)}');
      insert into auth_sessions values('${id(1)}','author',now()+interval '1 day'),('${id(2)}','reader',now()+interval '1 day');
      insert into stories values('${id(201)}','${id(101)}','cover',null);
      insert into chapters values('${id(301)}','${id(201)}',false,'banner');
      insert into chapter_media values('${id(301)}','chapter');
      insert into nook_posts values('${id(401)}','${id(101)}','legacy-post',null);
      insert into nook_post_media values('${id(401)}','post');
      insert into social_stories values('${id(101)}','social',now()+interval '1 day');
    `);
    await db.exec(actorFunction + profileFunction + migration);
    const allowed = async (bucket, url, session = null) => (await db.query('select content_media_allowed($1,$2,$3) ok', [session, bucket, [url]])).rows[0].ok;
    assert.equal(await allowed('story-covers','cover'), true, 'covers do not require published chapters');
    assert.equal(await allowed('chapter-media','chapter'), false, 'draft media is private');
    assert.equal(await allowed('chapter-media','banner','author'), true);
    assert.equal(await allowed('nook-media','post'), true);
    assert.equal(await allowed('nook-media','legacy-post'), true);
    assert.equal(await allowed('social-stories','social'), false);
    assert.equal(await allowed('social-stories','social','reader'), false, 'only followers see Stories');
    await db.exec(`insert into follows values('${id(102)}','${id(101)}'); update profiles set is_private=true where id='${id(101)}'`);
    assert.equal(await allowed('story-covers','cover'), false);
    assert.equal(await allowed('story-covers','cover','reader'), true);
    assert.equal(await allowed('social-stories','social','reader'), true);
    await db.exec(`update chapters set published=true; insert into chat_blocks values('${id(101)}','${id(102)}')`);
    for (const [bucket,url] of [['story-covers','cover'],['chapter-media','chapter'],['chapter-media','banner'],['nook-media','post'],['social-stories','social']]) {
      assert.equal(await allowed(bucket,url,'reader'), false, `blocked reader: ${url}`);
    }
    await db.exec(`delete from chat_blocks; update stories set moderation_hidden_at=now()`);
    assert.equal(await allowed('story-covers','cover','reader'), false);
    assert.equal(await allowed('story-covers','cover','author'), true, 'author can preview own cover');
    await db.exec(`update nook_posts set moderation_hidden_at=now(); update social_stories set expires_at=now()-interval '1 second'`);
    assert.equal(await allowed('nook-media','post','author'), false);
    assert.equal(await allowed('social-stories','social','author'), false);
    await db.exec(`update auth_sessions set expires_at=now()-interval '1 second' where token_hash='reader'; update stories set moderation_hidden_at=null`);
    assert.equal(await allowed('story-covers','cover','reader'), false);
    await db.exec(`update auth_accounts set account_status='suspended' where id='${id(1)}'`);
    assert.equal(await allowed('story-covers','cover','author'), false);
    assert.equal(await allowed('private-chat','cover','author'), false);
    assert.equal(await allowed('story-covers','unlinked','author'), false);
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query(`select has_function_privilege('${role}','content_media_allowed(text,text,text[])','EXECUTE') ok`)).rows[0].ok, false);
      await db.exec(`set role ${role}`);
      assert.deepEqual((await db.query('select * from storage.objects')).rows, [], 'restrictive deny wins even over an accidental grant');
      await assert.rejects(db.query("insert into storage.objects values(2,'avatars')"), /row-level security/);
      await db.exec('reset role');
    }
    const bucket = (await db.query("select * from storage.buckets where id='social-stories'")).rows[0];
    assert.equal(bucket.public,false); assert.equal(bucket.file_size_limit,5242880);
    assert.deepEqual((await db.query("select public from storage.buckets where id='avatars'")).rows,[{public:true}]);
  } finally { await db.close(); }
});
