import type { NooklieD1 } from './d1';

export function d1Feed(db: NooklieD1) {
 function session(hash:string|null){if(hash!==null&&!/^[0-9a-f]{64}$/.test(hash))throw new Error('Invalid session hash');}
 function text(body:string,optional=false){if(typeof body!=='string'||body.length>5000||(!optional&&!body.trim()))throw new Error('Invalid text');}
 const context=`WITH viewer AS(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1), visible AS(
 SELECT p.* FROM nook_posts p JOIN profiles a ON a.id=p.user_id JOIN auth_accounts u ON u.id=a.user_id
 WHERE p.moderation_hidden_at IS NULL AND a.moderation_hidden_at IS NULL AND u.account_status='active'
 AND(a.is_private=0 OR a.id=(SELECT profile_id FROM viewer) OR EXISTS(SELECT 1 FROM follows f WHERE f.following_id=a.id AND f.follower_id=(SELECT profile_id FROM viewer)))
 AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE(b.blocker_id=a.id AND b.blocked_id=(SELECT profile_id FROM viewer))OR(b.blocked_id=a.id AND b.blocker_id=(SELECT profile_id FROM viewer)))),
 replies AS(SELECT c.* FROM nook_comments c JOIN visible p ON p.id=c.post_id JOIN profiles a ON a.id=c.author_id JOIN auth_accounts u ON u.id=a.user_id
 WHERE a.moderation_hidden_at IS NULL AND u.account_status='active' AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE(b.blocker_id=a.id AND b.blocked_id=(SELECT profile_id FROM viewer))OR(b.blocked_id=a.id AND b.blocker_id=(SELECT profile_id FROM viewer))))`;
 return {
  async post(hash:string|null,id:string){session(hash);return db.prepare(context+' SELECT * FROM visible WHERE id=?2').bind(hash,id).first<Record<string,unknown>>();},
  async feed(hash:string,limit=30,after:{date:string;id:string}|null=null){session(hash);if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid page size');
   if(after&&(typeof after.date!=='string'||!Number.isFinite(Date.parse(after.date))||typeof after.id!=='string'))throw new Error('Invalid cursor');
   const r=await db.prepare(context+` SELECT p.* FROM visible p WHERE EXISTS(SELECT 1 FROM viewer)
    AND NOT EXISTS(SELECT 1 FROM profile_mutes m WHERE m.user_id=(SELECT profile_id FROM viewer) AND m.target_id=p.user_id)
    AND(?3 IS NULL OR p.created_at<?3 OR(p.created_at=?3 AND p.id<?4)) ORDER BY p.created_at DESC,p.id DESC LIMIT ?2`)
    .bind(hash,limit,after?.date??null,after?.id??null).all<Record<string,unknown>>();if(!r.success)throw new Error('Feed unavailable');return r.results;},
  async create(hash:string,id:string,body:string,origin:'feed'|'mural'='feed'){session(hash);text(body);if(!['feed','mural'].includes(origin))throw new Error('Invalid origin');
   return db.prepare(`INSERT INTO nook_posts(id,user_id,body,publication_origin) SELECT ?2,profile_id,?3,?4 FROM d1_social_actors WHERE token_hash=?1 RETURNING id`)
    .bind(hash,id,body.trim(),origin).first<{id:string}>();},
  async edit(hash:string,id:string,body:string){session(hash);text(body,true);
   return db.prepare(`UPDATE nook_posts SET body=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2
    AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) AND moderation_hidden_at IS NULL
    AND(trim(?3)<>'' OR image_url IS NOT NULL OR story_id IS NOT NULL OR news_slug IS NOT NULL OR EXISTS(SELECT 1 FROM nook_post_media m WHERE m.post_id=nook_posts.id)) RETURNING id`)
    .bind(hash,id,body.trim()).first<{id:string}>();},
  async remove(hash:string,id:string){session(hash);return db.prepare(`DELETE FROM nook_posts WHERE id=?2 AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) AND moderation_hidden_at IS NULL RETURNING id`).bind(hash,id).first<{id:string}>();},
  async comments(hash:string|null,id:string){session(hash);const r=await db.prepare(context+' SELECT * FROM replies WHERE post_id=?2 ORDER BY created_at,id LIMIT 200').bind(hash,id).all<Record<string,unknown>>();if(!r.success)throw new Error('Comments unavailable');return r.results;},
  async comment(hash:string,id:string,postId:string,body:string,parent:string|null=null){session(hash);text(body);
   return db.prepare(context+` INSERT INTO nook_comments(id,post_id,author_id,content,parent_id)
    SELECT ?2,p.id,v.profile_id,?4,?5 FROM visible p JOIN viewer v WHERE p.id=?3
    AND(?5 IS NULL OR EXISTS(SELECT 1 FROM replies c WHERE c.id=?5 AND c.post_id=p.id)) RETURNING id`)
    .bind(hash,id,postId,body.trim(),parent).first<{id:string}>();},
  async react(hash:string,id:string,kind:'post'|'comment',target:string,emoji:string){session(hash);if(!['post','comment'].includes(kind)||!['❤️','😂','😭','😱','👀','🔥'].includes(emoji))throw new Error('Invalid reaction');
   const table=kind==='post'?'nook_post_reactions':'nook_comment_reactions',column=kind==='post'?'post_id':'comment_id',view=kind==='post'?'visible':'replies';
   return db.prepare(context+` INSERT INTO ${table}(id,${column},user_id,emoji) SELECT ?2,p.id,v.profile_id,?4 FROM ${view} p JOIN viewer v WHERE p.id=?3 ON CONFLICT DO NOTHING RETURNING id`)
    .bind(hash,id,target,emoji).first<{id:string}>();},
  async unreact(hash:string,kind:'post'|'comment',target:string,emoji:string){session(hash);if(!['post','comment'].includes(kind))throw new Error('Invalid reaction');
   const table=kind==='post'?'nook_post_reactions':'nook_comment_reactions',column=kind==='post'?'post_id':'comment_id';
   return db.prepare(`DELETE FROM ${table} WHERE ${column}=?2 AND emoji=?3 AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING id`).bind(hash,target,emoji).first<{id:string}>();},
  async repost(hash:string,id:string,target:string,quote:string|null=null){session(hash);if(quote!==null)text(quote);
   return db.prepare(context+` INSERT INTO nook_reposts(id,user_id,post_id,comment) SELECT ?2,v.profile_id,p.id,?4 FROM visible p JOIN viewer v WHERE p.id=?3 ON CONFLICT DO NOTHING RETURNING id`).bind(hash,id,target,quote?.trim()??null).first<{id:string}>();},
  async unrepost(hash:string,target:string){session(hash);return db.prepare(`DELETE FROM nook_reposts WHERE post_id=?2 AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING id`).bind(hash,target).first<{id:string}>();},
  async save(hash:string,id:string,target:string){session(hash);return db.prepare(context+` INSERT INTO nook_saved_posts(id,user_id,post_id) SELECT ?2,v.profile_id,p.id FROM visible p JOIN viewer v WHERE p.id=?3 ON CONFLICT DO NOTHING RETURNING id`).bind(hash,id,target).first<{id:string}>();},
  async unsave(hash:string,target:string){session(hash);return db.prepare(`DELETE FROM nook_saved_posts WHERE post_id=?2 AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING id`).bind(hash,target).first<{id:string}>();},
  async saved(hash:string){session(hash);const r=await db.prepare(context+` SELECT p.* FROM nook_saved_posts s JOIN visible p ON p.id=s.post_id WHERE s.user_id=(SELECT profile_id FROM viewer) ORDER BY s.created_at DESC,s.id LIMIT 100`).bind(hash).all<Record<string,unknown>>();if(!r.success)throw new Error('Saved posts unavailable');return r.results;},
 };
}
