import assert from 'node:assert/strict';import{readFile,readdir}from'node:fs/promises';import{before,after,test}from'node:test';import{PGlite}from'@electric-sql/pglite';
const db=new PGlite();const assertFalse=async q=>assert.equal(Object.values((await rows(q))[0])[0],false);const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');const rows=async q=>(await db.query(q)).rows;
before(async()=>{await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table auth_accounts(id uuid primary key,account_status text default 'active');
    create table profiles(id uuid primary key,user_id uuid,username text,display_name text,moderation_hidden_at timestamptz);
    create table stories(id uuid primary key,author_id uuid,title text,description text,cover_url text,status text,rating text,created_at timestamptz default now(),updated_at timestamptz default now(),moderation_hidden_at timestamptz,fandom text default '',work_has_ai boolean default false,cover_has_ai boolean default false,has_content_warnings boolean default false,content_warnings text default '');
    create table chapters(id uuid primary key,story_id uuid,title text,chapter_number int,body text,published boolean,created_at timestamptz default now(),original_published_at timestamptz);
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
  `);await db.exec(`
alter table profiles add column bio text,add column avatar_url text,add column cover_url text,add column verified boolean,add column is_official boolean;
create table auth_sessions(id uuid default gen_random_uuid(),user_id uuid,token_hash text,expires_at timestamptz);
insert into auth_sessions(user_id,token_hash,expires_at)values('${id(1)}','reader-token',now()+interval '1 day'),('${id(2)}','writer-token',now()+interval '1 day'),('${id(3)}','suspended-token',now()+interval '1 day');
create table user_notifications(id uuid default gen_random_uuid(),user_id uuid,notification_type text,title text,body text,href text,created_at timestamptz default now(),read_at timestamptz);
create table follows(follower_id uuid,following_id uuid,primary key(follower_id,following_id));
create table chapter_likes(chapter_id uuid,user_id uuid);create table story_likes(story_id uuid,user_id uuid);
create table comments(id uuid primary key default gen_random_uuid(),chapter_id uuid,user_id uuid,body text,parent_comment_id uuid);
create table comment_likes(comment_id uuid,user_id uuid);
create table nook_posts(id uuid primary key default gen_random_uuid(),user_id uuid,story_id uuid,body text);
create table nook_comments(id uuid primary key default gen_random_uuid(),post_id uuid,author_id uuid,parent_id uuid,content text);
create table nook_comment_reactions(id uuid default gen_random_uuid(),comment_id uuid,user_id uuid);
create table nook_post_reactions(id uuid default gen_random_uuid(),post_id uuid,user_id uuid);
create table nook_saved_posts(id uuid default gen_random_uuid(),post_id uuid,user_id uuid);
create table reading_lists(id uuid primary key,user_id uuid);create table reading_list_items(id uuid default gen_random_uuid(),list_id uuid,story_id uuid);
create table posts(id uuid default gen_random_uuid(),user_id uuid,chapter_id uuid);create table post_likes(post_id uuid,user_id uuid);
create table nook_post_media(id uuid);create table chapter_media(id uuid);create table social_stories(id uuid);
`);const files=await readdir(new URL('../supabase/migrations/',import.meta.url));await db.exec(await readFile(new URL('../supabase/migrations/'+files.find(f=>f.endsWith('_personalized_discovery.sql')),import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/20261102195927_private_chat_social_privacy.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/migrations/20261104120000_original_story_catalog.sql',import.meta.url),'utf8'));});after(()=>db.close());
test('private profiles require owner-approved follows and disappear from public search',async()=>{await db.exec(`update profiles set is_private=true where id='${id(102)}'`);assert.equal((await rows(`select profile_content_allowed('${id(102)}',null) ok`))[0].ok,false);assert.equal((await rows("select count(*)::int n from search_public_stories('Hogwarts')"))[0].n,0);await rows(`select social_follow('reader-token','${id(102)}','follow')`);assert.equal((await rows('select count(*)::int n from follows'))[0].n,0);await assert.rejects(rows(`select social_follow('reader-token','${id(102)}','accept')`));await rows(`select social_follow('writer-token','${id(101)}','accept')`);assert.equal((await rows(`select profile_content_allowed('${id(102)}','${id(101)}') ok`))[0].ok,true);assert.equal((await rows(`select count(*)::int n from search_visible_stories('${id(101)}','Hogwarts')`))[0].n,1);});
test('chat acceptance, blocks, sessions and same-thread replies are enforced in SQL',async()=>{assert.equal((await rows("select social_actor('forged') id"))[0].id,null);assert.equal((await rows("select social_actor('suspended-token') id"))[0].id,null);const t=(await rows(`select chat_request('reader-token','${id(102)}') id`))[0].id;await assertFalse(`select chat_send('reader-token','${t}','${id(700)}','encrypted')`);await assertFalse(`select chat_action('reader-token','${t}','accept')`);await rows(`select chat_action('writer-token','${t}','accept')`);await rows(`select chat_send('reader-token','${t}','${id(700)}','encrypted')`);await rows(`select chat_send('writer-token','${t}','${id(701)}','encrypted','${id(700)}')`);await assertFalse(`select chat_send('reader-token','${t}','${id(702)}','encrypted','${id(999)}')`);await rows(`select chat_action('writer-token','${t}','block')`);await assertFalse(`select chat_send('reader-token','${t}','${id(703)}','encrypted')`);await assert.rejects(rows(`select chat_request('reader-token','${id(102)}')`));await rows(`select chat_action('writer-token','${t}','unblock')`);await rows(`select chat_action('writer-token','${t}','deny')`);assert.equal((await rows(`select status from chat_threads where id='${t}'`))[0].status,'spam');});
test('interaction notifications cover comments, reactions, saves, quotes and chapter subscriptions without self notifications',async()=>{await db.exec(`insert into chapter_likes values('${id(301)}','${id(101)}');insert into chapter_favorites values('${id(301)}','${id(101)}',now());insert into comments(id,chapter_id,user_id,body)values('${id(800)}','${id(301)}','${id(101)}','legal');insert into comment_likes values('${id(800)}','${id(102)}');insert into nook_posts(id,user_id,story_id,body)values('${id(801)}','${id(101)}','${id(201)}','leiam');insert into nook_comments(id,post_id,author_id,content)values('${id(802)}','${id(801)}','${id(102)}','oi');insert into nook_post_reactions(post_id,user_id)values('${id(801)}','${id(102)}');insert into nook_comment_reactions(comment_id,user_id)values('${id(802)}','${id(101)}');insert into nook_saved_posts(post_id,user_id)values('${id(801)}','${id(102)}');insert into reading_lists values('${id(803)}','${id(101)}');insert into reading_list_items(list_id,story_id)values('${id(803)}','${id(201)}');insert into posts(user_id,chapter_id)values('${id(101)}','${id(301)}');insert into chapters(id,story_id,title,chapter_number,published)values('${id(804)}','${id(201)}','Novo',2,true);`);const kinds=new Set((await rows('select notification_type from user_notifications')).map(r=>r.notification_type));for(const k of ['chapter_likes','chapter_favorites','comments','comment_likes','nook_posts','nook_comments','nook_post_reactions','nook_comment_reactions','nook_saved_posts','reading_list_items','posts','chapter_release'])assert.ok(kinds.has(k),k);const before=(await rows('select count(*)::int n from user_notifications'))[0].n;await db.exec(`insert into chapter_likes values('${id(301)}','${id(102)}')`);assert.equal((await rows('select count(*)::int n from user_notifications'))[0].n,before);});
test('browser roles cannot bypass chat/profile privacy and every account gets one safety notice',async()=>{for(const role of ['anon','authenticated'])for(const table of ['chat_threads','chat_messages','chat_reports','follow_requests','stories','chapters'])assert.equal((await rows(`select has_table_privilege('${role}','public.${table}','SELECT') ok`))[0].ok,false);assert.equal((await rows("select count(*)::int n from user_notifications where source_key='chat-safety-v1'"))[0].n,3);await db.exec(`insert into auth_accounts(id)values('${id(4)}')`);assert.equal((await rows("select count(*)::int n from user_notifications where source_key='chat-safety-v1'"))[0].n,4);});


test('original catalogue, series and highlights respect publication and profile visibility', async () => {
  await db.exec(`
    update profiles set is_private=false where id='${id(102)}';
    update stories set story_kind='original', story_format='conto', series_name='Lua', series_volume=1 where id='${id(202)}';
    update stories set story_kind='original', story_format='conto', series_name='lua', series_volume=2 where id='${id(206)}';
    update stories set story_kind='original', story_format='conto', series_name='Lua', series_volume=3 where id='${id(204)}';
    update stories set story_kind='fanfic' where id='${id(201)}';
    update chapters set original_published_at='2026-10-01' where id='${id(302)}';
    update chapters set original_published_at='2026-10-02' where id='${id(306)}';
  `);
  const catalogue = await rows("select id from search_catalog_stories(p_kind=>'original',p_format=>'conto',p_sort=>'debut')");
  assert.deepEqual(catalogue.map(row => row.id), [id(206), id(202)]);
  assert.deepEqual((await rows(`select id from list_story_series('${id(202)}',null)`)).map(row => row.id), [id(202), id(206)]);
  await assert.rejects(rows(`update stories set series_volume=1 where id='${id(206)}'`), /duplicate key/);
  await assertFalse(`select pin_profile_story('${id(101)}','${id(202)}')`);
  await assertFalse(`select pin_profile_story('${id(102)}','${id(204)}')`);
  assert.equal((await rows(`select pin_profile_story('${id(102)}','${id(202)}') ok`))[0].ok, true);
  await db.exec(`update profiles set is_private=true where id='${id(102)}'`);
  assert.deepEqual(await rows("select id from search_catalog_stories(p_kind=>'original')"), []);
  assert.deepEqual(await rows(`select id from list_story_series('${id(202)}',null)`), []);
});

test('beta drafts and notes are visible only to the author and the accepted reader until revocation', async () => {
  const author = id(102), reader = id(101), outsider = id(103), chapter = id(304);
  await db.exec(`update stories set story_kind='original' where id='${id(204)}'; update chapters set body='Segredo do rascunho' where id='${chapter}'`);
  const action = async (actor, verb, args = '') => (await rows(`select beta_reading_action('${actor}','${verb}'${args}) data`))[0].data;
  assert.equal(await action(reader, 'invite', `, null, '${chapter}', 'writer'`), null);
  assert.equal(await action(author, 'invite', `, null, '${chapter}', 'reader'`), true);
  const [{ id: invite }] = await action(reader, 'list');
  const args = `, '${invite}'`;
  assert.equal(await action(reader, 'read', args), null);
  assert.equal(await action(outsider, 'accept', args), null);
  assert.equal(await action(author, 'accept', args), null);
  assert.equal(await action(reader, 'accept', args), true);
  assert.equal((await action(reader, 'read', args)).body, 'Segredo do rascunho');
  assert.equal(await action(reader, 'note', args + ", null, null, 'Segredo', 'Gostei da abertura'"), true);
  assert.equal((await action(author, 'read', args)).notes[0].body, 'Gostei da abertura');
  assert.equal(await action(outsider, 'read', args), null);
  assert.equal(await action(author, 'revoke', args), true);
  assert.equal(await action(reader, 'read', args), null);
  assert.equal(await action(reader, 'note', args + ", null, null, '', 'Sem acesso'"), null);
  assert.deepEqual(await action(reader, 'list'), []);
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await rows(`select has_table_privilege('${role}','public.beta_reading_invites','SELECT') ok`))[0].ok, false);
    assert.equal((await rows(`select has_table_privilege('${role}','public.beta_reading_notes','SELECT') ok`))[0].ok, false);
    assert.equal((await rows(`select has_function_privilege('${role}','public.beta_reading_action(uuid,text,uuid,uuid,text,text,text)','EXECUTE') ok`))[0].ok, false);
  }
});

test('release gates, durable lists, feed media and wiki reviews preserve ownership', async () => {
  const author = id(102), reader = id(101), story = id(204), chapter = id(304);
  await db.exec(`
    alter table stories add column accepts_translation boolean default false;
    alter table chapters add column publication_status text default 'draft', add column updated_at timestamptz default now(), add column banner_url text;
    create table scheduled_chapters(id uuid primary key default gen_random_uuid(),chapter_id uuid,scheduled_for timestamptz);
    alter table reading_lists add column name text, add column description text, add column is_public boolean default false, add column created_at timestamptz default now();
    alter table reading_lists alter column id set default gen_random_uuid();
    alter table reading_list_items add unique(list_id,story_id);
    alter table nook_posts add column image_url text, add column moderation_hidden_at timestamptz, add column news_slug text, add column pinned boolean;
    alter table nook_comments add constraint nook_comments_content_check check (char_length(trim(content))>0);
    alter table nook_post_media add column post_id uuid, add column media_url text,
      add column media_type text, add column position int,
      add constraint nook_post_media_media_type_check check (media_type in ('image','gif'));
    alter table chapter_media add column chapter_id uuid, add column media_url text;
    alter table social_stories add column user_id uuid, add column media_url text, add column expires_at timestamptz;
    create schema storage;
    create table storage.buckets(id text primary key,allowed_mime_types text[]);
    insert into storage.buckets values('nook-media','{image/png}');
    update profiles set is_private=false where id='${author}';
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261107030000_reading_lists_publication_feed_and_character_wiki.sql', import.meta.url), 'utf8'));
  assert.deepEqual(await rows(`select id from released_stories where id='${story}'`), []);
  assert.equal((await rows(`select set_story_release('${story}','${reader}','publish',null) state`))[0].state, null);
  assert.equal((await rows(`select set_story_release('${story}','${author}','publish',null) state`))[0].state, 'no_chapter');
  assert.equal((await rows(`select set_story_release('${story}','${author}','unpublish',null) state`))[0].state, 'unpublished');
  await db.exec(`update chapters set published=true,publication_status='published' where id='${chapter}'`);
  assert.deepEqual(await rows(`select id from released_stories where id='${story}'`), []);
  assert.equal((await rows(`select set_story_release('${story}','${author}','publish',null) state`))[0].state, 'published');
  assert.equal((await rows(`select count(*)::int total from user_notifications where source_key='chapter-published:${chapter}'`))[0].total, 1);
  const [{ details }] = await rows(`select save_story_details('${story}','${author}','{"title":"A nova edição","fandom":"Nookverso"}',array['${id(402)}']::uuid[]) details`);
  assert.equal(details.title, 'A nova edição');
  assert.equal(details.fandom, 'Nookverso');
  assert.equal(details.tags[0].slug, 'romance');
  await db.exec(await readFile(new URL('../supabase/migrations/20261112234500_spotify_links.sql', import.meta.url), 'utf8'));
  const playlist = { url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', title: 'Playlist de teste', image: null };
  const saveDetails = (actor, changes) => db.query('select save_story_details($1,$2,$3::jsonb,null) details', [story, actor, JSON.stringify(changes)]);
  assert.equal((await saveDetails(reader, { spotify_link: playlist })).rows[0].details, null);
  assert.deepEqual((await saveDetails(author, { spotify_link: playlist })).rows[0].details.spotify_link, playlist);
  assert.deepEqual((await saveDetails(author, { title: 'A nova edição' })).rows[0].details.spotify_link, playlist);
  assert.equal((await saveDetails(author, { spotify_link: null })).rows[0].details.spotify_link, null);

  assert.equal((await rows(`select count(*)::int total from search_catalog_stories(p_include_slugs=>array['nookverso'])`))[0].total, 1);
  const [{ list }] = await rows(`select save_reading_list('${reader}',null,'${story}','Leituras','') list`);
  assert.ok(list);
  assert.equal((await rows(`select save_reading_list('${author}','${list}','${story}','','') list`))[0].list, null);
  await rows(`select save_reading_list('${reader}','${list}','${story}','','')`);
  assert.equal((await rows(`select count(*)::int total from reading_list_items where list_id='${list}'`))[0].total, 1);
  assert.equal((await rows(`select set_story_release('${story}','${author}','schedule',now()+interval '1 hour') state`))[0].state, 'scheduled');
  assert.deepEqual(await rows(`select id from released_stories where id='${story}'`), []);
  assert.deepEqual(await rows("select id from search_catalog_stories(p_include_slugs=>array['nookverso'])"), []);

  const [{ post }] = await rows(`select create_feed_media_post('${author}','#Leitura #Ficção #leitura',null,null,'[{"media_url":"test-video","media_type":"video"}]') post`);
  assert.deepEqual(new Set((await rows(`select hashtags from nook_posts where id='${post}'`))[0].hashtags), new Set(['ficção','leitura']));
  await db.exec(`insert into nook_comments(post_id,author_id,content,image_url) values('${post}','${reader}','','test-image')`);
  assert.equal((await rows("select content_media_allowed(null,'nook-media',array['test-image']) allowed"))[0].allowed, true);
  await db.exec(`update nook_posts set moderation_hidden_at=now() where id='${post}'`);
  assert.equal((await rows("select content_media_allowed(null,'nook-media',array['test-image']) allowed"))[0].allowed, false);
  const [{ character_id: character }] = await rows(`select submit_character_edit('${author}',null,'Personagem QA','Universo QA','Descrição de personagem para teste','https://example.invalid/wiki') as character_id`);
  assert.ok(character);
  assert.deepEqual(await rows(`select id from wiki_characters where id='${character}' and approved_at is not null`), []);
  const [{ id: edit }] = await rows(`select id from wiki_character_edits where character_id='${character}'`);
  assert.equal((await rows(`select review_character_edit('${edit}','approved') approved`))[0].approved, true);
  assert.equal((await rows(`select count(*)::int total from wiki_characters where id='${character}' and approved_at is not null`))[0].total, 1);
  for (const table of ['released_stories', 'wiki_character_favorites', 'nook_saved_replies']) {
    await assertFalse(`select has_table_privilege('anon','public.${table}','SELECT')`);
  }
});
