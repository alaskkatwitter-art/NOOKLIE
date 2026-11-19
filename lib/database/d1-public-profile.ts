import type { NooklieD1 } from './d1';
import { parseProfileTheme } from '@/lib/profile/themes';
import { readingListImageUrl } from '@/lib/reading-lists/image';

const profileColumns = `p.id,p.username,p.display_name,p.bio,p.avatar_url,p.cover_url,p.header_layout,
  p.avatar_position,p.is_private,p.verified,p.is_official`;
const storyJson = `json_object('id',s.id,'title',s.title,'description',s.description,'cover_url',s.cover_url,
  'status',s.status,'rating',s.rating,'created_at',s.created_at,'updated_at',s.updated_at)`;
const storyVisibility = `p.moderation_hidden_at IS NULL AND a.account_status='active'
  AND (coalesce(p.is_private,0)=0 OR p.id=?2 OR EXISTS(
    SELECT 1 FROM follows f WHERE f.follower_id=?2 AND f.following_id=p.id))
  AND NOT EXISTS(SELECT 1 FROM chat_blocks b
    WHERE (b.blocker_id=?2 AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=?2))`;

export async function d1PublicProfile(db:NooklieD1,hash:string|null,username:string) {
  const row = await db.prepare(`WITH v AS (SELECT (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) AS id)
    SELECT ${profileColumns},p.user_id,p.spotify_link,p.avatar_animation,p.cover_animation,p.pinned_story_id,
      p.moderation_hidden_at,v.id AS viewer,
      (coalesce(p.is_private,0)=0 OR p.id=v.id OR EXISTS(SELECT 1 FROM follows WHERE follower_id=v.id AND following_id=p.id))
        AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=v.id AND b.blocked_id=p.id)
          OR (b.blocker_id=p.id AND b.blocked_id=v.id)) AS allowed
    FROM profiles p JOIN auth_accounts a ON a.id=p.user_id CROSS JOIN v
    WHERE p.username=?2 AND p.moderation_hidden_at IS NULL AND a.account_status='active'`)
    .bind(hash,username).first<Record<string,unknown> & {
      id:string;user_id:string;viewer:string|null;allowed:number|null;verified:number;is_official:number;is_private:number;
      spotify_link:string|null;avatar_animation:string|null;cover_animation:string|null;pinned_story_id:string|null;moderation_hidden_at:null;
    }>();
  if (!row) return null;
  const {user_id,viewer,allowed,verified,is_official,is_private,spotify_link,avatar_animation,cover_animation,pinned_story_id,
    moderation_hidden_at,...publicCard} = row;
  const user = {...publicCard,verified:Boolean(verified),is_official:Boolean(is_official),is_private:Boolean(is_private)};
  const is_self = row.id===viewer;
  if (!allowed) return {user,is_self,restricted:true,stories:[],posts:[],reading_lists:[],fic_clubs:[]};
  const [stories,posts,lists,clubs,badges,theme] = await Promise.all([
    db.prepare('SELECT * FROM released_stories WHERE author_id=? ORDER BY julianday(updated_at) DESC,id')
      .bind(row.id).all<Record<string,unknown> & {id:string;spotify_link:string|null}>(),
    db.prepare(`SELECT n.id,n.user_id,n.body,n.image_url,n.story_id,n.news_slug,n.pinned,n.created_at,n.updated_at,
      (SELECT json_group_array(json_object('id',m.id,'post_id',m.post_id,'media_url',m.media_url,
        'media_type',m.media_type,'position',m.position,'created_at',m.created_at))
        FROM (SELECT * FROM nook_post_media WHERE post_id=n.id ORDER BY position,id LIMIT 4) m) AS media
      FROM nook_posts n WHERE n.user_id=? AND n.moderation_hidden_at IS NULL
      ORDER BY n.pinned DESC,julianday(n.created_at) DESC,n.id`).bind(row.id)
      .all<Record<string,unknown> & {pinned:number;media:string}>(),
    db.prepare(`SELECT l.id,l.user_id,l.name,l.description,l.is_public,l.image_path,l.created_at,
      (SELECT json_group_array(json_object('id',i.id,'list_id',i.list_id,'story_id',i.story_id,
        'position',i.position,'added_at',i.added_at,'story',json(
          (SELECT ${storyJson} FROM released_stories s JOIN profiles p ON p.id=s.author_id
            JOIN auth_accounts a ON a.id=p.user_id WHERE s.id=i.story_id AND ${storyVisibility}))))
        FROM (SELECT * FROM reading_list_items WHERE list_id=l.id ORDER BY position,julianday(added_at) DESC,id) i) AS items
      FROM reading_lists l WHERE l.user_id=?1 AND l.is_public=1 ORDER BY julianday(l.created_at) DESC,l.id`)
      .bind(row.id,viewer).all<Record<string,unknown> & {id:string;image_path:string|null;is_public:number;items:string}>(),
    db.prepare(`SELECT c.*, (SELECT count(*) FROM fic_club_members WHERE club_id=c.id) AS member_count,
      ${storyJson} AS story FROM fic_clubs c JOIN released_stories s ON s.id=c.story_id
      WHERE s.author_id=?1 AND EXISTS(SELECT 1 FROM fic_club_members WHERE club_id=c.id AND user_id=?1)
      ORDER BY julianday(c.created_at) DESC,c.id`).bind(row.id).all<Record<string,unknown> & {story:string}>(),
    db.prepare(`SELECT 'Administração do Nooklie' AS title,'Equipe oficial do Nooklie' AS description
      FROM platform_admins WHERE user_id=?1 UNION ALL
      SELECT coalesce(nullif(r.badge_title,''),r.name),coalesce(nullif(r.badge_description,''),d.name)
      FROM team_memberships m JOIN team_roles r ON r.id=m.role_id AND r.department_id=m.department_id AND r.status='active'
      JOIN departments d ON d.id=m.department_id AND d.status='active' WHERE m.user_id=?1 AND m.status='active'`)
      .bind(user_id).all<{title:string;description:string}>(),
    db.prepare('SELECT active FROM profile_themes WHERE user_id=?').bind(user_id).first<{active:string|null}>(),
  ]);
  if ([stories,posts,lists,clubs,badges].some(result=>!result.success)) throw Error('Profile unavailable');
  return {
    restricted:false,is_self,
    user:{...user,spotify_link:spotify_link ? JSON.parse(spotify_link) : null,
      avatar_animation:avatar_animation ? JSON.parse(avatar_animation) : null,
      cover_animation:cover_animation ? JSON.parse(cover_animation) : null,
      moderation_hidden_at, pinned_story_id:stories.results.some(s=>s.id===pinned_story_id) ? pinned_story_id : null,
      staff_badges:badges.results},
    theme:parseProfileTheme(theme?.active ? JSON.parse(theme.active) : null),
    stories:stories.results.map(story=>({...story,
      work_has_ai:Boolean(story.work_has_ai),cover_has_ai:Boolean(story.cover_has_ai),
      has_content_warnings:Boolean(story.has_content_warnings),accepts_translation:Boolean(story.accepts_translation),
      allows_download:Boolean(story.allows_download),spotify_link:story.spotify_link ? JSON.parse(story.spotify_link) : null,
    })),
    posts:posts.results.map(({pinned,media,...post})=>({...post,pinned:Boolean(pinned),media:JSON.parse(media)})),
    reading_lists:lists.results.map(({image_path,items,is_public,...list})=>({...list,is_public:Boolean(is_public),
      image_url:readingListImageUrl(list.id,image_path),items:JSON.parse(items)})),
    fic_clubs:clubs.results.map(({story,...club})=>({...club,story:JSON.parse(story)})),
  };
}
