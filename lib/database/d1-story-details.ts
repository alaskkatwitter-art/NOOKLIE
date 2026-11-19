import type { D1Value, NooklieD1 } from './d1';
import { d1Books } from './d1-books';
import { safeChapterHtml } from '@/lib/security/html';
import { storyPublication } from '@/lib/stories/publication';
import { tagSlug } from '@/lib/stories/tags';

export function decodeD1Story(story:Record<string,unknown>) {
  const {is_owner,expires_at,...record} = story;
  return {...record, spotify_link:typeof record.spotify_link==='string' ? JSON.parse(record.spotify_link) : null,
    work_has_ai:Boolean(record.work_has_ai),cover_has_ai:Boolean(record.cover_has_ai),
    has_content_warnings:Boolean(record.has_content_warnings),accepts_translation:Boolean(record.accepts_translation),
    allows_download:Boolean(record.allows_download)};
}

export async function d1StoryDetails(db:NooklieD1, hash:string|null, id:string, summary:boolean) {
  const books = d1Books(db,safeChapterHtml);
  const row = await books.story(hash,id);
  if (!row) return null;
  const {title,description,cover_url}=row;
  if (summary) return {story:{id,title,description,cover_url}};
  const [author, chapterRows, tags, likes, series] = await Promise.all([
    db.prepare('SELECT id,username,display_name,avatar_url,verified,is_official FROM profiles WHERE id=?')
      .bind(String(row.author_id)).first<{verified:number;is_official:number}>(),
    db.prepare(`SELECT c.id,c.story_id,c.chapter_number,c.entry_kind,c.title,c.body,c.published,c.publication_status,
      c.original_published_at,c.republished_at,c.created_at,c.updated_at,sc.scheduled_for
      FROM chapters c LEFT JOIN scheduled_chapters sc ON sc.chapter_id=c.id AND ?2=1
      WHERE c.story_id=?1 AND (?2=1 OR c.published=1) ORDER BY c.chapter_number,c.id`)
      .bind(id,Number(Boolean(row.is_owner))).all<{published:number|null;scheduled_for:string|null}>(),
    db.prepare(`SELECT t.id,t.name,t.slug,tc.name AS category,tc.slug AS category_slug FROM story_tags st
      JOIN tags t ON t.id=st.tag_id LEFT JOIN tag_categories tc ON tc.id=t.category_id WHERE st.story_id=?
      ORDER BY t.name,t.id`).bind(id).all<{name:string;category_slug:string|null}>(),
    db.prepare(`SELECT count(*) AS likes,coalesce(max(user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)),0)
      AS liked FROM story_likes WHERE story_id=?2`).bind(hash,id).first<{likes:number;liked:number}>(),
    row.series_volume ? db.prepare(`SELECT id,title,series_volume FROM released_stories
      WHERE author_id=?1 AND lower(series_name)=lower(?2) AND series_volume IS NOT NULL
      ORDER BY series_volume,id`).bind(String(row.author_id),String(row.series_name)).all() : null,
  ]);
  if (!chapterRows.success || !tags.success || (series && !series.success)) throw Error('Story details unavailable');
  // Recheck after loading chapter content in case access or the release changed.
  const current = await books.story(hash,id);
  if (!current || Boolean(current.is_owner)!==Boolean(row.is_owner)) return null;
  const chapters=chapterRows.results.map(c=>({...c,
    published:c.published===null ? null : Boolean(c.published),is_scheduled:Boolean(c.scheduled_for && !c.published),
  }));
  return {story:{...decodeD1Story(row),
    genre:tags.results.find(t=>t.category_slug==='genre')?.name ?? '',
    fandom:row.fandom || tags.results.filter(t=>t.category_slug==='fandom').map(t=>t.name).join(', '),
    publication:storyPublication(row.release_at as string|null,chapters.some(c=>c.published)),
    series_books:series?.results ?? [],author:author ? {...author,verified:Boolean(author.verified),is_official:Boolean(author.is_official)} : null,
    tags:tags.results,chapters,likes:likes?.likes ?? 0,liked:Boolean(likes?.liked),
  },chapters};
}

export async function saveD1StoryDetails(db:NooklieD1, hash:string, id:string, changes:Record<string,D1Value>,
  tags:{name:string;category:string}[]|null) {
  const owns = `EXISTS(SELECT 1 FROM d1_social_actors a WHERE a.token_hash=?1 AND a.profile_id=s.author_id)`;
  const entries=Object.entries(changes);
  const values=entries.map(([,value])=>value);
  const fields=entries.map(([name],index)=>`${name}=?${index+3}`);
  fields.push("updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  const update = db.prepare(`UPDATE stories AS s SET ${fields.join(',')} WHERE id=?2 AND ${owns}`)
    .bind(hash,id,...values);
  const statements=[update];
  if (tags!==null) {
    statements.push(db.prepare(`DELETE FROM story_tags WHERE story_id=?2
      AND EXISTS(SELECT 1 FROM stories s WHERE s.id=?2 AND ${owns})`).bind(hash,id));
    for (const {name,category} of tags) {
      const slug=tagSlug(name);
      if (!slug) continue;
      statements.push(db.prepare(`INSERT INTO tags(id,name,slug,category_id,created_by)
        SELECT ?3,?4,?5,(SELECT id FROM tag_categories WHERE slug=?6),s.author_id FROM stories s
        WHERE s.id=?2 AND ${owns} AND NOT EXISTS(SELECT 1 FROM tags WHERE slug=?5 OR lower(name)=lower(?4))
        ON CONFLICT DO NOTHING`).bind(hash,id,crypto.randomUUID(),name,slug,category));
      statements.push(db.prepare(`INSERT INTO story_tags(story_id,tag_id)
        SELECT s.id,t.id FROM stories s JOIN tags t ON t.slug=?4 OR lower(t.name)=lower(?3)
        WHERE s.id=?2 AND ${owns} ORDER BY lower(t.name)=lower(?3) DESC,t.id LIMIT 1 ON CONFLICT DO NOTHING`)
        .bind(hash,id,name,slug));
    }
  }
  const result=await db.batch(statements);
  if (result.some(row=>!row.success)) throw Error('Story update failed');
  return Boolean(result[0].meta.changes);
}
