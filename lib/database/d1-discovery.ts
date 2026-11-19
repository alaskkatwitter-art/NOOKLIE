import type { NooklieD1 } from './d1';
import type { DiscoveryHome, DiscoveryStory, ReadingEntry } from '@/lib/discovery/types';
import { tagSlug } from '@/lib/stories/tags';

type StoryRow = Omit<DiscoveryStory,'verified'|'is_official'|'work_has_ai'|'cover_has_ai'|'has_content_warnings'> & {
  verified: number; is_official: number; work_has_ai: number; cover_has_ai: number; has_content_warnings: number;
  created_at: string; updated_at: string; first_published_at: string; genres: string; fandom_tags: string;
};

const visibility = `WITH viewer AS (SELECT profile_id,user_id FROM d1_social_actors WHERE token_hash=?1),
  visible AS (
    SELECT s.* FROM released_stories s JOIN profiles p ON p.id=s.author_id
    JOIN auth_accounts a ON a.id=p.user_id CROSS JOIN viewer v
    WHERE a.account_status='active' AND p.moderation_hidden_at IS NULL
      AND (coalesce(p.is_private,0)=0 OR p.id=v.profile_id OR EXISTS(
        SELECT 1 FROM follows WHERE follower_id=v.profile_id AND following_id=p.id))
      AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
        (b.blocker_id=v.profile_id AND b.blocked_id=p.id) OR (b.blocker_id=p.id AND b.blocked_id=v.profile_id))
  )`;

