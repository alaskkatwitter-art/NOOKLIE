import type { NooklieD1 } from './d1';

export interface D1CommentInput {
  id: string; chapterId: string; body: string; parentId?: string | null;
  stickerId?: string | null; selectedText?: string | null;
  startOffset?: number | null; endOffset?: number | null;
}

// Requires the existing preference validator. It is injected so the same SQL
// repository can be tested against native SQLite and the remote D1 API.
export function d1Reader(db: NooklieD1, validPreferences: (value: unknown) => boolean) {
  if(typeof validPreferences!=='function')throw new Error('Preference validator required');
  function session(hash: string | null) {
    if(hash!==null&&!/^[0-9a-f]{64}$/.test(hash))throw new Error('Invalid session hash');
  }
  const reader=`WITH viewer AS (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1), readable AS (
    SELECT c.id,c.story_id FROM chapters c JOIN released_stories s ON s.id=c.story_id
    JOIN profiles p ON p.id=s.author_id JOIN auth_accounts a ON a.id=p.user_id
    WHERE c.published=1 AND p.moderation_hidden_at IS NULL AND a.account_status='active'
      AND (p.is_private=0 OR p.id=(SELECT profile_id FROM viewer) OR EXISTS(SELECT 1 FROM follows f
        WHERE f.following_id=p.id AND f.follower_id=(SELECT profile_id FROM viewer)))
      AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
        (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer))
        OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer)))), visible_comments AS (
    SELECT c.* FROM comments c JOIN readable r ON r.id=c.chapter_id
    JOIN profiles p ON p.id=c.user_id JOIN auth_accounts a ON a.id=p.user_id
    WHERE p.moderation_hidden_at IS NULL AND a.account_status='active'
      AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
        (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer))
        OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer))))`;
  const account=`SELECT s.user_id FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id
    WHERE s.token_hash=?1 AND a.account_status='active' AND julianday(s.expires_at)>julianday('now')`;
  return {
    async comments(hash: string | null, chapterId: string, limit=100, after: {createdAt:string;id:string} | null=null) {
      session(hash);if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Invalid page size');
      if(after!==null&&(typeof after.createdAt!=='string'||!Number.isFinite(Date.parse(after.createdAt))||typeof after.id!=='string'))throw new Error('Invalid cursor');
      const result=await db.prepare(reader+` SELECT c.id,c.chapter_id,c.body,c.selected_text,c.start_offset,c.end_offset,
        c.parent_comment_id,c.created_at,c.sticker_id,p.username,p.display_name,p.avatar_url,p.verified,p.is_official,
        st.image_url AS sticker_url FROM visible_comments c JOIN profiles p ON p.id=c.user_id
        LEFT JOIN user_stickers st ON st.id=c.sticker_id
        WHERE c.chapter_id=?2 AND (?4 IS NULL OR c.created_at>?4 OR (c.created_at=?4 AND c.id>?5))
        ORDER BY c.created_at,c.id LIMIT ?3`).bind(hash,chapterId,limit,after?.createdAt??null,after?.id??null).all<Record<string,unknown>>();
      if(!result.success)throw new Error('Comments unavailable');return result.results;
    },
    async postComment(hash: string, input: D1CommentInput) {
      session(hash);
      const {id,chapterId,body,parentId=null,stickerId=null,selectedText=null,startOffset=null,endOffset=null}=input;
      if(typeof body!=='string'||body.length>10000||(!body.trim()&&!stickerId)
        ||(selectedText!==null&&(typeof selectedText!=='string'||selectedText.length>10000))
        ||(startOffset!==null&&(!Number.isSafeInteger(startOffset)||startOffset<0))
        ||(endOffset!==null&&(!Number.isSafeInteger(endOffset)||endOffset<0||startOffset===null||endOffset<startOffset))) {
        throw new Error('Invalid comment');
      }
      return db.prepare(reader+` INSERT INTO comments(id,chapter_id,user_id,body,parent_comment_id,sticker_id,selected_text,start_offset,end_offset)
        SELECT ?2,r.id,v.profile_id,?4,?5,?6,?7,?8,?9 FROM readable r JOIN viewer v
        WHERE r.id=?3 AND (?5 IS NULL OR EXISTS(SELECT 1 FROM visible_comments p WHERE p.id=?5 AND p.chapter_id=r.id))
          AND (?6 IS NULL OR EXISTS(SELECT 1 FROM user_stickers st WHERE st.id=?6 AND st.user_id=v.profile_id)) RETURNING id`)
        .bind(hash,id,chapterId,body.trim(),parentId,stickerId,selectedText,startOffset,endOffset).first<{id:string}>();
    },
    async likeComment(hash: string, id: string) {
      session(hash);
      return db.prepare(reader+` INSERT INTO comment_likes(comment_id,user_id)
        SELECT c.id,v.profile_id FROM visible_comments c JOIN viewer v WHERE c.id=?2
        ON CONFLICT DO NOTHING RETURNING comment_id`).bind(hash,id).first<{comment_id:string}>();
    },
    async unlikeComment(hash: string, id: string) {
      session(hash);
      return db.prepare(`DELETE FROM comment_likes WHERE comment_id=?2
        AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING comment_id`)
        .bind(hash,id).first<{comment_id:string}>();
    },
    async preferences(hash: string) {
      session(hash);
      const row=await db.prepare(`SELECT preferences FROM reader_preferences WHERE user_id=(${account})`)
        .bind(hash).first<{preferences:string}>();
      return row&&validPreferences(JSON.parse(row.preferences))?JSON.parse(row.preferences):null;
    },
    async savePreferences(hash: string, preferences: unknown) {
      session(hash);if(!validPreferences(preferences))throw new Error('Invalid reader preferences');
      return db.prepare(`INSERT INTO reader_preferences(user_id,preferences) SELECT user_id,?2 FROM (${account})
        WHERE 1 ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING user_id`)
        .bind(hash,JSON.stringify(preferences)).first<{user_id:string}>();
    },
    async stickers(hash: string) {
      session(hash);
      const result=await db.prepare(`SELECT st.id,st.image_url,st.last_used_at FROM user_stickers st
        JOIN d1_social_actors a ON a.profile_id=st.user_id WHERE a.token_hash=?1
        ORDER BY st.created_at DESC,st.id LIMIT 200`).bind(hash).all<Record<string,unknown>>();
      if(!result.success)throw new Error('Stickers unavailable');return result.results;
    },
    async deleteSticker(hash: string, id: string) {
      session(hash);
      return db.prepare(`DELETE FROM user_stickers WHERE id=?2 AND user_id=(
        SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING id`).bind(hash,id).first<{id:string}>();
    },
    async notifications(hash: string) {
      session(hash);
      const result=await db.prepare(`SELECT id,notification_type,title,body,href,created_at,read_at,actor_id
        FROM user_notifications WHERE user_id=(${account}) ORDER BY created_at DESC,id DESC LIMIT 50`)
        .bind(hash).all<Record<string,unknown>>();
      if(!result.success)throw new Error('Notifications unavailable');return result.results;
    },
    async markNotificationRead(hash: string, id: string | null) {
      session(hash);if(id!==null&&typeof id!=='string')throw new Error('Invalid notification');
      const result=await db.prepare(`UPDATE user_notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE user_id=(${account}) AND (?2 IS NULL OR id=?2) AND read_at IS NULL`).bind(hash,id).run();
      if(!result.success)throw new Error('Unable to mark notification');
    },
  };
}
