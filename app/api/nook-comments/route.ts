import { chatActor, chatDb, privateHeaders, uuid } from '@/lib/chat/server';
import { getPublicProfileIds, isPublicPostVisible } from '@/lib/moderation/content-visibility';
import { AttachmentError, uploadFeedAttachments } from '@/lib/social/upload-attachments';

const fields = 'id,post_id,author_id,content,parent_id,image_url,created_at,updated_at';
const authorFields = 'id,username,display_name,avatar_url,verified,is_official';
const respond = (data: object, status = 200) => Response.json(data, { status, headers: privateHeaders });

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const postId = params.get('post_id') ?? '';
    const replyId = params.get('reply_id');
    if (replyId && !uuid.test(replyId)) return respond({ error: 'Resposta indisponível.' }, 404);
    const actor = await chatActor();
    if (params.get('saved') === '1') {
      if (!actor) return respond({ error: 'Entre para ver suas respostas salvas.' }, 401);
      const result = await chatDb.from('nook_saved_replies').select('nook_comments(id,post_id,author_id,content)').eq('user_id', actor.profileId).order('created_at', { ascending: false }).limit(100);
      if (result.error) throw result.error;
      const rows = result.data.flatMap(row => row.nook_comments);
      const authors = await getPublicProfileIds(chatDb, rows.map(row => row.author_id), actor.profileId);
      const posts = new Map(await Promise.all([...new Set(rows.map(row => row.post_id))].map(async id =>
        [id, await isPublicPostVisible(chatDb, id)] as const)));
      return respond({ comments: rows.filter(row => authors.has(row.author_id) && posts.get(row.post_id)).map(({ id, post_id, content }) => ({ id, post_id, content })) });
    }
    if (!uuid.test(postId) || !(await isPublicPostVisible(chatDb, postId))) return respond({ error: 'Publicação indisponível.' }, 404);
    let query = chatDb.from('nook_comments').select(fields).eq('post_id', postId).order('created_at').limit(300);
    if (replyId) query = query.eq('id', replyId);
    const result = await query;
    if (result.error) throw result.error;
    if (!result.data.length) return respond({ comments: [] });
    const ids = result.data.map(row => row.id);
    const authorIds = [...new Set(result.data.map(row => row.author_id))];
    const [visible, profiles, reactions, saves] = await Promise.all([
      getPublicProfileIds(chatDb, authorIds, actor?.profileId ?? null),
      chatDb.from('profiles').select(authorFields).in('id', authorIds),
      chatDb.from('nook_comment_reactions').select('comment_id,user_id').in('comment_id', ids).eq('emoji', '❤️'),
      actor ? chatDb.from('nook_saved_replies').select('comment_id').eq('user_id', actor.profileId).in('comment_id', ids)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profiles.error || reactions.error || saves.error) throw profiles.error || reactions.error || saves.error;
    const authors = new Map(profiles.data.map(profile => [profile.id, profile]));
    const saved = new Set(saves.data.map(save => save.comment_id));
    const likes = new Map<string, number>();
    const liked = new Set<string>();
    for (const row of reactions.data) {
      likes.set(row.comment_id, (likes.get(row.comment_id) ?? 0) + 1);
      if (row.user_id === actor?.profileId) liked.add(row.comment_id);
    }
    const rows = result.data.filter(row => visible.has(row.author_id));
    const visibleIds = new Set(rows.map(row => row.id));
    return respond({ comments: rows.map(row => ({
      ...row,
      parent_id: row.parent_id && visibleIds.has(row.parent_id) ? row.parent_id : null,
      author: authors.get(row.author_id) ?? null,
      likes: likes.get(row.id) ?? 0,
      liked: liked.has(row.id),
      saved: saved.has(row.id),
    })) });
  } catch (error) {
    console.error('feed replies GET', error);
    return respond({ error: 'Não foi possível carregar as respostas.' }, 500);
  }
}

export async function POST(request: Request) {
  let uploaded: string[] = [];
  try {
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para responder à publicação.' }, 401);
    const form = request.headers.get('content-type')?.includes('multipart/form-data') ? await request.formData() : null;
    const body = form ? Object.fromEntries(form.entries()) : await request.json().catch(() => null);
    if (!body || typeof body.post_id !== 'string' || !uuid.test(body.post_id)) return respond({ error: 'Publicação inválida.' }, 400);
    const postId: string = body.post_id;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const image = form?.get('image');
    const parentId = body.parent_id || null;
    if ((!content && !(image instanceof File)) || content.length > 2000 || (parentId && (typeof parentId !== 'string' || !uuid.test(parentId)))) {
      return respond({ error: 'Escreva uma resposta de até 2.000 caracteres ou anexe uma imagem.' }, 400);
    }
    if (!(await isPublicPostVisible(chatDb, postId))) return respond({ error: 'Publicação indisponível.' }, 404);
    if (parentId) {
      const parent = await chatDb.from('nook_comments').select('id,author_id').eq('id', parentId).eq('post_id', postId).maybeSingle();
      if (parent.error) throw parent.error;
      if (!parent.data || !(await getPublicProfileIds(chatDb, [parent.data.author_id], actor.profileId)).has(parent.data.author_id)) {
        return respond({ error: 'Resposta indisponível.' }, 404);
      }
    }
    let imageUrl: string | null = null;
    if (image instanceof File) {
      const upload = await uploadFeedAttachments([image], actor.profileId, true);
      uploaded = upload.paths;
      imageUrl = upload.media[0].media_url;
    }
    const result = await chatDb.from('nook_comments').insert({
      post_id: postId, author_id: actor.profileId, parent_id: parentId, content, image_url: imageUrl,
    }).select(fields).single();
    if (result.error) throw result.error;
    uploaded = [];
    const author = await chatDb.from('profiles').select(authorFields).eq('id', actor.profileId).maybeSingle();
    return respond({ comment: { ...result.data, author: author.data ?? null, likes: 0, liked: false, saved: false } }, 201);
  } catch (error) {
    if (uploaded.length) await chatDb.storage.from('nook-media').remove(uploaded);
    if (error instanceof AttachmentError) return respond({ error: error.message }, 400);
    console.error('feed replies POST', error);
    return respond({ error: 'Não foi possível enviar a resposta.' }, 500);
  }
}
