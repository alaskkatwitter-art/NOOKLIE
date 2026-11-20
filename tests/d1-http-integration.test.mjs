import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync,readdirSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {createRequire} from 'node:module';import path from 'node:path';import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
function fixture(){const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(root+'/d1/migrations').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(root+'/d1/migrations/'+name,'utf8'));sqlite.exec('PRAGMA foreign_keys=ON');const hash='a'.repeat(64),user='11000000-0000-4000-8000-000000000001',profile='11000000-0000-4000-8000-000000000002';sqlite.prepare('INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,?,?,?)').run(user,'http_reader','synthetic','synthetic');sqlite.prepare('INSERT INTO profiles(id,user_id,username) VALUES(?,?,?)').run(profile,user,'http_reader');sqlite.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').run('session',user,hash,'2099-01-01T00:00:00Z');let token=hash;
const db={async batch(statements){
  sqlite.exec('BEGIN');
  try {
    const results=[];
    for (const statement of statements) results.push(await statement.run());
    sqlite.exec('COMMIT');
    return results;
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
},prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...params)};},async run(){const s=sqlite.prepare(sql);if(s.columns().length)return{success:true,results:s.all(...params),meta:{changes:0}};return{success:true,meta:{changes:Number(s.run(...params).changes)}};}};}};
const objects = new Map();
const mediaBucket = {
  async put(key, data) { if (objects.has(key)) return null; objects.set(key, Buffer.from(data)); return {}; },
  async get(key) { return objects.has(key) ? { size: objects.get(key).length, body: new Blob([objects.get(key)]).stream(), blob: async () => new Blob([objects.get(key)]) } : null; },
  async delete(keys) { for (const key of keys) objects.delete(key); },
};
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>{if(name==='@/lib/auth/session')return{getSessionTokenHash:async()=>token,getAuthenticatedUserContext:async()=>token&&sqlite.prepare('SELECT user_id AS userId,token_hash AS sessionTokenHash FROM d1_social_actors WHERE token_hash=?').get(token)||null};if(name==='@/lib/chat/server')return{sameOrigin:request=>request.headers.get('origin')===new URL(request.url).origin,uuid:/^[a-f0-9-]{36}$/i,privateHeaders:{'Cache-Control':'no-store'},chatActor:()=>{throw Error('Supabase used in D1 path');}};if(name==='@/lib/media/r2-binding')return{getMediaBucket:()=>mediaBucket,getHistoricalMediaBucket:()=>mediaBucket};if(name==='@/lib/media/optimize-upload')return{optimizeUploadedImage:async bytes=>bytes};if(name==='@/lib/media/storage')return{mediaStorage:()=>{throw Error('Live media used in D1 path');},r2MediaResponse:async(bucket,path)=>{const data=objects.get(bucket+'/'+path);return data?new Response(data):null;}};if(name==='@/lib/database/preview')return{getD1PreviewDatabase:()=>db};if(name==='@/lib/database/d1')return{getD1Database:()=>db};if(name==='next/server')return{NextResponse:class extends Response{static json(body,options){const response=Response.json(body,options);response.cookies={set(cookie,value){const entry=typeof cookie==='string'?{name:cookie,value}:cookie;response.headers.set('Set-Cookie',entry.name+'='+entry.value);}};return response;}}};if(name==='@supabase/supabase-js')return{createClient:()=>({from(){throw Error('Supabase used in D1 path');}})};if(name.startsWith('@/'))return load(root+'/'+name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return nativeRequire(name);},exports);return exports;}
const request=(url,method='GET',body,origin='https://preview.invalid')=>new Request('https://preview.invalid'+url,{method,headers:origin?{origin}:{},...(body===undefined?{}:{body:JSON.stringify(body)})});return{sqlite,db,load,request,hash,user,profile,objects,setToken:t=>token=t};}
test('D1 news HTTP preserves the UI contract, privacy and CSRF protection',async()=>{const f=fixture();try{const{d1NewsHttp}=f.load(root+'/lib/database/d1-news-http.ts');const post=await d1NewsHttp(f.request('/api/news/comments','POST',{article:'boas-vindas',body:'HTTP integration comment'}),'POST',f.db);assert.equal(post.status,201);const saved=(await post.json()).comment;assert.equal(saved.author.id,f.profile);assert.equal(saved.can_delete,true);assert.equal(typeof saved.author.verified,'boolean');const list=await d1NewsHttp(f.request('/api/news/comments?article=boas-vindas'),'GET',f.db);assert.equal((await list.json()).comments.length,1);assert.equal((await d1NewsHttp(f.request('/api/news/comments','DELETE',{article:'boas-vindas',id:saved.id},'https://foreign.invalid'),'DELETE',f.db)).status,403);assert.equal((await d1NewsHttp(f.request('/api/news/comments','DELETE',{article:'boas-vindas',id:saved.id}),'DELETE',f.db)).status,200);const after=await(await d1NewsHttp(f.request('/api/news/comments?article=boas-vindas'),'GET',f.db)).json();assert.equal(after.comments[0].body,null);assert.equal(after.comments[0].author,null);f.setToken(null);assert.equal((await d1NewsHttp(f.request('/api/news/comments','POST',{article:'boas-vindas',body:'anonymous'}),'POST',f.db)).status,401);}finally{f.sqlite.close();}});
test('D1 wiki HTTP keeps unapproved biography private and blocks cross-origin writes',async()=>{const f=fixture();try{const{d1WikiHttp}=f.load(root+'/lib/database/d1-wiki-http.ts');const body={action:'submit',name:'HTTP Character',universe:'HTTP Universe',biography:'A complete unapproved biography.',source:'https://example.com/source'};assert.equal((await d1WikiHttp(f.request('/api/characters','POST',body,'https://foreign.invalid'),'POST',f.db)).status,403);const posted=await d1WikiHttp(f.request('/api/characters','POST',body),'POST',f.db);assert.equal(posted.status,201);const data=await(await d1WikiHttp(f.request('/api/characters'),'GET',f.db)).json();assert.equal(data.characters.length,0);assert.equal(data.favorites.length,1);assert.equal(data.favorites[0].biography,undefined);assert.equal((await d1WikiHttp(f.request('/api/characters?pending=1'),'GET',f.db)).status,403);}finally{f.sqlite.close();}});
test('D1 theme route uses existing validator and compare-and-swap revisions',async()=>{const f=fixture();try{const route=f.load(root+'/app/api/profile/themes/route.ts');const empty=await(await route.GET()).json();assert.equal(empty.revision,0);const body={drafts:[],active:null,revision:0};assert.equal((await route.PUT(f.request('/api/profile/themes','PUT',body))).status,200);assert.equal((await route.PUT(f.request('/api/profile/themes','PUT',body))).status,409);assert.equal((await(await route.GET()).json()).revision,1);f.setToken(null);assert.equal((await route.GET()).status,401);}finally{f.sqlite.close();}});
test('D1 preview gate stays off by default and refuses production or missing isolation',()=>{const f=fixture(),keys=['NOOKLIE_D1_PREVIEW_FEATURES','NOOKLIE_D1_PREVIEW','NOOKLIE_CLOUDFLARE_PRODUCTION','NOOKLIE_D1_PRODUCTION'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));try{const{getD1PreviewDatabase}=f.load(root+'/lib/database/preview.ts');for(const k of keys)delete process.env[k];assert.equal(getD1PreviewDatabase('news'),undefined);process.env.NOOKLIE_D1_PREVIEW_FEATURES='news';assert.throws(()=>getD1PreviewDatabase('news'),/isolated/);process.env.NOOKLIE_D1_PREVIEW='1';assert.equal(getD1PreviewDatabase('news'),f.db);assert.equal(getD1PreviewDatabase('wiki'),undefined);process.env.NOOKLIE_CLOUDFLARE_PRODUCTION='1';assert.throws(()=>getD1PreviewDatabase('news'),/isolated/);process.env.NOOKLIE_D1_PRODUCTION='1';assert.throws(()=>getD1PreviewDatabase('news'),/isolated/);delete process.env.NOOKLIE_D1_PREVIEW;assert.equal(getD1PreviewDatabase('news'),f.db);}finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}f.sqlite.close();}});

test('D1 preview login creates a session that logout revokes', async () => {
  const f = fixture();
  const bcrypt = nativeRequire('bcryptjs');
  const crypto = nativeRequire('node:crypto');
  try {
    const password = 'synthetic-password';
    f.sqlite.prepare('UPDATE auth_accounts SET password_hash = ? WHERE id = ?')
      .run(await bcrypt.hash(password, 4), f.user);
    const login = f.load(root + '/app/api/auth/login/route.ts');
    const logout = f.load(root + '/app/api/auth/logout/route.ts');
    const rejected = await login.POST(f.request('/api/auth/login', 'POST', {
      username: 'http_reader', password: 'wrong',
    }));
    assert.equal(rejected.status, 401);
    const accepted = await login.POST(f.request('/api/auth/login', 'POST', {
      username: 'http_reader', password,
    }));
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).user.id, f.user);
    const cookie = accepted.headers.get('set-cookie');
    assert.match(cookie, /^toriland_session=[0-9a-f]{64}$/);
    const token = cookie.split('=')[1];
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const session = f.sqlite.prepare('SELECT user_id FROM auth_sessions WHERE token_hash = ?');
    assert.equal(session.get(hash).user_id, f.user);
    const exited = await logout.POST(new Request('https://preview.invalid/api/auth/logout', {
      method: 'POST', headers: { cookie },
    }));
    assert.equal(exited.status, 200);
    assert.equal(session.get(hash), undefined);
  } finally {
    f.sqlite.close();
  }
});

