import type { NooklieD1 } from './d1';

export function d1Events(db:NooklieD1) {
 function session(hash:string|null){if(hash!==null&&!/^[0-9a-f]{64}$/.test(hash))throw new Error('Invalid session hash');}
 function fields(title:string,description:string,start:string,end:string){if(typeof title!=='string'||!title.trim()||title.length>120||typeof description!=='string'||description.length>12000||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))throw new Error('Invalid event');}
 const admin=`SELECT s.user_id FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id JOIN platform_admins pa ON pa.user_id=a.id WHERE s.token_hash=?1 AND a.account_status='active' AND julianday(s.expires_at)>julianday('now')`;
 const visible=`WITH viewer AS(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1), works AS(
 SELECT s.* FROM released_stories s JOIN profiles p ON p.id=s.author_id JOIN auth_accounts a ON a.id=p.user_id
 WHERE p.moderation_hidden_at IS NULL AND a.account_status='active' AND(p.is_private=0 OR p.id=(SELECT profile_id FROM viewer)
 OR EXISTS(SELECT 1 FROM follows f WHERE f.following_id=p.id AND f.follower_id=(SELECT profile_id FROM viewer)))
 AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE(b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer))OR(b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer))))`;
 return {
  async list(){const r=await db.prepare(`SELECT id,title,description,starts_at,ends_at,details,revision FROM story_events WHERE active=1 AND julianday(ends_at)>julianday('now') ORDER BY starts_at,id LIMIT 100`).all<Record<string,unknown>>();if(!r.success)throw new Error('Events unavailable');return r.results;},
  async create(hash:string,id:string,revision:string,title:string,description:string,start:string,end:string){session(hash);fields(title,description,start,end);
   return db.prepare(`INSERT INTO story_events(id,revision,title,description,starts_at,ends_at,created_by) SELECT ?2,?3,?4,?5,?6,?7,user_id FROM(${admin}) RETURNING id`).bind(hash,id,revision,title.trim(),description,start,end).first<{id:string}>();},
  async edit(hash:string,id:string,expected:string,revision:string,title:string,description:string,start:string,end:string){session(hash);fields(title,description,start,end);if(!revision||revision===expected)throw new Error('New revision required');
   return db.prepare(`UPDATE story_events SET revision=?4,title=?5,description=?6,starts_at=?7,ends_at=?8 WHERE id=?2 AND revision=?3 AND EXISTS(${admin}) RETURNING id`).bind(hash,id,expected,revision,title.trim(),description,start,end).first<{id:string}>();},
  async setActive(hash:string,id:string,expected:string,revision:string,active:boolean){session(hash);if(typeof active!=='boolean'||!revision||revision===expected)throw new Error('Invalid event revision');
   return db.prepare(`UPDATE story_events SET active=?5,revision=?4 WHERE id=?2 AND revision=?3 AND EXISTS(${admin}) RETURNING id`).bind(hash,id,expected,revision,active?1:0).first<{id:string}>();},
  async enter(hash:string,eventId:string,storyId:string){session(hash);return db.prepare(visible+` INSERT INTO story_event_entries(event_id,story_id)
   SELECT e.id,s.id FROM story_events e JOIN works s ON s.id=?3 WHERE e.id=?2 AND e.active=1 AND julianday(e.starts_at)<=julianday('now') AND julianday(e.ends_at)>julianday('now')
   AND s.author_id=(SELECT profile_id FROM viewer) ON CONFLICT DO NOTHING RETURNING story_id`).bind(hash,eventId,storyId).first<{story_id:string}>();},
  async withdraw(hash:string,eventId:string,storyId:string){session(hash);return db.prepare(`DELETE FROM story_event_entries WHERE event_id=?2 AND story_id=?3 AND EXISTS(SELECT 1 FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id WHERE s.id=?3 AND a.token_hash=?1) RETURNING story_id`).bind(hash,eventId,storyId).first<{story_id:string}>();},
  async entries(hash:string|null,eventId:string){session(hash);const r=await db.prepare(visible+` SELECT s.id,s.title,s.cover_url FROM story_event_entries x JOIN works s ON s.id=x.story_id JOIN story_events e ON e.id=x.event_id WHERE x.event_id=?2 AND e.active=1 AND julianday(e.ends_at)>julianday('now') ORDER BY x.created_at,s.id LIMIT 200`).bind(hash,eventId).all<Record<string,unknown>>();if(!r.success)throw new Error('Entries unavailable');return r.results;},
  async vote(hash:string,pollId:string,optionId:string){session(hash);return db.prepare(visible+` INSERT INTO poll_votes(poll_id,option_id,user_id)
   SELECT p.id,o.id,v.profile_id FROM polls p JOIN poll_options o ON o.poll_id=p.id JOIN chapters c ON c.id=p.chapter_id JOIN works s ON s.id=c.story_id JOIN viewer v
   WHERE p.id=?2 AND o.id=?3 AND c.published=1 ON CONFLICT DO NOTHING RETURNING poll_id`).bind(hash,pollId,optionId).first<{poll_id:string}>();},
 };
}
