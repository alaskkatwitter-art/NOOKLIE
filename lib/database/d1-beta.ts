import type { NooklieD1 } from './d1';

export function d1Beta(db: NooklieD1, sanitizeBeta: (html: string) => string) {
  if(typeof sanitizeBeta!=='function')throw new Error('Private preview sanitizer required');
  function session(hash: string) {if(!/^[0-9a-f]{64}$/.test(hash))throw new Error('Invalid session hash');}
  const context=`WITH actor AS (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1), eligible AS (
    SELECT i.id,i.chapter_id,i.reader_id,i.accepted_at,i.created_at,author.username AS author_name,reader.username AS reader_name,c.title,c.body,c.published,s.title AS story_title,s.author_id,s.story_kind,
      CASE WHEN s.author_id=(SELECT profile_id FROM actor) THEN 1 ELSE 0 END AS owner
    FROM beta_reading_invites i JOIN chapters c ON c.id=i.chapter_id JOIN stories s ON s.id=c.story_id
    JOIN profiles author ON author.id=s.author_id JOIN auth_accounts aa ON aa.id=author.user_id
    JOIN profiles reader ON reader.id=i.reader_id JOIN auth_accounts ra ON ra.id=reader.user_id
    WHERE (i.reader_id=(SELECT profile_id FROM actor) OR s.author_id=(SELECT profile_id FROM actor))
      AND s.moderation_hidden_at IS NULL AND author.moderation_hidden_at IS NULL AND reader.moderation_hidden_at IS NULL
      AND aa.account_status='active' AND ra.account_status='active')`;
  const active=`published=0 AND story_kind='original' AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
    (b.blocker_id=eligible.author_id AND b.blocked_id=eligible.reader_id)
    OR (b.blocked_id=eligible.author_id AND b.blocker_id=eligible.reader_id))`;
  return {
    async invite(hash: string, id: string, chapterId: string, username: string) {
      session(hash);if(typeof username!=='string'||!username.trim()||username.length>50)throw new Error('Invalid reader');
      return db.prepare(`INSERT INTO beta_reading_invites(id,chapter_id,reader_id)
        SELECT ?2,c.id,r.id FROM d1_social_actors a JOIN chapters c ON c.id=?3 JOIN stories s ON s.id=c.story_id
        JOIN profiles r ON lower(r.username)=lower(?4) JOIN auth_accounts ra ON ra.id=r.user_id
        WHERE a.token_hash=?1 AND s.author_id=a.profile_id AND c.published=0 AND s.story_kind='original'
          AND s.moderation_hidden_at IS NULL AND r.moderation_hidden_at IS NULL AND ra.account_status='active'
          AND r.id<>a.profile_id AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
            (b.blocker_id=r.id AND b.blocked_id=a.profile_id) OR (b.blocked_id=r.id AND b.blocker_id=a.profile_id))
        ON CONFLICT(chapter_id,reader_id) DO UPDATE SET reader_id=excluded.reader_id RETURNING id`)
        .bind(hash,id,chapterId,username.trim().replace(/^@/,'')).first<{id:string}>();
    },
    async invites(hash: string) {
      session(hash);
      const result=await db.prepare(context+` SELECT id,accepted_at,title,story_title,owner,author_name,reader_name
        FROM eligible WHERE ${active} ORDER BY created_at DESC,id LIMIT 100`).bind(hash).all<Record<string,unknown>>();
      if(!result.success)throw new Error('Invites unavailable');
      return result.results.map(row => ({ ...row, owner: Boolean(row.owner) }));
    },
    async accept(hash: string, id: string) {
      session(hash);
      return db.prepare(context+` UPDATE beta_reading_invites SET accepted_at=coalesce(accepted_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        WHERE id=?2 AND EXISTS(SELECT 1 FROM eligible WHERE eligible.id=?2 AND reader_id=(SELECT profile_id FROM actor)
          AND ${active}) RETURNING id`).bind(hash,id).first<{id:string}>();
    },
    async read(hash: string, id: string) {
      session(hash);
      const draft=await db.prepare(context+` SELECT id,title,story_title,body,owner,accepted_at FROM eligible
        WHERE id=?2 AND ${active} AND (owner=1 OR accepted_at IS NOT NULL)`)
        .bind(hash,id).first<{id:string;title:string;story_title:string;body:string;owner:number;accepted_at:string|null}>();
      if(!draft)return null;
      const notes=await db.prepare(context+` SELECT n.id,n.excerpt,n.body,n.created_at FROM beta_reading_notes n
        JOIN eligible ON eligible.id=n.invite_id WHERE eligible.id=?2 AND ${active}
          AND (owner=1 OR accepted_at IS NOT NULL) ORDER BY n.created_at DESC,n.id LIMIT 100`)
        .bind(hash,id).all<{id:string;excerpt:string;body:string;created_at:string}>();
      if(!notes.success)throw new Error('Beta notes unavailable');
      return {title:draft.title,story_title:draft.story_title,owner:Boolean(draft.owner),
        accepted:draft.accepted_at!==null,body:sanitizeBeta(draft.body || ''),notes:notes.results};
    },
    async note(hash: string, id: string, inviteId: string, excerpt: string, body: string) {
      session(hash);
      if(typeof body!=='string'||!body.trim()||body.length>2000||typeof excerpt!=='string'||excerpt.length>400)throw new Error('Invalid beta note');
      return db.prepare(context+` INSERT INTO beta_reading_notes(id,invite_id,excerpt,body)
        SELECT ?3,id,?4,?5 FROM eligible WHERE id=?2 AND reader_id=(SELECT profile_id FROM actor)
          AND accepted_at IS NOT NULL AND ${active} RETURNING id`)
        .bind(hash,inviteId,id,excerpt.trim(),body.trim()).first<{id:string}>();
    },
    async revoke(hash: string, id: string) {
      session(hash);
      // Either participant may end the invitation, including after a block.
      return db.prepare(`DELETE FROM beta_reading_invites WHERE id=?2 AND EXISTS(
        SELECT 1 FROM chapters c JOIN stories s ON s.id=c.story_id JOIN d1_social_actors a
          ON a.profile_id=s.author_id OR a.profile_id=beta_reading_invites.reader_id
        WHERE c.id=beta_reading_invites.chapter_id AND a.token_hash=?1) RETURNING id`)
        .bind(hash,id).first<{id:string}>();
    },
  };
}
