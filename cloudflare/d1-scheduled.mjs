export async function publishScheduledChapters(db, scheduledTime) {
  const now = new Date(scheduledTime).toISOString();
  const updates = db.prepare(`UPDATE chapters SET published=1, publication_status='published',
    original_published_at=coalesce(original_published_at,
      (SELECT scheduled_for FROM scheduled_chapters WHERE chapter_id=chapters.id)), updated_at=?1
    WHERE publication_status='scheduled' AND id IN (
      SELECT chapter_id FROM scheduled_chapters WHERE julianday(scheduled_for)<=julianday(?1)
      ORDER BY scheduled_for, id LIMIT 100
    )`).bind(now);
  const notifications = db.prepare(`INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
    SELECT lower(hex(randomblob(16))),p.user_id,'chapter_release',
      CASE WHEN p.id=a.id THEN 'Capítulo publicado' ELSE 'Novo capítulo disponível' END,
      CASE WHEN p.id=a.id THEN 'Seu capítulo de '||s.title||' está no ar.'
        ELSE 'Há um novo capítulo de '||s.title||'.' END,
      CASE WHEN p.id=a.id THEN '/capitulo-publicado/'||c.id ELSE '/historia/'||s.id END,
      CASE WHEN p.id=a.id THEN 'chapter-published:' ELSE 'chapter-release:' END||c.id
    FROM stories s JOIN chapters c ON c.story_id=s.id AND c.published=1
    JOIN profiles a ON a.id=s.author_id JOIN auth_accounts owner ON owner.id=a.user_id
    CROSS JOIN profiles p JOIN auth_accounts recipient ON recipient.id=p.user_id
    WHERE s.moderation_hidden_at IS NULL AND a.moderation_hidden_at IS NULL AND owner.account_status='active'
      AND recipient.account_status='active' AND p.moderation_hidden_at IS NULL
      AND (s.release_at IS NULL OR julianday(s.release_at)<=julianday(?1))
      AND (c.updated_at=?1 OR s.release_at IS NOT NULL)
      AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
      AND (p.id=a.id OR (p.chapter_notifications=1 AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
        (b.blocker_id=p.id AND b.blocked_id=a.id) OR (b.blocker_id=a.id AND b.blocked_id=p.id))
        AND (EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=p.id AND f.following_id=a.id)
          OR (coalesce(a.is_private,0)=0 AND EXISTS (SELECT 1 FROM reading_lists l
            JOIN reading_list_items i ON i.list_id=l.id WHERE l.user_id=p.id AND i.story_id=s.id)))))
    ON CONFLICT DO NOTHING`).bind(now);
  const releases = db.prepare(`UPDATE stories SET release_at=NULL
    WHERE julianday(release_at)<=julianday(?1) AND moderation_hidden_at IS NULL
      AND EXISTS (SELECT 1 FROM chapters c WHERE c.story_id=stories.id AND c.published=1)`).bind(now);
  const opportunities = db.prepare(`INSERT INTO opportunity_announcements(opportunity_id,announced_at)
    SELECT o.id,?1 FROM opportunities o
    WHERE o.status='open' AND julianday(o.opens_at)<=julianday(?1) AND julianday(o.closes_at)>julianday(?1)
      AND NOT EXISTS(SELECT 1 FROM opportunity_announcements a WHERE a.opportunity_id=o.id)
      AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
    ON CONFLICT(opportunity_id) DO NOTHING`).bind(now);
  const result = await db.batch([updates, notifications, releases, opportunities]);
  if (result.some(statement => !statement.success)) throw Error('Scheduled chapter publication failed');
  return result[0].meta.changes;
}
