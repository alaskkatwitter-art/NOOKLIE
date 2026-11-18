import type { NooklieD1 } from './d1';

// The caller supplies the existing server-owned newsArticleSlugs, never a request field.
export function d1News(db:NooklieD1,articleSlugs:readonly string[]){
 if(!Array.isArray(articleSlugs)||!articleSlugs.length||articleSlugs.some(s=>typeof s!=='string'||!/^[a-z0-9-]{1,100}$/.test(s)))throw Error('News catalog required');
 const catalog=new Set(articleSlugs);
 function article(slug:string){if(!catalog.has(slug))throw Error('Unknown article');}
 function session(hash:string|null){if(hash!==null&&!/^[0-9a-f]{64}$/.test(hash))throw Error('Invalid session hash');}
 function id(value:string){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(value))throw Error('Invalid identifier');}
 return {
  async comments(hash:string|null,slug:string,limit=30,before:{createdAt:string;id:string}|null=null){
   session(hash);article(slug);if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid page size');
   if(before){id(before.id);if(typeof before.createdAt!=='string'||!Number.isFinite(Date.parse(before.createdAt)))throw Error('Invalid cursor');}
   const rows=await db.prepare(`WITH viewer AS(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
    SELECT c.id,c.article_slug,CASE WHEN c.deleted_at IS NULL THEN c.body END AS body,c.parent_id,c.created_at,
    CASE WHEN c.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted,
    CASE WHEN c.deleted_at IS NULL THEN p.id END AS author_id,
    CASE WHEN c.deleted_at IS NULL THEN p.username END AS username,
    CASE WHEN c.deleted_at IS NULL THEN p.display_name END AS display_name,
    CASE WHEN c.deleted_at IS NULL THEN p.avatar_url END AS avatar_url,
    CASE WHEN c.deleted_at IS NULL THEN p.verified END AS verified,
    CASE WHEN c.deleted_at IS NULL THEN p.is_official END AS is_official,
    CASE WHEN c.deleted_at IS NULL AND p.id=(SELECT profile_id FROM viewer) THEN 1 ELSE 0 END AS can_delete
    FROM news_comments c JOIN profiles p ON p.id=c.author_id JOIN auth_accounts u ON u.id=p.user_id
    WHERE c.article_slug=?2 AND u.account_status='active' AND p.moderation_hidden_at IS NULL
    AND (p.is_private=0 OR p.id=(SELECT profile_id FROM viewer) OR EXISTS(SELECT 1 FROM follows f WHERE f.following_id=p.id AND f.follower_id=(SELECT profile_id FROM viewer)))
    AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer)) OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer)))
    AND (?3 IS NULL OR julianday(c.created_at)<julianday(?3) OR (julianday(c.created_at)=julianday(?3) AND c.id<?4))
    ORDER BY julianday(c.created_at) DESC,c.id DESC LIMIT ?5`).bind(hash,slug,before?.createdAt??null,before?.id??null,limit).all<Record<string,unknown>>();
   if(!rows.success)throw Error('Comments unavailable');return rows.results;},
  async post(hash:string,commentId:string,slug:string,body:string,parentId:string|null=null){
   session(hash);id(commentId);article(slug);if(parentId!==null)id(parentId);
   if(typeof body!=='string'||!body.trim()||body.trim().length>3000)throw Error('Invalid comment');
   const r=await db.prepare(`INSERT INTO d1_news_commands(token_hash,id,article_slug,operation,body,parent_id) VALUES(?,?,?,'post',?,?)`).bind(hash,commentId,slug,body.trim(),parentId).run();
   if(!r.success)throw Error('Comment failed');return {id:commentId};},
  async remove(hash:string,auditId:string,slug:string,commentId:string){
   session(hash);id(auditId);article(slug);id(commentId);
   const r=await db.prepare(`INSERT INTO d1_news_commands(token_hash,id,article_slug,operation,target_id) VALUES(?,?,?,'remove',?)`).bind(hash,auditId,slug,commentId).run();
   if(!r.success)throw Error('Comment removal failed');return {id:commentId};}
 };
}
