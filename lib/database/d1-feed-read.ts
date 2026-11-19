import type { NooklieD1 } from './d1';

const author = `json_object('id', a.id, 'username', a.username, 'display_name', a.display_name,
  'avatar_url', a.avatar_url, 'verified', json(CASE WHEN a.verified THEN 'true' ELSE 'false' END),
  'is_official', json(CASE WHEN a.is_official THEN 'true' ELSE 'false' END))`;

type FeedRow = {
  id: string; user_id: string; body: string; image_url: string | null; story_id: string | null;
  news_slug: string | null; pinned: number; created_at: string; updated_at: string;
  author_json: string; media_json: string; reactions_json: string; selected_json: string;
  repost_json: string | null; comments_count: number; saved: number;
  event_time: number; event_key: string;
};

export async function readD1Feed(db: NooklieD1, hash: string | null, following: boolean, tag: string,
  cursor: { time: number; key: string } | null, pageSize: number,
  reposts?: { post: string | null; profile: string | null }, postId?: string, ownProfileId?: string) {
  const result = await db.prepare(`
    WITH viewer AS (SELECT (SELECT profile_id FROM d1_social_actors WHERE token_hash = ?1) AS profile_id),
    authors AS (
      SELECT p.* FROM profiles p JOIN auth_accounts u ON u.id = p.user_id CROSS JOIN viewer v
      WHERE p.moderation_hidden_at IS NULL AND u.account_status = 'active'
        AND (p.is_private = 0 OR p.id = v.profile_id OR EXISTS (
          SELECT 1 FROM follows WHERE follower_id = v.profile_id AND following_id = p.id
        ))
        AND NOT EXISTS (SELECT 1 FROM profile_mutes WHERE user_id = v.profile_id AND target_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE (b.blocker_id = v.profile_id AND b.blocked_id = p.id)
          OR (b.blocker_id = p.id AND b.blocked_id = v.profile_id))
    ), posts AS (
      SELECT p.* FROM nook_posts p JOIN authors a ON a.id = p.user_id
      WHERE p.moderation_hidden_at IS NULL AND (?10 IS NULL OR p.id=?10)
        AND (?11 IS NULL OR p.user_id=?11) AND (?2 = '' OR EXISTS (
        SELECT 1 FROM json_each(p.hashtags) WHERE value = ?2
      ))
    ), timeline AS (
      SELECT p.id AS post_id, p.user_id AS event_author, 'post:' || p.id AS event_key,
        CAST(round(unixepoch(p.created_at, 'subsec') * 1000) AS INTEGER) AS event_time,
        NULL AS repost_json
      FROM posts p WHERE ?7=0
      UNION ALL
      SELECT r.post_id, r.user_id, 'repost:' || r.id,
        CAST(round(unixepoch(r.created_at, 'subsec') * 1000) AS INTEGER),
        json_object('id', r.id, 'user_id', r.user_id, 'post_id', r.post_id, 'comment', r.comment,
          'created_at', r.created_at, 'author', ${author})
      FROM nook_reposts r JOIN posts p ON p.id = r.post_id JOIN authors a ON a.id = r.user_id
      CROSS JOIN viewer v WHERE (a.reposts_private = 0 OR a.id = v.profile_id)
        AND ?10 IS NULL AND ?11 IS NULL AND (?8 IS NULL OR r.post_id=?8) AND (?9 IS NULL OR r.user_id=?9)
    ), page AS (
      SELECT t.* FROM timeline t CROSS JOIN viewer v
      WHERE t.event_time IS NOT NULL
        AND (?3 = 0 OR EXISTS (SELECT 1 FROM follows f
          WHERE f.follower_id = v.profile_id AND f.following_id = t.event_author))
        AND (?4 IS NULL OR t.event_time < ?4 OR (t.event_time = ?4 AND t.event_key < ?5))
      ORDER BY t.event_time DESC, t.event_key DESC LIMIT ?6
    )
    SELECT p.id,p.user_id,p.body,p.image_url,p.story_id,p.news_slug,p.pinned,p.created_at,p.updated_at,
      t.event_time,t.event_key,t.repost_json,${author} AS author_json,
      (SELECT json_group_array(json_object('id',m.id,'post_id',m.post_id,'media_url',m.media_url,
        'media_type',m.media_type,'created_at',m.created_at))
        FROM (SELECT * FROM nook_post_media WHERE post_id = p.id ORDER BY created_at,id) m) AS media_json,
      (SELECT json_group_object(emoji,n)
       FROM (SELECT emoji,count(*) AS n FROM nook_post_reactions WHERE post_id = p.id GROUP BY emoji)) AS reactions_json,
      (SELECT json_group_array(emoji) FROM nook_post_reactions WHERE post_id = p.id AND user_id = v.profile_id) AS selected_json,
      (SELECT count(*) FROM nook_comments WHERE post_id = p.id) AS comments_count,
      EXISTS(SELECT 1 FROM nook_saved_posts WHERE post_id = p.id AND user_id = v.profile_id) AS saved
    FROM page t JOIN posts p ON p.id = t.post_id JOIN authors a ON a.id = p.user_id CROSS JOIN viewer v
    ORDER BY t.event_time DESC,t.event_key DESC`)
    .bind(hash, tag, Number(following), cursor?.time ?? null, cursor?.key ?? null, pageSize + 1, Number(Boolean(reposts)), reposts?.post ?? null, reposts?.profile ?? null, postId ?? null, ownProfileId ?? null).all<FeedRow>();
  if (!result.success) throw Error('Unable to load feed');
  const page = result.results.slice(0, pageSize);
  const last = page.at(-1);
  return {
    posts: page.map(({ author_json, media_json, reactions_json, selected_json, repost_json,
      event_time, event_key, pinned, saved, ...post }) => ({
      ...post, pinned: Boolean(pinned), saved: Boolean(saved), author: JSON.parse(author_json),
      media: JSON.parse(media_json), reaction_counts: JSON.parse(reactions_json), user_reactions: JSON.parse(selected_json),
      ...(repost_json ? { repost: JSON.parse(repost_json) } : {}),
    })),
    next_cursor: result.results.length > pageSize && last ? last.event_time + ':' + last.event_key : null,
  };
}
