import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {verifyD1Remaining} from './fixtures/d1-remaining-scenarios.mjs';
function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../d1/migrations',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...params)};},async run(){const s=sqlite.prepare(sql);if(s.columns().length)return{success:true,meta:{changes:0},results:s.all(...params)};const r=s.run(...params);return{success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return{sqlite,db};}

test('D1 final nine tables preserve constraints, defaults and cascades',async()=>{const{sqlite,db}=fixture();try{assert.ok((await verifyD1Remaining(db)).passed>=40);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);}finally{sqlite.close();}});
test('D1 covers every inventoried source table',()=>{const{sqlite}=fixture();try{const inventory=JSON.parse(readFileSync(new URL('../d1/source-inventory.json',import.meta.url)));const names=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);assert.equal(inventory.tables.length,72);assert.deepEqual(inventory.tables.filter(n=>!names.includes(n)),[]);}finally{sqlite.close();}});

test('D1 final tables retain all 44 source columns and nullability',()=>{const{sqlite}=fixture();try{const source=JSON.parse(readFileSync(new URL('../d1/source-final-tables.json',import.meta.url)));let count=0;for(const table of source.tables){const actual=sqlite.prepare('PRAGMA table_info('+table.name+')').all();assert.deepEqual(actual.map(c=>c.name),table.columns.map(c=>c.name));for(const col of table.columns){const local=actual.find(c=>c.name===col.name);assert.equal(Boolean(local.notnull),!col.nullable,table.name+'.'+col.name);count++;}}assert.equal(count,44);}finally{sqlite.close();}});
