import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Feed } from '../lib/database/d1-feed.ts';
import { d1Events } from '../lib/database/d1-events.ts';
import { verifyD1Community } from './fixtures/d1-community-scenarios.mjs';
import { verifyD1Reader } from './fixtures/d1-reader-scenarios.mjs';
import { d1Reader } from '../lib/database/d1-reader.ts';
import { d1Beta } from '../lib/database/d1-beta.ts';
import { isReaderPreferences } from '../lib/reader/preferences.ts';
import { safeBetaHtml } from '../lib/security/beta-html.ts';

function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_auth_foundation.sql','0002_profiles_social_permissions.sql','0003_books_reading.sql','0004_comments_reader_beta.sql','0005_feed_events.sql','0006_notification_import_guard.sql'])sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...params)};},async run(){const r=sqlite.prepare(sql).run(...params);return{success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return{sqlite,db};}

test('D1 feed, mural, reactions, events and polls preserve privacy and ownership',async()=>{const{sqlite,db}=fixture();try{
 const result=await verifyD1Community(db,d1Feed,d1Events);assert.ok(result.passed>=45);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM auth_accounts').get().n,0);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{sqlite.close();}});
test('D1 new community schema preserves the previous reader and beta scenarios',async()=>{const{sqlite,db}=fixture();try{
 assert.equal((await verifyD1Reader(db,d1Reader,d1Beta,isReaderPreferences,safeBetaHtml)).passed,53);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{sqlite.close();}});
