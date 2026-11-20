import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {d1Feed} from '../lib/database/d1-feed.ts';
import {newsArticleSlugs,isNewsArticle} from '../lib/news/articles.ts';
const migrations=new URL('../d1/migrations/',import.meta.url);
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')&&n<'0015').sort())sqlite.exec(readFileSync(new URL(name,migrations),'utf8'));
 sqlite.exec("PRAGMA foreign_keys=ON; INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES('reader','reader','p','r'); INSERT INTO profiles(id,user_id,username) VALUES('reader','reader','reader'); INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES('session','reader','"+'a'.repeat(64)+"','2099-01-01'); INSERT INTO nook_posts(id,user_id,body,news_slug,updated_at) VALUES('old','reader','','nooklie-de-volta','2026-11-01'); INSERT INTO nook_post_reactions(id,post_id,user_id,emoji) VALUES('reaction','old','reader','❤️');");
 const db={prepare(sql){let params=[];return{bind(...values){params=values;return this;},async first(){return sqlite.prepare(sql).get(...params)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...params)};}};}};
 return{sqlite,db};
}
test('New and future catalog articles can be shared while historical posts and reactions survive migration',async()=>{
 const f=fixture();try{
  assert.throws(()=>f.sqlite.prepare("INSERT INTO nook_posts(id,user_id,body,news_slug) VALUES('broken','reader','','convites-e-vagas-moderacao')").run(),/CHECK constraint/);
  f.sqlite.exec(readFileSync(new URL('0015_news_share_links.sql',migrations),'utf8'));
  const old=f.sqlite.prepare("SELECT news_slug,legacy_news_slug,updated_at FROM nook_posts WHERE id='old'").get();
  assert.deepEqual({...old},{news_slug:'nooklie-de-volta',legacy_news_slug:null,updated_at:'2026-11-01'});
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM nook_post_reactions WHERE post_id='old'").get().n,1);
  for(const slug of newsArticleSlugs){
   assert.ok(isNewsArticle(slug));
   const post=await d1Feed(f.db).createPublication('a'.repeat(64),'share-'+slug,{body:'',origin:'feed',image:null,story:null,news:slug,tags:[]});
   assert.equal(post.news_slug,slug);
  }
  f.sqlite.prepare("INSERT INTO nook_posts(id,user_id,body,news_slug) VALUES('future','reader','','future-edition')").run();
  assert.throws(()=>f.sqlite.prepare("UPDATE nook_posts SET news_slug='../invalid' WHERE id='old'").run(),/CHECK constraint/);
  assert.throws(()=>f.sqlite.prepare("UPDATE nook_posts SET legacy_news_slug='boas-vindas' WHERE id='old'").run(),/one publication link/);
  assert.throws(()=>f.sqlite.prepare("UPDATE nook_posts SET story_id='story' WHERE id='old'").run(),/one publication link/);
  assert.equal(isNewsArticle('future-edition'),false);
  assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.sqlite.close();}
});
