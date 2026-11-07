import { chatActor, chatDb, privateHeaders, uuid } from '@/lib/chat/server';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const respond = (data: object, status = 200) => Response.json(data, { status, headers: privateHeaders });
  try {
    const { id } = await params;
    if (!uuid.test(id)) return respond({ error: 'Obra indisponível.' }, 404);
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para editar a obra.' }, 401);
    const body = await request.json().catch(() => null);
    if (!body || !['publish', 'schedule', 'unpublish'].includes(body.action)) {
      return respond({ error: 'Escolha uma ação de publicação.' }, 400);
    }
    const scheduledFor = typeof body.scheduledFor === 'string' ? Date.parse(body.scheduledFor) : NaN;
    if (body.action === 'schedule' && (!Number.isFinite(scheduledFor) || scheduledFor <= Date.now())) {
      return respond({ error: 'Escolha uma data e um horário no futuro.' }, 400);
    }
    const { data, error } = await chatDb.rpc('set_story_release', {
      p_story: id,
      p_author: actor.profileId,
      p_action: body.action,
      p_schedule: body.action === 'schedule' ? new Date(scheduledFor).toISOString() : null,
    });
    if (error) throw error;
    if (!data) return respond({ error: 'Obra indisponível.' }, 404);
    if (data === 'no_chapter') return respond({ error: body.action === 'schedule' ? 'Publique um capítulo ou agende o primeiro para o mesmo horário ou antes da obra.' : 'Publique um capítulo no editor antes de colocar a obra no ar.' }, 409);
    return respond({ publication: data });
  } catch (error) {
    console.error('set story release', error);
    return respond({ error: 'Não foi possível atualizar a publicação da obra.' }, 500);
  }
}
