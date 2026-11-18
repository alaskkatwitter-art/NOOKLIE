export async function verifyD1Remaining(db){
 const checks=[],run=(s,...p)=>db.prepare(s).bind(...p).run(),one=(s,...p)=>db.prepare(s).bind(...p).first();
 function check(ok,label){if(!ok)throw Error(label);checks.push(label);}
 async function fails(fn,label){let error=false;try{await fn();}catch{error=true;}check(error,label);}
 await db.batch(['author','reader'].flatMap(n=>[
 db.prepare('INSERT INTO auth_accounts(id,username,password_hash,recovery_key_hash) VALUES(?,?,?,?)').bind('r11u_'+n,'r11_'+n,'synthetic','synthetic_'+n),
 db.prepare('INSERT INTO profiles(id,user_id,username) VALUES(?,?,?)').bind('r11p_'+n,'r11u_'+n,'r11_'+n)]));
 await run("INSERT INTO stories(id,author_id,title) VALUES('r11book','r11p_author','Synthetic story')");
 await run("INSERT INTO chapters(id,story_id,title,body,chapter_number) VALUES('r11chapter','r11book','Synthetic chapter','Text',1)");
 await run("INSERT INTO discovery_preferences(user_id) VALUES('r11u_reader')");
 check((await one("SELECT favorite_fandoms FROM discovery_preferences WHERE user_id='r11u_reader'"))?.favorite_fandoms==='[]','discovery preferences default to empty JSON array');
 await fails(()=>run("INSERT INTO discovery_preferences(user_id) VALUES('r11p_author')"),'preferences reference account rather than profile ID');
 for(const invalid of ['{}',JSON.stringify(Array(31).fill('x')),JSON.stringify(['x'.repeat(3001)]),JSON.stringify([4]),JSON.stringify([['nested']])])await fails(()=>run("UPDATE discovery_preferences SET favorite_fandoms=? WHERE user_id='r11u_reader'",invalid),'invalid fandom array rejected: '+invalid.slice(0,30));
 await run("UPDATE discovery_preferences SET favorite_fandoms=? WHERE user_id='r11u_reader'",JSON.stringify(['x'.repeat(1499),'y'.repeat(1500),null]));
 check(JSON.parse((await one("SELECT favorite_fandoms FROM discovery_preferences WHERE user_id='r11u_reader'" )).favorite_fandoms).length===3,'fandom character limit includes separator and skips nulls');
 await fails(()=>run("UPDATE discovery_preferences SET favorite_fandoms=? WHERE user_id='r11u_reader'",JSON.stringify(['x'.repeat(1500),'y'.repeat(1500)])),'fandom separators count toward 3000 characters');
 await run("INSERT INTO story_daily_engagement(story_id,reader_id) VALUES('r11book','r11p_reader')");
 const engagement=await one("SELECT * FROM story_daily_engagement WHERE story_id='r11book'");
 check(engagement.viewed===0&&engagement.read===0,'engagement booleans default false');
 check(engagement.activity_day===(await one("SELECT date('now','-3 hours') AS day")).day,'engagement default uses current Sao Paulo day');
 await fails(()=>run("INSERT INTO story_daily_engagement(story_id,reader_id) VALUES('r11book','r11p_reader')"),'one engagement row per reader story day');
 await fails(()=>run("UPDATE story_daily_engagement SET viewed=2 WHERE story_id='r11book'"),'invalid engagement boolean rejected');
 await fails(()=>run("UPDATE story_daily_engagement SET activity_day='2026-02-30' WHERE story_id='r11book'"),'invalid calendar date rejected');
 await run("INSERT INTO fic_clubs(id,story_id,creator_id,name) VALUES('r11club','r11book','r11p_author','Synthetic club')");
 await run("INSERT INTO fic_club_members(id,club_id,user_id) VALUES('r11member','r11club','r11p_reader')");
 await fails(()=>run("INSERT INTO fic_club_members(id,club_id,user_id) VALUES('r11duplicate','r11club','r11p_reader')"),'club membership unique per profile');
 await fails(()=>run("INSERT INTO fic_club_members(id,club_id,user_id) VALUES('r11bad','r11club','r11u_reader')"),'club membership references profile rather than account');
 await run("INSERT INTO official_signup_tokens(token_hash) VALUES('synthetic-only-not-a-real-secret')");
 await fails(()=>run("INSERT INTO official_signup_tokens(singleton,token_hash) VALUES(0,'synthetic')"),'official token only permits true singleton');
 await fails(()=>run("INSERT INTO official_signup_tokens(token_hash) VALUES('synthetic')"),'official token cannot have two records');
 await run("UPDATE official_signup_tokens SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1 AND used_at IS NULL");
 const consumed=await run("UPDATE official_signup_tokens SET used_at='reused' WHERE singleton=1 AND used_at IS NULL");
 check(consumed.meta.changes===0,'conditional token consumption cannot repeat');
 await run("INSERT INTO profile_themes(user_id,revision) VALUES('r11u_reader',1)");
 for(const [field,value] of [['drafts','{}'],['drafts',JSON.stringify(Array(13).fill({}))],['active','[]'],['active','null']])await fails(()=>run('UPDATE profile_themes SET '+field+"=? WHERE user_id='r11u_reader'",value),'theme JSON shape validated: '+field+' '+value.slice(0,20));
 await fails(()=>run("UPDATE profile_themes SET revision=0 WHERE user_id='r11u_reader'"),'theme revision must be positive');
 await run("UPDATE profile_themes SET drafts=?,active=? WHERE user_id='r11u_reader'",JSON.stringify(Array(12).fill({name:'draft'})),JSON.stringify({name:'active'}));
 check(JSON.parse((await one("SELECT active FROM profile_themes WHERE user_id='r11u_reader'")).active).name==='active','theme active object and 12 drafts preserved');
 await run("INSERT INTO social_stories(id,user_id,media_url) VALUES('r11social','r11p_reader','/synthetic/image.webp')");
 const social=await one("SELECT media_type,(julianday(expires_at)-julianday(created_at))*24 AS hours FROM social_stories WHERE id='r11social'");
 check(social.media_type==='image'&&Math.abs(social.hours-24)<0.001,'social story defaults to image and 24-hour expiry');
 await fails(()=>run("UPDATE social_stories SET media_type='audio' WHERE id='r11social'"),'unsupported social story media type rejected');
 await run("INSERT INTO posts(id,user_id,chapter_id,quote_text) VALUES('r11post','r11p_reader','r11chapter','Quoted text')");
 check((await one("SELECT user_id FROM user_notifications WHERE source_key='posts:r11post:r11p_author'"))?.user_id==='r11u_author','legacy quote notifies chapter author account');
 await run("INSERT INTO post_likes(post_id,user_id) VALUES('r11post','r11p_author')");
 check((await one("SELECT user_id FROM user_notifications WHERE source_key='post_likes:r11post:r11p_author:r11p_reader'"))?.user_id==='r11u_reader','legacy like notifies post author account');
 await fails(()=>run("INSERT INTO post_likes(post_id,user_id) VALUES('r11post','r11p_author')"),'duplicate legacy like rejected');
 await run("UPDATE d1_runtime_flags SET value='1' WHERE key='suppress_notifications'");
 await run("INSERT INTO posts(id,user_id,chapter_id) VALUES('r11import','r11p_reader','r11chapter')");
 check(!(await one("SELECT id FROM user_notifications WHERE source_key='posts:r11import:r11p_author'")),'historical legacy post import suppresses notifications');
 await run("UPDATE d1_runtime_flags SET value='0' WHERE key='suppress_notifications'");
 await run("INSERT INTO posts(id,user_id,created_at) VALUES('r11null','r11p_reader',NULL)");
 check((await one("SELECT created_at,body FROM posts WHERE id='r11null'")).created_at===null,'legacy nullable timestamps preserved');
 await run("DELETE FROM chapters WHERE id='r11chapter'");
 check((await one("SELECT chapter_id,quote_text FROM posts WHERE id='r11post'")).chapter_id===null,'chapter deletion keeps legacy post with null chapter');
 check((await one("SELECT quote_text FROM posts WHERE id='r11post'")).quote_text==='Quoted text','chapter deletion preserves quoted text');
 await run("DELETE FROM stories WHERE id='r11book'");
 check(!(await one("SELECT id FROM fic_clubs WHERE id='r11club'")),'story deletion cascades to club');
 check(!(await one("SELECT id FROM fic_club_members WHERE id='r11member'")),'club deletion cascades to membership');
 check(!(await one("SELECT story_id FROM story_daily_engagement WHERE story_id='r11book'")),'story deletion cascades to daily engagement');
 await run("DELETE FROM profiles WHERE id='r11p_reader'");
 await run("DELETE FROM auth_accounts WHERE id='r11u_reader'");
 for(const table of ['discovery_preferences','profile_themes','posts','social_stories'])check(!(await one('SELECT * FROM '+table+' LIMIT 1')),'account deletion cascades to '+table);
 check(!(await one('SELECT * FROM post_likes LIMIT 1')),'post deletion cascades to likes');
 return{passed:checks.length,checks};
}
