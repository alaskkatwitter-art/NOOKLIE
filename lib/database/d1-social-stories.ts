import type { NooklieD1 } from './d1';

const visible = `WITH viewer AS (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1),
  visible AS (
    SELECT s.*,p.username,p.avatar_url,p.verified,p.is_official
    FROM social_stories s JOIN profiles p ON p.id=s.user_id
    JOIN auth_accounts a ON a.id=p.user_id CROSS JOIN viewer v
    WHERE julianday(s.expires_at)>julianday('now') AND a.account_status='active' AND p.moderation_hidden_at IS NULL
      AND (s.user_id=v.profile_id OR EXISTS(SELECT 1 FROM follows WHERE follower_id=v.profile_id AND following_id=s.user_id))
      AND NOT EXISTS(SELECT 1 FROM profile_mutes WHERE user_id=v.profile_id AND target_id=s.user_id)
      AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
        (b.blocker_id=v.profile_id AND b.blocked_id=s.user_id) OR (b.blocker_id=s.user_id AND b.blocked_id=v.profile_id))
  )`;

export async function d1SocialStoryList(db:NooklieD1,hash:string) {
  const rows = await db.prepare(visible+` SELECT * FROM visible ORDER BY julianday(created_at),id`)
    .bind(hash).all<{user_id:string;media_url:string;username:string;avatar_url:string|null;verified:number;is_official:number}>();
  if (!rows.success) throw Error('Stories unavailable');
  return rows.results.map(({username,avatar_url,verified,is_official,...story})=>({
    ...story,user:{id:story.user_id,username,avatar_url,verified:Boolean(verified),is_official:Boolean(is_official)},
  }));
}

export async function canReadD1SocialStoryMedia(db:NooklieD1,hash:string|null,urls:string[]) {
  if (!hash) return false;
  return Boolean(await db.prepare(visible+` SELECT id FROM visible WHERE media_url IN (?2,?3,?4) LIMIT 1`)
    .bind(hash,...urls).first());
}