test('D1 preview signup preserves account and profile creation and claims the official code atomically', async () => {
  const f = fixture();
  try {
    const signup = f.load(root + '/app/api/auth/signup/route.ts');
    const create = (username, officialSignupCode) => signup.POST(f.request('/api/auth/signup', 'POST', {
      username, password: 'synthetic-password', officialSignupCode,
    }));
    const ordinary = await create('new_reader');
    assert.equal(ordinary.status, 201);
    assert.match((await ordinary.json()).recoveryKey, /^[a-f0-9]{32}$/);
    const profile = f.sqlite.prepare('SELECT user_id, is_official FROM profiles WHERE username = ?');
    assert.equal(profile.get('new_reader').is_official, 0);
    assert.equal((await create('new_reader')).status, 409);
    assert.equal((await create('nooklie', 'invalid-code')).status, 403);

    const crypto = nativeRequire('node:crypto');
    const code = 'synthetic-official-code';
    f.sqlite.prepare('INSERT INTO official_signup_tokens(token_hash) VALUES (?)')
      .run(crypto.createHash('sha256').update(code).digest('hex'));
    const auth = f.load(root + '/lib/database/d1-auth.ts').d1Auth(f.db);
    f.sqlite.exec("CREATE TRIGGER reject_official_profile BEFORE INSERT ON profiles WHEN NEW.username = 'nooklie' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    await assert.rejects(auth.register('official-test', 'nooklie', 'pw', 'recovery', crypto.createHash('sha256').update(code).digest('hex')));
    assert.equal(await auth.accountForLogin('nooklie'), null);
    const token = f.sqlite.prepare('SELECT used_at FROM official_signup_tokens');
    assert.equal(token.get().used_at, null);
    f.sqlite.exec('DROP TRIGGER reject_official_profile');
    assert.equal((await create('nooklie', code)).status, 201);
    assert.equal(profile.get('nooklie').is_official, 1);
    assert.ok(token.get().used_at);
  } finally {
    f.sqlite.close();
  }
});

test('D1 chapter management reorders and deletes chapters through the editor route', async () => {
  const f = fixture();
  try {
    const route = f.load(root + '/app/api/stories/[id]/chapters/manage/route.ts');
    const id = '11000000-0000-4000-8000-000000000011';
    const first = '11000000-0000-4000-8000-000000000012';
    const second = '11000000-0000-4000-8000-000000000013';
    f.sqlite.prepare('INSERT INTO stories (id, author_id, title) VALUES (?, ?, ?)').run(id, f.profile, 'Test story');
    const insert = f.sqlite.prepare('INSERT INTO chapters (id, story_id, chapter_number, title, body) VALUES (?, ?, ?, ?, ?)');
    insert.run(first, id, 1, 'First', '<p>First</p>');
    insert.run(second, id, 2, 'Second', '<p>Second</p>');
    const post = body => route.POST(f.request('/api/stories/' + id + '/chapters/manage', 'POST', body), {
      params: Promise.resolve({ id }),
    });
    assert.equal((await post({ action: 'reorder', ids: [second, first] })).status, 200);
    const order = f.sqlite.prepare('SELECT id FROM chapters WHERE story_id = ? ORDER BY chapter_number');
    assert.deepEqual(order.all(id).map(row => row.id), [second, first]);
    assert.equal((await post({ action: 'reorder', ids: [first] })).status, 409);
    assert.equal((await post({ action: 'delete', chapterId: second })).status, 200);
    assert.deepEqual(order.all(id).map(row => row.id), [first]);
    assert.equal((await post({ action: 'delete', chapterId: second })).status, 404);
  } finally {
    f.sqlite.close();
  }
});

test('D1 preview chapter GET exposes drafts only to the author and preserves reader navigation', async () => {
  const f = fixture();
  try {
    const route = f.load(root + '/app/api/chapters/[id]/route.ts');
    const story = '11000000-0000-4000-8000-000000000021';
    const first = '11000000-0000-4000-8000-000000000022';
    const draft = '11000000-0000-4000-8000-000000000023';
    const last = '11000000-0000-4000-8000-000000000024';
    f.sqlite.prepare("INSERT INTO stories (id, author_id, title, release_at) VALUES (?, ?, ?, '2020-01-01T00:00:00Z')")
      .run(story, f.profile, 'Test story');
    const insert = f.sqlite.prepare('INSERT INTO chapters (id, story_id, chapter_number, title, body, published, publication_status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insert.run(first, story, 1, 'First', '<p>Hello</p><script>bad()</script>', 1, 'published');
    insert.run(draft, story, 2, 'Draft', '<p>Draft</p>', 0, 'draft');
    insert.run(last, story, 3, 'Last', '<p>Last</p>', 1, 'published');
    const get = id => route.GET(f.request('/api/chapters/' + id), { params: Promise.resolve({ id }) });
    assert.equal((await get(draft)).status, 200);
    f.setToken(null);
    assert.equal((await get(draft)).status, 404);
    const published = await get(first);
    assert.equal(published.status, 200);
    const data = await published.json();
    assert.equal(data.chapter.body, '<p>Hello</p>');
    assert.equal(data.chapter.published, true);
    assert.equal(data.nextChapter.id, last);
    assert.equal(data.previousChapter, null);
    f.sqlite.prepare('UPDATE profiles SET is_private = 1 WHERE id = ?').run(f.profile);
    assert.equal((await get(first)).status, 404);
  } finally {
    f.sqlite.close();
  }
});

test('D1 preview edits and revokes encrypted chat messages within two hours', async () => {
  const f = fixture();
  const previousKey = process.env.CHAT_ENCRYPTION_KEY_V2;
  process.env.CHAT_ENCRYPTION_KEY_V2 = 'ab'.repeat(32);
  try {
    const peer = '11000000-0000-4000-8000-000000000031';
    const thread = '11000000-0000-4000-8000-000000000032';
    const message = '11000000-0000-4000-8000-000000000033';
    const expired = '11000000-0000-4000-8000-000000000034';
    const crypto = f.load(root + '/lib/chat/crypto.ts');
    const route = f.load(root + '/app/api/chat/messages/[id]/route.ts');
    f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,'peer','pw','unique-key')").run(peer);
    f.sqlite.prepare("INSERT INTO profiles(id,user_id,username) VALUES(?,?,'peer')").run(peer, peer);
    f.sqlite.prepare("INSERT INTO chat_threads(id,initiator_id,recipient_id,kind,status) VALUES(?,?,?,'direct','accepted')")
      .run(thread, f.profile, peer);
    const encrypted = crypto.encodeChatBody(crypto.encryptChat(Buffer.from('original'), thread + ':' + message + ':body'));
    const insert = f.sqlite.prepare("INSERT INTO chat_messages(id,thread_id,sender_id,body_cipher,cipher_version,created_at) VALUES(?,?,?,?,2,?)");
    insert.run(message, thread, f.profile, encrypted, new Date().toISOString());
    insert.run(expired, thread, f.profile, encrypted, '2020-01-01T00:00:00Z');
    const chat = f.load(root + '/app/api/chat/route.ts');
    const inbox = await chat.GET(f.request('/api/chat'));
    assert.equal(inbox.status, 200);
    assert.equal((await inbox.json()).threads[0].peer.id, peer);
    const conversation = await chat.GET(f.request('/api/chat?thread=' + thread + '&before=2021-01-01T00:00:00Z'));
    assert.equal(conversation.status, 503, 'ciphertext bound to a different message cannot be opened');
    const latest = await chat.GET(f.request('/api/chat?thread=' + thread + '&before=2019-01-01T00:00:00Z'));
    assert.equal(latest.status, 200);
    assert.deepEqual((await latest.json()).messages, []);
    const call = (method, id) => route[method](f.request('/api/chat/messages/' + id, method,
      { thread_id: thread, body: 'updated' }), { params: Promise.resolve({ id }) });
    assert.equal((await call('PATCH', expired)).status, 409);
    assert.equal((await call('PATCH', message)).status, 200);
    const query = f.sqlite.prepare('SELECT body_cipher, revoked_at FROM chat_messages WHERE id = ?');
    const saved = query.get(message);
    assert.equal(crypto.decryptChat(crypto.decodeChatBody(saved.body_cipher), thread + ':' + message + ':body').toString(), 'updated');
    assert.equal((await call('DELETE', message)).status, 200);
    assert.ok(query.get(message).revoked_at);
    f.sqlite.prepare('DELETE FROM chat_messages WHERE id = ?').run(expired);
    const opened = await chat.GET(f.request('/api/chat?thread=' + thread));
    assert.equal(opened.status, 200);
    const messages = (await opened.json()).messages;
    assert.equal(messages[0].body, '');
    assert.ok(messages[0].revoked_at);
    f.setToken(null);
    assert.equal((await chat.GET(f.request('/api/chat?thread=' + thread))).status, 401);
    f.setToken(f.hash);
    assert.equal((await call('PATCH', message)).status, 409);
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const form = new FormData();
    form.set('thread_id', thread);
    form.set('body', 'message with attachment');
    form.set('file', new File([png], 'photo.png', { type: 'image/png' }));
    const sent = await chat.POST(new Request('https://preview.invalid/api/chat', {
      method: 'POST', headers: { origin: 'https://preview.invalid' }, body: form,
    }));
    assert.equal(sent.status, 201);
    const sentId = (await sent.json()).id;
    const key = 'private-chat/' + crypto.chatMediaPath(thread, sentId);
    assert.ok(f.objects.has(key));
    assert.notDeepEqual(f.objects.get(key), png);
    const media = f.load(root + '/app/api/chat/media/[id]/route.ts');
    const downloaded = await media.GET(f.request('/api/chat/media/' + sentId), { params: Promise.resolve({ id: sentId }) });
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
    const action = action => chat.PATCH(f.request('/api/chat', 'PATCH', { thread_id: thread, action }));
    assert.equal((await action('block')).status, 200);
    assert.equal((await action('block')).status, 200);
    const blocked = await chat.GET(f.request('/api/chat?thread=' + thread));
    assert.equal((await blocked.json()).thread.blocked_by_me, true);
    assert.equal((await media.GET(f.request('/api/chat/media/' + sentId), { params: Promise.resolve({ id: sentId }) })).status, 404);
    assert.equal((await action('unblock')).status, 200);
    assert.equal((await action('unblock')).status, 200);

    f.setToken('b'.repeat(64));
    const denied = await media.GET(f.request('/api/chat/media/' + sentId), { params: Promise.resolve({ id: sentId }) });
    assert.equal(denied.status, 404);

  } finally {
    if (previousKey === undefined) delete process.env.CHAT_ENCRYPTION_KEY_V2;
    else process.env.CHAT_ENCRYPTION_KEY_V2 = previousKey;
    f.sqlite.close();
  }
});

test('D1 preview saves and resumes reading progress with atomic daily engagement', async () => {
  const f = fixture();
  try {
    const route = f.load(root + '/app/api/reading-progress/route.ts');
    const author = '11000000-0000-4000-8000-000000000041';
    const story = '11000000-0000-4000-8000-000000000042';
    const chapter = '11000000-0000-4000-8000-000000000043';
    f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES (?,'reader_author','pw','author-key')").run(author);
    f.sqlite.prepare("INSERT INTO profiles(id,user_id,username) VALUES (?,?,'reader_author')").run(author, author);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES (?,?,'Test story')").run(story, author);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body,published) VALUES (?,?,1,'First','Text',1)").run(chapter, story);
    const save = (position, read_seconds) => route.PUT(new Request('https://preview.invalid/api/reading-progress', {
      method: 'PUT',
      headers: { 'X-Discovery-Account': f.user, origin: 'https://preview.invalid' },
      body: JSON.stringify({ story_id: story, chapter_id: chapter, percent: 42, position, read_seconds }),
    }));
    assert.equal((await save(120, 31)).status, 200);
    assert.equal((await save(130, 3)).status, 200);
    const result = await route.GET(f.request('/api/reading-progress?chapter=' + chapter));
    assert.deepEqual(await result.json(), {
      account_id: f.user, progress: { chapter_id: chapter, progress_percent: 42, position: 130 },
    });
    const resume = await route.GET(f.request('/api/reading-progress?resume=1&chapter=' + chapter));
    assert.deepEqual(await resume.json(), { chapter_id: chapter });
    const daily = f.sqlite.prepare('SELECT read FROM story_daily_engagement WHERE reader_id = ?').all(f.profile);
    assert.deepEqual(daily.map(row => row.read), [1]);

    f.sqlite.exec("CREATE TRIGGER reject_daily_update BEFORE UPDATE ON story_daily_engagement BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    assert.equal((await save(900, 31)).status, 503);
    assert.equal(f.sqlite.prepare('SELECT position FROM reading_progress WHERE user_id = ?').get(f.profile).position, 130);
  } finally {
    f.sqlite.close();
  }
});

test('D1 feed route preserves card shape, hashtag pagination and muted author filtering', async () => {
  const f = fixture();
  try {
    const route = f.load(root + '/app/api/feed/route.ts');
    const author = '11000000-0000-4000-8000-000000000051';
    f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES (?,'feed_author','pw','feed-key')").run(author);
    f.sqlite.prepare("INSERT INTO profiles(id,user_id,username) VALUES (?,?,'feed_author')").run(author, author);
    f.sqlite.prepare('INSERT INTO follows(follower_id,following_id) VALUES (?,?)').run(f.profile, author);
    const insert = f.sqlite.prepare("INSERT INTO nook_posts(id,user_id,body,hashtags,created_at) VALUES (?,?,'Sample',?,'2026-11-01T12:00:00.000Z')");
    for (let index = 0; index < 21; index++) {
      insert.run('11000000-0000-4000-8000-' + String(index + 100).padStart(12, '0'), author, '["literatura"]');
    }
    insert.run('11000000-0000-4000-8000-000000000221', author, '["other"]');
    const url = '/api/feed?scope=following&tag=literatura';
    const response = await route.GET(f.request(url));
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.posts.length, 20);
    assert.equal(page.posts[0].author.id, author);
    assert.deepEqual(page.posts[0].reaction_counts, {});
    assert.equal(page.posts[0].saved, false);
    const save = f.load(root + '/app/api/nook-posts/save/route.ts');
    const postId = page.posts[0].id;
    const toggle = () => save.POST(f.request('/api/nook-posts/save', 'POST', { post_id: postId }));
    const added = await toggle();
    assert.equal(added.status, 201);
    assert.equal((await added.json()).saved_post.post_id, postId);
    const saved = await save.GET(f.request('/api/nook-posts/save?post_id=' + postId));
    assert.deepEqual(await saved.json(), { saved: true });
    const removed = await toggle();
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { saved: false });
    const reactions = f.load(root + '/app/api/nook-posts/reactions/route.ts');
    const react = () => reactions.POST(f.request('/api/nook-posts/reactions', 'POST', { post_id: postId, emoji: '🔥' }));
    assert.equal((await react()).status, 201);
    const summary = await reactions.GET(f.request('/api/nook-posts/reactions?post_id=' + postId));
    assert.deepEqual((await summary.json()).summary, { counts: { '🔥': 1 }, user_reactions: ['🔥'], comments_count: 0 });
    assert.deepEqual(await (await react()).json(), { reacted: false, emoji: '🔥' });


    const next = await route.GET(f.request(url + '&before=' + encodeURIComponent(page.next_cursor)));
    assert.equal((await next.json()).posts.length, 1);
    f.sqlite.prepare('INSERT INTO profile_mutes(user_id,target_id) VALUES (?,?)').run(f.profile, author);
    assert.deepEqual((await (await route.GET(f.request(url))).json()).posts, []);
  } finally {
    f.sqlite.close();
  }
});

