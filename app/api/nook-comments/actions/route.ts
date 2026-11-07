import { chatActor, chatDb, privateHeaders, uuid } from '@/lib/chat/server';
import { getPublicProfileIds, isPublicPostVisible } from '@/lib/moderation/content-visibility';

export async function POST(request: Request) {
  const respond = (data: object, status = 200) => Response.json(data, { status, headers: privateHeaders });
  try {
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para interagir com as respostas.' }, 401);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== 'string' || !uuid.test(body.id) || !['like', 'save'].includes(body.action) || typeof body.enabled !== 'boolean') {
      return respond({ error: 'Ação inválida.' }, 400);
    }
    const reply = await chatDb.from('nook_comments').select('post_id,author_id').eq('id', body.id).maybeSingle();
    if (reply.error) throw reply.error;
    if (!reply.data || !(await isPublicPostVisible(chatDb, reply.data.post_id)) ||
      !(await getPublicProfileIds(chatDb, [reply.data.author_id], actor.profileId)).has(reply.data.author_id)) {
      return respond({ error: 'Resposta indisponível.' }, 404);
    }
    const table = body.action === 'like' ? 'nook_comment_reactions' : 'nook_saved_replies';
    const row = { comment_id: body.id, user_id: actor.profileId, ...(body.action === 'like' ? { emoji: '❤️' } : {}) };
    const result = body.enabled
      ? await chatDb.from(table).upsert(row, { onConflict: Object.keys(row).join(','), ignoreDuplicates: true })
      : await chatDb.from(table).delete().match(row);
    if (result.error) throw result.error;
    return respond({ enabled: body.enabled });
  } catch (error) {
    console.error('reply action', error);
    return respond({ error: 'Não foi possível atualizar a resposta.' }, 500);
  }
}