export async function d1Discovery(db: NooklieD1, hash: string): Promise<DiscoveryHome | null> {
  const profile = await db.prepare(`SELECT p.id,p.username,p.display_name,p.avatar_url,p.verified,p.is_official,
    p.moderation_hidden_at,coalesce(f.favorite_fandoms,'[]') AS favorites
    FROM d1_social_actors a JOIN profiles p ON p.id=a.profile_id
    LEFT JOIN discovery_preferences f ON f.user_id=a.user_id WHERE a.token_hash=?`)
    .bind(hash).first<Omit<DiscoveryHome['user'],'verified'|'is_official'> & {favorites:string; verified:number; is_official:number}>();
  if (!profile) return null;
  const {favorites, verified, is_official, ...reader} = profile;
  const favorite_fandoms: string[] = JSON.parse(favorites);
  const keys = new Set(favorite_fandoms.filter(name => typeof name==='string').map(tagSlug));
  const query = visibility + `, metrics AS (
    SELECT e.story_id,sum(e.viewed) AS views,sum(e.read) AS reads,
      sum(CASE WHEN e.activity_day>=date('now','-3 hours','-6 days') THEN e.viewed ELSE 0 END) AS week_views,
      sum(CASE WHEN e.activity_day>=date('now','-3 hours','-6 days') THEN e.read ELSE 0 END) AS week_reads
    FROM story_daily_engagement e JOIN visible s ON s.id=e.story_id GROUP BY e.story_id
  ) SELECT s.id,s.author_id,s.title,substr(s.description,1,240) AS description,s.cover_url,s.fandom,
    s.rating,s.work_has_ai,s.cover_has_ai,s.has_content_warnings,s.content_warnings,s.created_at,s.updated_at,
    p.username,p.display_name,p.verified,p.is_official,
    (SELECT min(coalesce(c.original_published_at,c.created_at)) FROM chapters c WHERE c.story_id=s.id AND c.published=1)
      AS first_published_at,
    (SELECT json_group_array(t.slug) FROM story_tags st JOIN tags t ON t.id=st.tag_id
      JOIN tag_categories tc ON tc.id=t.category_id WHERE st.story_id=s.id AND tc.slug='genre') AS genres,
    (SELECT json_group_array(t.slug) FROM story_tags st JOIN tags t ON t.id=st.tag_id
      JOIN tag_categories tc ON tc.id=t.category_id WHERE st.story_id=s.id AND tc.slug='fandom') AS fandom_tags,
    coalesce(m.views,0) AS views,coalesce(m.reads,0) AS reads,
    coalesce(m.week_views,0) AS week_views,coalesce(m.week_reads,0) AS week_reads
    FROM visible s JOIN profiles p ON p.id=s.author_id LEFT JOIN metrics m ON m.story_id=s.id`;
  const [stories, progress, affinity, events] = await Promise.all([
    db.prepare(query).bind(hash).all<StoryRow>(),
    db.prepare(visibility + ` SELECT s.id,s.title,s.cover_url,c.id AS chapter_id,c.title AS chapter_title,
      c.chapter_number,rp.progress_percent,rp.position,rp.updated_at FROM reading_progress rp
      JOIN viewer v ON v.profile_id=rp.user_id JOIN visible s ON s.id=rp.story_id
      JOIN chapters c ON c.id=rp.chapter_id AND c.story_id=s.id AND c.published=1
      ORDER BY julianday(rp.updated_at) DESC,s.id LIMIT 6`).bind(hash).all<ReadingEntry>(),
    db.prepare(visibility + ` SELECT t.slug FROM reading_progress rp JOIN viewer v ON v.profile_id=rp.user_id
      JOIN story_tags st ON st.story_id=rp.story_id JOIN tags t ON t.id=st.tag_id
      JOIN tag_categories tc ON tc.id=t.category_id WHERE tc.slug='genre'
      GROUP BY t.slug ORDER BY count(*) DESC,t.slug LIMIT 5`).bind(hash).all<{slug:string}>(),
    db.prepare(`SELECT id,title,description,ends_at,
      (SELECT json_group_array(story_id) FROM (
        SELECT story_id FROM story_event_entries WHERE event_id=e.id ORDER BY julianday(created_at) DESC,story_id
      )) AS entries
      FROM story_events e WHERE active=1 AND julianday(starts_at)<=julianday('now')
      AND julianday(ends_at)>julianday('now') ORDER BY julianday(ends_at),id LIMIT 4`)
      .all<Omit<DiscoveryHome['events'][number],'stories'> & {entries:string}>(),
  ]);
  if ([stories, progress, affinity, events].some(result=>!result.success)) throw Error('Discovery unavailable');
  const genres = affinity.results.map(row=>row.slug);
  const candidates = stories.results.filter(row=>{
    if (!keys.size) return true;
    const fandoms = [...(row.fandom ?? '').split(',').map(tagSlug).filter(Boolean), ...JSON.parse(row.fandom_tags)];
    return (fandoms.length ? fandoms : ['universo-original']).some(key=>keys.has(key));
  });
  const newest = (a: StoryRow,b: StoryRow) => Date.parse(b.first_published_at)-Date.parse(a.first_published_at) || a.id.localeCompare(b.id);
  const card = ({genres: _genres,fandom_tags: _fandomTags,...row}:StoryRow):DiscoveryStory => ({
    ...row, verified:Boolean(row.verified), is_official:Boolean(row.is_official), work_has_ai:Boolean(row.work_has_ai),
    cover_has_ai:Boolean(row.cover_has_ai), has_content_warnings:Boolean(row.has_content_warnings),
  });
  const shelf = (rows: StoryRow[], order: (a: StoryRow,b: StoryRow)=>number) => rows.toSorted(order).slice(0,8).map(card);
  const authorCounts = new Map<string,number>();
  const newVoices = candidates.filter(row=>row.reads<10).toSorted(newest).filter(row=>{
    const count = authorCounts.get(row.author_id) ?? 0;
    authorCounts.set(row.author_id,count+1);
    return count<2;
  });
  const cards = new Map(candidates.map(row=>[row.id,row]));
  return {
    user:{...reader,verified:Boolean(verified),is_official:Boolean(is_official)}, favorite_fandoms, genres,
    continue_reading:progress.results,
    for_you:shelf(candidates.filter(row=>(JSON.parse(row.genres) as string[]).some(genre=>genres.includes(genre))),
      (a,b)=>b.week_reads-a.week_reads || newest(a,b)),
    weekly:shelf(candidates.filter(row=>row.week_views+row.week_reads>0),
      (a,b)=>(b.week_views+3*b.week_reads)-(a.week_views+3*a.week_reads) || newest(a,b)),
    most_viewed:shelf(candidates.filter(row=>row.views>0),(a,b)=>b.views-a.views || b.reads-a.reads || a.id.localeCompare(b.id)),
    most_read:shelf(candidates.filter(row=>row.reads>0),(a,b)=>b.reads-a.reads || b.views-a.views || a.id.localeCompare(b.id)),
    new_fandom:shelf(candidates,newest), new_voices:newVoices.slice(0,8).map(card),
    events:events.results.map(({entries,...event})=>({
      ...event,description:event.description.length>240 ? event.description.slice(0,240).trimEnd()+'…' : event.description,
      stories:(JSON.parse(entries) as string[]).flatMap(id=>{
        const row=cards.get(id);
        return row ? [row] : [];
      }).slice(0,8).map(card),
    })),
  };
}
