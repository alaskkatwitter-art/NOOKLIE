import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {d1News} from '../lib/database/d1-news.ts';
import {verifyD1News} from './fixtures/d1-news-scenarios.mjs';
function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../d1/migrations',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...params)};},async run(){const s=sqlite.prepare(sql);if(s.columns().length)return{success:true,meta:{changes:0},results:s.all(...params)};const r=s.run(...params);return{success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return{sqlite,db};}

test('D1 news comments preserve visibility, reply integrity and audited removal',async()=>{const{sqlite,db}=fixture();try{assert.ok((await verifyD1News(db,d1News)).passed>=35);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);}finally{sqlite.close();}});
