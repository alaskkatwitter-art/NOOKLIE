import type { NooklieD1 } from './d1';

export interface D1VisibleProfile {
  id: string; username: string; display_name: string | null; bio: string | null;
  avatar_url: string | null; cover_url: string | null; is_private: number;
  verified: number; is_official: number;
}

function validSessionHash(hash: string | null) {
  if (hash !== null && !/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid session hash');
}

// Every mutation resolves the actor from the live session IN the mutation SQL.
// Public methods never accept a caller-supplied owner ID or privileged fields.
export function d1Social(db: NooklieD1) {
  return {
    async visibleProfile(profileId: string, tokenHash: string | null = null) {
      validSessionHash(tokenHash);
      return db.prepare(`WITH viewer AS (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
        SELECT p.id,p.username,p.display_name,p.bio,p.avatar_url,p.cover_url,
          p.is_private,p.verified,p.is_official
        FROM profiles p JOIN auth_accounts a ON a.id=p.user_id
        WHERE p.id=?2 AND p.moderation_hidden_at IS NULL AND a.account_status='active'
          AND (p.is_private=0 OR p.id=(SELECT profile_id FROM viewer)
            OR EXISTS(SELECT 1 FROM follows f WHERE f.following_id=p.id AND f.follower_id=(SELECT profile_id FROM viewer)))
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
            (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer))
            OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer)))`)
        .bind(tokenHash,profileId).first<D1VisibleProfile>();
    },
    async updateAbout(tokenHash: string, displayName: string, bio: string) {
      validSessionHash(tokenHash);
      if (typeof displayName!=='string' || typeof bio!=='string' || displayName.length>100 || bio.length>2000) {
        throw new Error('Invalid profile text');
      }
      return db.prepare(`UPDATE profiles SET display_name=?2,bio=?3
        WHERE id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING id`)
        .bind(tokenHash,displayName,bio).first<{ id: string }>();
    },
    async follow(tokenHash: string, target: string) {
      validSessionHash(tokenHash);
      // Triggers make public follows atomic and prevent blocked requests.
      return db.prepare(`INSERT INTO follow_requests(requester_id,target_id)
        SELECT actor.profile_id,p.id FROM d1_social_actors actor
        JOIN profiles p ON p.id=?2 JOIN auth_accounts a ON a.id=p.user_id
        WHERE actor.token_hash=?1 AND actor.profile_id<>p.id
          AND p.moderation_hidden_at IS NULL AND a.account_status='active'
          AND NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=actor.profile_id AND f.following_id=p.id)
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
            (b.blocker_id=actor.profile_id AND b.blocked_id=p.id) OR (b.blocked_id=actor.profile_id AND b.blocker_id=p.id))
        ON CONFLICT DO NOTHING RETURNING requester_id,target_id`)
        .bind(tokenHash,target).first<{ requester_id: string; target_id: string }>();
    },
    async unfollow(tokenHash: string, target: string) {
      validSessionHash(tokenHash);
      const results=await db.batch([
        db.prepare(`DELETE FROM follows WHERE following_id=?2
          AND follower_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)`).bind(tokenHash,target),
        db.prepare(`DELETE FROM follow_requests WHERE target_id=?2
          AND requester_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)`).bind(tokenHash,target),
      ]);
      if (results.some(result=>!result.success)) throw new Error('Unable to unfollow');
    },
    async acceptFollow(tokenHash: string, requester: string) {
      validSessionHash(tokenHash);
      // Only the target of an existing request can accept it. The follow insert
      // and pending-request deletion (trigger) are the same transaction.
      return db.prepare(`INSERT INTO follows(follower_id,following_id)
        SELECT r.requester_id,r.target_id FROM follow_requests r
        JOIN d1_social_actors actor ON actor.profile_id=r.target_id AND actor.token_hash=?1
        JOIN profiles p ON p.id=r.requester_id JOIN auth_accounts a ON a.id=p.user_id
        WHERE r.requester_id=?2 AND p.moderation_hidden_at IS NULL AND a.account_status='active'
        ON CONFLICT DO NOTHING RETURNING follower_id,following_id`)
        .bind(tokenHash,requester).first<{ follower_id: string; following_id: string }>();
    },
    async denyFollow(tokenHash: string, requester: string) {
      validSessionHash(tokenHash);
      return db.prepare(`DELETE FROM follow_requests WHERE requester_id=?2
        AND target_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING requester_id`)
        .bind(tokenHash,requester).first<{ requester_id: string }>();
    },
    async block(tokenHash: string, target: string) {
      validSessionHash(tokenHash);
      return db.prepare(`INSERT INTO chat_blocks(blocker_id,blocked_id)
        SELECT actor.profile_id,p.id FROM d1_social_actors actor JOIN profiles p ON p.id=?2
        WHERE actor.token_hash=?1 AND actor.profile_id<>p.id
        ON CONFLICT DO NOTHING RETURNING blocker_id`)
        .bind(tokenHash,target).first<{ blocker_id: string }>();
    },
    async unblock(tokenHash: string, target: string) {
      validSessionHash(tokenHash);
      return db.prepare(`DELETE FROM chat_blocks WHERE blocked_id=?2
        AND blocker_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING blocker_id`)
        .bind(tokenHash,target).first<{ blocker_id: string }>();
    },
    async mute(tokenHash: string, target: string) {
      validSessionHash(tokenHash);
      return db.prepare(`INSERT INTO profile_mutes(user_id,target_id)
        SELECT actor.profile_id,p.id FROM d1_social_actors actor JOIN profiles p ON p.id=?2
        WHERE actor.token_hash=?1 AND actor.profile_id<>p.id
        ON CONFLICT DO NOTHING RETURNING user_id`)
        .bind(tokenHash,target).first<{ user_id: string }>();
    },
    async unmute(tokenHash: string, target: string) {
      validSessionHash(tokenHash);
      return db.prepare(`DELETE FROM profile_mutes WHERE target_id=?2
        AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING user_id`)
        .bind(tokenHash,target).first<{ user_id: string }>();
    },
    async isMuted(tokenHash: string, target: string) {
      validSessionHash(tokenHash);
      const row=await db.prepare(`SELECT EXISTS(SELECT 1 FROM profile_mutes m
        JOIN d1_social_actors actor ON actor.profile_id=m.user_id
        WHERE actor.token_hash=?1 AND m.target_id=?2) AS allowed`)
        .bind(tokenHash,target).first<{allowed: number}>();
      return row?.allowed===1;
    },
  };
}
