import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Moderation } from '../lib/database/d1-moderation.ts';
import { verifyD1Moderation } from './fixtures/d1-moderation-scenarios.mjs';
import { d1Chat } from '../lib/database/d1-chat.ts';
import { verifyD1Chat } from './fixtures/d1-chat-scenarios.mjs';

function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../d1/migrations',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...params)};},async run(){const s=sqlite.prepare(sql);if(s.columns().length)return{success:true,meta:{changes:0},results:s.all(...params)};const r=s.run(...params);return{success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return{sqlite,db};}

test('D1 administrative decisions, scoped moderation and permanent audit',async()=>{const{sqlite,db}=fixture();try{
 const result=await verifyD1Moderation(db,d1Moderation);assert.ok(result.passed>=35);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{sqlite.close();}});
test('D1 administrative schema preserves encrypted chat scenarios',async()=>{const{sqlite,db}=fixture();try{
 assert.equal((await verifyD1Chat(db,d1Chat)).passed,48);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{sqlite.close();}});
