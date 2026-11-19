import { getSessionTokenHash } from '@/lib/auth/session';
import type { NooklieD1 } from './d1';

export async function d1FollowActor(db: NooklieD1) {
  const hash = await getSessionTokenHash();
  if (!hash) return null;
  const actor = await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
    .bind(hash).first<{profile_id:string}>();
  return actor ? { hash, id: actor.profile_id } : null;
}

export async function d1FollowState(db: NooklieD1, hash: string | null, target: string) {
  return db.prepare(`WITH viewer AS (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
    SELECT coalesce(p.id=(SELECT profile_id FROM viewer),0) AS own,
    EXISTS(SELECT 1 FROM follows WHERE follower_id=(SELECT profile_id FROM viewer) AND following_id=p.id) AS following,
    EXISTS(SELECT 1 FROM follow_requests WHERE requester_id=(SELECT profile_id FROM viewer) AND target_id=p.id) AS requested,
    (SELECT count(*) FROM follows WHERE following_id=p.id) AS followers_count,
    (SELECT count(*) FROM follows WHERE follower_id=p.id) AS following_count,
    a.account_status='active' AND p.moderation_hidden_at IS NULL
      AND (p.is_private=0 OR p.id=(SELECT profile_id FROM viewer) OR EXISTS(
        SELECT 1 FROM follows WHERE follower_id=(SELECT profile_id FROM viewer) AND following_id=p.id))
      AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
        (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer))
        OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer))) AS allowed
    FROM profiles p JOIN auth_accounts a ON a.id=p.user_id WHERE p.id=?2`)
    .bind(hash,target).first<{own:number;following:number;requested:number;followers_count:number;following_count:number;allowed:number}>();
}