test('D1 preview creates scheduled and published chapters and toggles reader favorites', async () => {
  const f = fixture();
  try {
    const editor = f.load(root + '/app/api/chapters/create/route.ts');
    const reader = f.load(root + '/app/api/chapters/[id]/favorite/route.ts');
    const story = '11000000-0000-4000-8000-000000000071';
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES (?,?,'Story')").run(story, f.profile);
    const create = (title, publication_status, scheduled_for) => editor.POST(f.request('/api/chapters/create', 'POST', {
      story_id: story, title, body: '<p>Text</p><script>bad()</script>', publication_status, scheduled_for,
    }));
    const scheduled = await create('Scheduled', 'scheduled', '2098-01-01T07:00:00Z');
    assert.equal(scheduled.status, 201);
    const scheduledChapter = (await scheduled.json()).chapter;
    assert.equal(scheduledChapter.body, '<p>Text</p>');
    assert.equal(scheduledChapter.published, false);
    assert.equal(f.sqlite.prepare('SELECT scheduled_for FROM scheduled_chapters WHERE chapter_id = ?')
      .get(scheduledChapter.id).scheduled_for, '2098-01-01T07:00:00.000Z');
    const published = await create('Published', 'published');
    assert.equal(published.status, 201);
    const chapter = (await published.json()).chapter;
    assert.equal(chapter.published, true);
    assert.equal(chapter.chapter_number, 2);
    const request = method => f.request('/api/chapters/' + chapter.id + '/favorite', method);
    const params = { params: Promise.resolve({ id: chapter.id }) };
    assert.deepEqual(await (await reader.GET(request('GET'), params)).json(), { favorited: false });
    assert.deepEqual(await (await reader.POST(request('POST'), params)).json(), { favorited: true });
    assert.deepEqual(await (await reader.POST(request('POST'), params)).json(), { favorited: false });
    const likes = f.load(root + '/app/api/chapters/[id]/like/route.ts');
    assert.deepEqual(await (await likes.POST(request('POST'), params)).json(), { likes: 1, liked: true });
    f.setToken(null);
    assert.deepEqual(await (await likes.GET(request('GET'), params)).json(), { likes: 1, liked: false });
    f.setToken(f.hash);
    assert.deepEqual(await (await likes.POST(request('POST'), params)).json(), { likes: 0, liked: false });
    const edit = f.load(root + '/app/api/chapters/[id]/route.ts');
    const form = new FormData();
    form.set('title', 'Revised title');
    const revised = await edit.PUT(new Request('https://preview.invalid/api/chapters/' + chapter.id, {
      method: 'PUT', body: form,
    }), params);
    assert.equal(revised.status, 200);
    const saved = await revised.json();
    assert.equal(saved.chapter.title, 'Revised title');
    assert.equal(saved.chapter.published, true);
    const image = Buffer.from('89504e470d0a1a0a00000000','hex');
    const mediaForm = new FormData();
    mediaForm.set('replace_media','1');
    mediaForm.append('media',new File([image],'chapter.png',{type:'image/png'}));
    const withMedia = await edit.PUT(new Request('https://preview.invalid/api/chapters/' + chapter.id, {
      method: 'PUT', body: mediaForm,
    }), params);
    assert.equal(withMedia.status, 200);
    const media = (await withMedia.json()).media;
    assert.equal(media.length, 1);
    const contentMedia = f.load(root + '/app/api/content-media/route.ts');
    assert.equal((await contentMedia.GET(f.request(media[0].media_url))).status, 200);
    const removeMedia = new FormData();
    removeMedia.set('replace_media','1');
    assert.equal((await edit.PUT(new Request('https://preview.invalid/api/chapters/' + chapter.id, {
      method: 'PUT', body: removeMedia,
    }), params)).status, 200);
    assert.equal((await contentMedia.GET(f.request(media[0].media_url))).status, 404);

    f.sqlite.prepare("UPDATE stories SET release_at='2098-01-01T07:00:00.000Z' WHERE id=?").run(story);
    const { publishScheduledChapters } = await import('../cloudflare/d1-scheduled.mjs');
    assert.equal(await publishScheduledChapters(f.db, Date.parse('2098-01-01T06:59:00Z')), 0);
    assert.equal(await publishScheduledChapters(f.db, Date.parse('2098-01-01T07:00:00Z')), 1);
    assert.equal(await publishScheduledChapters(f.db, Date.parse('2098-01-01T07:01:00Z')), 0);
    const release = f.sqlite.prepare('SELECT published,original_published_at FROM chapters WHERE id=?').get(scheduledChapter.id);
    assert.equal(release.published, 1);
    assert.equal(release.original_published_at, '2098-01-01T07:00:00.000Z');
    assert.equal(f.sqlite.prepare('SELECT release_at FROM stories WHERE id=?').get(story).release_at, null);
    const delivery = f.sqlite.prepare('SELECT count(*) AS n FROM user_notifications WHERE source_key=?');
    assert.equal(delivery.get('chapter-published:' + scheduledChapter.id).n, 1);


  } finally {
    f.sqlite.close();
  }
});

test('D1 preview creates feed publications and reads nested replies', async () => {
  const f = fixture();
  try {
    const attachments = f.load(root + '/app/api/nook-posts/attachments/route.ts');
    const contentMedia = f.load(root + '/app/api/content-media/route.ts');
    const image = Buffer.from('89504e470d0a1a0a00000000','hex');
    const send = (bytes, mime) => {
      const form = new FormData();
      form.append('files',new File([bytes],'upload',{type:mime}));
      return attachments.POST(new Request('https://preview.invalid/api/nook-posts/attachments',{
        method:'POST',headers:{origin:'https://preview.invalid'},body:form,
      }));
    };
    assert.equal((await send(Buffer.from('wrong format'),'image/png')).status,400);
    const mediaPost = await send(image,'image/png');
    assert.equal(mediaPost.status,201);
    const mediaPostId = (await mediaPost.json()).post.id;
    const media = f.sqlite.prepare('SELECT media_url FROM nook_post_media WHERE post_id=?').get(mediaPostId);
    const served = await contentMedia.GET(f.request(media.media_url));
    assert.equal(served.status,200);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()),image);
    const videoBytes = Buffer.concat([Buffer.from('0000001866747970','hex'),Buffer.alloc(8)]);
    const videoPost = await send(videoBytes,'video/mp4');
    assert.equal(videoPost.status,201);
    const videoPostId = (await videoPost.json()).post.id;
    const video = f.sqlite.prepare('SELECT id,media_url FROM nook_post_media WHERE post_id=?').get(videoPostId);
    const playback = f.load(root + '/app/api/nook-posts/video/[id]/route.ts');
    const redirect = await playback.GET(f.request('/api/nook-posts/video/' + video.id),{params:Promise.resolve({id:video.id})});
    assert.equal(redirect.status,307);
    const partial = await contentMedia.GET(new Request(redirect.headers.get('location'),{headers:{range:'bytes=2-5'}}));
    assert.equal(partial.status,206);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()),videoBytes.subarray(2,6));

    f.sqlite.prepare('UPDATE nook_posts SET moderation_hidden_at=? WHERE id=?').run(new Date().toISOString(),mediaPostId);
    assert.equal((await contentMedia.GET(f.request(media.media_url))).status,404);
    const publications = f.load(root + '/app/api/nook-posts/route.ts');
    const replies = f.load(root + '/app/api/nook-comments/route.ts');
    const result = await publications.POST(f.request('/api/nook-posts', 'POST', { body: 'Olá #literatura' }));
    assert.equal(result.status, 201);
    const post = (await result.json()).post;
    assert.equal(post.author.id, f.profile);
    const comment = (content, parent_id) => replies.POST(f.request('/api/nook-comments', 'POST', {
      post_id: post.id, content, parent_id,
    }));
    const parent = await comment('Primeira resposta');
    assert.equal(parent.status, 201);
    const parentId = (await parent.json()).comment.id;
    const child = await comment('Segunda resposta', parentId);
    assert.equal(child.status, 201);
    const list = await replies.GET(f.request('/api/nook-comments?post_id=' + post.id));
    const { comments } = await list.json();
    assert.equal(comments.length, 2);
    assert.equal(comments.find(row => row.id !== parentId).parent_id, parentId);
    const actions = f.load(root + '/app/api/nook-comments/actions/route.ts');
    const liked = await actions.POST(f.request('/api/nook-comments/actions', 'POST', { id: parentId, action: 'like', enabled: true }));
    assert.equal(liked.status, 200);
    const reply = f.load(root + '/app/api/nook-posts/comments/[id]/route.ts');
    const updated = await reply.PATCH(f.request('/api/nook-posts/comments/' + parentId, 'PATCH', { content: 'Atualizada' }),
      { params: Promise.resolve({ id: parentId }) });
    assert.equal((await updated.json()).comment.content, 'Atualizada');
    const postRoute = f.load(root + '/app/api/nook-posts/[id]/route.ts');
    const postParams = { params: Promise.resolve({ id: post.id }) };
    const edited = await postRoute.PATCH(f.request('/api/nook-posts/' + post.id, 'PATCH', { body: 'Texto editado' }), postParams);
    assert.equal((await edited.json()).post.body, 'Texto editado');
    const removed = await postRoute.DELETE(f.request('/api/nook-posts/' + post.id, 'DELETE'), postParams);
    assert.equal((await removed.json()).success, true);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM nook_comments WHERE post_id=?').get(post.id).n, 0);

  } finally {
    f.sqlite.close();
  }
});

