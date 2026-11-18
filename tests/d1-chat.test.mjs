import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Chat } from '../lib/database/d1-chat.ts';
import { verifyD1Chat } from './fixtures/d1-chat-scenarios.mjs';
import { encryptChat,decryptChat,encodeChatBody,decodeChatBody } from '../lib/chat/crypto.ts';

function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_auth_foundation.sql','0002_profiles_social_permissions.sql','0003_books_reading.sql','0004_comments_reader_beta.sql','0005_feed_events.sql','0006_notification_import_guard.sql','0007_chat.sql'])sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
 const db={prepare(sql){let params=[];return{bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...params)};},async run(){const r=sqlite.prepare(sql).run(...params);return{success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return{sqlite,db};}

test('D1 encrypted chat, requests, groups, two-hour changes and report evidence',async()=>{const{sqlite,db}=fixture();try{
 const result=await verifyD1Chat(db,d1Chat);assert.ok(result.passed>=40);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM auth_accounts').get().n,0);assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{sqlite.close();}});

test('D1 chat persists real AES-GCM ciphertext without changing codec or context binding',async()=>{
 const{sqlite,db}=fixture(),old=process.env.CHAT_ENCRYPTION_KEY_V2;process.env.CHAT_ENCRYPTION_KEY_V2='11'.repeat(32);
 try{
  sqlite.exec("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('a','alice','p','r'),('b','bobby','p','r2'); INSERT INTO profiles(id,user_id,username) VALUES('pa','a','alice'),('pb','b','bobby');");
  const hash='a'.repeat(64),expires=new Date(Date.now()+3600000).toISOString();
  sqlite.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').run('session','a',hash,expires);
  sqlite.exec("INSERT INTO chat_threads(id,initiator_id,recipient_id,status) VALUES('thread','pa','pb','accepted')");
  const encrypted=encodeChatBody(encryptChat(Buffer.from('Private text'),'thread:message:body'));
  await d1Chat(db,2).send(hash,'message','thread',encrypted);
  const stored=sqlite.prepare("SELECT body_cipher FROM chat_messages WHERE id='message'").get().body_cipher;
  assert.equal(stored,encrypted);assert.ok(!stored.includes('Private text'));
  assert.equal(decryptChat(decodeChatBody(stored),'thread:message:body').toString(),'Private text');
  assert.throws(()=>decryptChat(decodeChatBody(stored),'thread:another-message:body'));
  assert.throws(()=>sqlite.exec("UPDATE chat_threads SET kind='group',recipient_id=NULL,name='Group',avatar_path='thread/nested/path.png' WHERE id='thread'"),/CHECK/);
  sqlite.exec("UPDATE chat_threads SET kind='group',recipient_id=NULL,name='Group',avatar_path='thread/abcd-123.webp' WHERE id='thread'");
 }finally{if(old===undefined)delete process.env.CHAT_ENCRYPTION_KEY_V2;else process.env.CHAT_ENCRYPTION_KEY_V2=old;sqlite.close();}
});
