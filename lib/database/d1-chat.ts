import type { NooklieD1 } from './d1';

// Encrypted persistence only. Existing AES-GCM encryption/decryption and its
// thread:message:body/media AAD remain server-side and unchanged.
export function d1Chat(db:NooklieD1,version:1|2=2) {
 if(![1,2].includes(version))throw new Error('Invalid cipher version');
 function session(hash:string){if(!/^[0-9a-f]{64}$/.test(hash))throw new Error('Invalid session hash');}
 function id(value:string){if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(value))throw new Error('Invalid identifier');}
 function cipher(value:string){if(typeof value!=='string'||value.length>16000||!(version===2?/^v2:[A-Za-z0-9+/]{38,}={0,2}$/:/^[A-Za-z0-9+/]{38,}={0,2}$/).test(value))throw new Error('Encrypted body required');}
 const metadata='id,kind,name,avatar_path,initiator_id,recipient_id,member_status,blocked,created_at,updated_at';
 const allowed=`SELECT * FROM d1_chat_access WHERE token_hash=?1 AND id=?2`;
 return {
  async thread(hash:string,threadId:string){session(hash);return db.prepare(`SELECT ${metadata} FROM d1_chat_access WHERE token_hash=?1 AND id=?2`).bind(hash,threadId).first<Record<string,unknown>>();},
  async threads(hash:string){session(hash);const r=await db.prepare(`SELECT ${metadata} FROM d1_chat_access WHERE token_hash=?1 ORDER BY updated_at DESC,id LIMIT 100`).bind(hash).all<Record<string,unknown>>();if(!r.success)throw new Error('Threads unavailable');return r.results;},
  async request(hash:string,threadId:string,target:string){session(hash);id(threadId);
   const result=await db.prepare(`INSERT INTO chat_threads(id,initiator_id,recipient_id) SELECT ?2,a.profile_id,p.id FROM d1_social_actors a
    JOIN profiles p ON p.id=?3 JOIN auth_accounts u ON u.id=p.user_id WHERE a.token_hash=?1 AND p.id<>a.profile_id
    AND p.moderation_hidden_at IS NULL AND u.account_status='active' AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
      (b.blocker_id=a.profile_id AND b.blocked_id=p.id)OR(b.blocked_id=a.profile_id AND b.blocker_id=p.id))
    AND(SELECT count(*) FROM chat_threads t WHERE t.initiator_id=a.profile_id AND julianday(t.created_at)>julianday('now','-1 hour'))<10
    ON CONFLICT DO NOTHING RETURNING id`).bind(hash,threadId,target).first<{id:string}>();
   if(result)return result;
   return db.prepare(`SELECT id FROM d1_chat_access WHERE token_hash=?1 AND kind='direct' AND ?2<>actor_id AND ?2 IN(initiator_id,recipient_id) AND blocked=0`).bind(hash,target).first<{id:string}>();},
  async acceptDirect(hash:string,threadId:string,accept=true){session(hash);if(typeof accept!=='boolean')throw new Error('Invalid action');
   return db.prepare(`UPDATE chat_threads SET status=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND kind='direct'
    AND recipient_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
    AND EXISTS(SELECT 1 FROM d1_chat_access WHERE token_hash=?1 AND id=?2 AND blocked=0) RETURNING id`).bind(hash,threadId,accept?'accepted':'spam').first<{id:string}>();},
  async createGroup(hash:string,threadId:string,name:string,members:string[]){session(hash);id(threadId);
   if(typeof name!=='string'||!name.trim()||name.trim().length>60||!Array.isArray(members)||members.length<1||members.length>14||new Set(members).size!==members.length)throw new Error('Invalid group');
   members.forEach(id);const r=await db.prepare('INSERT INTO d1_chat_group_commands(id,token_hash,name,members) VALUES(?,?,?,?)').bind(threadId,hash,name.trim(),JSON.stringify(members)).run();
   if(!r.success)throw new Error('Unable to create group');return{id:threadId};},
  async invite(hash:string,threadId:string,target:string){session(hash);
   return db.prepare(`INSERT INTO chat_group_members(thread_id,profile_id,status) SELECT t.id,p.id,'pending' FROM chat_threads t
    JOIN d1_social_actors a ON a.profile_id=t.initiator_id JOIN profiles p ON p.id=?3 JOIN auth_accounts u ON u.id=p.user_id
    WHERE t.id=?2 AND t.kind='group' AND a.token_hash=?1 AND u.account_status='active' AND p.moderation_hidden_at IS NULL
    AND EXISTS(SELECT 1 FROM chat_group_members m WHERE m.thread_id=t.id AND m.profile_id=a.profile_id AND m.status='accepted')
    AND NOT EXISTS(SELECT 1 FROM chat_blocks b JOIN chat_group_members m ON m.thread_id=t.id WHERE
      (b.blocker_id=p.id AND b.blocked_id=m.profile_id)OR(b.blocked_id=p.id AND b.blocker_id=m.profile_id))
    ON CONFLICT DO NOTHING RETURNING profile_id`).bind(hash,threadId,target).first<{profile_id:string}>();},
  async acceptGroup(hash:string,threadId:string){session(hash);
   return db.prepare(`UPDATE chat_group_members SET status='accepted' WHERE thread_id=?2
    AND profile_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
    AND NOT EXISTS(SELECT 1 FROM chat_blocks b JOIN chat_group_members m ON m.thread_id=?2 WHERE
      (b.blocker_id=chat_group_members.profile_id AND b.blocked_id=m.profile_id)OR(b.blocked_id=chat_group_members.profile_id AND b.blocker_id=m.profile_id)) RETURNING profile_id`)
    .bind(hash,threadId).first<{profile_id:string}>();},
  async leaveGroup(hash:string,threadId:string){session(hash);return db.prepare(`DELETE FROM chat_group_members WHERE thread_id=?2 AND profile_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING profile_id`).bind(hash,threadId).first<{profile_id:string}>();},
  async members(hash:string,threadId:string){session(hash);const r=await db.prepare(`SELECT p.id,p.username,p.display_name,p.avatar_url,m.status
    FROM chat_group_members m JOIN profiles p ON p.id=m.profile_id WHERE m.thread_id=?2 AND EXISTS(SELECT 1 FROM d1_chat_access
      WHERE token_hash=?1 AND id=?2 AND kind='group' AND member_status='accepted' AND blocked=0) ORDER BY m.joined_at,p.id`).bind(hash,threadId).all<Record<string,unknown>>();if(!r.success)throw new Error('Members unavailable');return r.results;},
  async messages(hash:string,threadId:string,before:{date:string;id:string}|null=null){session(hash);
   if(before&&(!Number.isFinite(Date.parse(before.date))||typeof before.id!=='string'))throw new Error('Invalid cursor');
   const r=await db.prepare(`SELECT m.* FROM chat_messages m JOIN(${allowed}) t ON t.id=m.thread_id
    WHERE t.blocked=0 AND(t.kind='direct' OR t.member_status='accepted') AND m.cipher_version=?3
    AND(?4 IS NULL OR m.created_at<?4 OR(m.created_at=?4 AND m.id<?5)) ORDER BY m.created_at DESC,m.id DESC LIMIT 60`)
    .bind(hash,threadId,version,before?.date??null,before?.id??null).all<Record<string,unknown>>();if(!r.success)throw new Error('Messages unavailable');return r.results;},
  async send(hash:string,messageId:string,threadId:string,bodyCipher:string,reply:string|null=null,mediaType:string|null=null,sticker=false){session(hash);id(messageId);id(threadId);cipher(bodyCipher);
   if(typeof sticker!=='boolean'||(mediaType!==null&&!['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/ogg','audio/mpeg','audio/wav','audio/mp4'].includes(mediaType))||(sticker&&!mediaType?.startsWith('image/')))throw new Error('Invalid attachment');
   const path=mediaType?(version===2?'v2/':'')+threadId+'/'+messageId+'.enc':null;
   return db.prepare(`INSERT INTO chat_messages(id,thread_id,sender_id,body_cipher,reply_to,media_path,media_type,is_sticker,cipher_version)
    SELECT ?3,t.id,t.actor_id,?4,?5,?6,?7,?8,?9 FROM(${allowed}) t WHERE t.member_status='accepted' AND t.blocked=0
    AND(?5 IS NULL OR EXISTS(SELECT 1 FROM chat_messages m WHERE m.id=?5 AND m.thread_id=t.id AND m.cipher_version=?9 AND m.revoked_at IS NULL))
    AND(SELECT count(*) FROM chat_messages m WHERE m.sender_id=t.actor_id AND julianday(m.created_at)>julianday('now','-1 minute'))<30
    ON CONFLICT(id) DO NOTHING RETURNING id`).bind(hash,threadId,messageId,bodyCipher,reply,path,mediaType,sticker?1:0,version).first<{id:string}>();},
  async media(hash:string,messageId:string){session(hash);return db.prepare(`SELECT m.id,m.thread_id,m.media_path,m.media_type FROM chat_messages m
    JOIN d1_chat_access t ON t.id=m.thread_id AND t.token_hash=?1 WHERE m.id=?2 AND m.cipher_version=?3
    AND m.revoked_at IS NULL AND m.media_path IS NOT NULL AND t.blocked=0 AND(t.kind='direct' OR t.member_status='accepted')`)
    .bind(hash,messageId,version).first<{id:string;thread_id:string;media_path:string;media_type:string}>();},
  async change(hash:string,threadId:string,messageId:string,bodyCipher:string,revoke=false){session(hash);cipher(bodyCipher);if(typeof revoke!=='boolean')throw new Error('Invalid action');
   return db.prepare(`UPDATE chat_messages SET body_cipher=?4,edited_at=CASE WHEN ?5=0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE edited_at END,
    revoked_at=CASE WHEN ?5=1 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE revoked_at END,
    media_path=CASE WHEN ?5=1 THEN NULL ELSE media_path END,media_type=CASE WHEN ?5=1 THEN NULL ELSE media_type END,
    is_sticker=CASE WHEN ?5=1 THEN 0 ELSE is_sticker END,reply_to=CASE WHEN ?5=1 THEN NULL ELSE reply_to END
    WHERE id=?3 AND thread_id=?2 AND cipher_version=?6 AND revoked_at IS NULL AND julianday(created_at)>julianday('now','-2 hours')
    AND EXISTS(SELECT 1 FROM d1_chat_access t WHERE t.token_hash=?1 AND t.id=?2 AND t.actor_id=chat_messages.sender_id
      AND t.member_status='accepted' AND(?5=1 OR t.blocked=0)) RETURNING id,edited_at,revoked_at`)
    .bind(hash,threadId,messageId,bodyCipher,revoke?1:0,version).first<Record<string,unknown>>();},
  async report(hash:string,reportId:string,threadId:string,messageId:string|null,reason:string){session(hash);id(reportId);if(typeof reason!=='string'||reason.trim().length<3||reason.length>2000)throw new Error('Invalid report');
   return db.prepare(`INSERT INTO chat_reports(id,reporter_id,thread_id,message_id,reason,message_snapshot)
    SELECT ?3,t.actor_id,t.id,?4,?5,CASE WHEN ?4 IS NULL THEN NULL ELSE(SELECT json_object('id',m.id,'thread_id',m.thread_id,'sender_id',m.sender_id,
      'body_cipher',m.body_cipher,'created_at',m.created_at,'media_type',m.media_type,'cipher_version',m.cipher_version) FROM chat_messages m WHERE m.id=?4) END
    FROM(${allowed}) t WHERE(?4 IS NULL OR((t.kind='direct' OR t.member_status='accepted') AND EXISTS(SELECT 1 FROM chat_messages m
      WHERE m.id=?4 AND m.thread_id=t.id AND m.cipher_version=?6 AND m.revoked_at IS NULL)))
    AND(SELECT count(*) FROM chat_reports r WHERE r.reporter_id=t.actor_id AND julianday(r.created_at)>julianday('now','-1 hour'))<10 RETURNING id`)
    .bind(hash,threadId,reportId,messageId,reason.trim(),version).first<{id:string}>();},
  async link(hash:string,threadId:string,tokenHash:string){session(hash);session(tokenHash);
   return db.prepare(`INSERT INTO chat_group_invite_links(thread_id,token_hash,created_by,expires_at)
    SELECT t.id,?3,t.actor_id,strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days') FROM(${allowed}) t
    WHERE t.kind='group' AND t.initiator_id=t.actor_id AND t.member_status='accepted'
    ON CONFLICT(thread_id) DO UPDATE SET token_hash=excluded.token_hash,created_by=excluded.created_by,expires_at=excluded.expires_at RETURNING thread_id`)
    .bind(hash,threadId,tokenHash).first<{thread_id:string}>();},
  async revokeLink(hash:string,threadId:string){session(hash);return db.prepare(`DELETE FROM chat_group_invite_links WHERE thread_id=?2
    AND EXISTS(SELECT 1 FROM d1_chat_access t WHERE t.token_hash=?1 AND t.id=?2 AND t.initiator_id=t.actor_id AND t.member_status='accepted') RETURNING thread_id`).bind(hash,threadId).first<{thread_id:string}>();},
  async joinLink(hash:string,tokenHash:string){session(hash);session(tokenHash);
   return db.prepare(`INSERT INTO chat_group_members(thread_id,profile_id,status)
    SELECT t.id,a.profile_id,'accepted' FROM chat_group_invite_links l JOIN chat_threads t ON t.id=l.thread_id
    JOIN d1_social_actors a ON a.token_hash=?1 JOIN profiles owner ON owner.id=t.initiator_id JOIN auth_accounts u ON u.id=owner.user_id
    WHERE l.token_hash=?2 AND julianday(l.expires_at)>julianday('now') AND t.kind='group' AND t.initiator_id=l.created_by
      AND owner.moderation_hidden_at IS NULL AND u.account_status='active'
      AND EXISTS(SELECT 1 FROM chat_group_members m WHERE m.thread_id=t.id AND m.profile_id=l.created_by AND m.status='accepted')
      AND NOT EXISTS(SELECT 1 FROM chat_blocks b JOIN chat_group_members m ON m.thread_id=t.id WHERE
        (b.blocker_id=a.profile_id AND b.blocked_id=m.profile_id)OR(b.blocked_id=a.profile_id AND b.blocker_id=m.profile_id))
    ON CONFLICT(thread_id,profile_id) DO UPDATE SET status='accepted' RETURNING thread_id`).bind(hash,tokenHash).first<{thread_id:string}>();},
 };
}