test('D1 preview saves library items, reads owned lists and marks notifications read', async () => {
  const f = fixture();
  try {
    const story = '11000000-0000-4000-8000-000000000081';
    const chapter = '11000000-0000-4000-8000-000000000082';
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES (?,?,'Story')").run(story,f.profile);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body) VALUES (?,?,1,'Chapter','Body')").run(chapter,story);
    const library = f.load(root + '/app/api/library/route.ts');
    assert.equal((await library.POST(f.request('/api/library','POST',{story_id:story}))).status,200);
    assert.equal((await library.POST(f.request('/api/library','POST',{story_id:story}))).status,200);
    assert.equal((await (await library.GET()).json()).items[0].story_id,story);
    assert.equal((await library.PATCH(f.request('/api/library','PATCH',{story_id:story,reading_status:'reading'}))).status,200);
    assert.equal((await library.PATCH(f.request('/api/library','PATCH',{story_id:story,reading_status:null}))).status,200);
    const lists = f.load(root + '/app/api/reading-lists/route.ts');
    const created = await lists.POST(f.request('/api/reading-lists','POST',{name:'Lista teste',storyId:story}));
    assert.equal(created.status,201);
    const listId = (await created.json()).id;
    assert.deepEqual((await (await lists.GET(f.request('/api/reading-lists?id='+listId))).json()).order,[story]);
    assert.equal((await lists.DELETE(f.request('/api/reading-lists','DELETE',{listId,storyId:story}))).status,200);
    assert.equal((await library.DELETE(f.request('/api/library','DELETE',{story_id:story}))).status,200);
    assert.deepEqual((await (await library.GET()).json()).items,[]);

    const notifications = f.load(root + '/app/api/notifications/route.ts');
    f.sqlite.prepare("INSERT INTO user_notifications(id,user_id,notification_type,title,body,href) VALUES ('note',?,'reply','Title','Text','/')").run(f.user);
    assert.deepEqual(await (await notifications.GET(f.request('/api/notifications?summary=1'))).json(),{unread_count:1});
    assert.equal((await notifications.PATCH(f.request('/api/notifications','PATCH',{id:'note'}))).status,200);
    assert.deepEqual(await (await notifications.GET(f.request('/api/notifications?summary=1'))).json(),{unread_count:0});
  } finally {
    f.sqlite.close();
  }
});

test('D1 preview creates groups and manages invitations and invite links', async () => {
  const f = fixture();
  try {
    for (const [id,username] of [['peer1','peer_one'],['peer2','peer_two']]) {
      f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES (?,?,'pw',?)").run(id,username,id);
      f.sqlite.prepare('INSERT INTO profiles(id,user_id,username) VALUES (?,?,?)').run(id,id,username);
    }
    const groups = f.load(root + '/app/api/chat/groups/route.ts');
    const created = await groups.POST(f.request('/api/chat/groups','POST',{name:'Grupo teste',usernames:['peer_one']}));
    assert.equal(created.status,201);
    const thread_id = (await created.json()).thread_id;
    const invites = f.load(root + '/app/api/chat/groups/invitations/route.ts');
    const endpoint = '/api/chat/groups/invitations';
    assert.equal((await invites.PATCH(f.request(endpoint,'PATCH',{thread_id,usernames:['peer_two']}))).status,200);
    const link = await invites.POST(f.request(endpoint,'POST',{thread_id}));
    assert.equal(link.status,200);
    const token = (await link.json()).url.split('/').at(-1);
    const join = f.load(root + '/app/api/chat/groups/join/route.ts');
    const info = await join.GET(f.request('/api/chat/groups/join?token=' + token));
    assert.equal((await info.json()).group.name,'Grupo teste');
    assert.equal((await invites.DELETE(f.request(endpoint,'DELETE',{thread_id}))).status,200);
    assert.equal((await join.GET(f.request('/api/chat/groups/join?token=' + token))).status,404);
  } finally {
    f.sqlite.close();
  }
});

test('D1 preview stores list images and group avatars with distinct visibility rules', async () => {
  const f = fixture();
  try {
    const id = '11000000-0000-4000-8000-000000000091';
    const group = '11000000-0000-4000-8000-000000000092';
    const png = Buffer.from('89504e470d0a1a0a00000000','hex');
    f.sqlite.prepare("INSERT INTO reading_lists(id,user_id,name) VALUES (?,?,'List')").run(id,f.profile);
    f.sqlite.prepare("INSERT INTO chat_threads(id,initiator_id,name,kind,status) VALUES (?,?,'Group','group','accepted')").run(group,f.profile);
    f.sqlite.prepare("INSERT INTO chat_group_members(thread_id,profile_id,status) VALUES (?,?,'accepted')").run(group,f.profile);
    const check = async (route, url, resourceId, field, deniedStatus) => {
      const params = {params:Promise.resolve({id:resourceId})};
      const form = new FormData();
      form.set(field,new File([png],'test.png',{type:'image/png'}));
      const saved = await route.POST(new Request('https://preview.invalid'+url,{
        method:'POST',headers:{origin:'https://preview.invalid'},body:form,
      }), params);
      assert.equal(saved.status,200);
      const result = await route.GET(f.request(url),params);
      assert.equal(result.status,200);
      assert.deepEqual(Buffer.from(await result.arrayBuffer()),png);
      f.setToken(null);
      assert.equal((await route.GET(f.request(url),params)).status,deniedStatus);
      f.setToken(f.hash);
      assert.equal((await route.DELETE(f.request(url,'DELETE'),params)).status,200);
      assert.equal((await route.GET(f.request(url),params)).status,404);
    };
    await check(f.load(root+'/app/api/reading-lists/[id]/image/route.ts'),'/api/reading-lists/'+id+'/image',id,'image',404);
    await check(f.load(root+'/app/api/chat/groups/[id]/avatar/route.ts'),'/api/chat/groups/'+group+'/avatar',group,'file',401);
    assert.equal(f.objects.size,0);
  } finally {
    f.sqlite.close();
  }
});

test('D1 profile routes update privacy and pin an owned published story', async () => {
  const f = fixture();
  try {
    const privacy = f.load(root+'/app/api/profile/privacy/route.ts');
    const set = body => privacy.PUT(f.request('/api/profile/privacy','PUT',body));
    assert.equal((await set({is_private:true,reposts_private:true})).status,200);
    const settings = (await (await privacy.GET()).json());
    assert.equal(settings.is_private,true);
    assert.equal(settings.reposts_private,true);
    assert.equal((await set({is_official:true})).status,400);
    const pin = f.load(root+'/app/api/profile/pinned-story/route.ts');
    const story = '11000000-0000-4000-8000-000000000095';
    const chapter = '11000000-0000-4000-8000-000000000096';
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES (?,?,'Story')").run(story,f.profile);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body) VALUES (?,?,1,'Chapter','Body')").run(chapter,story);
    const change = value => pin.PUT(f.request('/api/profile/pinned-story','PUT',{story_id:value}));
    assert.equal((await (await change(story)).json()).pinned_story_id,story);
    assert.equal((await (await change(null)).json()).pinned_story_id,null);
  } finally {
    f.sqlite.close();
  }
});

test('D1 people and schedule routes respect blocks and show followed publications', async () => {
  const f = fixture();
  try {
    const peer = '11000000-0000-4000-8000-000000000101';
    const story = '11000000-0000-4000-8000-000000000102';
    const first = '11000000-0000-4000-8000-000000000103';
    const next = '11000000-0000-4000-8000-000000000104';
    f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES (?,'peer_author','pw','peer-key')").run(peer);
    f.sqlite.prepare("INSERT INTO profiles(id,user_id,username) VALUES (?,?,'peer_author')").run(peer,peer);
    f.sqlite.prepare("INSERT INTO follows(follower_id,following_id) VALUES (?,?)").run(f.profile,peer);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES (?,?,'Story')").run(story,peer);
    const insert=f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body,published,publication_status) VALUES (?,?,?,'Chapter','Body',?,?)");
    insert.run(first,story,1,1,'published');
    insert.run(next,story,2,0,'scheduled');
    f.sqlite.prepare("INSERT INTO scheduled_chapters(id,chapter_id,scheduled_for) VALUES (?,?,'2098-01-01T00:00:00.000Z')").run(next,next);
    const people=f.load(root+'/app/api/chat/people/route.ts');
    const lookup=()=>people.GET(f.request('/api/chat/people?q=peer_'));
    assert.equal((await (await lookup()).json()).people[0].id,peer);
    const updates=f.load(root+'/app/api/upcoming-updates/route.ts');
    assert.equal((await (await updates.GET()).json()).updates[0].chapter_id,next);
    f.sqlite.prepare("INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES (?,?)").run(f.profile,peer);
    assert.deepEqual((await (await lookup()).json()).people,[]);
    assert.deepEqual((await (await updates.GET()).json()).updates,[]);
  } finally {
    f.sqlite.close();
  }
});

test('D1 account routes list owned stories and cancel applications with an audit entry', async () => {
  const f = fixture();
  try {
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES ('owned',?,'Owned story')").run(f.profile);
    const mine = f.load(root + '/app/api/my-stories/route.ts');
    assert.equal((await (await mine.GET()).json()).stories[0].id,'owned');
    f.sqlite.exec(`INSERT INTO departments(id,name,slug) VALUES ('dep','Equipe','equipe');
      INSERT INTO opportunities(id,department_id,title,opens_at,closes_at)
      VALUES ('opening','dep','Vaga','2020-01-01','2098-01-01');`);
    f.sqlite.prepare("INSERT INTO applications(id,opportunity_id,user_id) VALUES ('entry','opening',?)").run(f.user);
    const apps = f.load(root + '/app/api/applications/mine/route.ts');
    const cancellation = f.load(root + '/app/api/applications/cancel/route.ts');
    const listing = async () => (await (await apps.GET()).json()).applications[0];
    assert.equal((await listing()).opportunity.department.name,'Equipe');
    const cancel = () => cancellation.POST(f.request('/api/applications/cancel','POST',{application_id:'entry'}));
    assert.equal((await cancel()).status,200);
    assert.equal((await cancel()).status,409);
    assert.equal((await listing()).status,'cancelled');
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM admin_audit_log WHERE subject_id='entry'").get().n,1);
  } finally {
    f.sqlite.close();
  }
});

