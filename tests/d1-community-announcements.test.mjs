import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {publishScheduledChapters} from '../cloudflare/d1-scheduled.mjs';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../d1/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../d1/migrations/'+name,import.meta.url),'utf8'));
 sqlite.exec("PRAGMA foreign_keys=ON; INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash,account_status) VALUES ('a','alice','pa','ra','active'),('b','bob','pb','rb','active'),('s','suspended','ps','rs','suspended'); INSERT INTO profiles(id,user_id,username,social_notifications) VALUES('a','a','alice',0),('b','b','bob',0),('s','s','suspended',0); INSERT INTO departments(id,name,slug) VALUES('moderation','Moderação','moderacao');");
 const db={prepare(sql){let p=[];return{bind(...v){p=v;return this;},async first(){return sqlite.prepare(sql).get(...p)??null;},async run(){const r=sqlite.prepare(sql).run(...p);return{success:true,meta:{changes:Number(r.changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const opportunity=(id,status='open',opens='2000-01-01',closes='2099-01-01')=>sqlite.prepare('INSERT INTO opportunities(id,department_id,title,status,opens_at,closes_at) VALUES(?,?,?,?,?,?)').run(id,'moderation','Moderador',status,opens,closes);
 return{sqlite,db,opportunity};
}
test('Open opportunities notify all active accounts regardless of social preferences, exactly once',()=>{
 const f=fixture();try{
  f.opportunity('draft','draft');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,0);
  f.sqlite.exec("UPDATE opportunities SET status='open' WHERE id='draft'");
  assert.deepEqual(f.sqlite.prepare('SELECT user_id,notification_type,href FROM user_notifications ORDER BY user_id').all().map(x=>({...x})),[{user_id:'a',notification_type:'opportunity_open',href:'/oportunidades'},{user_id:'b',notification_type:'opportunity_open',href:'/oportunidades'}]);
  f.sqlite.exec("UPDATE opportunities SET title='Editada',closes_at='2099-01-02' WHERE id='draft'; UPDATE opportunities SET status='closed' WHERE id='draft'; UPDATE opportunities SET status='open' WHERE id='draft'");
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,2);
  f.opportunity('expired','open','2000-01-01','2001-01-01');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,2);
  f.opportunity('new_open');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,4);
 }finally{f.sqlite.close();}
});
test('Scheduled openings announce at the opening time and repeated cron executions do not duplicate notices',async()=>{
 const f=fixture();try{
  f.opportunity('future','open','2090-01-01T12:00:00Z','2090-02-01');
  await publishScheduledChapters(f.db,Date.parse('2090-01-01T11:59:00Z'));
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,0);
  await publishScheduledChapters(f.db,Date.parse('2090-01-01T12:00:00Z'));
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,2);
  await publishScheduledChapters(f.db,Date.parse('2090-01-01T12:01:00Z'));
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,2);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM opportunity_announcements').get().n,1);
 }finally{f.sqlite.close();}
});
test('Notification suppression keeps announcements pending and failed delivery rolls back publication',async()=>{
 const f=fixture();try{
  f.sqlite.exec("UPDATE d1_runtime_flags SET value='1' WHERE key='suppress_notifications'");
  f.opportunity('suppressed');await publishScheduledChapters(f.db,Date.now());
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM opportunity_announcements').get().n,0);
  f.sqlite.exec("UPDATE d1_runtime_flags SET value='0' WHERE key='suppress_notifications'");
  await publishScheduledChapters(f.db,Date.now());assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,2);
  f.sqlite.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON user_notifications BEGIN SELECT RAISE(ABORT,'delivery failed'); END");
  assert.throws(()=>f.opportunity('rollback'),/delivery failed/);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM opportunities WHERE id='rollback'").get().n,0);
 }finally{f.sqlite.close();}
});
test('Published and reactivated literary events notify everyone once, including when an expired event becomes available',()=>{
 const f=fixture();try{
  const insert=(id,active,end)=>f.sqlite.prepare('INSERT INTO story_events(id,title,description,starts_at,ends_at,active,created_by,revision) VALUES(?,?,?,?,?,?,?,1)').run(id,'Natal entre Histórias','','2000-01-01',end,active,'a');
  insert('draft',0,'2099-01-01');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,0);
  f.sqlite.exec("UPDATE story_events SET active=1 WHERE id='draft'; UPDATE story_events SET title='Atualizado' WHERE id='draft'; UPDATE story_events SET active=0 WHERE id='draft'; UPDATE story_events SET active=1 WHERE id='draft'");
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_notifications').get().n,2);
  insert('expired',1,'2001-01-01');f.sqlite.exec("UPDATE story_events SET ends_at='2099-01-01' WHERE id='expired'");
  insert('published',1,'2099-01-01');
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM user_notifications WHERE notification_type='literary_event'").get().n,6);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM user_notifications WHERE user_id='s'").get().n,0);
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.sqlite.close();}
});
