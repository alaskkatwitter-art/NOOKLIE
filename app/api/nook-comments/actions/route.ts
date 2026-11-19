import { randomUUID } from 'node:crypto';
import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Feed } from '@/lib/database/d1-feed';
import { chatActor, chatDb, privateHeaders, uuid } from '@/lib/chat/server';
import { getPublicProfileIds, isPublicPostVisible } from '@/lib/moderation/content-visibility';

export async function POST(request: Request) {
  const respond = (data: object, status = 200) => Response.json(data, { status, headers: privateHeaders });
  try {
    const db = getD1PreviewDatabase('auth');
    const hash = db ? await getSessionTokenHash() : null;
    const session = db && hash ? await db.prepare('SELECT 1 FROM d1_social_actors WHERE token_hash=?').bind(hash).first() : null;
    const actor = db ? null : await chatActor();
    if (!actor && !session) return respond({ error: 'Entre para interagir com as respostas.' }, 401);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== 'string' || !uuid.test(body.id) || !['like', 'save'].includes(body.action) || typeof body.enabled !== 'boolean') {
      return respond({ error: 'Ação inválida.' }, 400);
    }
    if (db && hash) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return respond({ error: 'Origem não permitida.' }, 403);
      const updated = await d1Feed(db).applyReplyAction(hash, body.id, body.action, body.enabled, randomUUID());
      return updated ? respond({ enabled: body.enabled }) : respond({ error: 'Resposta indisponível.' }, 404);
    }
    if (!actor) return respond({ error: 'Entre para interagir com as respostas.' }, 401);
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
