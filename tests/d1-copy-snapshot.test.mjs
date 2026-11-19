import assert from 'node:assert/strict';import test from 'node:test';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';import {copyD1Snapshot} from '../scripts/d1-copy-snapshot.mjs';
const names=JSON.parse(readFileSync(new URL('../d1/source-inventory.json',import.meta.url))).tables;
function database(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../d1/migrations',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../d1/migrations/'+f,import.meta.url),'utf8'));return db;}
function adapter(sqlite){return async({batch})=>{sqlite.exec('BEGIN');try{const results=batch.map(({sql,params=[]})=>{if(!params.length&&sql.includes(';')){sqlite.exec(sql);return{results:[]};}const s=sqlite.prepare(sql);return s.columns().length?{results:s.all(...params)}:(s.run(...params),{results:[]});});sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}};}
function schema(sqlite){return{tables:names.map(name=>({name,columns:sqlite.prepare('PRAGMA table_info('+name+')').all(),foreignKeys:sqlite.prepare('PRAGMA foreign_key_list('+name+')').all()})),triggers:sqlite.prepare("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger'").all()};}
test('D1 snapshot runner copies dependencies, restores pinned stories and all triggers',async()=>{const source=database(),target=database();try{source.exec("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('u','sample','synthetic','synthetic'); INSERT INTO profiles(id,user_id,username) VALUES('p','u','sample'); INSERT INTO stories(id,author_id,title) VALUES('s','p','Synthetic story'); UPDATE profiles SET pinned_story_id='s' WHERE id='p';");const meta=schema(source),types=meta.tables.flatMap(t=>t.columns.map(c=>({table_name:t.name,column_name:c.name,data_type:c.type==='INTEGER'?'integer':c.type==='REAL'?'double precision':'text'})));const report=await copyD1Snapshot({target:{database_id:'fcea4d88-3c18-4c21-a6c1-af13c72caa00',production_cutover:false},schema:meta,sourceColumns:types,readPage:async(name,{offset,limit})=>source.prepare('SELECT * FROM '+name+' LIMIT ? OFFSET ?').all(limit,offset),query:adapter(target),runId:'synthetic_test'});assert.equal(report.verifiedRows,3);assert.equal(report.consistentSnapshot,false);assert.equal(target.prepare("SELECT pinned_story_id FROM profiles WHERE id='p'").get().pinned_story_id,'s');assert.equal(target.prepare("SELECT state FROM d1_import_runs").get().state,'verified');assert.deepEqual(target.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(target.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'").get().n,meta.triggers.length);assert.equal(target.prepare('SELECT count(*) AS n FROM user_notifications').get().n,0);await assert.rejects(()=>copyD1Snapshot({target:{database_id:'fcea4d88-3c18-4c21-a6c1-af13c72caa00',production_cutover:false},schema:meta,sourceColumns:types,query:adapter(target),runId:'second'}),/not empty/);}finally{source.close();target.close();}});
test('D1 snapshot runner rejects production targets before any database request',async()=>{let touched=false;await assert.rejects(()=>copyD1Snapshot({target:{database_id:'wrong',production_cutover:true},schema:{tables:[]},query:async()=>{touched=true;}}),/isolated/i);assert.equal(touched,false);});
test('D1 snapshot batch failure restores triggers and keeps rejected rows out',async()=>{const source=database(),target=database();try{source.exec("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('u','sample','synthetic','synthetic')");const row={...source.prepare('SELECT * FROM auth_accounts').get(),password_hash:null},meta=schema(target),types=meta.tables.flatMap(t=>t.columns.map(c=>({table_name:t.name,column_name:c.name,data_type:c.type==='INTEGER'?'integer':'text'})));await assert.rejects(()=>copyD1Snapshot({target:{database_id:'fcea4d88-3c18-4c21-a6c1-af13c72caa00',production_cutover:false},schema:meta,sourceColumns:types,readPage:async name=>name==='auth_accounts'?[row]:[],query:adapter(target),runId:'rejected_batch'}),/NOT NULL/);assert.equal(target.prepare('SELECT count(*) AS n FROM auth_accounts').get().n,0);assert.equal(target.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger'").get().n,meta.triggers.length);assert.equal(target.prepare('SELECT state FROM d1_import_runs').get().state,'failed');}finally{source.close();target.close();}});

test('D1 final synchronization reconciles populated databases and verifies all 72 tables',async()=>{
 const {reconcileD1Snapshot}=await import('../scripts/d1-reconcile-snapshot.mjs');
 const source=database(),target=database();
 try {
  const initial="INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('u','sample','synthetic','synthetic'); INSERT INTO profiles(id,user_id,username) VALUES('p','u','sample'); INSERT INTO stories(id,author_id,title) VALUES('s','p','Before'),('obsolete','p','Obsolete'); UPDATE profiles SET pinned_story_id='obsolete' WHERE id='p'; INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES('existing_session','u','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2099-01-01T00:00:00Z');";
  source.exec(initial);target.exec(initial);
  source.exec("UPDATE auth_accounts SET password_hash='new-password-hash' WHERE id='u'; UPDATE stories SET title='After' WHERE id='s'; INSERT INTO stories(id,author_id,title) VALUES('new','p','New'); UPDATE profiles SET pinned_story_id='new' WHERE id='p'; DELETE FROM stories WHERE id='obsolete';");
  const meta=schema(target);
  const types=meta.tables.flatMap(t=>t.columns.map(c=>({table_name:t.name,column_name:c.name,data_type:c.type==='INTEGER'?'integer':c.type==='REAL'?'double precision':'text'})));
  const args={schema:meta,sourceColumns:types,readSource:async name=>source.prepare('SELECT * FROM '+name).all(),
   readTarget:async name=>target.prepare('SELECT * FROM '+name).all(),query:adapter(target)};
  const report=await reconcileD1Snapshot(args);
  assert.equal(Object.keys(report).length,72);
  assert.deepEqual(report.stories,{inserted:1,updated:1,deleted:1,verified:2});
  assert.equal(report.auth_sessions.deleted,1);
  assert.equal(target.prepare("SELECT pinned_story_id FROM profiles WHERE id='p'").get().pinned_story_id,'new');
  assert.equal(target.prepare("SELECT title FROM stories WHERE id='s'").get().title,'After');
  assert.equal(target.prepare('SELECT count(*) n FROM user_notifications').get().n,0);
  const next=await reconcileD1Snapshot(args);
  assert.ok(Object.values(next).every(t=>!t.inserted&&!t.updated&&!t.deleted));

  source.exec("UPDATE stories SET title='Next' WHERE id='s'");
  const execute=adapter(target);
  await assert.rejects(()=>reconcileD1Snapshot({...args,query:({batch})=>execute({batch:[
   ...batch,
   {sql:"UPDATE stories SET title='Unexpected' WHERE id='s'"},batch.findLast(statement=>statement.sql.includes('FROM "stories" actual')),
  ]})}),/overflow/);
  assert.equal(target.prepare("SELECT title FROM stories WHERE id='s'").get().title,'After');
  assert.equal(target.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n,meta.triggers.length);
 } finally {source.close();target.close();}
});
