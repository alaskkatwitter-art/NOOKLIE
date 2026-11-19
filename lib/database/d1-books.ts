import type { NooklieD1 } from './d1';

// Server-only repository for the isolated migration. Routes must supply the
// existing safeChapterHtml sanitizer and retain same-origin/rate-limit checks.
export function d1Books(db: NooklieD1, sanitizeChapter: (html: string) => string) {
  if (typeof sanitizeChapter!=='function') throw new Error('Chapter sanitizer required');
  function session(hash: string | null) {
    if (hash!==null && !/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid session hash');
  }
  function text(value: string, max: number, required=false) {
    if (typeof value!=='string' || value.length>max || (required&&!value.trim())) throw new Error('Invalid text');
  }
  function order(ids: string[], max: number) {
    if (!Array.isArray(ids)||ids.length>max||ids.some(id=>typeof id!=='string'||!id||id.length>128)||new Set(ids).size!==ids.length) {
      throw new Error('Invalid order');
    }
    return JSON.stringify(ids);
  }
  const access=`WITH viewer AS (SELECT profile_id, user_id FROM d1_social_actors WHERE token_hash=?1), accessible AS (
    SELECT s.*,CASE WHEN s.author_id=(SELECT profile_id FROM viewer) THEN 1 ELSE 0 END AS is_owner
    FROM stories s JOIN profiles p ON p.id=s.author_id JOIN auth_accounts a ON a.id=p.user_id
    WHERE s.moderation_hidden_at IS NULL AND p.moderation_hidden_at IS NULL AND a.account_status='active'
      AND (s.author_id=(SELECT profile_id FROM viewer) OR (
        EXISTS(SELECT 1 FROM released_stories rs WHERE rs.id=s.id)
        AND (p.is_private=0 OR EXISTS(SELECT 1 FROM follows f
          WHERE f.following_id=p.id AND f.follower_id=(SELECT profile_id FROM viewer)))
        AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
          (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer))
          OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer))))))`;
  async function rows<T>(sql: string, hash: string | null, id: string) {
    const result=await db.prepare(sql).bind(hash,id).all<T>();
    if (!result.success) throw new Error('Unable to read records');
    return result.results;
  }
  async function command(hash: string, operation: string, target: string, ids: string[], chapter: string | null=null) {
    session(hash);
    const result=await db.prepare(`INSERT INTO d1_book_commands(id,token_hash,operation,target_id,chapter_id,ids)
      VALUES(?1,?2,?3,?4,?5,?6)`)
      .bind(hash+':'+operation+':'+target,hash,operation,target,chapter,order(ids,operation==='reorder_list'?5000:2000)).run();
    if (!result.success) throw new Error('Unable to apply order');
  }
  return {
    async story(hash: string | null, id: string) {
      session(hash);
      return db.prepare(access+` SELECT s.* FROM accessible s WHERE s.id=?2`)
        .bind(hash,id).first<Record<string,unknown>>();
    },
    async chapters(hash: string | null, storyId: string) {
      session(hash);
      return rows<{id:string;chapter_number:number;title:string;publication_status:string;entry_kind:string}>(access+`
        SELECT c.id,c.chapter_number,c.title,c.publication_status,c.entry_kind FROM chapters c
        JOIN accessible s ON s.id=c.story_id WHERE s.id=?2 AND (s.is_owner=1 OR c.published=1)
        ORDER BY c.chapter_number,c.id`,hash,storyId);
    },
    async chapter(hash: string | null, id: string) {
      session(hash);
      return db.prepare(access+` SELECT c.* FROM chapters c JOIN accessible s ON s.id=c.story_id
        WHERE c.id=?2 AND (s.is_owner=1 OR c.published=1)`)
        .bind(hash,id).first<Record<string,unknown>>();
    },
    async chapterForReader(hash: string | null, id: string) {
      session(hash);
      const row = await db.prepare(access + `
        SELECT c.*,
          (SELECT scheduled_for FROM scheduled_chapters WHERE chapter_id = c.id AND s.is_owner = 1) AS scheduled_for,
          (SELECT json_group_array(json_object('id', m.id, 'chapter_id', m.chapter_id,
            'media_url', m.media_url, 'media_type', m.media_type, 'position', m.position, 'created_at', m.created_at))
            FROM (SELECT * FROM chapter_media WHERE chapter_id = c.id ORDER BY position, id) m) AS media,
          (SELECT json_object('id', n.id, 'story_id', n.story_id, 'chapter_number', n.chapter_number,
            'title', n.title, 'published', json('true')) FROM chapters n
            WHERE n.story_id = c.story_id AND n.published = 1 AND n.chapter_number < c.chapter_number
            ORDER BY n.chapter_number DESC LIMIT 1) AS previous_chapter,
          (SELECT json_object('id', n.id, 'story_id', n.story_id, 'chapter_number', n.chapter_number,
            'title', n.title, 'published', json('true')) FROM chapters n
            WHERE n.story_id = c.story_id AND n.published = 1 AND n.chapter_number > c.chapter_number
            ORDER BY n.chapter_number LIMIT 1) AS next_chapter
        FROM chapters c JOIN accessible s ON s.id = c.story_id
        WHERE c.id = ?2 AND (s.is_owner = 1 OR c.published = 1)`)
        .bind(hash, id).first<{
          scheduled_for: string | null; media: string;
          previous_chapter: string | null; next_chapter: string | null;
          body: string; published: number | null; spotify_link: string | null; banner_url: string | null;
        }>();
      if (!row) return null;
      const { scheduled_for, media, previous_chapter, next_chapter, ...chapter } = row;
      return {
        chapter: {
          ...chapter,
          body: sanitizeChapter(chapter.body),
          published: chapter.published === null ? null : Boolean(chapter.published),
          spotify_link: chapter.spotify_link === null ? null : JSON.parse(chapter.spotify_link),
        },
        scheduled_for,
        media: JSON.parse(media),
        previousChapter: previous_chapter === null ? null : JSON.parse(previous_chapter),
        nextChapter: next_chapter === null ? null : JSON.parse(next_chapter),
      };
    },
    async createStory(hash: string, id: string, title: string, description='') {
      session(hash);text(title,200,true);text(description,20000);
      return db.prepare(`INSERT INTO stories(id,author_id,title,description,release_at)
        SELECT ?2,profile_id,?3,?4,'infinity' FROM d1_social_actors WHERE token_hash=?1 RETURNING id`)
        .bind(hash,id,title,description).first<{id:string}>();
    },
    async editStory(hash: string, id: string, title: string, description: string) {
      session(hash);text(title,200,true);text(description,20000);
      return db.prepare(`UPDATE stories SET title=?3,description=?4,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?2 AND author_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
          AND moderation_hidden_at IS NULL RETURNING id`)
        .bind(hash,id,title,description).first<{id:string}>();
    },
    async createEditorChapter(hash: string, input: {
      id: string; storyId: string; title: string; body: string; notes: string | null;
      status: 'draft' | 'scheduled' | 'published' | 'unpublished'; schedule: string | null; music: string | null;
    }) {
      session(hash);
      const create = db.prepare(`INSERT INTO chapters
        (id,story_id,chapter_number,title,body,author_notes,published,publication_status,spotify_link,original_published_at)
        SELECT ?3,s.id,coalesce((SELECT max(chapter_number) FROM chapters WHERE story_id=s.id),0)+1,
          ?4,?5,?6,?7='published',?7,?8,
          CASE WHEN ?7='published' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END
        FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id
        WHERE s.id=?2 AND a.token_hash=?1 AND s.moderation_hidden_at IS NULL`)
        .bind(hash,input.storyId,input.id,input.title,sanitizeChapter(input.body),input.notes,input.status,input.music);
      const schedule = db.prepare(`INSERT INTO scheduled_chapters (id,chapter_id,scheduled_for)
        SELECT id,id,?2 FROM chapters WHERE id=?1 AND publication_status='scheduled'`)
        .bind(input.id,input.schedule);
      const results = await db.batch([create, schedule]);
      if (results.some(result => !result.success)) throw Error('Unable to create chapter');
      if (results[0].meta.changes !== 1) return null;
      const row = await db.prepare('SELECT * FROM chapters WHERE id = ?').bind(input.id)
        .first<{ published: number; spotify_link: string | null; original_published_at: string | null }>();
      if (!row) throw Error('New chapter unavailable');
      return { ...row, published: Boolean(row.published), spotify_link: row.spotify_link && JSON.parse(row.spotify_link) };
    },
    async appendChapter(hash: string, storyId: string, id: string, title: string, html: string, notes='') {
      session(hash);text(title,200,true);text(html,1000000);text(notes,20000);
      return db.prepare(`INSERT INTO chapters(id,story_id,chapter_number,title,body,author_notes,published,publication_status)
        SELECT ?3,s.id,coalesce((SELECT max(chapter_number) FROM chapters WHERE story_id=s.id),0)+1,?4,?5,?6,0,'draft'
        FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id
        WHERE s.id=?2 AND a.token_hash=?1 AND s.moderation_hidden_at IS NULL RETURNING id`)
        .bind(hash,storyId,id,title,sanitizeChapter(html),notes).first<{id:string}>();
    },
    async editChapter(hash: string, id: string, title: string, html: string, notes='') {
      session(hash);text(title,200,true);text(html,1000000);text(notes,20000);
      return db.prepare(`UPDATE chapters SET title=?3,body=?4,author_notes=?5,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?2 AND EXISTS(SELECT 1 FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id
          WHERE s.id=chapters.story_id AND a.token_hash=?1 AND s.moderation_hidden_at IS NULL) RETURNING id`)
        .bind(hash,id,title,sanitizeChapter(html),notes).first<{id:string}>();
    },
    async setChapterPublished(hash: string, id: string, published: boolean) {
      session(hash);if(typeof published!=='boolean')throw new Error('Invalid publication');
      return db.prepare(`UPDATE chapters SET published=?3,publication_status=CASE WHEN ?3=1 THEN 'published' ELSE 'unpublished' END,
        republished_at=CASE WHEN ?3=1 AND coalesce(published,0)=0 AND original_published_at IS NOT NULL
          THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE republished_at END,
        original_published_at=CASE WHEN ?3=1 THEN coalesce(original_published_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE original_published_at END,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?2 AND EXISTS(SELECT 1 FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id
          WHERE s.id=chapters.story_id AND a.token_hash=?1 AND s.moderation_hidden_at IS NULL) RETURNING id`)
        .bind(hash,id,published?1:0).first<{id:string}>();
    },
    async download(hash: string | null, id: string) {
      session(hash);
      const result = await rows<{ title: string; username: string; chapter_title: string; body: string }>(
        access + ` SELECT s.title,p.username,c.title AS chapter_title,c.body
        FROM accessible s JOIN released_stories r ON r.id=s.id JOIN profiles p ON p.id=s.author_id
        JOIN chapters c ON c.story_id=s.id AND c.published=1
        WHERE s.id=?2 AND s.allows_download=1 AND p.username<>''
        ORDER BY c.chapter_number,c.id`, hash, id);
      if (!result.length) return null;
      return { id, title: result[0].title, author: result[0].username,
        chapters: result.map(chapter => ({ title: chapter.chapter_title, html: sanitizeChapter(chapter.body || '') })) };
    },
    async release(hash: string, id: string, action: 'publish' | 'schedule' | 'unpublish', schedule: string | null) {
      session(hash);
      const owner = `author_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
        AND moderation_hidden_at IS NULL`;
      const update = db.prepare(`UPDATE stories SET release_at=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?2 AND ${owner} AND (?4='unpublish' OR EXISTS(
          SELECT 1 FROM chapters c WHERE c.story_id=stories.id AND (c.published=1 OR
            (?4='schedule' AND c.publication_status='scheduled' AND EXISTS(
              SELECT 1 FROM scheduled_chapters sc WHERE sc.chapter_id=c.id AND julianday(sc.scheduled_for)<=julianday(?3)
            ))))) AND (?4<>'schedule' OR julianday(?3)>julianday('now'))`)
        .bind(hash,id,action==='unpublish'?'infinity':schedule,action);
      const statements = [update];
      if (action==='publish') {
        statements.push(db.prepare(`INSERT INTO user_notifications(id,user_id,notification_type,title,body,href,source_key)
          SELECT lower(hex(randomblob(16))),p.user_id,'chapter_release',
            CASE WHEN p.id=s.author_id THEN 'Capítulo publicado' ELSE 'Novo capítulo disponível' END,
            CASE WHEN p.id=s.author_id THEN 'Seu capítulo de '||s.title||' está no ar.'
              ELSE 'Há um novo capítulo de '||s.title||'.' END,
            CASE WHEN p.id=s.author_id THEN '/capitulo-publicado/'||c.id ELSE '/historia/'||s.id END,
            CASE WHEN p.id=s.author_id THEN 'chapter-published:' ELSE 'chapter-release:' END||c.id
          FROM released_stories s JOIN chapters c ON c.story_id=s.id AND c.published=1
          JOIN profiles a ON a.id=s.author_id CROSS JOIN profiles p
          WHERE s.id=? AND changes()>0
          AND coalesce((SELECT value FROM d1_runtime_flags WHERE key='suppress_notifications'),'0')='0'
          AND (p.id=s.author_id OR (
            p.chapter_notifications=1 AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
              (b.blocker_id=p.id AND b.blocked_id=a.id) OR (b.blocker_id=a.id AND b.blocked_id=p.id))
            AND (EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=p.id AND f.following_id=a.id)
              OR (coalesce(a.is_private,0)=0 AND EXISTS(SELECT 1 FROM reading_lists l
                JOIN reading_list_items i ON i.list_id=l.id WHERE l.user_id=p.id AND i.story_id=s.id)))))
          ON CONFLICT DO NOTHING`).bind(id));
      }
      const result = await db.batch(statements);
      if (result.some(row => !row.success)) throw new Error('Unable to release story');
      if (result[0].meta.changes) return { publish:'published', schedule:'scheduled', unpublish:'unpublished' }[action];
      const story = await db.prepare(`SELECT id FROM stories WHERE id=?2 AND ${owner}`).bind(hash,id).first();
      return story ? 'no_chapter' : null;
    },
    async setStoryPublished(hash: string, id: string, published: boolean) {
      session(hash);if(typeof published!=='boolean')throw new Error('Invalid publication');
      return db.prepare(`UPDATE stories SET release_at=CASE WHEN ?3=1 THEN NULL ELSE 'infinity' END,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?2 AND author_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
          AND moderation_hidden_at IS NULL AND (?3=0 OR EXISTS(SELECT 1 FROM chapters c WHERE c.story_id=stories.id AND c.published=1))
        RETURNING id`).bind(hash,id,published?1:0).first<{id:string}>();
    },
    async reorderChapters(hash: string, storyId: string, ids: string[]) {
      await command(hash,'reorder_chapters',storyId,ids);
    },
    async deleteChapter(hash: string, storyId: string, chapterId: string) {
      await command(hash,'delete_chapter',storyId,[],chapterId);
    },
    async pinStory(hash: string, storyId: string | null) {
      session(hash);
      return db.prepare(`UPDATE profiles SET pinned_story_id=?2
        WHERE id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
          AND (?2 IS NULL OR EXISTS(SELECT 1 FROM stories s WHERE s.id=?2 AND s.author_id=profiles.id
            AND s.moderation_hidden_at IS NULL AND EXISTS(SELECT 1 FROM chapters c WHERE c.story_id=s.id AND c.published=1)))
        RETURNING id`).bind(hash,storyId).first<{id:string}>();
    },
    async ownsReadingList(hash: string, id: string) {
      session(hash);
      return db.prepare(`SELECT l.id FROM reading_lists l JOIN d1_social_actors a ON a.profile_id=l.user_id
        WHERE a.token_hash=? AND l.id=? AND l.name<>'Biblioteca'`).bind(hash,id).first<{id:string}>();
    },
    async saveOwnedList(hash: string,id: string,newList: {name:string;description:string}|null,storyId: string|null,itemId: string) {
      session(hash);
      const statements = [];
      if (newList) {
        statements.push(db.prepare(access + ` INSERT INTO reading_lists(id,user_id,name,description,is_public)
          SELECT ?2,profile_id,?4,?5,0 FROM viewer
          WHERE ?3 IS NULL OR EXISTS(SELECT 1 FROM accessible s JOIN released_stories r ON r.id=s.id WHERE s.id=?3)`)
          .bind(hash,id,storyId,newList.name,newList.description));
      }
      if (storyId) {
        statements.push(db.prepare(access + ` INSERT INTO reading_list_items(id,list_id,story_id,position)
          SELECT ?4,l.id,s.id,coalesce((SELECT max(position) FROM reading_list_items WHERE list_id=l.id),-1)+1
          FROM reading_lists l JOIN accessible s ON s.id=?3 JOIN released_stories rs ON rs.id=s.id
          WHERE l.id=?2 AND l.name<>'Biblioteca' AND l.user_id=(SELECT profile_id FROM viewer)
          ON CONFLICT(list_id,story_id) DO NOTHING`).bind(hash,id,storyId,itemId));
      }
      const result = await db.batch(statements);
      if (result.some(row=>!row.success)) throw Error('Unable to save reading list');
      if (result[0]?.meta.changes) return true;
      if (!newList && storyId) return Boolean(await db.prepare(access + ` SELECT i.id FROM reading_list_items i
        JOIN reading_lists l ON l.id=i.list_id JOIN accessible s ON s.id=i.story_id JOIN released_stories r ON r.id=s.id
        WHERE l.id=?2 AND s.id=?3 AND l.name<>'Biblioteca' AND l.user_id=(SELECT profile_id FROM viewer)`)
        .bind(hash,id,storyId).first());
      return false;
    },
    async createList(hash: string, id: string, name: string, description='') {
      session(hash);text(name,80,true);text(description,240);
      if(name.trim().toLowerCase()==='biblioteca')throw new Error('Reserved library name');
      return db.prepare(`INSERT INTO reading_lists(id,user_id,name,description,is_public)
        SELECT ?2,profile_id,?3,?4,0 FROM d1_social_actors WHERE token_hash=?1 RETURNING id`)
        .bind(hash,id,name.trim(),description).first<{id:string}>();
    },
    async libraryCards(hash: string) {
      session(hash);
      const result = await db.prepare(access + ` SELECT i.id,i.list_id,'Biblioteca' AS list_name,s.id AS story_id,
        s.title,s.description,s.status,s.rating,s.cover_url,s.created_at,s.updated_at,i.added_at,i.reading_status,
        c.id AS chapter_id,c.title AS chapter_title,
        CASE WHEN c.id IS NULL THEN 0 ELSE coalesce(r.progress_percent,0) END AS progress_percent,
        CASE WHEN c.id IS NULL THEN 0 ELSE coalesce(r.position,0) END AS position,
        lower(trim(s.status)) IN ('concluída','concluÍda') AND r.progress_percent>=100 AND c.id=(
          SELECT id FROM chapters WHERE story_id=s.id AND published=1 ORDER BY chapter_number DESC,id DESC LIMIT 1
        ) AS reading_completed,
        EXISTS(SELECT 1 FROM chapter_favorites f JOIN chapters fc ON f.chapter_id=fc.id
          WHERE f.user_id=v.profile_id AND fc.story_id=s.id AND fc.published=1) AS has_favorite_chapter,
        p.username AS author_username,p.display_name AS author_display_name,
        json_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url) AS author
        FROM viewer v JOIN reading_lists l ON l.user_id=v.profile_id AND l.name='Biblioteca'
        JOIN reading_list_items i ON i.list_id=l.id JOIN accessible s ON s.id=i.story_id JOIN released_stories rs ON rs.id=s.id
        JOIN profiles p ON p.id=s.author_id LEFT JOIN reading_progress r ON r.user_id=v.profile_id AND r.story_id=s.id
        LEFT JOIN chapters c ON c.id=r.chapter_id AND c.story_id=s.id AND c.published=1
        ORDER BY i.added_at DESC,i.id`).bind(hash).all<{
          title:string;description:string|null;status:string|null;rating:string|null;cover_url:string|null;
          reading_completed:number|null;has_favorite_chapter:number;author:string;
        }>();
      if (!result.success) throw Error('Unable to load library');
      return result.results.map(row=>({
        ...row,story_title:row.title,story_description:row.description,story_status:row.status,
        story_rating:row.rating,story_cover_url:row.cover_url,author:JSON.parse(row.author),
        reading_completed:Boolean(row.reading_completed),has_favorite_chapter:Boolean(row.has_favorite_chapter),
      }));
    },
    async libraryItem(hash: string,storyId: string) {
      session(hash);
      return db.prepare(access + ` SELECT i.id FROM viewer v JOIN reading_lists l ON l.user_id=v.profile_id AND l.name='Biblioteca'
        JOIN reading_list_items i ON i.list_id=l.id JOIN accessible s ON s.id=i.story_id JOIN released_stories r ON r.id=s.id
        WHERE s.id=?2`).bind(hash,storyId).first();
    },
    async library(hash: string, newId: string) {
      session(hash);
      await db.prepare(`INSERT INTO reading_lists(id,user_id,name,is_public)
        SELECT ?2,profile_id,'Biblioteca',0 FROM d1_social_actors WHERE token_hash=?1
        ON CONFLICT(user_id) WHERE name='Biblioteca' DO NOTHING`).bind(hash,newId).run();
      return db.prepare(`SELECT l.id FROM reading_lists l JOIN d1_social_actors a ON a.profile_id=l.user_id
        WHERE a.token_hash=?1 AND l.name='Biblioteca'`).bind(hash).first<{id:string}>();
    },
    async setListPublic(hash: string, id: string, isPublic: boolean) {
      session(hash);if(typeof isPublic!=='boolean')throw new Error('Invalid visibility');
      return db.prepare(`UPDATE reading_lists SET is_public=?3 WHERE id=?2 AND name<>'Biblioteca'
        AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1) RETURNING id`)
        .bind(hash,id,isPublic?1:0).first<{id:string}>();
    },
    async list(hash: string | null, id: string) {
      session(hash);
      return db.prepare(access+` SELECT l.id,l.name,l.description,l.is_public,l.image_path FROM reading_lists l
        JOIN profiles p ON p.id=l.user_id JOIN auth_accounts a ON a.id=p.user_id
        WHERE l.id=?2 AND p.moderation_hidden_at IS NULL AND a.account_status='active'
          AND (l.user_id=(SELECT profile_id FROM viewer) OR (l.is_public=1 AND l.name<>'Biblioteca'
            AND (p.is_private=0 OR EXISTS(SELECT 1 FROM follows f WHERE f.following_id=p.id AND f.follower_id=(SELECT profile_id FROM viewer)))
            AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
              (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer)) OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer)))))`)
        .bind(hash,id).first<{id:string;name:string;description:string|null;is_public:number;image_path:string|null}>();
    },
    async listItems(hash: string | null, id: string) {
      session(hash);
      // Authorize the list and every story in the same query. Publishing a list
      // never makes a private/draft/blocked author's story visible.
      return rows<{id:string;title:string;cover_url:string|null;position:number;reading_status:string|null}>(access+`
        SELECT s.id,s.title,s.cover_url,i.position,i.reading_status FROM reading_list_items i
        JOIN reading_lists l ON l.id=i.list_id JOIN profiles p ON p.id=l.user_id JOIN auth_accounts a ON a.id=p.user_id
        JOIN accessible s ON s.id=i.story_id JOIN released_stories rs ON rs.id=s.id
        WHERE l.id=?2 AND p.moderation_hidden_at IS NULL AND a.account_status='active'
          AND (l.user_id=(SELECT profile_id FROM viewer) OR (l.is_public=1 AND l.name<>'Biblioteca'
            AND (p.is_private=0 OR EXISTS(SELECT 1 FROM follows f WHERE f.following_id=p.id AND f.follower_id=(SELECT profile_id FROM viewer)))
            AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
              (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer)) OR (b.blocked_id=p.id AND b.blocker_id=(SELECT profile_id FROM viewer)))))
        ORDER BY i.position,i.added_at DESC,i.id`,hash,id);
    },
    async addToList(hash: string, listId: string, storyId: string, itemId: string) {
      session(hash);
      return db.prepare(access+` INSERT INTO reading_list_items(id,list_id,story_id,position)
        SELECT ?4,l.id,s.id,coalesce((SELECT max(position) FROM reading_list_items WHERE list_id=l.id),-1)+1
        FROM reading_lists l JOIN accessible s ON s.id=?3 JOIN released_stories rs ON rs.id=s.id
        WHERE l.id=?2 AND l.user_id=(SELECT profile_id FROM viewer)
        ON CONFLICT(list_id,story_id) DO NOTHING RETURNING id`)
        .bind(hash,listId,storyId,itemId).first<{id:string}>();
    },
    async removeFromList(hash: string, listId: string, storyId: string) {
      session(hash);
      return db.prepare(`DELETE FROM reading_list_items WHERE story_id=?3 AND list_id=?2
        AND EXISTS(SELECT 1 FROM reading_lists l JOIN d1_social_actors a ON a.profile_id=l.user_id
          WHERE l.id=?2 AND a.token_hash=?1) RETURNING id`).bind(hash,listId,storyId).first<{id:string}>();
    },
    async reorderList(hash: string, listId: string, storyIds: string[]) {
      await command(hash,'reorder_list',listId,storyIds);
    },
    async setReadingStatus(hash: string, listId: string, storyId: string, status: string | null) {
      session(hash);if(status!==null&&!['unread','reading','completed'].includes(status))throw new Error('Invalid reading status');
      return db.prepare(`UPDATE reading_list_items SET reading_status=?4 WHERE list_id=?2 AND story_id=?3
        AND EXISTS(SELECT 1 FROM reading_lists l JOIN d1_social_actors a ON a.profile_id=l.user_id
          WHERE l.id=?2 AND l.name='Biblioteca' AND a.token_hash=?1) RETURNING id`)
        .bind(hash,listId,storyId,status).first<{id:string}>();
    },
    async storyLike(hash: string | null,id: string,toggle: boolean) {
      session(hash);
      const target = `, target AS (
        SELECT s.id,v.profile_id FROM accessible s JOIN released_stories r ON r.id=s.id
        LEFT JOIN viewer v ON 1 WHERE s.id=?2
      )`;
      if (toggle) {
        const remove = db.prepare(access+target+` DELETE FROM story_likes
          WHERE (story_id,user_id) IN(SELECT id,profile_id FROM target)`).bind(hash,id);
        const add = db.prepare(access+target+` INSERT INTO story_likes(story_id,user_id)
          SELECT id,profile_id FROM target WHERE profile_id IS NOT NULL AND changes()=0`).bind(hash,id);
        const result = await db.batch([remove,add]);
        if (result.some(row=>!row.success)) throw Error('Unable to update story like');
        if (!result.some(row=>row.meta.changes)) return null;
      }
      const row = await db.prepare(access+target+` SELECT
        (SELECT count(*) FROM story_likes WHERE story_id=t.id) AS likes,
        EXISTS(SELECT 1 FROM story_likes WHERE story_id=t.id AND user_id=t.profile_id) AS liked
        FROM target t`).bind(hash,id).first<{likes:number;liked:number}>();
      return row ? {likes:row.likes,liked:Boolean(row.liked)} : null;
    },
    async chapterLike(hash: string | null, id: string, toggle: boolean) {
      session(hash);
      const target = `, target AS (
        SELECT c.id, v.user_id FROM chapters c JOIN accessible s ON s.id = c.story_id
        JOIN released_stories r ON r.id = s.id LEFT JOIN viewer v ON 1 WHERE c.id = ?2 AND c.published = 1
      )`;
      if (toggle) {
        const remove = db.prepare(access + target + ` DELETE FROM chapter_likes
          WHERE (chapter_id,user_id) IN (SELECT id,user_id FROM target)`).bind(hash,id);
        const add = db.prepare(access + target + ` INSERT INTO chapter_likes (chapter_id,user_id)
          SELECT id,user_id FROM target WHERE user_id IS NOT NULL AND changes() = 0`).bind(hash,id);
        const results = await db.batch([remove, add]);
        if (results.some(result => !result.success)) throw Error('Unable to change chapter like');
        if (!results.some(result => result.meta.changes)) return null;
      }
      const row = await db.prepare(access + target + ` SELECT
        (SELECT count(*) FROM chapter_likes l WHERE l.chapter_id = t.id) AS likes,
        EXISTS(SELECT 1 FROM chapter_likes l WHERE l.chapter_id = t.id AND l.user_id = t.user_id) AS liked
        FROM target t`).bind(hash,id).first<{ likes: number; liked: number }>();
      return row ? { likes: row.likes, liked: Boolean(row.liked) } : null;
    },
    async chapterFavorite(hash: string, id: string, toggle: boolean) {
      session(hash);
      const visibleChapter = `, target AS (
        SELECT c.id, v.profile_id FROM chapters c JOIN accessible s ON s.id = c.story_id
        JOIN released_stories r ON r.id = s.id CROSS JOIN viewer v WHERE c.id = ?2 AND c.published = 1
      )`;
      if (!toggle) {
        const row = await db.prepare(access + visibleChapter + ` SELECT EXISTS(
          SELECT 1 FROM chapter_favorites f WHERE f.chapter_id = t.id AND f.user_id = t.profile_id
        ) AS favorited FROM target t`).bind(hash,id).first<{ favorited: number }>();
        return row ? { favorited: Boolean(row.favorited) } : null;
      }
      const remove = db.prepare(access + visibleChapter + ` DELETE FROM chapter_favorites
        WHERE (chapter_id,user_id) IN (SELECT id,profile_id FROM target)`).bind(hash,id);
      const add = db.prepare(access + visibleChapter + ` INSERT INTO chapter_favorites (chapter_id,user_id)
        SELECT id,profile_id FROM target WHERE changes() = 0`).bind(hash,id);
      const [removed, added] = await db.batch([remove, add]);
      if (!removed.success || !added.success) throw Error('Unable to change chapter favorite');
      if (removed.meta.changes) return { favorited: false };
      return added.meta.changes ? { favorited: true } : null;
    },
    async readerProgress(hash: string, chapterId: string) {
      session(hash);
      return db.prepare(access + `
        SELECT c.id, previous.id AS chapter_id, p.progress_percent, p.position
        FROM viewer v CROSS JOIN chapters c JOIN accessible s ON s.id = c.story_id
        JOIN released_stories r ON r.id = s.id
        LEFT JOIN reading_progress p ON p.user_id = v.profile_id AND p.story_id = s.id
        LEFT JOIN chapters previous ON previous.id = p.chapter_id AND previous.story_id = s.id
          AND previous.published = 1
        WHERE c.id = ?2 AND c.published = 1`)
        .bind(hash, chapterId).first<{ chapter_id: string | null; progress_percent: number | null; position: number | null }>();
    },
    async recordReaderProgress(hash: string, storyId: string, chapterId: string, percent: number, position: number, read: boolean) {
      session(hash);
      const allowed = `, reading AS (
        SELECT v.profile_id, s.id AS story_id, s.author_id, c.id AS chapter_id
        FROM viewer v JOIN accessible s ON s.id = ?2 JOIN released_stories r ON r.id = s.id
        JOIN chapters c ON c.id = ?3 AND c.story_id = s.id AND c.published = 1
      )`;
      const progress = db.prepare(access + allowed + `
        INSERT INTO reading_progress (user_id, story_id, chapter_id, progress_percent, position)
        SELECT profile_id, story_id, chapter_id, ?4, ?5 FROM reading WHERE 1
        ON CONFLICT(user_id, story_id) DO UPDATE SET chapter_id = excluded.chapter_id,
          progress_percent = excluded.progress_percent, position = excluded.position,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(hash, storyId, chapterId, percent, position);
      const engagement = db.prepare(access + allowed + `
        INSERT INTO story_daily_engagement (story_id, reader_id, viewed, read)
        SELECT story_id, profile_id, 1, ?4 FROM reading WHERE profile_id <> author_id
        ON CONFLICT(story_id, reader_id, activity_day) DO UPDATE SET viewed = 1,
          read = max(story_daily_engagement.read, excluded.read)`).bind(hash, storyId, chapterId, Number(read));
      const results = await db.batch([progress, engagement]);
      if (results.some(result => !result.success)) throw Error('Unable to save reading progress');
      return results[0].meta.changes === 1;
    },
    async saveProgress(hash: string, storyId: string, chapterId: string, percent: number, position: number) {
      session(hash);
      if(!Number.isFinite(percent)||percent<0||percent>100||!Number.isSafeInteger(position)||position<0)throw new Error('Invalid progress');
      return db.prepare(access+` INSERT INTO reading_progress(user_id,story_id,chapter_id,progress_percent,position)
        SELECT v.profile_id,s.id,c.id,?4,?5 FROM viewer v JOIN accessible s ON s.id=?2
        JOIN chapters c ON c.story_id=s.id AND c.id=?3 WHERE (c.published=1 OR s.is_owner=1)
        ON CONFLICT(user_id,story_id) DO UPDATE SET chapter_id=excluded.chapter_id,progress_percent=excluded.progress_percent,
          position=excluded.position,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING user_id`)
        .bind(hash,storyId,chapterId,percent,position).first<{user_id:string}>();
    },
    async progress(hash: string, storyId: string) {
      session(hash);
      return db.prepare(`SELECT p.chapter_id,p.progress_percent,p.position,p.updated_at FROM reading_progress p
        JOIN d1_social_actors a ON a.profile_id=p.user_id WHERE a.token_hash=?1 AND p.story_id=?2`)
        .bind(hash,storyId).first<{chapter_id:string;progress_percent:number;position:number;updated_at:string}>();
    },
  };
}
