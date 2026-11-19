import { randomUUID } from 'node:crypto';
import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { normalizeHashtag } from '@/lib/social/feed-links';
import { chatActor, chatDb, privateHeaders, sameOrigin, uuid } from '@/lib/chat/server';
import { isNewsArticle } from '@/lib/news/articles';
import { AttachmentError, removeFeedAttachments, uploadFeedAttachments } from '@/lib/social/upload-attachments';

export async function POST(request: Request) {
  const respond = (data: object, status = 200) => Response.json(data, { status, headers: privateHeaders });
  if (!sameOrigin(request)) return respond({ error: 'Origem da requisição inválida.' }, 403);
  let uploaded: string[] = [];
  let isolated = false;
  try {
    const db = getD1PreviewDatabase('auth');
    isolated = Boolean(db);
    const hash = db ? await getSessionTokenHash() : null;
    const session = db && hash ? await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
      .bind(hash).first<{profile_id:string}>() : null;
    const actor = db ? session && { profileId: session.profile_id } : await chatActor();
    if (!actor) return respond({ error: 'Entre para publicar no feed.' }, 401);
    const form = await request.formData();
    const text = String(form.get('body') ?? '').trim();
    const origin = form.get('origin') ?? 'feed';
    if (origin !== 'feed' && origin !== 'mural') {
      return respond({ error: 'Origem da publicação inválida.' }, 400);
    }
    const storyId = String(form.get('story_id') ?? '');
    const newsSlug = String(form.get('news_slug') ?? '');
    if (text.length > 5000 || (storyId && !uuid.test(storyId)) ||
      (newsSlug && (!isNewsArticle(newsSlug) || storyId))) {
      return respond({ error: 'Confira o texto e o vínculo desta publicação.' }, 400);
    }
    if (storyId && !db) {
      const story = await chatDb.from('released_stories').select('id').eq('id', storyId).eq('author_id', actor.profileId).maybeSingle();
      if (story.error) throw story.error;
      if (!story.data) return respond({ error: 'A história escolhida está indisponível.' }, 404);
    }
    const files = form.getAll('files').filter((file): file is File => file instanceof File);
    const attachments = await uploadFeedAttachments(files, actor.profileId, false, isolated);
    uploaded = attachments.paths;
    if (db && hash) {
      const id = randomUUID();
      const tags = [...new Set((text.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map(normalizeHashtag).filter(Boolean))];
      const post = db.prepare(`INSERT INTO nook_posts(id,user_id,body,story_id,news_slug,publication_origin,hashtags)
        SELECT ?2,a.profile_id,?3,?4,?5,?6,?7 FROM d1_social_actors a WHERE a.token_hash=?1 AND
        (?4 IS NULL OR EXISTS(SELECT 1 FROM released_stories WHERE id=?4 AND author_id=a.profile_id))`)
        .bind(hash,id,text,storyId || null,newsSlug || null,origin,JSON.stringify(tags));
      const media = attachments.media.map(item => db.prepare(`INSERT INTO nook_post_media(id,post_id,media_url,media_type)
        SELECT ?2,id,?3,?4 FROM nook_posts WHERE id=?1`).bind(id,randomUUID(),item.media_url,item.media_type));
      const result = await db.batch([post,...media]);
      if (result.some(item => !item.success)) throw Error('Unable to save feed attachments');
      if (!result[0].meta.changes) {
        await removeFeedAttachments(uploaded,isolated);
        return respond({ error: 'A história escolhida está indisponível.' }, 404);
      }
      uploaded = [];
      return respond({ post: { id } }, 201);
    }
    const result = await chatDb.rpc('create_feed_media_post', {
      p_profile: actor.profileId, p_text: text, p_story: storyId || null, p_news: newsSlug || null, p_media: attachments.media, p_origin: origin,
    });
    if (result.error) throw result.error;
    uploaded = [];
    return respond({ post: { id: result.data } }, 201);
  } catch (error) {
    if (uploaded.length) await removeFeedAttachments(uploaded,isolated).catch(() => undefined);
    if (error instanceof AttachmentError) return respond({ error: error.message }, 400);
    console.error('feed media post', error);
    return respond({ error: 'Não foi possível publicar os arquivos.' }, 500);
  }
}
