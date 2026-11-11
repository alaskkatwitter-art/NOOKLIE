import { chatActor, chatDb, privateHeaders, sameOrigin, uuid } from '@/lib/chat/server';
import { isNewsArticle } from '@/lib/news/articles';
import { AttachmentError, uploadFeedAttachments } from '@/lib/social/upload-attachments';

export async function POST(request: Request) {
  const respond = (data: object, status = 200) => Response.json(data, { status, headers: privateHeaders });
  if (!sameOrigin(request)) return respond({ error: 'Origem da requisição inválida.' }, 403);
  let uploaded: string[] = [];
  try {
    const actor = await chatActor();
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
    if (storyId) {
      const story = await chatDb.from('released_stories').select('id').eq('id', storyId).eq('author_id', actor.profileId).maybeSingle();
      if (story.error) throw story.error;
      if (!story.data) return respond({ error: 'A história escolhida está indisponível.' }, 404);
    }
    const files = form.getAll('files').filter((file): file is File => file instanceof File);
    const attachments = await uploadFeedAttachments(files, actor.profileId);
    uploaded = attachments.paths;
    const result = await chatDb.rpc('create_feed_media_post', {
      p_profile: actor.profileId, p_text: text, p_story: storyId || null, p_news: newsSlug || null, p_media: attachments.media, p_origin: origin,
    });
    if (result.error) throw result.error;
    uploaded = [];
    return respond({ post: { id: result.data } }, 201);
  } catch (error) {
    if (uploaded.length) await chatDb.storage.from('nook-media').remove(uploaded);
    if (error instanceof AttachmentError) return respond({ error: error.message }, 400);
    console.error('feed media post', error);
    return respond({ error: 'Não foi possível publicar os arquivos.' }, 500);
  }
}
