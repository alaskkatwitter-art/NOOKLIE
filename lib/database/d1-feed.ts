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
 WHERE a.moderation_hidden_at IS NULL AND u.account_status='active'
 AND (a.is_private=0 OR a.id=(SELECT profile_id FROM viewer) OR EXISTS(
   SELECT 1 FROM follows WHERE follower_id=(SELECT profile_id FROM viewer) AND following_id=a.id))
 AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE(b.blocker_id=a.id AND b.blocked_id=(SELECT profile_id FROM viewer))OR(b.blocked_id=a.id AND b.blocker_id=(SELECT profile_id FROM viewer))))`;
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
  async createPublication(hash: string, id: string, input: {
    body: string; origin: 'feed' | 'mural'; image: string | null; story: string | null; news: string | null; tags: string[];
  }) {
   session(hash);
   return db.prepare(`INSERT INTO nook_posts(id,user_id,body,publication_origin,image_url,story_id,news_slug,hashtags)
     SELECT ?2,a.profile_id,?3,?4,?5,?6,?7,?8 FROM d1_social_actors a WHERE a.token_hash=?1
     AND (?6 IS NULL OR EXISTS(SELECT 1 FROM released_stories s WHERE s.id=?6 AND s.author_id=a.profile_id))
     RETURNING id,user_id,body,image_url,story_id,news_slug,pinned,created_at,updated_at`)
     .bind(hash,id,input.body,input.origin,input.image,input.story,input.news,JSON.stringify(input.tags))
     .first<Record<string, unknown>>();
  },
  async author(profileId: string) {
   const row = await db.prepare('SELECT id,username,display_name,avatar_url,verified,is_official FROM profiles WHERE id=?')
     .bind(profileId).first<Record<string, unknown>>();
   return row ? { ...row, verified: Boolean(row.verified), is_official: Boolean(row.is_official) } : null;
  },
  async edit(hash:string,id:string,body:string){session(hash);text(body,true);
   return db.prepare(`UPDATE nook_posts SET body=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2
    AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) AND moderation_hidden_at IS NULL
    AND(trim(?3)<>'' OR image_url IS NOT NULL OR story_id IS NOT NULL OR news_slug IS NOT NULL OR EXISTS(SELECT 1 FROM nook_post_media m WHERE m.post_id=nook_posts.id)) RETURNING id`)
    .bind(hash,id,body.trim()).first<{id:string}>();},
  async remove(hash:string,id:string){session(hash);return db.prepare(`DELETE FROM nook_posts WHERE id=?2 AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) AND moderation_hidden_at IS NULL RETURNING id`).bind(hash,id).first<{id:string}>();},
  async comments(hash:string|null,id:string){session(hash);const r=await db.prepare(context+' SELECT * FROM replies WHERE post_id=?2 ORDER BY created_at,id LIMIT 200').bind(hash,id).all<Record<string,unknown>>();if(!r.success)throw new Error('Comments unavailable');return r.results;},
  async replyCards(hash: string | null, postId: string | null, replyId: string | null, savedOnly: boolean) {
   session(hash);
   const result = await db.prepare(context + ` SELECT c.id,c.post_id,c.author_id,c.content,c.parent_id,c.image_url,c.created_at,c.updated_at,
     a.username,a.display_name,a.avatar_url,a.verified,a.is_official,
     (SELECT count(*) FROM nook_comment_reactions WHERE comment_id=c.id AND emoji='❤️') AS likes,
     EXISTS(SELECT 1 FROM nook_comment_reactions WHERE comment_id=c.id AND emoji='❤️'
       AND user_id=(SELECT profile_id FROM viewer)) AS liked,
     EXISTS(SELECT 1 FROM nook_saved_replies WHERE comment_id=c.id AND user_id=(SELECT profile_id FROM viewer)) AS saved
     FROM replies c JOIN profiles a ON a.id=c.author_id
     WHERE (?2 IS NULL OR c.post_id=?2) AND (?3 IS NULL OR c.id=?3)
     AND (a.is_private=0 OR a.id=(SELECT profile_id FROM viewer) OR EXISTS(
       SELECT 1 FROM follows WHERE follower_id=(SELECT profile_id FROM viewer) AND following_id=a.id))
     AND (?4=0 OR EXISTS(SELECT 1 FROM nook_saved_replies WHERE comment_id=c.id AND user_id=(SELECT profile_id FROM viewer)))
     ORDER BY CASE WHEN ?4=1 THEN (SELECT created_at FROM nook_saved_replies
       WHERE comment_id=c.id AND user_id=(SELECT profile_id FROM viewer)) END DESC, c.created_at,c.id
     LIMIT CASE WHEN ?4=1 THEN 100 ELSE 300 END`)
     .bind(hash,postId,replyId,Number(savedOnly)).all<{ id: string; post_id: string; content: string; parent_id: string|null;
       author_id: string; username: string; display_name: string|null; avatar_url: string|null;
       verified: number; is_official: number; liked: number; saved: number }>();
   if (!result.success) throw Error('Replies unavailable');
   const ids = new Set(result.results.map(row => row.id));
   return result.results.map(({ username,display_name,avatar_url,verified,is_official,liked,saved,...row }) => savedOnly
     ? { id: row.id, post_id: row.post_id, content: row.content }
     : { ...row, parent_id: row.parent_id && ids.has(row.parent_id) ? row.parent_id : null,
         author: { id: row.author_id, username, display_name, avatar_url, verified: Boolean(verified), is_official: Boolean(is_official) },
         liked: Boolean(liked), saved: Boolean(saved) });
  },
  async comment(hash:string,id:string,postId:string,body:string,parent:string|null=null,image:string|null=null){session(hash);text(body,Boolean(image));
   return db.prepare(context+` INSERT INTO nook_comments(id,post_id,author_id,content,parent_id,image_url)
    SELECT ?2,p.id,v.profile_id,?4,?5,?6 FROM visible p JOIN viewer v WHERE p.id=?3
    AND(?5 IS NULL OR EXISTS(SELECT 1 FROM replies c WHERE c.id=?5 AND c.post_id=p.id)) RETURNING id`)
    .bind(hash,id,postId,body.trim(),parent,image).first<{id:string}>();},
  async applyReplyAction(hash: string, id: string, action: 'like'|'save', enabled: boolean, reactionId: string) {
   session(hash);
   if (!await db.prepare(context + ' SELECT id FROM replies WHERE id=?2').bind(hash,id).first()) return false;
   const like = action === 'like';
   const table = like ? 'nook_comment_reactions' : 'nook_saved_replies';
   const insert = like
     ? `INSERT INTO ${table}(id,comment_id,user_id,emoji) SELECT ?3,r.id,v.profile_id,'❤️' FROM replies r CROSS JOIN viewer v WHERE r.id=?2`
     : `INSERT INTO ${table}(comment_id,user_id) SELECT r.id,v.profile_id FROM replies r CROSS JOIN viewer v WHERE r.id=?2`;
   const sql = enabled ? insert + ' ON CONFLICT DO NOTHING'
     : `DELETE FROM ${table} WHERE comment_id=?2 AND user_id=(SELECT profile_id FROM viewer)
       AND EXISTS(SELECT 1 FROM replies WHERE id=?2)${like ? " AND emoji='❤️'" : ''}`;
   const result = await db.prepare(context + ' ' + sql).bind(...(enabled && like ? [hash,id,reactionId] : [hash,id])).run();
   if (!result.success) throw Error('Unable to change reply action');
   return true;
  },
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
  async reactionSummary(hash: string, postId: string) {
   session(hash);
   const row = await db.prepare(context + ` SELECT
     (SELECT json_group_object(emoji, total) FROM (
       SELECT emoji,count(*) AS total FROM nook_post_reactions WHERE post_id = ?2 GROUP BY emoji
     )) AS counts,
     (SELECT json_group_array(r.emoji) FROM nook_post_reactions r JOIN viewer v ON v.profile_id = r.user_id
       WHERE r.post_id = ?2) AS selected,
     (SELECT count(*) FROM nook_comments WHERE post_id = ?2) AS comments_count
     FROM visible WHERE id = ?2`).bind(hash, postId)
     .first<{ counts: string; selected: string; comments_count: number }>();
   return row ? { counts: JSON.parse(row.counts), user_reactions: JSON.parse(row.selected), comments_count: row.comments_count } : null;
  },
  async togglePostReaction(hash: string, postId: string, emoji: string, id: string) {
   session(hash);
   const remove = db.prepare(context + ` DELETE FROM nook_post_reactions WHERE post_id = ?2 AND emoji = ?3
     AND user_id = (SELECT profile_id FROM viewer) AND EXISTS(SELECT 1 FROM visible WHERE id = ?2)`)
     .bind(hash, postId, emoji);
   const add = db.prepare(context + ` INSERT INTO nook_post_reactions (id,post_id,user_id,emoji)
     SELECT ?4,p.id,v.profile_id,?3 FROM visible p CROSS JOIN viewer v WHERE p.id = ?2 AND changes() = 0`)
     .bind(hash, postId, emoji, id);
   const [removed, added] = await db.batch([remove, add]);
   if (!removed.success || !added.success) throw Error('Unable to change reaction');
   if (removed.meta.changes) return { reacted: false as const, emoji };
   if (!added.meta.changes) return null;
   const reaction = await db.prepare('SELECT id,post_id,user_id,emoji,created_at FROM nook_post_reactions WHERE id = ?').bind(id).first();
   return { reacted: true as const, reaction };
  },
  async savedEntry(hash: string, postId: string) {
   session(hash);
   return db.prepare(context + ` SELECT entry.id,entry.user_id,entry.post_id,entry.created_at
     FROM nook_saved_posts entry JOIN viewer v ON v.profile_id = entry.user_id WHERE entry.post_id = ?2`)
     .bind(hash, postId).first<{ id: string; user_id: string; post_id: string; created_at: string }>();
  },
  async toggleSaved(hash: string, postId: string, id: string) {
   session(hash);
   const remove = db.prepare(context + ` DELETE FROM nook_saved_posts WHERE post_id = ?2
     AND user_id = (SELECT profile_id FROM viewer) AND EXISTS(SELECT 1 FROM visible WHERE id = ?2)`)
     .bind(hash, postId);
   const add = db.prepare(context + ` INSERT INTO nook_saved_posts (id, user_id, post_id)
     SELECT ?3, v.profile_id, p.id FROM visible p CROSS JOIN viewer v WHERE p.id = ?2 AND changes() = 0`)
     .bind(hash, postId, id);
   const [removed, added] = await db.batch([remove, add]);
   if (!removed.success || !added.success) throw Error('Unable to change saved post');
   if (removed.meta.changes) return { saved: false as const };
   if (!added.meta.changes) return null;
   const row = await db.prepare('SELECT id,user_id,post_id,created_at FROM nook_saved_posts WHERE id = ?')
     .bind(id).first();
   return { saved: true as const, saved_post: row };
  },
  async unsave(hash:string,target:string){session(hash);return db.prepare(`DELETE FROM nook_saved_posts WHERE post_id=?2 AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING id`).bind(hash,target).first<{id:string}>();},
  async saved(hash:string){session(hash);const r=await db.prepare(context+` SELECT p.* FROM nook_saved_posts s JOIN visible p ON p.id=s.post_id WHERE s.user_id=(SELECT profile_id FROM viewer) ORDER BY s.created_at DESC,s.id LIMIT 100`).bind(hash).all<Record<string,unknown>>();if(!r.success)throw new Error('Saved posts unavailable');return r.results;},
 };
}
