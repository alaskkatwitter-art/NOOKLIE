import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Reader } from '../lib/database/d1-reader.ts';
import { d1Beta } from '../lib/database/d1-beta.ts';
import { isReaderPreferences } from '../lib/reader/preferences.ts';
import { safeBetaHtml } from '../lib/security/beta-html.ts';
import { verifyD1Reader } from './fixtures/d1-reader-scenarios.mjs';
import { verifyD1Books } from './fixtures/d1-books-scenarios.mjs';
import { d1Books } from '../lib/database/d1-books.ts';
import { safeChapterHtml } from '../lib/security/html.ts';

function fixture() {
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;');
  for(const file of ['0001_auth_foundation.sql','0002_profiles_social_permissions.sql','0003_books_reading.sql','0004_comments_reader_beta.sql']) {
    sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
  }
  const db={prepare(sql){let params=[];return {
    bind(...values){params=values;return this;},
    async first(){return sqlite.prepare(sql).get(...params)??null;},
    async all(){return {success:true,results:sqlite.prepare(sql).all(...params)};},
    async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  return {sqlite,db};
}

test('D1 comments, notifications, reader preferences and private beta reading',async()=>{
  const {sqlite,db}=fixture();
  try {
    assert.ok((await verifyD1Reader(db,d1Reader,d1Beta,isReaderPreferences,safeBetaHtml)).passed>=45);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM auth_accounts').get().n,0);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{sqlite.close();}
});

test('D1 preference constraints reject missing, extra, duplicate or mistyped fields',()=>{
  const {sqlite}=fixture();
  try {
    sqlite.exec("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('account','author','p','r')");
    const valid={fontId:'lora',fontSize:18,lineHeight:1.6,margin:0,theme:'dark'};
    const insert=sqlite.prepare("INSERT INTO reader_preferences(user_id,preferences) VALUES('account',?)");
    for(const input of [{...valid,extra:1},{fontId:'lora'},{...valid,fontSize:'18'},{...valid,theme:'bad'}]) {
      assert.throws(()=>insert.run(JSON.stringify(input)));
    }
    assert.throws(()=>insert.run('{"fontId":"lora","fontSize":18,"lineHeight":1.6,"margin":0,"theme":"dark","theme":"light"}'));
    insert.run(JSON.stringify(valid));
    assert.throws(()=>sqlite.prepare("UPDATE reader_preferences SET preferences=? WHERE user_id='account'").run(JSON.stringify({...valid,extra:1})));
  }finally{sqlite.close();}
});

test('D1 beta preview sanitizer preserves formatting and strips images, links and scripts',()=>{
  assert.equal(safeBetaHtml('<p><strong>Safe</strong><img src="https://tracker.invalid/a"><a href="https://tracker.invalid">link</a></p><script>bad()</script>'),'<p><strong>Safe</strong>link</p>');
});

test('D1 phase-four schema preserves all phase-three book scenarios',async()=>{
  const {sqlite,db}=fixture();
  try {
    assert.equal((await verifyD1Books(db,d1Books,safeChapterHtml)).passed,58);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{sqlite.close();}
});

test('D1 chapter deletion cascades comments, replies, likes and accepted beta notes',async()=>{
  const {sqlite,db}=fixture();const author='a'.repeat(64),reader='b'.repeat(64);
  const books=d1Books(db,safeChapterHtml),beta=d1Beta(db,safeBetaHtml),comments=d1Reader(db,isReaderPreferences);
  try {
    sqlite.exec(`INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('author','author','p','r'),('reader','reader','p','r2');
      INSERT INTO profiles(id,user_id,username) VALUES('author-profile','author','author'),('reader-profile','reader','reader');`);
    const insertSession=sqlite.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)');
    const expiry=new Date(Date.now()+3600000).toISOString();
    insertSession.run('author-session','author',author,expiry);insertSession.run('reader-session','reader',reader,expiry);
    await books.createStory(author,'story','Title');sqlite.exec("UPDATE stories SET story_kind='original' WHERE id='story'");
    await books.appendChapter(author,'story','public','Public','Body');await books.setChapterPublished(author,'public',true);await books.setStoryPublished(author,'story',true);
    await books.appendChapter(author,'story','draft','Draft','<p><strong>Private</strong><img src="https://tracker.invalid/a"></p>');
    await comments.postComment(reader,{id:'comment',chapterId:'public',body:'Comment'});
    await comments.postComment(author,{id:'reply',chapterId:'public',body:'Reply',parentId:'comment'});
    await comments.likeComment(author,'comment');
    await beta.invite(author,'invite','draft','reader');await beta.accept(reader,'invite');await beta.note(reader,'note','invite','','Note');
    assert.equal((await beta.read(reader,'invite')).body,'<p><strong>Private</strong></p>');
    await books.deleteChapter(author,'story','public');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM comments').get().n,0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM comment_likes').get().n,0);
    await books.deleteChapter(author,'story','draft');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM beta_reading_invites').get().n,0);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM beta_reading_notes').get().n,0);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{sqlite.close();}
});
