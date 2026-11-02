import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const rows = async query => (await db.query(query)).rows;
const home = async () => (await rows(`select public.discovery_home('${id(1)}') as data`))[0].data;

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table auth_accounts(id uuid primary key,account_status text default 'active');
    create table profiles(id uuid primary key,user_id uuid,username text,display_name text,moderation_hidden_at timestamptz);
    create table stories(id uuid primary key,author_id uuid,title text,description text,cover_url text,status text,rating text,created_at timestamptz default now(),updated_at timestamptz default now(),moderation_hidden_at timestamptz,fandom text default '',work_has_ai boolean default false,cover_has_ai boolean default false,has_content_warnings boolean default false,content_warnings text default '');
    create table chapters(id uuid primary key,story_id uuid,title text,chapter_number int,published boolean,created_at timestamptz default now(),original_published_at timestamptz);
    create table tag_categories(id uuid primary key,name text,slug text);
    create table tags(id uuid primary key,name text,slug text,category_id uuid);
    create table story_tags(story_id uuid,tag_id uuid);
    create table reading_progress(user_id uuid,story_id uuid,chapter_id uuid,progress_percent numeric,position integer,updated_at timestamptz,primary key(user_id,story_id));
    insert into auth_accounts(id) values('${id(1)}'),('${id(2)}');
    insert into auth_accounts values('${id(3)}','suspended');
    insert into profiles(id,user_id,username) values('${id(101)}','${id(1)}','reader'),('${id(102)}','${id(2)}','writer'),('${id(103)}','${id(3)}','suspended-writer');
    insert into stories(id,author_id,title,fandom) values('${id(201)}','${id(102)}','Corações de Hogwarts','Harry Potter'),('${id(202)}','${id(102)}','Outra aventura','Marvel'),('${id(203)}','${id(102)}','Oculta','Harry Potter'),('${id(204)}','${id(102)}','Rascunho','Harry Potter'),('${id(205)}','${id(103)}','Autor suspenso','Harry Potter'),('${id(206)}','${id(102)}','Novo romance','Harry Potter');
    update stories set moderation_hidden_at=now() where id='${id(203)}';
    insert into chapters(id,story_id,title,chapter_number,published) values('${id(301)}','${id(201)}','Primeiro',1,true),('${id(302)}','${id(202)}','Primeiro',1,true),('${id(303)}','${id(203)}','Primeiro',1,true),('${id(304)}','${id(204)}','Primeiro',1,false),('${id(305)}','${id(205)}','Primeiro',1,true),('${id(306)}','${id(206)}','Primeiro',1,true);
    insert into tag_categories values('${id(401)}','Gênero','genre');
    insert into tags values('${id(402)}','Romance','romance','${id(401)}');
    insert into story_tags values('${id(201)}','${id(402)}'),('${id(206)}','${id(402)}');
  `);
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
  const migration = files.find(f => f.endsWith('_personalized_discovery.sql'));
  await db.exec(await readFile(new URL(migration ? `../supabase/migrations/${migration}` : '../supabase/discovery-home.sql', import.meta.url), 'utf8'));
});
after(async () => db.close());

test('search finds accents, word order, fandom, genre and author, with exact title first', async () => {
  for (const query of ['coracoes', 'Hogwarts coracoes', 'Harry Potter', 'Romance', 'writer']) {
    const result = await rows(`select * from search_public_stories('${query}')`);
    assert.ok(result.some(s => s.id === id(201)), query);
    assert.ok(result.every(s => ![id(203),id(204),id(205)].includes(s.id)));
  }
  const result = await rows("select * from search_public_stories('Corações de Hogwarts')");
  assert.equal(result[0].id,id(201));
  const filtered = await rows("select * from search_public_stories(null,array['harry-potter'])");
  assert.deepEqual(new Set(filtered.map(s=>s.id)),new Set([id(201),id(206)]));
  assert.deepEqual(new Set((await rows('select * from discovery_sitemap()')).map(s=>s.id)),new Set([id(201),id(202),id(206)]));
});

test('progress is owned by the authenticated profile; daily engagement is idempotent and authors cannot boost their own works', async () => {
  for (let n=0;n<3;n++) await rows(`select record_discovery_activity('${id(1)}','${id(201)}','${id(301)}',42,4200,true)`);
  assert.equal((await rows('select count(*)::int n from story_daily_engagement'))[0].n,1);
  const progress=(await rows('select * from reading_progress'))[0];assert.equal(progress.user_id,id(101));assert.equal(progress.chapter_id,id(301));assert.equal(Number(progress.progress_percent),42);
  const result=await rows(`select record_discovery_activity('${id(1)}','${id(201)}','${id(302)}',50,5000,true) ok`);assert.equal(result[0].ok,false);
  await rows(`select record_discovery_activity('${id(2)}','${id(201)}')`);assert.equal((await rows('select count(*)::int n from story_daily_engagement'))[0].n,1);
  for(const story of [203,204,205])assert.equal((await rows(`select record_discovery_activity('${id(1)}','${id(story)}') ok`))[0].ok,false);
});

test('favorite fandoms restrict every recommendation shelf without hiding existing reading progress', async () => {
  await rows(`select record_discovery_activity('${id(1)}','${id(202)}','${id(302)}',10,1000,false)`);
  await db.exec(`insert into discovery_preferences values('${id(1)}',array['Harry Potter'],now())`);
  const data=await home();
  assert.ok(data.continue_reading.some(s=>s.id===id(202)));
  for(const key of ['for_you','weekly','most_viewed','most_read','new_fandom','new_voices'])assert.ok(data[key].every(s=>s.fandom==='Harry Potter'),key);
  assert.ok(data.for_you.some(s=>s.id===id(206)));
  assert.equal(data.most_read[0].reads,1);
  assert.ok(data.new_voices.length<=2);
});

test('active event shelves contain only public participating works matching favorites', async () => {
  await db.exec(`insert into story_events(id,title,starts_at,ends_at,created_by) values('${id(501)}','Evento ativo',now()-interval '1 day',now()+interval '1 day','${id(2)}'),('${id(502)}','Encerrado',now()-interval '5 days',now()-interval '1 day','${id(2)}');insert into story_event_entries(event_id,story_id) values('${id(501)}','${id(201)}'),('${id(501)}','${id(202)}'),('${id(501)}','${id(203)}');`);
  const data=await home();assert.equal(data.events.length,1);assert.deepEqual(data.events[0].stories.map(s=>s.id),[id(201)]);
});

test('browser database roles cannot read private preferences or progress metrics or execute privileged discovery functions', async () => {
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from discovery_preferences'));
    await assert.rejects(db.query('select * from story_daily_engagement'));
    await assert.rejects(db.query(`select discovery_home('${id(1)}')`));
    await assert.rejects(db.query(`select record_discovery_activity('${id(1)}','${id(201)}')`));
    await db.exec('reset role');
  }
});

test('favorite choices validate limits and deduplicate spelling without allowing ownership fields', async () => {
  const source=await readFile(new URL('../lib/discovery/preferences.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
  const {favoriteFandoms}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  assert.deepEqual(favoriteFandoms([' Harry Potter ','harry potter']),['harry potter']);
  assert.equal(favoriteFandoms(['']),null);assert.equal(favoriteFandoms(['x'.repeat(101)]),null);assert.equal(favoriteFandoms(Array(31).fill('Harry')),null);
});