test('D1 discovery activity records a single daily view and respects blocks', async () => {
  const f = fixture();
  try {
    const author = '11000000-0000-4000-8000-000000000111';
    const story = '11000000-0000-4000-8000-000000000112';
    f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES (?,'view_author','pw','view-key')").run(author);
    f.sqlite.prepare("INSERT INTO profiles(id,user_id,username) VALUES (?,?,'view_author')").run(author,author);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES (?,?,'Story')").run(story,author);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body) VALUES ('view-chapter',?,1,'Chapter','Body')").run(story);
    f.sqlite.prepare("INSERT INTO tags(id,name,slug) VALUES ('tag','Literatura','literatura')").run();
    f.sqlite.prepare("INSERT INTO story_tags(story_id,tag_id) VALUES (?,'tag')").run(story);
    const tagged = f.load(root + '/app/api/tags/[slug]/route.ts');
    const readTag = async () => (await tagged.GET(f.request('/api/tags/literatura'),{params:Promise.resolve({slug:'literatura'})})).json();
    assert.equal((await readTag()).stories[0].id,story);
    const activity = f.load(root + '/app/api/discovery/activity/route.ts');
    const view = async () => (await activity.POST(f.request('/api/discovery/activity','POST',{story_id:story}))).json();
    assert.equal((await view()).recorded,true);
    assert.equal((await view()).recorded,true);
    assert.deepEqual(f.sqlite.prepare('SELECT viewed FROM story_daily_engagement').all().map(x=>x.viewed),[1]);
    f.sqlite.prepare('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES (?,?)').run(f.profile,author);
    assert.equal((await view()).recorded,false);
    assert.deepEqual((await readTag()).stories,[]);
  } finally {
    f.sqlite.close();
  }
});

test('D1 follow HTTP flow enforces private profile requests and removes follows on block', async () => {
  const f = fixture();
  try {
    const peer = '11000000-0000-4000-8000-000000000121';
    const peerHash = 'b'.repeat(64);
    f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES (?,'follow_peer','pw','follow-key')").run(peer);
    f.sqlite.prepare("INSERT INTO profiles(id,user_id,username,is_private) VALUES (?,?,'follow_peer',1)").run(peer,peer);
    f.sqlite.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES ('peer-session',?,?,'2098-01-01')").run(peer,peerHash);
    const follow = f.load(root+'/app/api/follows/route.ts');
    const requests = f.load(root+'/app/api/follows/requests/route.ts');
    const list = f.load(root+'/app/api/follows/list/route.ts');
    const control = f.load(root+'/app/api/profile/control/route.ts');
    const followRequest = f.request('/api/follows','POST',{following_id:peer});
    assert.deepEqual(await (await follow.POST(followRequest)).json(),{following:false,requested:true});
    f.setToken(peerHash);
    assert.equal((await (await requests.GET()).json()).requests[0].requester_id,f.profile);
    assert.equal((await requests.PATCH(f.request('/api/follows/requests','PATCH',{requester_id:f.profile,action:'accept'}))).status,200);
    f.setToken(f.hash);
    const users=await list.GET(f.request('/api/follows/list?user_id='+peer+'&kind=followers'));
    assert.equal((await users.json()).people[0].id,f.profile);
    assert.equal((await control.POST(f.request('/api/profile/control','POST',{target:peer,action:'mute'}))).status,200);
    assert.equal((await (await control.GET(f.request('/api/profile/control?target='+peer))).json()).muted,true);
    assert.equal((await control.POST(f.request('/api/profile/control','POST',{target:peer,action:'block'}))).status,200);
    const state=await (await follow.GET(f.request('/api/follows?user_id='+peer))).json();
    assert.equal(state.is_following,false);
    assert.equal(state.restricted,true);
  } finally {
    f.sqlite.close();
  }
});

test('D1 chapter comments keep response shape and reject replies outside the chapter', async () => {
  const f = fixture();
  try {
    const story='11000000-0000-4000-8000-000000000131';
    const first='11000000-0000-4000-8000-000000000132';
    const second='11000000-0000-4000-8000-000000000133';
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES (?,?,'Story')").run(story,f.profile);
    const insert=f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body) VALUES (?,?,?,'Chapter','Body')");
    insert.run(first,story,1);
    insert.run(second,story,2);
    const route=f.load(root+'/app/api/comments/route.ts');
    const post=(chapter_id,parent_comment_id)=>route.POST(f.request('/api/comments','POST',{
      chapter_id,parent_comment_id,body:'Comentário',selected_text:'Trecho',start_offset:0,
    }));
    const created=await post(first,null);
    assert.equal(created.status,201);
    const {comment}=await created.json();
    assert.equal(comment.user_id,f.profile);
    assert.equal(typeof comment.profiles.username,'string');
    assert.equal((await post(second,comment.id)).status,404);
    assert.equal((await post(first,comment.id)).status,201);
    const owned = f.load(root+'/app/api/profile/stories/route.ts');
    assert.equal((await (await owned.GET()).json()).stories[0].id,story);
    const author = f.load(root+'/app/api/stories/author/[id]/route.ts');
    const byAuthor = await author.GET(f.request('/api/stories/author/'+f.profile),{params:Promise.resolve({id:f.profile})});
    assert.equal((await byAuthor.json()).stories[0].id,story);
    const likes = f.load(root+'/app/api/stories/[id]/like/route.ts');
    const likeParams={params:Promise.resolve({id:story})};
    const toggle=()=>likes.POST(f.request('/api/stories/'+story+'/like','POST'),likeParams);
    assert.deepEqual(await (await toggle()).json(),{likes:1,liked:true});
    assert.deepEqual(await (await toggle()).json(),{likes:0,liked:false});
    const listing=await route.GET(f.request('/api/comments?chapter_id='+first));
    const {comments}=await listing.json();
    assert.equal(comments.length,2);
    assert.equal(comments.find(row=>row.id!==comment.id).parent_comment_id,comment.id);
  } finally {
    f.sqlite.close();
  }
});

function addMigrationPeer(f) {
  const user = '22000000-0000-4000-8000-000000000001';
  const profile = '22000000-0000-4000-8000-000000000002';
  const hash = 'b'.repeat(64);
  f.sqlite.prepare("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,'http_peer','synthetic','synthetic-peer')").run(user);
  f.sqlite.prepare("INSERT INTO profiles(id,user_id,username) VALUES(?,?,'http_peer')").run(profile,user);
  f.sqlite.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES('peer-session',?,?,'2099-01-01T00:00:00Z')").run(user,hash);
  return {user,profile,hash};
}

test('D1 reports, support and moderation preserve ticket ownership and staff permissions', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    f.sqlite.exec("INSERT INTO departments(id,name,slug) VALUES('moderation','Moderação','moderacao')");
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(peer.user);
    const route = name => f.load(root+'/app/api/'+name+'/route.ts');
    const report = {content_type:'profile',content_id:peer.profile,reason:'spam'};
    assert.equal((await route('reports').POST(f.request('/api/reports','POST',report))).status,201);
    assert.equal((await route('reports').POST(f.request('/api/reports','POST',report))).status,409);
    const body = {category:'help',subject:'Ajuda no site',details:'Mensagem para o suporte',target_username:'http_reader'};
    const created = await route('support').POST(f.request('/api/support','POST',body));
    assert.equal(created.status,201);
    const {id} = await created.json();
    assert.equal((await (await route('support').GET()).json()).tickets[0].id,id);
    assert.equal((await route('moderation/inbox').GET()).status,403);
    const warning = {source_type:'support',source_id:id,reason:'Motivo de teste autorizado'};
    assert.equal((await route('moderation/warnings').POST(f.request('/api/moderation/warnings','POST',warning))).status,409);
    f.setToken(peer.hash);
    assert.equal((await (await route('support').GET()).json()).tickets.length,0);
    assert.equal((await (await route('moderation/inbox').GET()).json()).tickets[0].reporter,'http_reader');
    const patch = f.request('/api/moderation/inbox','PATCH',{id,status:'resolved',notes:'',response:'Concluído'});
    assert.equal((await route('moderation/inbox').PATCH(patch)).status,200);
    assert.equal((await route('moderation/warnings').POST(f.request('/api/moderation/warnings','POST',warning))).status,201);
    assert.equal((await route('moderation/warnings').POST(f.request('/api/moderation/warnings','POST',warning))).status,409);
  } finally { f.sqlite.close(); }
});

test('D1 story publication, download and beta reading enforce release and invitation access', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const story = '33000000-0000-4000-8000-000000000001';
    const chapter = '33000000-0000-4000-8000-000000000002';
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title,story_kind,allows_download,release_at) VALUES(?,?,'Livro','original',1,'infinity')").run(story,f.profile);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body,published,publication_status) VALUES(?,?,1,'Capítulo',?,0,'draft')").run(chapter,story,'<p>Rascunho</p><img src="/private">');
    const route = name => f.load(root+'/app/api/'+name+'/route.ts');
    const params = {params:Promise.resolve({id:story})};
    const release = (action, scheduledFor) => route('stories/[id]/publication').PATCH(
      f.request('/publication','PATCH',{action,scheduledFor}),params);
    const book = () => route('stories/[id]/book').GET(f.request('/book'),params);
    assert.equal((await book()).status,404);
    assert.equal((await release('publish')).status,409);
    const beta = route('beta-reading');
    const betaPost = body => beta.POST(f.request('/api/beta-reading','POST',body));
    assert.equal((await betaPost({action:'invite',chapter_id:chapter,reader:'http_peer'})).status,200);
    assert.equal((await betaPost({action:'invite',chapter_id:chapter,reader:'http_peer'})).status,200);
    f.setToken(peer.hash);
    assert.equal((await release('publish')).status,404);
    const {invites} = await (await beta.GET(f.request('/api/beta-reading'))).json();
    assert.equal(invites[0].author_name,'http_reader');
    const draft = () => beta.GET(f.request('/api/beta-reading?invite='+invites[0].id));
    assert.equal((await draft()).status,404);
    assert.equal((await betaPost({action:'accept',invite_id:invites[0].id})).status,200);
    assert.equal((await betaPost({action:'note',invite_id:invites[0].id,body:'Nota'})).status,200);
    assert.equal((await (await draft()).json()).draft.body,'<p>Rascunho</p>');
    assert.equal((await betaPost({action:'revoke',invite_id:invites[0].id})).status,200);
    assert.equal((await draft()).status,404);
    f.setToken(f.hash);
    f.sqlite.prepare("UPDATE chapters SET publication_status='scheduled' WHERE id=?").run(chapter);
    f.sqlite.prepare("INSERT INTO scheduled_chapters(id,chapter_id,scheduled_for) VALUES('job',?,?)").run(chapter,new Date(Date.now()+3600000).toISOString());
    assert.equal((await (await release('schedule',new Date(Date.now()+7200000).toISOString())).json()).publication,'scheduled');
    f.sqlite.prepare("UPDATE chapters SET published=1,publication_status='published' WHERE id=?").run(chapter);
    assert.equal((await (await release('publish')).json()).publication,'published');
    assert.equal((await (await book()).json()).chapters[0].title,'Capítulo');
    assert.equal((await release('publish')).status,200);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM user_notifications WHERE notification_type='chapter_release'").get().n,1);
    assert.equal((await release('unpublish')).status,200);
    assert.equal((await book()).status,404);
  } finally { f.sqlite.close(); }
});

