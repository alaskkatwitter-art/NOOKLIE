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
  const access=`WITH viewer AS (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1), accessible AS (
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
    async createList(hash: string, id: string, name: string, description='') {
      session(hash);text(name,80,true);text(description,240);
      if(name.trim().toLowerCase()==='biblioteca')throw new Error('Reserved library name');
      return db.prepare(`INSERT INTO reading_lists(id,user_id,name,description,is_public)
        SELECT ?2,profile_id,?3,?4,0 FROM d1_social_actors WHERE token_hash=?1 RETURNING id`)
        .bind(hash,id,name.trim(),description).first<{id:string}>();
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
    async setReadingStatus(hash: string, listId: string, storyId: string, status: string) {
      session(hash);if(!['unread','reading','completed'].includes(status))throw new Error('Invalid reading status');
      return db.prepare(`UPDATE reading_list_items SET reading_status=?4 WHERE list_id=?2 AND story_id=?3
        AND EXISTS(SELECT 1 FROM reading_lists l JOIN d1_social_actors a ON a.profile_id=l.user_id
          WHERE l.id=?2 AND l.name='Biblioteca' AND a.token_hash=?1) RETURNING id`)
        .bind(hash,listId,storyId,status).first<{id:string}>();
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
