import type { NooklieD1 } from './d1';
import { tagSlug } from '@/lib/stories/tags';

type Options = {
  query: string; include: string[]; exclude: string[]; rating: string | null; status: string | null;
  kind: string | null; format: string | null; sort: string; page: number;
};
type Tag = {name:string;slug:string;category:string|null;category_slug:string|null};
type Author = {
  id:string;username:string;display_name:string|null;avatar_url:string|null;verified:number;is_official:number;
};
type Story = {
  id:string;title:string;description:string|null;fandom:string;cover_url:string|null;rating:string|null;
  status:string|null;story_kind:string;story_format:string;created_at:string;updated_at:string;debut:string;
  author_json:string;tags_json:string;saved:number;own:number;
};

const viewer = `WITH viewer AS (SELECT (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) AS id)`;

export async function d1Explore(db:NooklieD1,hash:string|null,options:Options) {
  const profile = hash ? await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?').bind(hash).first() : null;
  const [profiles, stories] = await Promise.all([
    db.prepare(viewer + ` SELECT p.id,p.username,p.display_name,p.avatar_url,p.verified,p.is_official,
      coalesce(p.id=v.id,0) AS own,EXISTS(SELECT 1 FROM follows WHERE follower_id=v.id AND following_id=p.id) AS following
      FROM profiles p JOIN auth_accounts a ON a.id=p.user_id CROSS JOIN viewer v
      WHERE ?2<>'' AND (instr(lower(p.username),lower(?2))>0 OR instr(lower(p.display_name),lower(?2))>0)
        AND a.account_status='active' AND p.moderation_hidden_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
          (b.blocker_id=p.id AND b.blocked_id=v.id) OR (b.blocker_id=v.id AND b.blocked_id=p.id))
      ORDER BY p.username LIMIT 20`)
      .bind(hash,options.query.replace(/[^\p{L}\p{N}_ -]/gu,'').trim())
      .all<Author & {own:number;following:number}>(),
    db.prepare(viewer + ` SELECT s.id,s.title,s.description,s.fandom,s.cover_url,s.rating,s.status,s.story_kind,s.story_format,
      s.created_at,s.updated_at,(SELECT min(coalesce(c.original_published_at,c.created_at)) FROM chapters c
        WHERE c.story_id=s.id AND c.published=1) AS debut,
      json_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,
        'verified',p.verified,'is_official',p.is_official) AS author_json,
      (SELECT json_group_array(json_object('name',t.name,'slug',t.slug,'category',tc.name,'category_slug',tc.slug))
        FROM story_tags st JOIN tags t ON t.id=st.tag_id LEFT JOIN tag_categories tc ON tc.id=t.category_id
        WHERE st.story_id=s.id) AS tags_json,
      EXISTS(SELECT 1 FROM reading_list_items i JOIN reading_lists l ON l.id=i.list_id
        WHERE i.story_id=s.id AND l.user_id=v.id AND l.name='Biblioteca') AS saved,
      coalesce(s.author_id=v.id,0) AS own
      FROM released_stories s JOIN profiles p ON p.id=s.author_id JOIN auth_accounts a ON a.id=p.user_id CROSS JOIN viewer v
      WHERE (?2 IS NULL OR s.rating=?2) AND (?3 IS NULL OR s.status=?3)
        AND (?4 IS NULL OR s.story_kind=?4) AND (?5 IS NULL OR s.story_format=?5)
        AND a.account_status='active' AND p.moderation_hidden_at IS NULL
        AND (coalesce(p.is_private,0)=0 OR p.id=v.id OR EXISTS(
          SELECT 1 FROM follows WHERE follower_id=v.id AND following_id=p.id))
        AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
          (b.blocker_id=p.id AND b.blocked_id=v.id) OR (b.blocker_id=v.id AND b.blocked_id=p.id))`)
      .bind(hash,options.rating,options.status,options.kind,options.format).all<Story>(),
  ]);
  if (!profiles.success || !stories.success) throw Error('Catalog unavailable');
  const query = tagSlug(options.query);
  const terms = query.split('-').filter(Boolean);
  const rows = stories.results.flatMap(({author_json,tags_json,saved,own,created_at,updated_at,debut,...story}) => {
    const author = JSON.parse(author_json) as Author;
    const tags = JSON.parse(tags_json) as Tag[];
    const fandoms = (story.fandom ?? '').split(',').map(tagSlug).filter(Boolean);
    const keywords = new Set([...fandoms,...tags.map(tag=>tag.slug)]);
    if (!fandoms.length && !tags.some(tag=>tag.category_slug==='fandom')) keywords.add('universo-original');
    if (!options.include.every(tag=>keywords.has(tag)) || options.exclude.some(tag=>keywords.has(tag))) return [];
    const document = tagSlug([story.title,story.description,story.fandom,author.username,author.display_name,...tags.map(t=>t.name)].join(' '));
    if (!terms.every(term=>document.includes(term))) return [];
    const title = tagSlug(story.title);
    const rank = !query || title===query ? 0 : title.startsWith(query) ? 1 : title.includes(query) ? 2 : 3;
    return [{rank,created_at,updated_at,debut,story:{
      ...story, fandom:story.fandom || tags.filter(tag=>tag.category_slug==='fandom').map(tag=>tag.name).join(', '),
      tags,author:{...author,verified:Boolean(author.verified),is_official:Boolean(author.is_official)},
      is_saved:Boolean(saved),is_own_story:Boolean(own),
    }}];
  });
  rows.sort((a,b)=>{
    if (a.rank!==b.rank) return a.rank-b.rank;
    let order=0;
    if (options.sort==='newest') order=Date.parse(b.created_at)-Date.parse(a.created_at);
    if (options.sort==='debut') order=Date.parse(b.debut)-Date.parse(a.debut);
    if (options.sort==='title_asc') order=a.story.title.localeCompare(b.story.title,'pt-BR');
    if (options.sort==='title_desc') order=b.story.title.localeCompare(a.story.title,'pt-BR');
    return order || Date.parse(b.updated_at)-Date.parse(a.updated_at) || a.story.id.localeCompare(b.story.id);
  });
  const page = rows.slice((options.page-1)*24,options.page*24);
  return {
    users:profiles.results.map(({own,following,verified,is_official,...p})=>({
      ...p,verified:Boolean(verified),is_official:Boolean(is_official),is_self:Boolean(own),is_following:Boolean(following),
    })),
    stories:page.map(row=>row.story),page:options.page,has_more:page.length===24,authenticated:Boolean(profile),
  };
}
