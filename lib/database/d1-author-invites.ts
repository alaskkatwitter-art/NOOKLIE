import type { NooklieD1 } from './d1';
export function d1AuthorInvites(db: NooklieD1) {
  return {
    async dashboard(hash: string) {
      const owner = await db.prepare(`SELECT p.id,p.username,p.is_private,
        EXISTS(SELECT 1 FROM author_invite_participants i WHERE i.author_id=p.id) AS participating,
        (SELECT count(*) FROM author_invite_registrations r WHERE r.author_id=p.id) AS registrations
        FROM d1_social_actors a JOIN profiles p ON p.id=a.profile_id
        WHERE a.token_hash=? AND p.moderation_hidden_at IS NULL`).bind(hash)
        .first<{id:string;username:string;is_private:number;participating:number;registrations:number}>();
      if (!owner) return null;
      const readers = await db.prepare(`SELECT p.username,r.created_at FROM author_invite_registrations r
        JOIN d1_social_actors actor ON actor.profile_id=r.author_id
        JOIN profiles p ON p.user_id=r.reader_user_id
        JOIN auth_accounts a ON a.id=p.user_id AND a.account_status='active'
        WHERE actor.token_hash=? AND p.moderation_hidden_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
            (b.blocker_id=p.id AND b.blocked_id=r.author_id) OR
            (b.blocked_id=p.id AND b.blocker_id=r.author_id))
        ORDER BY r.created_at DESC,r.reader_user_id DESC LIMIT 50`).bind(hash)
        .all<{username:string;created_at:string}>();
      if (!readers.success) throw Error('Unable to read invitations');
      return { username:owner.username, is_private:Boolean(owner.is_private), participating:Boolean(owner.participating),
        registrations:owner.registrations, readers:readers.results };
    },
    async participate(hash: string) {
      const result = await db.prepare(`INSERT INTO author_invite_participants(author_id)
        SELECT p.id FROM d1_social_actors a JOIN profiles p ON p.id=a.profile_id
        WHERE a.token_hash=? AND p.moderation_hidden_at IS NULL AND p.is_private=0
        ON CONFLICT(author_id) DO NOTHING`).bind(hash).run();
      if (!result.success) throw Error('Unable to join author invitations');
      return this.dashboard(hash);
    },
  };
}
