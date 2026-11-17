import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Books } from '../lib/database/d1-books.ts';
import { safeChapterHtml } from '../lib/security/html.ts';
import { verifyD1Books } from './fixtures/d1-books-scenarios.mjs';
import { verifyD1Social } from './fixtures/d1-social-scenarios.mjs';
import { d1Social } from '../lib/database/d1-social.ts';
import { d1Permissions } from '../lib/database/d1-permissions.ts';

function fixture() {
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;');
  for(const file of ['0001_auth_foundation.sql','0002_profiles_social_permissions.sql','0003_books_reading.sql']) {
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

test('D1 stories, chapter management, library and lists enforce authorization and atomic ordering',async()=>{
  const {sqlite,db}=fixture();
  try {
    const result=await verifyD1Books(db,d1Books,safeChapterHtml);
    assert.ok(result.passed>=50);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM auth_accounts').get().n,0);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(sqlite.prepare("SELECT count(*) n FROM pragma_foreign_key_list('profiles') WHERE \"from\"='pinned_story_id' AND \"table\"='stories'").get().n,1);
  }finally{sqlite.close();}
});

test('D1 chapter HTML uses existing sanitizer and failed deletion rolls back numbering and command',async()=>{
  const {sqlite,db}=fixture();const hash='d'.repeat(64),books=d1Books(db,safeChapterHtml);
  try {
    sqlite.exec(`INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('a','author','p','r');
      INSERT INTO profiles(id,user_id,username) VALUES('p','a','author');`);
    sqlite.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
      .run('session','a',hash,new Date(Date.now()+3600000).toISOString());
    await books.createStory(hash,'story','Title');
    await books.appendChapter(hash,'story','one','One','<p><strong>Keep</strong></p><script>alert(1)</script>');
    await books.appendChapter(hash,'story','two','Two','Body');
    assert.equal((await books.chapter(hash,'one')).body,'<p><strong>Keep</strong></p>');
    sqlite.exec("CREATE TRIGGER test_reject_delete BEFORE DELETE ON chapters BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
    await assert.rejects(books.deleteChapter(hash,'story','one'),/simulated failure/);
    assert.deepEqual((await books.chapters(hash,'story')).map(c=>c.chapter_number),[1,2]);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM d1_book_commands').get().n,0);
    assert.throws(()=>sqlite.exec("UPDATE profiles SET pinned_story_id='missing' WHERE id='p'"),/FOREIGN KEY/);
    sqlite.exec("UPDATE profiles SET pinned_story_id='story' WHERE id='p'; DROP TRIGGER test_reject_delete; DELETE FROM stories WHERE id='story';");
    assert.equal(sqlite.prepare("SELECT pinned_story_id FROM profiles WHERE id='p'").get().pinned_story_id,null);
  }finally{sqlite.close();}
});

test('D1 phase-three profile reconstruction preserves all phase-two privacy and permission scenarios',async()=>{
  const {sqlite,db}=fixture();
  try {
    assert.equal((await verifyD1Social(db,d1Social,d1Permissions)).passed,41);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{sqlite.close();}
});

test('D1 phase-three migration refuses to reconstruct a populated profile table',()=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;');
  try {
    for(const file of ['0001_auth_foundation.sql','0002_profiles_social_permissions.sql']) {
      sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
    }
    sqlite.exec("INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('a','author','p','r'); INSERT INTO profiles(id,user_id,username) VALUES('p','a','author');");
    assert.throws(()=>sqlite.exec(readFileSync(new URL('../d1/migrations/0003_books_reading.sql',import.meta.url),'utf8')),/CHECK/);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM profiles').get().n,1);
  }finally{sqlite.close();}
});