test('D1 tags, discovery preferences and reposts preserve account and privacy controls', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const route = name => f.load(root+'/app/api/'+name+'/route.ts');
    f.sqlite.exec("INSERT INTO tag_categories(id,name,slug) VALUES('fandom','Fandom','fandom')");
    const tag = () => route('tags').POST(f.request('/api/tags','POST',{name:'D1 Fandom',category:'fandom'}));
    assert.equal((await tag()).status,201);
    assert.equal((await tag()).status,200);
    const listed = await route('tags').GET(f.request('/api/tags?category=fandom&q=fandom'));
    assert.equal((await listed.json()).tags[0].category.slug,'fandom');
    const prefs = route('discovery/preferences');
    assert.ok((await (await prefs.GET()).json()).catalog.includes('D1 Fandom'));
    const save = account => new Request('https://preview.invalid/api/discovery/preferences',{
      method:'PUT',headers:{'X-Discovery-Account':account},body:JSON.stringify({favorite_fandoms:['D1 Fandom']}),
    });
    assert.equal((await prefs.PUT(save(peer.user))).status,409);
    assert.equal((await prefs.PUT(save(f.user))).status,200);
    assert.deepEqual((await (await prefs.GET()).json()).favorite_fandoms,['D1 Fandom']);
    const post = '33000000-0000-4000-8000-000000000003';
    f.sqlite.prepare("INSERT INTO nook_posts(id,user_id,body) VALUES(?,?,'Original')").run(post,peer.profile);
    const reposts = route('nook-posts/reposts');
    const change = method => f.request('/api/nook-posts/reposts',method,{post_id:post,comment:'Comentário'});
    assert.equal((await reposts.POST(change('POST'))).status,200);
    const list = search => reposts.GET(f.request('/api/nook-posts/reposts?'+search));
    assert.equal((await (await list('post_id='+post)).json()).nookled,true);
    assert.equal((await (await list('profile_id='+f.profile)).json()).posts[0].repost.comment,'Comentário');
    f.sqlite.prepare('UPDATE profiles SET reposts_private=1 WHERE id=?').run(f.profile);
    f.setToken(null);
    assert.deepEqual((await (await list('post_id='+post)).json()).reposts,[]);
    f.setToken(f.hash);
    assert.equal((await reposts.DELETE(change('DELETE'))).status,200);
    assert.equal((await (await list('post_id='+post)).json()).nookled,false);
  } finally { f.sqlite.close(); }
});

test('D1 chapter banners use preview storage and respect draft visibility', async () => {
  const f = fixture();
  try {
    const story = '33000000-0000-4000-8000-000000000011';
    const chapter = '33000000-0000-4000-8000-000000000012';
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title,release_at) VALUES(?,?,'Livro','infinity')").run(story,f.profile);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body,published,publication_status) VALUES(?,?,1,'Capítulo','Texto',0,'draft')").run(chapter,story);
    const banner = f.load(root+'/app/api/chapters/[id]/banner/route.ts');
    const media = f.load(root+'/app/api/content-media/route.ts');
    const update = form => banner.PUT(new Request('https://preview.invalid/api/banner',{
      method:'PUT', headers:{origin:'https://preview.invalid'}, body:form,
    }),{params:Promise.resolve({id:chapter})});
    const file = new FormData();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB0UAAAAASUVORK5CYII=', 'base64');
    file.set('file',new File([png],'banner.png',{type:'image/png'}));
    const uploaded = await update(file);
    assert.equal(uploaded.status,200);
    const {banner_url} = await uploaded.json();
    assert.match(banner_url,/^\/api\/content-media\?/);
    assert.equal(f.objects.size,1);
    assert.equal((await media.GET(f.request(banner_url))).status,200);
    f.setToken(null);
    assert.equal((await media.GET(f.request(banner_url))).status,404);
    f.setToken(f.hash);
    const remove = new FormData();
    remove.set('remove','true');
    assert.equal((await update(remove)).status,200);
    assert.equal(f.objects.size,0);
    assert.equal((await media.GET(f.request(banner_url))).status,404);
  } finally { f.sqlite.close(); }
});

test('D1 admin reports scope the queue and audit a confirmed moderation decision', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    f.sqlite.exec("INSERT INTO departments(id,name,slug) VALUES('moderation','Moderação','moderacao')");
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(f.user);
    const reportRoute = f.load(root+'/app/api/reports/route.ts');
    const review = f.load(root+'/app/api/admin/reports/route.ts');
    f.setToken(peer.hash);
    const submitted = await reportRoute.POST(f.request('/api/reports','POST',{
      content_type:'profile',content_id:f.profile,reason:'spam',
    }));
    assert.equal(submitted.status,201);
    const {report_id:id} = await submitted.json();
    assert.equal((await review.GET()).status,403);
    f.setToken(f.hash);
    const initial = await (await review.GET()).json();
    assert.equal(initial.reports[0].reporter.username,'http_peer');
    assert.equal(initial.reports[0].content_hidden,false);
    const patch = confirm => review.PATCH(f.request('/api/admin/reports','PATCH',{id,status:'resolved',confirm}));
    assert.equal((await patch(false)).status,400);
    assert.equal((await patch(true)).status,200);
    assert.equal((await patch(true)).status,409);
    assert.equal((await (await review.GET()).json()).reports[0].status,'resolved');
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM admin_audit_log WHERE subject_id=?").get(id).n,1);
  } finally { f.sqlite.close(); }
});

test('D1 admin overview protects global counts and scopes department staff', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const overview = f.load(root+'/app/api/admin/overview/route.ts');
    assert.equal((await overview.GET()).status,403);
    f.sqlite.exec(`INSERT OR IGNORE INTO permissions(code,name,scope) VALUES ('admin.view','Painel','department');
      INSERT INTO departments(id,name,slug) VALUES ('dept-a','Equipe A','equipe-a'),('dept-b','Equipe B','equipe-b');
      INSERT INTO team_roles(id,department_id,name) VALUES ('role-a','dept-a','Staff'),('role-b','dept-b','Staff');
      INSERT INTO team_role_permissions(role_id,permission_code) VALUES ('role-a','admin.view');`);
    f.sqlite.prepare("INSERT INTO team_memberships(id,user_id,department_id,role_id,status) VALUES('member',?,'dept-a','role-a','active')").run(f.user);
    assert.deepEqual(await (await overview.GET()).json(),{
      is_platform_admin:false, stats:{users:null,departments:1,roles:1,members:1},
    });
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(peer.user);
    f.setToken(peer.hash);
    assert.deepEqual(await (await overview.GET()).json(),{
      is_platform_admin:true, stats:{users:2,departments:2,roles:2,members:1},
    });
  } finally { f.sqlite.close(); }
});

test('D1 opportunities validate required answers and audit a single application', async () => {
  const f = fixture();
  try {
    const id = '33000000-0000-4000-8000-000000000021';
    f.sqlite.exec("INSERT INTO departments(id,name,slug) VALUES ('staff','Equipe','equipe')");
    f.sqlite.prepare(`INSERT INTO opportunities(id,department_id,title,questions,opens_at,closes_at,status)
      VALUES (?,'staff','Vaga',?,'2000-01-01','2099-01-01','open')`)
      .run(id,JSON.stringify([{id:'motivo',required:true}]));
    const route = f.load(root+'/app/api/opportunities/route.ts');
    assert.equal((await (await route.GET()).json()).opportunities[0].department.name,'Equipe');
    const apply = answers => route.POST(f.request('/api/opportunities','POST',{opportunity_id:id,answers}));
    assert.equal((await apply({motivo:'   '})).status,400);
    assert.equal((await apply({motivo:'Teste',extra:'Inválida'})).status,400);
    assert.equal((await apply({motivo:'Teste'})).status,201);
    assert.equal((await apply({motivo:'Teste'})).status,409);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM admin_audit_log WHERE action='application.submitted'").get().n,1);
    f.sqlite.prepare("UPDATE opportunities SET status='closed' WHERE id=?").run(id);
    assert.equal((await apply({motivo:'Teste'})).status,404);
  } finally { f.sqlite.close(); }
});

test('D1 profile update changes only the authenticated profile', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const route = f.load(root+'/app/api/profile/update/route.ts');
    const patch = body => route.PATCH(f.request('/api/profile/update','PATCH',body));
    assert.equal((await patch({theme_color:'invalid'})).status,400);
    const response = await patch({id:peer.profile,display_name:' Leitora ',bio:'',theme_color:'#ABCDEF',spotify_url:null});
    assert.equal(response.status,200);
    const {user} = await response.json();
    assert.equal(user.id,f.profile);
    assert.equal(user.display_name,'Leitora');
    assert.equal(user.bio,null);
    assert.equal(user.theme_color,'#abcdef');
    assert.equal(user.spotify_link,null);
    assert.equal(typeof user.verified,'boolean');
    assert.equal(f.sqlite.prepare('SELECT display_name FROM profiles WHERE id=?').get(peer.profile).display_name,null);
    f.setToken(null);
    assert.equal((await patch({display_name:'Sem sessão'})).status,401);
  } finally { f.sqlite.close(); }
});

test('D1 literary events support editing, image access, enrollment and deactivation', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const id = '33000000-0000-4000-8000-000000000031';
    const story = '33000000-0000-4000-8000-000000000032';
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(f.user);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES(?,?,'Obra')").run(story,peer.profile);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body,published) VALUES('event-chapter',?,1,'Capítulo','Texto',1)").run(story);
    const route = f.load(root+'/app/api/events/route.ts');
    const event = {id,title:'Evento',description:'Descrição',starts_at:'2000-01-01',ends_at:'2099-01-01',
      details:{format:'Mostra literária',eligibility:'',entry_limit:'Ilimitadas',instructions:'Leia',rules:'Regras',topics:[],images:[{alt:'Capa'}]}};
    const multipart = (method, body, upload) => {
      const form = new FormData();
      form.set('event',JSON.stringify(body));
      if (upload) {
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB0UAAAAASUVORK5CYII=', 'base64');
        form.set('image-0',new File([png],'event.png',{type:'image/png'}));
      }
      return new Request('https://preview.invalid/api/events',{method,headers:{origin:'https://preview.invalid'},body:form});
    };
    f.setToken(peer.hash);
    assert.equal((await route.POST(multipart('POST',event,true))).status,403);
    f.setToken(f.hash);
    assert.equal((await route.POST(multipart('POST',event,true))).status,201);
    const list = () => route.GET(f.request('/api/events?evento='+id));
    const saved = (await (await list()).json()).events[0];
    const imageUrl = '/api/events?event='+id+'&image='+saved.details.images[0].id;
    assert.equal((await route.GET(f.request(imageUrl))).status,200);
    assert.equal((await route.PATCH(multipart('PATCH',{...saved,title:'Editado'},false))).status,200);
    assert.equal((await route.PATCH(multipart('PATCH',saved,false))).status,409);
    f.setToken(peer.hash);
    const enroll = () => route.POST(f.request('/api/events','POST',{action:'enter',event_id:id,story_id:story}));
    assert.equal((await enroll()).status,200);
    assert.equal((await enroll()).status,200);
    f.setToken(f.hash);
    assert.equal((await route.PATCH(f.request('/api/events','PATCH',{id,active:false}))).status,200);
    f.setToken(null);
    assert.equal((await (await list()).json()).events.length,0);
    assert.equal((await route.GET(f.request(imageUrl))).status,404);
  } finally { f.sqlite.close(); }
});

test('D1 stickers save and list media separately for each profile', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const route = f.load(root+'/app/api/stickers/route.ts');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB0UAAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.set('file',new File([png],'sticker.png',{type:'image/png'}));
    const saved = await route.POST(new Request('https://preview.invalid/api/stickers',{method:'POST',body:form}));
    assert.equal(saved.status,201);
    const {sticker} = await saved.json();
    assert.equal(f.objects.size,1);
    const list = () => route.GET(f.request('/api/stickers'));
    assert.equal((await (await list()).json()).stickers[0].id,sticker.id);
    f.setToken(peer.hash);
    assert.deepEqual((await (await list()).json()).stickers,[]);
  } finally { f.sqlite.close(); }
});

