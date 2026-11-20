import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { d1Auth } from '../lib/database/d1-auth.ts';
import { d1AuthorInvites } from '../lib/database/d1-author-invites.ts';
function fixture() {
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../d1/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL('../d1/migrations/'+file,import.meta.url),'utf8'));
  sqlite.exec('PRAGMA foreign_keys=ON');
  const db={prepare(sql){let params=[];return {
    bind(...values){params=values;return this;},
    async first(){return sqlite.prepare(sql).get(...params)??null;},
    async all(){return {success:true,results:sqlite.prepare(sql).all(...params)};},
    async run(){const result=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(result.changes)}};}
  };},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const auth=d1Auth(db);
  const register=(id,username,invite=null)=>auth.register(id,username,'password-'+id,'recovery-'+id,null,invite);
  return {sqlite,db,auth,register,invites:d1AuthorInvites(db)};
}
test('A completed invited registration notifies the author once; normal signup and failed duplicate do not',async()=>{
  const f=fixture();try{
    await f.register('author','author');
    assert.equal(await f.register('reader','reader','author'),true);
    const notification=f.sqlite.prepare("SELECT * FROM user_notifications WHERE notification_type='author_invite_signup'").get();
    assert.equal(notification.user_id,'author');assert.equal(notification.actor_id,'reader');assert.equal(notification.href,'/convites');
    assert.match(notification.title,/reader.*chegou ao Nooklie pelo seu convite/);
    assert.equal(await f.register('duplicate','reader','author'),false);
    await f.register('ordinary','ordinary');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM author_invite_registrations').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,1);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.sqlite.close();}
});
test('Invalid, private, hidden or suspended authors do not prevent signup or receive attribution',async()=>{
  const f=fixture();try{
    for(const [id,change] of [['private',"UPDATE profiles SET is_private=1 WHERE id='private'"],['hidden',"UPDATE profiles SET moderation_hidden_at='2026-11-20' WHERE id='hidden'"],['suspended',"UPDATE auth_accounts SET account_status='suspended' WHERE id='suspended'"]]){
      await f.register(id,id);f.sqlite.exec(change);
      assert.equal(await f.register('reader_'+id,'reader_'+id,id),true);
    }
    assert.equal(await f.register('reader_invalid','reader_invalid',"author' OR 1=1 --"),true);
    assert.equal(await f.register('reader_missing','reader_missing','missing'),true);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM author_invite_registrations').get().n,0);
  }finally{f.sqlite.close();}
});
test('Account, referral and notification roll back together on notification failure',async()=>{
  const f=fixture();try{
    await f.register('author','author');
    f.sqlite.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON user_notifications BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    await assert.rejects(f.register('reader','reader','author'),/injected failure/);
    assert.equal(await f.auth.accountForLogin('reader'),null);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM profiles WHERE id='reader'").get().n,0);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM author_invite_registrations').get().n,0);
  }finally{f.sqlite.close();}
});
test('Participation is idempotent and dashboards enforce session ownership and expiry',async()=>{
  const f=fixture();try{
    await f.register('author','author');await f.register('other','other');await f.register('reader','reader','author');
    const hash='a'.repeat(64),otherHash='b'.repeat(64),expiry=new Date(Date.now()+86400000).toISOString();
    await f.auth.createSession('s1','author',hash,expiry);await f.auth.createSession('s2','other',otherHash,expiry);
    assert.equal((await f.invites.participate(hash)).participating,true);
    await f.invites.participate(hash);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM author_invite_participants').get().n,1);
    const owner=await f.invites.dashboard(hash);assert.equal(owner.registrations,1);assert.equal(owner.readers[0].username,'reader');
    const other=await f.invites.dashboard(otherHash);assert.equal(other.registrations,0);assert.equal(other.readers.length,0);
    assert.equal(await f.invites.dashboard('c'.repeat(64)),null);
    f.sqlite.exec("UPDATE auth_sessions SET expires_at='2000-01-01' WHERE id='s1'");
    assert.equal(await f.invites.dashboard(hash),null);assert.equal(await f.invites.participate(hash),null);
  }finally{f.sqlite.close();}
});
test('Social notification preference is respected while completed signup remains in the dashboard',async()=>{
  const f=fixture();try{
    await f.register('author','author');
    f.sqlite.exec("UPDATE profiles SET social_notifications=0 WHERE id='author'");
    await f.register('reader','reader','author');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM author_invite_registrations').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,0);
  }finally{f.sqlite.close();}
});