test('D1 feed media uploads require post ownership and enforce four attachments', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const id = '33000000-0000-4000-8000-000000000041';
    f.sqlite.prepare("INSERT INTO nook_posts(id,user_id,body) VALUES(?,?,'Post')").run(id,f.profile);
    const route = f.load(root+'/app/api/nook-posts/media/route.ts');
    const content = f.load(root+'/app/api/content-media/route.ts');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB0UAAAAASUVORK5CYII=', 'base64');
    const upload = () => {
      const form = new FormData();
      form.set('post_id',id);
      form.set('file',new File([png],'post.png',{type:'image/png'}));
      return route.POST(new Request('https://preview.invalid/api/nook-posts/media',{method:'POST',body:form}));
    };
    f.setToken(peer.hash);
    assert.equal((await upload()).status,403);
    f.setToken(f.hash);
    const first = await upload();
    assert.equal(first.status,201);
    const {media} = await first.json();
    assert.equal((await content.GET(f.request(media.media_url))).status,200);
    for (let index=0;index<3;index++) assert.equal((await upload()).status,201);
    assert.equal((await upload()).status,400);
    assert.equal(f.objects.size,4);
  } finally { f.sqlite.close(); }
});

test('D1 discovery excludes blocked stories and ranks the selected fandom', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title,fandom) VALUES('book',?,'Obra','Fã Clube')").run(peer.profile);
    f.sqlite.exec(`INSERT INTO chapters(id,story_id,chapter_number,title,body,published) VALUES ('chapter','book',1,'Capítulo','Texto',1);
      INSERT INTO tag_categories(id,name,slug) VALUES ('genres','Gênero','genre');
      INSERT INTO tags(id,name,slug,category_id) VALUES ('fantasy','Fantasia','fantasia','genres');
      INSERT INTO story_tags(story_id,tag_id) VALUES ('book','fantasy');`);
    f.sqlite.prepare("INSERT INTO discovery_preferences(user_id,favorite_fandoms) VALUES(?,'[\"Fa Clube\"]')").run(f.user);
    f.sqlite.prepare("INSERT INTO reading_progress(user_id,story_id,chapter_id,progress_percent,position) VALUES(?,'book','chapter',50,4)").run(f.profile);
    f.sqlite.prepare("INSERT INTO story_daily_engagement(story_id,reader_id,viewed,read) VALUES('book',?,1,1)").run(f.profile);
    const route = f.load(root+'/app/api/discovery/route.ts');
    const response = await route.GET();
    assert.equal(response.status,200);
    const home = await response.json();
    assert.equal(home.user.username,'http_reader');
    assert.equal(home.weekly[0].id,'book');
    assert.equal(home.for_you[0].id,'book');
    assert.equal(home.continue_reading[0].chapter_id,'chapter');
    f.sqlite.prepare('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES(?,?)').run(peer.profile,f.profile);
    const blocked = await (await route.GET()).json();
    assert.deepEqual(blocked.new_fandom,[]);
    assert.deepEqual(blocked.continue_reading,[]);
    f.setToken(null);
    assert.equal((await route.GET()).status,401);
  } finally { f.sqlite.close(); }
});

test('D1 story creation saves the draft, tags and gated cover together', async () => {
  const f = fixture();
  try {
    f.sqlite.exec("INSERT INTO tag_categories(id,name,slug) VALUES('genres','Gênero','genre')");
    const route = f.load(root+'/app/api/stories/create/route.ts');
    const media = f.load(root+'/app/api/content-media/route.ts');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB0UAAAAASUVORK5CYII=', 'base64');
    const create = () => {
      const form = new FormData();
      for (const [key,value] of Object.entries({title:'Título',genre:'Fantasia',tags:'Aventura,Fantasia',
        story_kind:'original',allows_download:'true',series_name:'Saga',series_volume:'1'})) form.set(key,value);
      form.set('cover',new File([png],'cover.png',{type:'image/png'}));
      return route.POST(new Request('https://preview.invalid/api/stories/create',{method:'POST',body:form}));
    };
    const created = await create();
    assert.equal(created.status,201);
    const {story} = await created.json();
    assert.equal(story.author_id,f.profile);
    assert.equal(f.sqlite.prepare('SELECT allows_download,release_at FROM stories WHERE id=?').get(story.id).release_at,'infinity');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM story_tags WHERE story_id=?').get(story.id).n,2);
    assert.equal((await media.GET(f.request(story.cover_url))).status,200);
    assert.equal((await create()).status,500);
    assert.equal(f.objects.size,1);
    f.setToken(null);
    assert.equal((await media.GET(f.request(story.cover_url))).status,404);
    assert.equal((await create()).status,401);
  } finally { f.sqlite.close(); }
});

test('D1 application review rejects self-appointment and atomically appoints an applicant', async () => {
  const f = fixture();
  try {
    const peer = addMigrationPeer(f);
    const opportunity = '33000000-0000-4000-8000-000000000051';
    const application = '33000000-0000-4000-8000-000000000052';
    const role = '33000000-0000-4000-8000-000000000053';
    f.sqlite.exec("INSERT INTO departments(id,name,slug) VALUES('team','Equipe','equipe')");
    f.sqlite.prepare("INSERT INTO opportunities(id,department_id,title,opens_at,closes_at) VALUES(?,'team','Vaga','2000-01-01','2099-01-01')").run(opportunity);
    f.sqlite.prepare("INSERT INTO team_roles(id,department_id,name) VALUES(?,'team','Cargo')").run(role);
    f.sqlite.prepare('INSERT INTO applications(id,opportunity_id,user_id) VALUES(?,?,?)').run(application,opportunity,peer.user);
    const route = f.load(root+'/app/api/admin/applications/route.ts');
    const request = method=>f.request('/api/admin/applications',method,method==='PATCH'?{id:application,status:'approved',confirm:true,role_id:role}:undefined);
    assert.equal((await route.GET(request('GET'))).status,403);
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(peer.user);
    f.setToken(peer.hash);
    assert.equal((await route.PATCH(request('PATCH'))).status,403);
    f.setToken(f.hash);
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(f.user);
    const listed = await (await route.GET(request('GET'))).json();
    assert.equal(listed.applications[0].applicant.username,'http_peer');
    assert.deepEqual(listed.applications[0].opportunity.questions,[]);
    assert.equal((await route.PATCH(request('PATCH'))).status,200);
    assert.equal((await route.PATCH(request('PATCH'))).status,400);
    assert.equal(f.sqlite.prepare('SELECT user_id FROM team_memberships WHERE role_id=?').get(role).user_id,peer.user);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM user_notifications WHERE notification_type='team_appointment'").get().n,1);
    assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM admin_audit_log WHERE action='application.approved'").get().n,1);
  } finally { f.sqlite.close(); }
});

test('D1 chat evidence can be read only by authorized staff and is audited', async () => {
  const f = fixture();
  const previous = process.env.CHAT_ENCRYPTION_KEY_V2;
  try {
    process.env.CHAT_ENCRYPTION_KEY_V2 = 'd'.repeat(64);
    const peer = addMigrationPeer(f);
    const thread = '33000000-0000-4000-8000-000000000061';
    const message = '33000000-0000-4000-8000-000000000062';
    const {encryptChat,encodeChatBody}=f.load(root+'/lib/chat/crypto.ts');
    f.sqlite.prepare("INSERT INTO chat_threads(id,initiator_id,recipient_id,status) VALUES(?,?,?,'accepted')").run(thread,f.profile,peer.profile);
    f.sqlite.prepare('INSERT INTO chat_messages(id,thread_id,sender_id,body_cipher,cipher_version) VALUES(?,?,?,?,2)')
      .run(message,thread,peer.profile,encodeChatBody(encryptChat(Buffer.from('Evidência'),thread+':'+message+':body')));
    f.sqlite.exec("INSERT INTO departments(id,name,slug) VALUES('moderation','Moderação','moderacao')");
    const route=f.load(root+'/app/api/chat/reports/route.ts');
    const send=()=>route.POST(f.request('/api/chat/reports','POST',{thread_id:thread,message_id:message,reason:'Teste de denúncia'}));
    assert.equal((await send()).status,201);
    assert.equal((await route.GET()).status,403);
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(peer.user);
    f.setToken(peer.hash);
    const response=await route.GET();
    assert.equal(response.status,200);
    const {reports}=await response.json();
    assert.equal(reports[0].evidence.body,'Evidência');
    assert.equal(reports[0].reporter.username,'http_reader');
    assert.equal(reports[0].target.username,'http_peer');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM chat_audit_access').get().n,1);
    assert.equal((await route.PATCH(f.request('/api/chat/reports','PATCH',{id:reports[0].id}))).status,200);
    assert.equal(f.sqlite.prepare('SELECT status FROM chat_reports WHERE id=?').get(reports[0].id).status,'reviewed');
  } finally {
    if (previous===undefined) delete process.env.CHAT_ENCRYPTION_KEY_V2;
    else process.env.CHAT_ENCRYPTION_KEY_V2=previous;
    f.sqlite.close();
  }
});

test('D1 explore matches normalized queries, tags and private author access', async () => {
  const f = fixture();
  try {
    const peer=addMigrationPeer(f);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title,fandom) VALUES('catalog',?,'Coração','Aventura')").run(peer.profile);
    f.sqlite.exec("INSERT INTO chapters(id,story_id,chapter_number,title,body,published) VALUES('catalog-chapter','catalog',1,'Capítulo','Texto',1)");
    const route=f.load(root+'/app/api/explore/route.ts');
    const search=async query=>(await route.GET(f.request('/api/explore?'+query))).json();
    assert.equal((await search('q=coracao&includeTag=aventura')).stories[0].id,'catalog');
    assert.deepEqual((await search('excludeTag=aventura')).stories,[]);
    f.sqlite.prepare('UPDATE profiles SET is_private=1 WHERE id=?').run(peer.profile);
    assert.deepEqual((await search('q=coracao')).stories,[]);
    f.sqlite.prepare('INSERT INTO follows(follower_id,following_id) VALUES(?,?)').run(f.profile,peer.profile);
    assert.equal((await search('q=coracao')).stories[0].author.username,'http_peer');
  } finally { f.sqlite.close(); }
});

test('D1 social stories are visible to their author and followers and can be removed', async () => {
  const f=fixture();
  try {
    const peer=addMigrationPeer(f);
    const route=f.load(root+'/app/api/stories/route.ts');
    const media=f.load(root+'/app/api/content-media/route.ts');
    const form=new FormData();
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB0UAAAAASUVORK5CYII=','base64');
    form.set('file',new File([png],'story.png',{type:'image/png'}));
    form.set('thought','Oi');
    const saved=await route.POST(new Request('https://preview.invalid/api/stories',{method:'POST',body:form}));
    assert.equal(saved.status,201);
    const {story}=await saved.json();
    assert.equal(story.thought,'Oi');
    f.setToken(peer.hash);
    assert.equal((await media.GET(f.request(story.media_url))).status,404);
    f.sqlite.prepare('INSERT INTO follows(follower_id,following_id) VALUES(?,?)').run(peer.profile,f.profile);
    assert.equal((await (await route.GET()).json()).stories[0].user.username,'http_reader');
    assert.equal((await media.GET(f.request(story.media_url))).status,200);
    const remove=()=>route.DELETE(f.request('/api/stories','DELETE',{id:story.id}));
    assert.equal((await remove()).status,404);
    f.setToken(f.hash);
    assert.equal((await remove()).status,200);
    assert.equal(f.objects.size,0);
  } finally { f.sqlite.close(); }
});

test('D1 public profile hides private content and returns public lists and posts to followers', async () => {
  const f=fixture();
  try {
    const peer=addMigrationPeer(f);
    f.sqlite.prepare('UPDATE profiles SET is_private=1 WHERE id=?').run(peer.profile);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title) VALUES('profile-story',?,'Livro')").run(peer.profile);
    f.sqlite.exec("INSERT INTO chapters(id,story_id,chapter_number,title,body,published) VALUES('public-chapter','profile-story',1,'Capítulo','Texto',1)");
    f.sqlite.prepare("INSERT INTO nook_posts(id,user_id,body) VALUES('profile-post',?,'Mural')").run(peer.profile);
    f.sqlite.prepare("INSERT INTO reading_lists(id,user_id,name,is_public) VALUES('profile-list',?,'Lista',1)").run(peer.profile);
    f.sqlite.exec("INSERT INTO reading_list_items(id,list_id,story_id,position) VALUES('entry','profile-list','profile-story',0)");
    const route=f.load(root+'/app/api/public-profile/[username]/route.ts');
    const profile=async()=>await (await route.GET(f.request('/api/public-profile/http_peer'),{
      params:Promise.resolve({username:'http_peer'}),
    })).json();
    assert.equal((await profile()).restricted,true);
    f.sqlite.prepare('INSERT INTO follows(follower_id,following_id) VALUES(?,?)').run(f.profile,peer.profile);
    const visible=await profile();
    assert.equal(visible.restricted,false);
    assert.equal(visible.user.user_id,undefined);
    assert.equal(visible.stories[0].title,'Livro');
    assert.equal(visible.posts[0].body,'Mural');
    assert.equal(visible.reading_lists[0].items[0].story.id,'profile-story');
  } finally { f.sqlite.close(); }
});

test('D1 story details edit metadata, restrict drafts and require password for deletion', async () => {
  const f=fixture();
  try {
    const peer=addMigrationPeer(f);
    const id='33000000-0000-4000-8000-000000000071';
    const password='synthetic-story-password';
    const bcrypt=nativeRequire('bcryptjs');
    f.sqlite.prepare('UPDATE auth_accounts SET password_hash=? WHERE id=?').run(await bcrypt.hash(password,4),f.user);
    f.sqlite.prepare("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES('new-author-session',?,?,'2099-01-01')").run(f.user,f.hash);
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title,release_at) VALUES(?,?,'Antes','infinity')").run(id,f.profile);
    f.sqlite.prepare("INSERT INTO chapters(id,story_id,chapter_number,title,body,published) VALUES('draft-chapter',?,1,'Rascunho','Texto',0)").run(id);
    const route=f.load(root+'/app/api/stories/[id]/route.ts');
    const params={params:Promise.resolve({id})};
    const form=()=> {
      const data=new FormData();
      data.set('title','Depois');
      data.set('tags','Aventura');
      data.set('allows_download','true');
      return new Request('https://preview.invalid/api/story',{method:'PUT',body:data});
    };
    f.setToken(peer.hash);
    assert.equal((await route.GET(f.request('/story'),params)).status,404);
    assert.equal((await route.PUT(form(),params)).status,403);
    f.setToken(f.hash);
    const owner = await route.GET(f.request('/story'),params);
    const ownerBody = await owner.json();
    assert.equal(owner.status,200,JSON.stringify(ownerBody));
    assert.equal(ownerBody.chapters[0].title,'Rascunho');
    const edited=await route.PUT(form(),params);
    assert.equal(edited.status,200);
    assert.equal((await edited.json()).story.tags[0].name,'Aventura');
    const summary=await (await route.GET(f.request('/story?summary=1'),params)).json();
    assert.equal(summary.story.title,'Depois');
    const remove=value=>route.DELETE(f.request('/story','DELETE',{password:value}),params);
    assert.equal((await remove('wrong')).status,403);
    assert.equal((await remove(password)).status,200);
    assert.equal((await route.GET(f.request('/story'),params)).status,404);
  } finally { f.sqlite.close(); }
});

test('D1 admin management scopes all resources and audits department, role, opportunity and membership changes', async () => {
  const f=fixture();
  try {
    const peer=addMigrationPeer(f);
    f.sqlite.exec("INSERT OR IGNORE INTO permissions(code,name,scope) VALUES('members.view','Membros','department')");
    const route=f.load(root+'/app/api/admin/manage/route.ts');
    const method=(verb,body)=>route[verb](f.request('/api/admin/manage',verb,body));
    const read=resource=>route.GET(f.request('/api/admin/manage?resource='+resource));
    const get=async resource=>(await (await read(resource)).json())[resource];
    assert.equal((await read('departments')).status,403);
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES(?)').run(f.user);
    const dept={resource:'department',name:'Equipe',slug:'equipe'};
    const created=await method('POST',dept);
    assert.equal(created.status,201);
    const {id:department}=await created.json();
    assert.equal((await method('POST',dept)).status,409);
    assert.equal((await method('PATCH',{...dept,id:department,status:'active',name:'Equipe nova'})).status,200);
    const role={resource:'role',department_id:department,name:'Cargo',permission_codes:['members.view']};
    const roleCreated=await method('POST',role);
    assert.equal(roleCreated.status,201);
    const {id:roleId}=await roleCreated.json();
    assert.equal((await method('PATCH',{...role,id:roleId,status:'active',name:'Cargo novo'})).status,200);
    assert.deepEqual((await get('roles'))[0].permission_codes,['members.view']);
    const job={resource:'opportunity',department_id:department,title:'Vaga',openings:1,status:'open',
      questions:[{id:'reason',prompt:'Motivo',required:true}],opens_at:'2000-01-01',closes_at:'2099-01-01'};
    assert.equal((await method('POST',{...job,openings:0})).status,400);
    const jobCreated=await method('POST',job);
    assert.equal(jobCreated.status,201);
    const {id:jobId}=await jobCreated.json();
    assert.equal((await method('PATCH',{...job,id:jobId,status:'closed'})).status,200);
    assert.equal((await get('opportunities'))[0].status,'closed');
    const member=await method('POST',{resource:'member',user_id:peer.user,role_id:roleId});
    assert.equal(member.status,201);
    const {id:memberId}=await member.json();
    assert.equal((await get('members'))[0].profile.username,'http_peer');
    f.setToken(peer.hash);
    assert.equal((await get('members')).length,1);
    assert.equal((await read('audit')).status,403);
    assert.equal((await method('PATCH',{...dept,id:department,status:'archived'})).status,403);
    f.setToken(f.hash);
    assert.equal((await method('DELETE',{resource:'member',id:memberId,confirm:true})).status,200);
    assert.equal((await get('members'))[0].status,'removed');
    assert.equal((await method('POST',{resource:'user_status',user_id:peer.user,status:'suspended',confirm:true})).status,200);
    assert.equal((await (await read('audit')).json()).entries.length,9);
    assert.equal((await get('departments'))[0].name,'Equipe nova');
  } finally { f.sqlite.close(); }
});

test('D1 admin access and post detail respect session and account permissions', async () => {
  const f = fixture();
  try {
    const admin = f.load(root + '/app/api/admin/access/route.ts');
    const detail = f.load(root + '/app/api/nook-posts/detail/route.ts');
    const id = '11000000-0000-4000-8000-000000000041';
    f.sqlite.prepare('INSERT INTO nook_posts (id,user_id,body) VALUES (?,?,?)').run(id, f.profile, 'Post de teste');
    const request = f.request('/api/nook-posts/detail?id=' + id);
    assert.equal((await (await admin.GET()).json()).allowed, false);
    f.sqlite.prepare('INSERT INTO platform_admins(user_id) VALUES (?)').run(f.user);
    assert.deepEqual(await (await admin.GET()).json(), { allowed: true, moderation_allowed: true });
    const post = await detail.GET(request);
    assert.equal(post.status, 200);
    assert.equal((await post.json()).post.author.id, f.profile);
    f.sqlite.prepare("UPDATE auth_accounts SET account_status='suspended' WHERE id=?").run(f.user);
    assert.equal((await (await admin.GET()).json()).allowed, false);
    assert.equal((await detail.GET(request)).status, 401);
  } finally {
    f.sqlite.close();
  }
});

test('D1 legacy stories media is served only when its referencing story is visible', async () => {
  const f = fixture();
  try {
    const media = f.load(root + '/app/api/content-media/route.ts');
    const storagePath = 'fixture/cover.png';
    const url = 'https://fwwgoyburkdybbqmvljk.supabase.co/storage/v1/object/public/stories/' + storagePath;
    const request = f.request('/api/content-media?' + new URLSearchParams({ bucket: 'stories', path: storagePath }));
    f.objects.set('stories/' + storagePath, Buffer.from('fixture'));
    f.sqlite.prepare("INSERT INTO stories(id,author_id,title,cover_url,release_at) VALUES('legacy',?,'Legacy',?,'infinity')")
      .run(f.profile, url);
    f.setToken(null);
    assert.equal((await media.GET(request)).status, 404);
    f.setToken(f.hash);
    assert.equal(await (await media.GET(request)).text(), 'fixture');
    f.sqlite.prepare("UPDATE stories SET moderation_hidden_at='2026-11-19T00:00:00Z' WHERE id='legacy'").run();
    assert.equal((await media.GET(request)).status, 404);
  } finally {
    f.sqlite.close();
  }
});

test('D1 own-post listing stays in D1 and excludes other authors and reposts',async()=>{
 const f=fixture();try{
  f.sqlite.prepare('INSERT INTO nook_posts(id,user_id,body) VALUES(?,?,?)').run('own-post',f.profile,'Own post');
  f.sqlite.exec("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('other-user','other_reader','synthetic','other-recovery'); INSERT INTO profiles(id,user_id,username) VALUES('other-profile','other-user','other_reader'); INSERT INTO nook_posts(id,user_id,body) VALUES('other-post','other-profile','Other post'); INSERT INTO nook_reposts(id,user_id,post_id) VALUES('other-repost','other-profile','own-post');");
  const route=f.load(root+'/app/api/nook-posts/route.ts');
  const response=await route.GET();assert.equal(response.status,200);
  assert.deepEqual((await response.json()).posts.map(p=>p.id),['own-post']);
  f.setToken(null);assert.equal((await route.GET()).status,401);
 }finally{f.sqlite.close();}
});

test('Author invitation HTTP signup records the author and dashboard rejects anonymous or cross-site access',async()=>{
  const f=fixture();try{
    const invites=f.load(root+'/app/api/author-invites/route.ts');
    const signup=f.load(root+'/app/api/auth/signup/route.ts');
    assert.equal((await invites.POST(f.request('/api/author-invites','POST',{},'https://foreign.invalid'))).status,403);
    assert.equal((await invites.POST(f.request('/api/author-invites','POST',{}))).status,200);
    const result=await signup.POST(f.request('/api/auth/signup','POST',{username:'invited_http_reader',password:'synthetic-passphrase',invitedBy:'http_reader'}));
    assert.equal(result.status,201);
    const dashboard=await(await invites.GET(f.request('/api/author-invites'))).json();
    assert.equal(dashboard.participating,true);assert.equal(dashboard.registrations,1);
    assert.equal(dashboard.readers[0].username,'invited_http_reader');
    const notification=f.sqlite.prepare("SELECT user_id,href FROM user_notifications WHERE notification_type='author_invite_signup'").get();
    assert.equal(notification.user_id,f.user);assert.equal(notification.href,'/convites');
    f.setToken(null);
    assert.equal((await invites.GET(f.request('/api/author-invites'))).status,401);
    assert.equal((await invites.POST(f.request('/api/author-invites','POST',{}))).status,401);
  }finally{f.sqlite.close();}
});
